import csv
import hashlib
import json
import os
from functools import lru_cache
from pathlib import Path

import joblib
from flask import Flask, abort, render_template, request, send_file
from PIL import Image, UnidentifiedImageError

from webdemo.features import hog_vector, resnet_vector


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 20_000_000
PAPER = Path(__file__).resolve().parents[1] / "papercode"
PREPARE = PAPER / "prepare-dataset"
MODELS = PAPER / "eval/models"
REALDATA = Path(__file__).resolve().parent / "realdata"
INDEX = json.loads((MODELS / "index.json").read_text(encoding="utf-8"))
DATASETS = {"mcf": "MCF", "upfall": "UP-Fall", "mix": "MCF + UP-Fall"}
LABELS = INDEX["labels"]
FAMILIES = {"softmax": "Softmax", "knn": "KNN", "linear_svc": "LinearSVC", "svm_rbf": "SVM-RBF"}
PIPELINES = {
    feature + "_" + model: name + " + " + family
    for feature, name in {"hog": "HOG", "resnet50": "ResNet-50"}.items()
    for model, family in FAMILIES.items()
}


def examples():
    samples = {}
    for dataset in ("mcf", "upfall"):
        images = PREPARE / "dataraw" / dataset / "examples/images"
        with (PREPARE / "splits" / f"{dataset}.csv").open(newline="", encoding="utf-8") as handle:
            rows = {row["sample_id"]: row for row in csv.DictReader(handle)}
        for path in sorted(images.glob("*.png")):
            row = rows[path.stem]
            samples[path.stem] = dict(path=path, dataset=dataset, label=int(row["label"]), split=row["split"])
    for sample in json.loads((REALDATA / "samples.json").read_text(encoding="utf-8")):
        sample_id = sample["id"]
        samples[sample_id] = {
            **sample, "dataset": "real", "split": "external",
            "path": REALDATA / "images" / f"{sample_id}.png",
        }
    return samples


SAMPLES = examples()


@lru_cache(maxsize=1)
def load_model(train_source, pipeline):
    record = INDEX["models"][train_source][pipeline]
    model = Path(os.environ.get("CV_MODEL_DIR", MODELS)) / record["path"]
    if not model.is_file():
        package = INDEX["archives"][train_source]["filename"]
        raise FileNotFoundError(f"Tải {package} và giải nén vào papercode/eval/models để chạy mô hình.")
    with model.open("rb") as handle:
        if hashlib.file_digest(handle, "sha256").hexdigest() != record["sha256"]:
            raise ValueError("Checkpoint không khớp index.json.")
    bundle = joblib.load(model)
    if bundle["protocol"] != record["protocol"]:
        raise ValueError("Checkpoint dùng giao thức khác.")
    return bundle["model"]


@app.route("/", methods=["GET", "POST"])
def demo():
    train_source = request.form.get("train_source", "mix")
    pipeline = request.form.get("pipeline", "hog_svm_rbf")
    sample_id = request.form.get("sample", "")
    result = error = truth = sample = None
    if request.method == "POST":
        if train_source not in DATASETS or pipeline not in PIPELINES:
            abort(400)
        upload = request.files.get("image")
        sample = SAMPLES.get(sample_id) if not (upload and upload.filename) else None
        try:
            if sample is None and not (upload and upload.filename):
                raise ValueError("Chọn ảnh mẫu hoặc tải một ảnh lên.")
            with Image.open(sample["path"] if sample else upload.stream) as image:
                if image.format not in {"JPEG", "PNG", "WEBP"} or image.width * image.height > 20_000_000:
                    raise ValueError("Chọn ảnh JPG, PNG hoặc WebP tối đa 20 megapixel.")
                classifier = load_model(train_source, pipeline)
                feature = hog_vector(image) if pipeline.startswith("hog_") else resnet_vector(image)
                label = int(classifier.predict(feature.reshape(1, -1))[0])
                result = f"P{label + 1} · {LABELS[label]}"
                if sample:
                    truth = LABELS[sample["label"]]
        except UnidentifiedImageError:
            error = "Không đọc được ảnh. Chọn ảnh JPG, PNG hoặc WebP."
        except Image.DecompressionBombError:
            error = "Ảnh vượt giới hạn kích thước."
        except (ValueError, OSError) as exc:
            error = str(exc)
    choices = {key: row for key, row in SAMPLES.items() if row["split"] in ("validation", "external")}
    return render_template("demo.html", sources=DATASETS, pipelines=PIPELINES, samples=choices,
                           labels=LABELS, train_source=train_source, pipeline=pipeline,
                           sample_id=sample_id, result=result, truth=truth, sample=sample, error=error)


@app.get("/samples/<sample_id>")
def sample_image(sample_id):
    if sample_id not in SAMPLES:
        abort(404)
    return send_file(SAMPLES[sample_id]["path"])


@app.get("/datasets")
def datasets():
    camera_examples = [f"mcf_s01_c{camera:02d}_f{frame:06d}" for camera, frame in [(1, 1103), (5, 1123), (8, 1100)]]
    trial_examples = [f"upfall_s01_a01_t01_c1_f{frame:06d}" for frame in (0, 78, 114)]
    return render_template("datasets.html", labels=LABELS, samples=SAMPLES,
                           camera_examples=camera_examples, trial_examples=trial_examples)


@app.errorhandler(413)
def too_large(_error):
    return "Ảnh vượt quá 8 MB.", 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
