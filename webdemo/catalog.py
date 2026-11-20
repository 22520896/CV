import csv
import json
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

from PIL import ExifTags, Image


PAPER = Path(__file__).resolve().parents[1] / "papercode"
PREPARE = PAPER / "prepare-dataset"
REALDATA = Path(__file__).resolve().parent / "realdata"
FRAME_STORE = os.environ.get("CV_FRAME_STORE")


@dataclass(frozen=True)
class Sample:
    id: str
    path: Path
    label: int
    dataset: str
    camera: int = 1
    scenario: int = 0
    time_row: int = 0
    credit: dict | None = None
    size: tuple[int, int] | None = None


def frame_path(dataset, sample_id):
    packaged = PREPARE / "dataraw" / dataset / "examples" / "images" / f"{sample_id}.png"
    if packaged.is_file():
        return packaged
    prepared = PREPARE / "prepared" / dataset / "images" / f"{sample_id}.png"
    if prepared.is_file():
        return prepared
    if not FRAME_STORE:
        return None
    base = Path(FRAME_STORE) / dataset / "frames" / "rgb128"
    if dataset == "mcf":
        match = re.fullmatch(r"mcf_s(\d{2})_c(\d{2})_f(\d{6})", sample_id)
        if not match:
            return None
        scene, camera, frame = match.groups()
        path = base / f"scenario_{scene}" / f"camera_{camera}" / f"{frame}.png"
    else:
        match = re.fullmatch(r"upfall_s(\d{2})_a(\d{2})_t(\d{2})_c1_f(\d{6})", sample_id)
        if not match:
            return None
        subject, activity, trial, frame = match.groups()
        path = base / f"subject_{subject}" / f"activity_{activity}" / f"trial_{trial}" / f"{frame}.png"
    return path if path.is_file() else None


def load_catalog():
    validation, summaries = {}, {}
    moments = defaultdict(lambda: defaultdict(list))
    for dataset in ("mcf", "upfall"):
        count, groups = Counter(), set()
        with (PREPARE / "splits" / f"{dataset}.csv").open(newline="", encoding="utf-8") as file:
            for row in csv.DictReader(file):
                count[row["split"]] += 1
                groups.add(row["group_id"])
                if row["split"] != "validation":
                    continue
                sample_id = row["sample_id"]
                path = frame_path(dataset, sample_id)
                if path is None:
                    continue
                scenario, camera = 0, 1
                if dataset == "mcf":
                    _, scene_key, camera_key, _ = sample_id.split("_")
                    scenario, camera = int(scene_key[1:]), int(camera_key[1:])
                item = Sample(sample_id, path, int(row["label"]), dataset, camera, scenario, int(row["time_row"]))
                validation[sample_id] = item
                if dataset == "mcf":
                    moments[scenario][item.time_row].append(item)
        summaries[dataset] = {"train": count["train"], "validation": count["validation"],
                              "images": count.total(), "groups": len(groups)}

    real = {}
    for row in json.loads((REALDATA / "samples.json").read_text(encoding="utf-8")):
        sample_id = row["id"]
        path = REALDATA / "images" / f"{sample_id}.png"
        try:
            with Image.open(path) as image:
                width, height = image.size
                orientation = image.getexif().get(ExifTags.Base.Orientation)
                size = (height, width) if orientation in (5, 6, 7, 8) else (width, height)
        except OSError:
            size = None
        real[sample_id] = Sample(sample_id, path, row["label"], "real", credit=row, size=size)
    complete_moments = {}
    for scenario, timeline in moments.items():
        views = [tuple(sorted(items, key=lambda item: item.camera)) for items in timeline.values()
                 if len({item.camera for item in items}) == 8 and len({item.label for item in items}) == 1]
        if views:
            complete_moments[scenario] = views
    return validation, real, summaries, complete_moments
