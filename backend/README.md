# Model server (optional)

Runs a trained tooth detector for the "Try AI model" button. **No model has
been trained yet**, so the server answers `503 No trained model is installed`
and the app tells the student so. It never returns made-up detections.

```bash
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

When a model exists: `pip install ultralytics`, put the weights at
`models/tooth_obb.pt` (or set `TOOTH_MODEL_PATH`), restart, and enter the
server address in the app's Settings. Class names must be
`fdi_<FDI>_<natural|artificial>` (e.g. `fdi_14_artificial`).

Photos are processed in memory and never stored. EXIF orientation is applied
to an in-memory copy so coordinates match what the browser shows.

Tests: `pip install -r requirements-dev.txt && pytest`
