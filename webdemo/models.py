import hashlib
import json
import os
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np

from webdemo.catalog import PAPER


MODELS = PAPER / "eval/models"
INDEX = json.loads((MODELS / "index.json").read_text(encoding="utf-8"))
DATASETS = {"mcf": "MCF", "upfall": "UP-Fall", "mix": "MCF + UP-Fall"}
LABELS = INDEX["labels"]
FAMILIES = {"svm_rbf": "SVM-RBF", "linear_svc": "LinearSVC", "knn": "KNN", "softmax": "Softmax"}
PIPELINES = {
    f"{feature}_{model}": f"{name} + {family}"
    for feature, name in {"hog": "HOG", "resnet50": "ResNet-50"}.items()
    for model, family in FAMILIES.items()
}


def _model_path(record):
    return Path(os.environ.get("CV_MODEL_DIR", MODELS)) / record["path"]


def model_options(dataset):
    return [{"id": model_id, "name": name, "available": _model_path(INDEX["models"][dataset][model_id]).is_file()}
            for model_id, name in PIPELINES.items()]


@lru_cache(maxsize=1)
def load_model(dataset, pipeline):
    record = INDEX["models"][dataset][pipeline]
    path = _model_path(record)
    if not path.is_file():
        package = INDEX["archives"][dataset]["filename"]
        raise ValueError(f"Tải {package} và giải nén vào papercode/eval/models để chạy mô hình.")
    with path.open("rb") as handle:
        if hashlib.file_digest(handle, "sha256").hexdigest() != record["sha256"]:
            raise ValueError("Checkpoint không khớp index.json.")
        handle.seek(0)
        bundle = joblib.load(handle)
    if bundle["feature_scaler"] is not None:
        raise ValueError("Checkpoint dùng giao thức khác.")
    return bundle["model"]


def classify_with_scores(classifier, features, pipeline):
    if hasattr(classifier, "predict_proba"):
        values = classifier.predict_proba(features)[0]
        kind = "neighbor_votes" if pipeline.endswith("_knn") else "probability"
    else:
        margins = classifier.decision_function(features)[0]
        if pipeline.endswith("_svm_rbf") and classifier.decision_function_shape == "ovr":
            # scikit-learn 1.7 returns the pairwise vote count plus a tie-break term in (-1/3, 1/3).
            votes = np.rint(margins).astype(int)
            values = votes / votes.sum()
            kind = "pairwise_votes"
        else:
            weights = np.exp(margins - margins.max())
            values = weights / weights.sum()
            kind = "relative_score"
    # Distance-weighted KNN predicts the class with the highest vote share.
    prediction = classifier.classes_[values.argmax()] if kind == "neighbor_votes" else classifier.predict(features)[0]
    scores = {int(label): float(value) for label, value in zip(classifier.classes_, values)}
    return int(prediction), {"kind": kind, "by_class": scores}
