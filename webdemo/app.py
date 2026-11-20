import hashlib
import io
import json
import os
import secrets
import time
from collections import Counter, OrderedDict
from functools import lru_cache
from pathlib import Path, PureWindowsPath
from threading import Lock

import joblib
from flask import Flask, abort, jsonify, render_template, request, send_file, url_for
from PIL import Image, ImageOps, UnidentifiedImageError
from threadpoolctl import threadpool_limits

from webdemo.catalog import PAPER, load_catalog
from webdemo.features import hog_vector, resnet_vector, rgb128


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024
app.json.ensure_ascii = False
Image.MAX_IMAGE_PIXELS = 20_000_000
MODELS = PAPER / "eval/models"
INDEX = json.loads((MODELS / "index.json").read_text(encoding="utf-8"))
DATASETS = {"mcf": "MCF", "upfall": "UP-Fall", "mix": "MCF + UP-Fall"}
LABELS = INDEX["labels"]
FAMILIES = {"svm_rbf": "SVM-RBF", "linear_svc": "LinearSVC", "knn": "KNN", "softmax": "Softmax"}
PIPELINES = {
    feature + "_" + model: name + " + " + family
    for feature, name in {"hog": "HOG", "resnet50": "ResNet-50"}.items()
    for model, family in FAMILIES.items()
}
PAGE_SIZE = 9
VALIDATION, REAL, SUMMARIES, MOMENTS = load_catalog()
UPLOADS = OrderedDict()
UPLOAD_LOCK = Lock()
MODEL_LOCK = Lock()


def context(values):
    dataset = values.get("dataset", "mix")
    try:
        camera = int(values.get("camera", 1))
    except (TypeError, ValueError):
        raise ValueError("Camera không hợp lệ.") from None
    if not isinstance(dataset, str) or dataset not in DATASETS:
        raise ValueError("Chọn bộ model MCF, UP-Fall hoặc Mix.")
    if camera not in (range(1, 9) if dataset == "mcf" else (1,)):
        raise ValueError("Camera không hợp lệ.")
    return dataset, camera


def model_path(record):
    return Path(os.environ.get("CV_MODEL_DIR", MODELS)) / record["path"]


@lru_cache(maxsize=1)
def load_model(dataset, pipeline):
    record = INDEX["models"][dataset][pipeline]
    path = model_path(record)
    if not path.is_file():
        package = INDEX["archives"][dataset]["filename"]
        raise ValueError(f"Tải {package} và giải nén vào papercode/eval/models để chạy mô hình.")
    with path.open("rb") as handle:
        if hashlib.file_digest(handle, "sha256").hexdigest() != record["sha256"]:
            raise ValueError("Checkpoint không khớp index.json.")
    bundle = joblib.load(path)
    if bundle["protocol"] != record["protocol"] or bundle["feature_scaler"] is not None:
        raise ValueError("Checkpoint dùng giao thức khác.")
    return bundle["model"]


@lru_cache(maxsize=10)
def validation_samples(dataset, camera):
    return tuple(item for item in VALIDATION.values()
                 if dataset == "mix" or (item.dataset == dataset and item.camera == camera))


def sample_reference(item):
    return {"class_id": item.label, "code": f"P{item.label + 1}", "label": LABELS[item.label],
            "kind": "manual" if item.credit else "original", "credit": item.credit}


def sample_json(item, order):
    source = "real" if item.credit else "validation"
    title = f"Ảnh {order:02d}" if source == "real" else f"{DATASETS[item.dataset]} · Ảnh {order:02d}"
    return {"id": item.id, "source": source, "order": order, "title": title,
            "reference": sample_reference(item), "image_url": url_for("media", source=source, identifier=item.id),
            "thumbnail_url": url_for("media", source=source, identifier=item.id, thumb=1)}


def library(values):
    dataset, camera = context(values)
    source = values.get("source", "real")
    if source == "real":
        items = tuple(REAL.values())
    elif source == "validation":
        items = validation_samples(dataset, camera)
    else:
        raise ValueError("Nguồn ảnh không hợp lệ.")
    label = values.get("label", "all")
    if label == "all":
        return items
    if label not in ("0", "1", "2", "3"):
        raise ValueError("Bộ lọc tư thế không hợp lệ.")
    return tuple(item for item in items if item.label == int(label))


