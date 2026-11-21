import io
import secrets
import time
from collections import Counter, OrderedDict
from functools import lru_cache
from pathlib import PureWindowsPath
from threading import Lock

import numpy as np
from flask import Flask, abort, jsonify, render_template, request, send_file, url_for
from PIL import Image, ImageOps, UnidentifiedImageError
from threadpoolctl import threadpool_limits

from webdemo.catalog import load_catalog
from webdemo.features import hog_vector, resnet_vector, rgb128
from webdemo.models import DATASETS, LABELS, PIPELINES, classify_with_scores, load_model, model_options


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024
app.json.ensure_ascii = False
app.jinja_env.globals["project_title"] = "Phân loại tư thế người từ dữ liệu hình ảnh trong các tình huống sinh hoạt và té ngã"
Image.MAX_IMAGE_PIXELS = 20_000_000
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


@lru_cache(maxsize=64)
def validation_samples(dataset, camera, label=None):
    if dataset == "mix":
        pools = (validation_samples("mcf", None, label), validation_samples("upfall", None, label))
        # Spread each dataset proportionally through the gallery while keeping page order stable.
        ranked = ((index / len(pool), item) for pool in pools for index, item in enumerate(pool))
        return tuple(item for _, item in sorted(ranked, key=lambda entry: entry[0]))
    return tuple(item for item in VALIDATION.values()
                 if item.dataset == dataset and (camera is None or item.camera == camera)
                 and (label is None or item.label == label))


def sample_reference(item):
    return {"class_id": item.label, "code": f"P{item.label + 1}", "label": LABELS[item.label],
            "kind": "manual" if item.credit else "original", "credit": item.credit}


def sample_json(item, order):
    source = "real" if item.credit else "validation"
    title = f"Ảnh {order:02d}" if source == "real" else f"{DATASETS[item.dataset]} · Ảnh {order:02d}"
    sample = {"id": item.id, "source": source, "order": order, "title": title,
              "reference": sample_reference(item), "image_url": url_for("media", source=source, identifier=item.id),
              "thumbnail_url": url_for("media", source=source, identifier=item.id, thumb=1)}
    if source == "validation":
        sample.update(dataset=item.dataset, dataset_name=DATASETS[item.dataset])
    elif item.size:
        sample.update(width=item.size[0], height=item.size[1])
    return sample


def library(values):
    dataset, camera = context(values)
    source = values.get("source", "real")
    label = values.get("label", "all")
    if label not in ("all", "0", "1", "2", "3"):
        raise ValueError("Bộ lọc tư thế không hợp lệ.")
    class_id = None if label == "all" else int(label)
    if source == "real":
        matches = (item for item in REAL.values() if class_id is None or item.label == class_id)
        return sorted(matches, key=lambda item: item.size[0] / item.size[1] if item.size else 0, reverse=True)
    if source != "validation":
        raise ValueError("Nguồn ảnh không hợp lệ.")

    validation_dataset = values.get("validation_dataset", "all")
    if validation_dataset not in ("all", "mcf", "upfall"):
        raise ValueError("Bộ lọc dataset không hợp lệ.")
    if validation_dataset != "all":
        if dataset == "mix":
            dataset, camera = validation_dataset, None
        elif dataset != validation_dataset:
            return ()
    return validation_samples(dataset, camera, class_id)


