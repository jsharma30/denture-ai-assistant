"""Train the YOLOv8-OBB tooth detector. NOT run during the pilot.

Only run this after the pilot data has passed QC (see pilot_rpd/ANNOTATION_PROTOCOL.md),
on a machine with a GPU:

  pip install ultralytics
  python3 convert_cvat.py pilot_rpd/cases dataset/
  python3 train_obb.py dataset/data.yaml

The best weights end up in runs/obb/train*/weights/best.pt; copy them to
backend/models/tooth_obb.pt. Report results on the TEST split only once.
"""
import sys

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    from ultralytics import YOLO

    model = YOLO("yolov8s-obb.pt")
    model.train(
        data=sys.argv[1],
        imgsz=1024,
        epochs=150,
        patience=30,
        batch=8,
        # Mild augmentation only: no left-right flips, because a flip would swap
        # FDI quadrants (e.g. 14 would look like 24) and corrupt the labels.
        fliplr=0.0,
        flipud=0.0,
        degrees=10,
        hsv_v=0.3,
    )