@app.get("/")
def index():
    selected = None
    if sample_id := request.args.get("sample"):
        dataset, camera = context(request.args)
        rows = validation_samples(dataset, camera)
        order = next((number for number, item in enumerate(rows, 1) if item.id == sample_id), None)
        if order is None:
            abort(404)
        selected = {"dataset": dataset, "camera": camera, "sample": sample_json(rows[order - 1], order),
                    "page": (order - 1) // PAGE_SIZE + 1}
    return render_template("index.html", initial=selected, datasets=DATASETS)


@app.template_filter("vn_number")
def vn_number(value):
    return f"{value:,}".replace(",", ".")


def dataset_example(item):
    if item is None:
        return None
    return {**sample_json(item, 1),
            "demo_url": url_for("index", dataset=item.dataset, camera=item.camera, sample=item.id)}


def camera_payload(scenario, label="all", index=0):
    if scenario not in MOMENTS or index < 0 or label not in ("all", "0", "1", "2", "3"):
        raise ValueError("Lựa chọn camera không hợp lệ.")
    moments = MOMENTS[scenario]
    counts = Counter(moment[0].label for moment in moments)
    selected = moments if label == "all" else [moment for moment in moments if moment[0].label == int(label)]
    if selected and index >= len(selected):
        raise ValueError("Thời điểm đã chọn không hợp lệ.")
    views = []
    caption = "Không có ảnh validation ở nhóm này."
    if selected:
        for item in selected[index]:
            views.append({**dataset_example(item), "camera": item.camera})
        first = selected[index][0]
        caption = f"P{first.label + 1} · {LABELS[first.label]} · Mốc đồng bộ {first.time_row}"
    return {"count": len(selected), "index": index if selected else 0, "caption": caption, "views": views,
            "label_counts": [counts[label] for label in range(4)]}


@app.get("/datasets")
def datasets_page():
    examples = {dataset: {} for dataset in ("mcf", "upfall")}
    for item in sorted(VALIDATION.values(), key=lambda item: item.camera):
        examples[item.dataset].setdefault(item.label, item)
    initial = camera_payload(min(MOMENTS))
    rows = [[dataset_example(examples[dataset].get(label)) for dataset in ("mcf", "upfall")]
            for label in range(4)]
    return render_template("datasets.html", summaries=SUMMARIES, example_rows=rows, labels=LABELS,
                           scenarios=sorted(MOMENTS), initial=initial)


@app.get("/api/datasets/cameras")
def camera_comparison():
    return jsonify(camera_payload(int(request.args.get("scenario", min(MOMENTS))),
                                  request.args.get("label", "all"), int(request.args.get("index", 0))))


@app.get("/api/config")
def configuration():
    dataset, camera = context(request.args)
    models = [{"id": model_id, "name": name, "available": model_path(INDEX["models"][dataset][model_id]).is_file()}
              for model_id, name in PIPELINES.items()]
    return jsonify(models=models, labels=LABELS, dataset=dataset, camera=camera)


@app.get("/api/samples")
def sample_list():
    items = library(request.args)
    pages = max(1, (len(items) + PAGE_SIZE - 1) // PAGE_SIZE)
    page = min(pages, max(1, int(request.args.get("page", 1))))
    start = (page - 1) * PAGE_SIZE
    return jsonify(items=[sample_json(item, i) for i, item in enumerate(items[start:start + PAGE_SIZE], start + 1)],
                   total=len(items), page=page, pages=pages, page_size=PAGE_SIZE, labels=LABELS)


@app.get("/api/samples/random")
def random_sample():
    items = library(request.args)
    if not items:
        abort(404, "Không có ảnh phù hợp với bộ lọc.")
    index = secrets.randbelow(len(items))
    return jsonify(sample=sample_json(items[index], index + 1), page=index // PAGE_SIZE + 1)


def uploaded_image(identifier):
    with UPLOAD_LOCK:
        record = UPLOADS.get(identifier)
    if not record or time.monotonic() - record[0] > 8 * 3600:
        abort(404, "Ảnh tải lên đã hết hạn. Hãy chọn lại ảnh.")
    return record[1:]


def encode_image(image, format):
    buffer = io.BytesIO()
    image.save(buffer, format)
    return buffer.getvalue()


@lru_cache(maxsize=256)
def thumbnail(path):
    with Image.open(path) as original:
        image = ImageOps.exif_transpose(original).convert("RGB")
        image.thumbnail((320, 240), Image.Resampling.BILINEAR)
        return encode_image(image, "JPEG")


@app.get("/media/<source>/<identifier>")
def media(source, identifier):
    if source == "upload":
        _, preview = uploaded_image(identifier)
        return send_file(io.BytesIO(preview), mimetype="image/jpeg", max_age=0)
    groups = {"real": REAL, "validation": VALIDATION}
    item = groups.get(source, {}).get(identifier)
    if item is None:
        abort(404, "Không tìm thấy ảnh.")
    if request.args.get("thumb") == "1":
        return send_file(io.BytesIO(thumbnail(item.path)), mimetype="image/jpeg", max_age=3600)
    return send_file(item.path, max_age=3600)


@app.post("/api/upload")
def upload():
    file = request.files.get("image")
    if file is None or not file.filename:
        raise ValueError("Hãy chọn một ảnh để tải lên.")
    try:
        with Image.open(file.stream) as original:
            if original.format not in ("JPEG", "PNG", "WEBP") or original.width * original.height > 20_000_000:
                raise ValueError("Chọn ảnh JPG, PNG hoặc WebP tối đa 20 megapixel.")
            data = encode_image(rgb128(original), "PNG")
            preview = ImageOps.exif_transpose(original).convert("RGB")
            preview.thumbnail((1280, 1024), Image.Resampling.BILINEAR)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValueError("Không đọc được ảnh. Hãy chọn ảnh JPG, PNG hoặc WebP khác.") from None
    identifier = secrets.token_hex(16)
    with UPLOAD_LOCK:
        UPLOADS[identifier] = (time.monotonic(), data, encode_image(preview, "JPEG"))
        if len(UPLOADS) > 32:
            UPLOADS.popitem(last=False)
    return jsonify(id=identifier, source="upload", title=PureWindowsPath(file.filename).name[:100],
                   reference=None, image_url=url_for("media", source="upload", identifier=identifier))


@app.post("/api/predict")
def predict():
    values = request.get_json(silent=True)
    if not isinstance(values, dict):
        raise ValueError("Yêu cầu phân loại không hợp lệ.")
    dataset, camera = context(values)
    pipeline, source, identifier = (values.get(key) for key in ("model", "source", "id"))
    if not all(isinstance(value, str) for value in (pipeline, source, identifier)) or pipeline not in PIPELINES:
        raise ValueError("Chọn ảnh và model trước khi phân loại.")
    reference = None
    if source == "upload":
        data, _ = uploaded_image(identifier)
        location = io.BytesIO(data)
    else:
        groups = {"real": REAL, "validation": VALIDATION}
        item = groups.get(source, {}).get(identifier)
        if item is None:
            abort(404, "Không tìm thấy ảnh.")
        if source == "validation" and dataset != "mix" and (item.dataset, item.camera) != (dataset, camera):
            raise ValueError("Ảnh validation không thuộc bộ ảnh đã chọn.")
        reference = sample_reference(item)
        location = item.path

    started = time.perf_counter()
    with MODEL_LOCK, threadpool_limits(limits=2), Image.open(location) as image:
        classifier = load_model(dataset, pipeline)
        vector = hog_vector(image) if pipeline.startswith("hog_") else resnet_vector(image)
        label = int(classifier.predict(vector.reshape(1, -1))[0])
    elapsed = (time.perf_counter() - started) * 1000
    result = {"class_id": label, "code": f"P{label + 1}", "label": LABELS[label], "elapsed_ms": elapsed,
              "model_name": f"{DATASETS[dataset]} · {PIPELINES[pipeline]}"}
    return jsonify(prediction=result, reference=reference, correct=label == reference["class_id"] if reference else None)


@app.errorhandler(ValueError)
def invalid_request(error):
    return jsonify(error=str(error)), 400


@app.errorhandler(404)
def not_found(error):
    return jsonify(error=error.description), 404


@app.errorhandler(413)
def too_large(_error):
    return jsonify(error="Ảnh vượt quá 8 MB."), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
