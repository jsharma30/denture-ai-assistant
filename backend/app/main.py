"""Model server for the Denture AI Assistant.

POST /v1/analyze returns REAL_MODEL detections only when trained weights are
installed; otherwise 503. Photos are processed in memory and not stored.
"""
from __future__ import annotations

import json
import os

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import UnidentifiedImageError

from .model_runner import Detector, load_detector, open_upright

VIEWS = {"OCCLUSAL_MAXILLARY", "OCCLUSAL_MANDIBULAR", "FRONTAL", "RPD_REPLACEMENT_CLOSEUP", "OPPOSING_OCCLUSION"}
MAX_BYTES = 25 * 1024 * 1024

app = FastAPI(title="Denture AI Assistant model server", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "https://jsharma30.github.io,http://localhost:8080").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_detector: Detector | None = None
_loaded = False


def get_detector() -> Detector | None:
    global _detector, _loaded
    if not _loaded:
        _detector, _loaded = load_detector(), True
    return _detector


@app.get("/health")
def health(detector: Detector | None = Depends(get_detector)) -> dict:
    return {"status": "ok", "model_loaded": detector is not None,
            "model_version": detector.version if detector else None}


@app.post("/v1/analyze")
async def analyze(
    photo: UploadFile = File(...),
    view: str = Form(...),
    case: str = Form("{}"),
    detector: Detector | None = Depends(get_detector),
) -> dict:
    if view not in VIEWS:
        raise HTTPException(422, f"Unknown view {view!r}")
    try:
        json.loads(case)
    except json.JSONDecodeError:
        raise HTTPException(422, "case must be JSON")
    if detector is None:
        raise HTTPException(503, "No trained model is installed on this server yet.")
    data = await photo.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Photo is larger than 25 MB.")
    try:
        image = open_upright(data)
    except (UnidentifiedImageError, OSError):
        raise HTTPException(422, "The upload is not a readable photo.")
    return {
        "source": "REAL_MODEL",
        "model_loaded": True,
        "model_version": detector.version,
        "view": view,
        "image_size": {"width": image.width, "height": image.height},
        "items": detector.detect(image),
    }
