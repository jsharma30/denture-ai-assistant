"""Loads a trained YOLOv8-OBB tooth detector, if one is installed.

No weights -> no model. The server then answers 503 and the app says so;
it never invents detections.
"""
from __future__ import annotations

import io
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from PIL import Image, ImageOps

DEFAULT_WEIGHTS = Path(__file__).resolve().parent.parent / "models" / "tooth_obb.pt"
FDI = [q * 10 + t for q in (1, 2, 3, 4) for t in range(1, 9)]


class Detector(Protocol):
    version: str

    def detect(self, image: Image.Image) -> list[dict]: ...


@dataclass
class YoloObbDetector:
    """Wraps an Ultralytics YOLOv8-OBB model whose class names are 'fdi_<number>_<natural|artificial>'."""
    weights: Path
    min_confidence: float = 0.35

    def __post_init__(self) -> None:
        from ultralytics import YOLO  # imported lazily: only needed with real weights
        self._model = YOLO(str(self.weights))
        self.version = f"yolov8-obb:{self.weights.name}"

    def detect(self, image: Image.Image) -> list[dict]:
        res = self._model.predict(image, verbose=False)[0]
        items = []
        for (cx, cy, w, h, r), cls, conf in zip(res.obb.xywhr.tolist(), res.obb.cls.tolist(), res.obb.conf.tolist()):
            if conf < self.min_confidence:
                continue
            items.append(tooth_item(self._model.names[int(cls)], cx, cy, w, h, math.degrees(r), conf))
        return items


def tooth_item(class_name: str, cx: float, cy: float, w: float, h: float, angle_deg: float, conf: float) -> dict:
    """Convert one detection to the app's annotation format (original-image pixels)."""
    _, fdi, kind = class_name.split("_")
    fdi = int(fdi)
    if fdi not in FDI or kind not in ("natural", "artificial"):
        raise ValueError(f"Unexpected class name {class_name!r}")
    return {
        "label": "TOOTH", "shape": "rotated_box",
        "box": {"cx": cx, "cy": cy, "w": w, "h": h, "angle_deg": angle_deg},
        "attributes": {"fdi": fdi, "kind": kind, "visibility": "full"},
        "confidence": round(conf, 3),
    }


def load_detector() -> Detector | None:
    weights = Path(os.environ.get("TOOTH_MODEL_PATH", DEFAULT_WEIGHTS))
    if not weights.exists():
        return None
    return YoloObbDetector(weights)


def open_upright(data: bytes) -> Image.Image:
    """Open the uploaded photo and apply its EXIF orientation to an in-memory copy.

    The uploaded bytes are never written back or stored. Browsers display photos
    with EXIF orientation applied, so coordinates match what the student sees.
    """
    img = Image.open(io.BytesIO(data))
    img.load()
    return ImageOps.exif_transpose(img).convert("RGB")