@app.get("/")
def index():
    selected = None
    if sample_id := request.args.get("sample"):
        dataset, camera = context(request.args)
        rows = validation_samples(dataset, camera)
        order = next((number for number, item in enumerate(rows, 1) if item.id == sample_id), None)
        if order is None:
            abort(404)
        pipeline = request.args.get("model")
        if pipeline is not None and pipeline not in PIPELINES:
            raise ValueError("Model đã chọn không hợp lệ.")
        selected = {"dataset": dataset, "camera": camera, "sample": sample_json(rows[order - 1], order),
                    "page": (order - 1) // PAGE_SIZE + 1, "model": pipeline}
    return render_template("index.html", initial=selected, datasets=DATASETS, labels=LABELS)


@app.template_filter("vn_number")
def vn_number(value):
    return f"{value:,}".replace(",", ".")


def dataset_example(item):
    if item is None:
        return None
    return {**sample_json(item, 1),
            "demo_url": url_for("index", dataset=item.dataset, camera=item.camera, sample=item.id)}


@lru_cache(maxsize=8)
def posture_samples(dataset, label):
    return tuple(item for item in VALIDATION.values() if item.dataset == dataset and item.label == label)


def posture_examples(previous=None):
    rows = []
    for label in range(len(LABELS)):
        row = []
        for dataset in ("mcf", "upfall"):
            pool = posture_samples(dataset, label)
            if previous is None:
                item = min(pool, key=lambda item: item.camera, default=None)
            else:
                options = tuple(item for item in pool if item.id not in previous) or pool
                item = secrets.choice(options) if options else None
            row.append(dataset_example(item))
        rows.append(row)
    return rows


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
        caption = f"P{first.label + 1} · {LABELS[first.label]}"
    return {"count": len(selected), "index": index if selected else 0, "caption": caption, "views": views,
            "label_counts": [counts[label] for label in range(4)]}


@app.get("/datasets")
def datasets_page():
    initial = camera_payload(min(MOMENTS))
    models = model_options("mcf")
    available = [model for model in models if model["available"]]
    default = next((model["id"] for model in available if model["id"] == "hog_svm_rbf"),
                   available[0]["id"] if available else None)
    return render_template("datasets.html", summaries=SUMMARIES, example_rows=posture_examples(), labels=LABELS,
                           scenarios=sorted(MOMENTS), initial=initial, camera_models=models, camera_model=default)


@app.get("/datasets/postures")
def shuffle_postures():
    previous = set(request.args.getlist("exclude")[:8])
    return render_template("_posture_examples.html", example_rows=posture_examples(previous), labels=LABELS)


@app.get("/api/datasets/cameras")
def camera_comparison():
    return jsonify(camera_payload(int(request.args.get("scenario", min(MOMENTS))),
                                  request.args.get("label", "all"), int(request.args.get("index", 0))))


@app.post("/api/datasets/cameras/predict")
def predict_camera_views():
    options = request.get_json(silent=True)
    if not isinstance(options, dict):
        raise ValueError("Yêu cầu so sánh camera không hợp lệ.")
    scenario, index = options.get("scenario"), options.get("index")
    pipeline = options.get("model")
    if not isinstance(scenario, int) or not isinstance(index, int):
        raise ValueError("Chọn scenario và thời điểm trước khi so sánh.")
    if not isinstance(pipeline, str) or pipeline not in PIPELINES:
        raise ValueError("Chọn model MCF trước khi so sánh.")

    views = camera_payload(scenario, options.get("label", "all"), index)["views"]
    if not views:
        abort(404, "Chưa có ảnh để so sánh.")

    items = [VALIDATION[view["id"]] for view in views]
    extract = hog_vector if pipeline.startswith("hog_") else resnet_vector
    with MODEL_LOCK, threadpool_limits(limits=2):
        classifier = load_model("mcf", pipeline)
        vectors = []
        for item in items:
            with Image.open(item.path) as image:
                vectors.append(extract(image))
        predictions = classifier.predict(np.stack(vectors))

    results = []
    for item, label in zip(items, predictions):
        results.append({"camera": item.camera, "code": f"P{label + 1}", "label": LABELS[label],
                        "correct": bool(label == item.label),
                        "demo_url": url_for("index", dataset="mcf", camera=item.camera, sample=item.id, model=pipeline)})
    return jsonify(results=results)


@app.get("/api/config")
def configuration():
    dataset, camera = context(request.args)
    return jsonify(models=model_options(dataset), labels=LABELS, dataset=dataset, camera=camera)


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
    source, identifier = values.get("source"), values.get("id")
    if not isinstance(source, str) or not isinstance(identifier, str):
        raise ValueError("Chọn ảnh trước khi phân loại.")
    batch = "models" in values
    pipelines = values.get("models") if batch else [values.get("model")]
    if (not isinstance(pipelines, list) or not 1 <= len(pipelines) <= len(PIPELINES)
            or any(not isinstance(model, str) or model not in PIPELINES for model in pipelines)
            or len(set(pipelines)) != len(pipelines)):
        raise ValueError("Chọn ít nhất một model hợp lệ trước khi phân loại.")
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

    results = []
    vectors = {}
    with MODEL_LOCK, threadpool_limits(limits=2), Image.open(location) as image:
        for pipeline in pipelines:
            started = time.perf_counter()
            pipeline_name = PIPELINES[pipeline]
            extractor = hog_vector if pipeline.startswith("hog_") else resnet_vector
            try:
                classifier = load_model(dataset, pipeline)
                if extractor not in vectors:
                    vectors[extractor] = extractor(image).reshape(1, -1)
                label, scores = classify_with_scores(classifier, vectors[extractor], pipeline)
            except ValueError as error:
                if not batch:
                    raise
                results.append({"pipeline_name": pipeline_name, "error": str(error)})
                continue
            elapsed = (time.perf_counter() - started) * 1000
            prediction = {"class_id": label, "code": f"P{label + 1}", "label": LABELS[label], "elapsed_ms": elapsed,
                          "model_name": f"{DATASETS[dataset]} · {pipeline_name}", "pipeline_name": pipeline_name,
                          "scores": scores}
            results.append({"prediction": prediction, "correct": label == reference["class_id"] if reference else None})
    if batch:
        return jsonify(results=results, reference=reference)
    return jsonify(**results[0], reference=reference)


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
