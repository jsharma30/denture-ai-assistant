# Machine learning

- **Start here for the pilot dataset:** [`pilot_rpd/README.md`](pilot_rpd/README.md)

No model has been trained yet. The app only shows a result as
**REAL MODEL OUTPUT** when real trained weights are installed on the model
server (`backend/`); otherwise results are **STUDENT-ANNOTATED** (the
student's own landmarks) or clearly labelled **DEMO / MOCK**.

| File | Purpose |
|---|---|
| `convert_cvat.py` | Turns QC-passed CVAT exports into a YOLOv8-OBB tooth dataset plus landmark files. Splits by case so a patient's photos never appear in both training and test sets. |
| `train_obb.py` | Training recipe for the tooth detector. **Not run during the pilot.** Left-right flips are disabled because they would swap FDI quadrants. |
| `tests/` | Tests for the converter. |

Planned approach once enough data exists: YOLOv8-OBB for teeth (rotated boxes
give the long-axis angle directly), a keypoint model (or Detectron2) for
landmarks, then the same clinical rules engine the app already uses.
