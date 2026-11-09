"""Convert pilot CVAT exports into (1) a YOLOv8-OBB tooth dataset and
(2) per-photo landmark files in the app's annotation format.

Nothing is trained here.

Usage:
  python3 convert_cvat.py pilot_rpd/cases  out_dataset/
Each case folder must contain annotations/*.zip (CVAT for images 1.1) or
annotations/annotations.xml, and photos/ with the original photos.
"""
from __future__ import annotations

import hashlib
import json
import math
import shutil
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

FDI = [q * 10 + t for q in (1, 2, 3, 4) for t in range(1, 9)]
CLASSES = [f"fdi_{f}_{k}" for f in FDI for k in ("natural", "artificial")]
VIEW_BY_SUFFIX = {
    "1": "OCCLUSAL_MAXILLARY", "2": "OCCLUSAL_MANDIBULAR", "3": "FRONTAL",
    "4": "RPD_REPLACEMENT_CLOSEUP", "5": "OPPOSING_OCCLUSION",
}


def attrs(el: ET.Element) -> dict:
    out = {}
    for a in el.findall("attribute"):
        v = (a.text or "").strip()
        name = a.get("name")
        if name in ("fdi", "abutment"):
            out[name] = int(v)
        elif name == "fdi_uncertain":
            out[name] = v.lower() == "true"
        elif name == "length_mm":
            out[name] = float(v)
        elif v:
            out[name] = v
    return out


def box_item(el: ET.Element) -> dict:
    xtl, ytl, xbr, ybr = (float(el.get(k)) for k in ("xtl", "ytl", "xbr", "ybr"))
    angle = float(el.get("rotation", 0))  # CVAT: degrees clockwise on screen = app convention
    angle = ((angle + 90) % 180) - 90
    return {"label": el.get("label"), "shape": "rotated_box",
            "box": {"cx": (xtl + xbr) / 2, "cy": (ytl + ybr) / 2, "w": xbr - xtl, "h": ybr - ytl, "angle_deg": angle},
            "attributes": attrs(el)}


def points_item(el: ET.Element, shape: str) -> dict:
    pts = [[float(x) for x in p.split(",")] for p in el.get("points").split(";")]
    return {"label": el.get("label"), "shape": shape, "points": pts, "attributes": attrs(el)}


def corners(box: dict) -> list[tuple[float, float]]:
    t = math.radians(box["angle_deg"])
    u, v = (math.cos(t), math.sin(t)), (-math.sin(t), math.cos(t))
    hw, hh = box["w"] / 2, box["h"] / 2
    return [(box["cx"] + su * hw * u[0] + sv * hh * v[0], box["cy"] + su * hw * u[1] + sv * hh * v[1])
            for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


def read_xml(case_dir: Path) -> ET.Element:
    ann = case_dir / "annotations"
    xml = ann / "annotations.xml"
    if xml.exists():
        return ET.parse(xml).getroot()
    zips = sorted(ann.glob("*.zip"))
    if not zips:
        raise FileNotFoundError(f"No CVAT export in {ann}")
    with zipfile.ZipFile(zips[-1]) as z:
        return ET.fromstring(z.read("annotations.xml"))


def split_for(case_id: str) -> str:
    """Stable split by case (never by photo), so one patient's photos stay together."""
    h = int(hashlib.sha256(case_id.encode()).hexdigest(), 16) % 10
    return "test" if h == 0 else "val" if h == 1 else "train"


def convert(cases_root: Path, out: Path) -> dict:
    stats = {"cases": 0, "photos": 0, "teeth": 0, "problems": []}
    for case_dir in sorted(p for p in cases_root.iterdir() if p.is_dir() and p.name.startswith("RPD-")):
        try:
            root = read_xml(case_dir)
        except FileNotFoundError as e:
            stats["problems"].append(str(e))
            continue
        split = split_for(case_dir.name)
        stats["cases"] += 1
        for img in root.iter("image"):
            name = Path(img.get("name")).name
            src = case_dir / "photos" / name
            if not src.exists():
                stats["problems"].append(f"{case_dir.name}: photo {name} not found")
                continue
            W, H = float(img.get("width")), float(img.get("height"))
            items = [box_item(b) for b in img.findall("box")]
            items += [points_item(p, "point") for p in img.findall("points")]
            items += [points_item(p, "polyline") for p in img.findall("polyline")]
            items += [points_item(p, "polygon") for p in img.findall("polygon")]
            lines, seen = [], set()
            for it in items:
                if it["label"] != "TOOTH":
                    continue
                a = it["attributes"]
                if a.get("fdi") not in FDI or a.get("kind") not in ("natural", "artificial"):
                    stats["problems"].append(f"{name}: tooth with bad fdi/kind {a}")
                    continue
                if a["fdi"] in seen:
                    stats["problems"].append(f"{name}: FDI {a['fdi']} labelled twice")
                seen.add(a["fdi"])
                cls = CLASSES.index(f"fdi_{a['fdi']}_{a['kind']}")
                pts = " ".join(f"{min(max(x / W, 0), 1):.6f} {min(max(y / H, 0), 1):.6f}" for x, y in corners(it["box"]))
                lines.append(f"{cls} {pts}")
            (out / "images" / split).mkdir(parents=True, exist_ok=True)
            (out / "labels" / split).mkdir(parents=True, exist_ok=True)
            (out / "landmarks").mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, out / "images" / split / name)  # byte-identical copy
            (out / "labels" / split / f"{Path(name).stem}.txt").write_text("\n".join(lines) + ("\n" if lines else ""))
            view = VIEW_BY_SUFFIX.get(Path(name).stem.split("_")[1], "UNKNOWN")
            (out / "landmarks" / f"{Path(name).stem}.json").write_text(json.dumps(
                {"case_id": case_dir.name, "view": view, "file": name, "width": W, "height": H, "items": items}, indent=1))
            stats["photos"] += 1
            stats["teeth"] += len(lines)
    (out / "data.yaml").write_text(
        f"path: {out.resolve()}\ntrain: images/train\nval: images/val\ntest: images/test\n"
        f"names:\n" + "".join(f"  {i}: {n}\n" for i, n in enumerate(CLASSES)))
    return stats


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    s = convert(Path(sys.argv[1]), Path(sys.argv[2]))
    print(json.dumps(s, indent=2))
