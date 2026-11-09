import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from convert_cvat import CLASSES, convert  # noqa: E402

XML = """<annotations><image id="0" name="RPD-001_4_replacement_region.jpg" width="1000" height="500">
<box label="TOOTH" xtl="100" ytl="100" xbr="200" ybr="300" rotation="0">
  <attribute name="fdi">14</attribute><attribute name="kind">artificial</attribute>
  <attribute name="visibility">full</attribute><attribute name="fdi_uncertain">false</attribute></box>
<box label="TOOTH" xtl="200" ytl="100" xbr="300" ybr="300" rotation="10">
  <attribute name="fdi">13</attribute><attribute name="kind">natural</attribute></box>
<polyline label="OCCLUSAL_PLANE" points="100,300;400,300"></polyline>
<polyline label="CALIBRATION_MARKER" points="50,450;150,450"><attribute name="length_mm">10</attribute></polyline>
</image></annotations>"""


def test_convert(tmp_path):
    case = tmp_path / "cases" / "RPD-001"
    (case / "annotations").mkdir(parents=True)
    (case / "photos").mkdir()
    (case / "annotations" / "annotations.xml").write_text(XML)
    photo = case / "photos" / "RPD-001_4_replacement_region.jpg"
    photo.write_bytes(b"\xff\xd8original-bytes")
    out = tmp_path / "ds"
    stats = convert(tmp_path / "cases", out)
    assert stats["photos"] == 1 and stats["teeth"] == 2 and not stats["problems"]
    label = next((out / "labels").rglob("*.txt")).read_text().splitlines()
    cls, *pts = label[0].split()
    assert CLASSES[int(cls)] == "fdi_14_artificial"
    assert [round(float(p), 3) for p in pts] == [0.1, 0.2, 0.2, 0.2, 0.2, 0.6, 0.1, 0.6]
    copied = next((out / "images").rglob("*.jpg"))
    assert copied.read_bytes() == photo.read_bytes()
    lm = json.loads(next((out / "landmarks").glob("*.json")).read_text())
    assert lm["view"] == "RPD_REPLACEMENT_CLOSEUP"
    assert {i["label"] for i in lm["items"]} == {"TOOTH", "OCCLUSAL_PLANE", "CALIBRATION_MARKER"}
    assert lm["items"][1]["box"]["angle_deg"] == 10
    assert "names:" in (out / "data.yaml").read_text()


def test_duplicate_fdi_is_reported(tmp_path):
    case = tmp_path / "cases" / "RPD-002"
    (case / "annotations").mkdir(parents=True)
    (case / "photos").mkdir()
    (case / "annotations" / "annotations.xml").write_text(XML.replace(">13<", ">14<").replace("RPD-001", "RPD-002"))
    (case / "photos" / "RPD-002_4_replacement_region.jpg").write_bytes(b"x")
    stats = convert(tmp_path / "cases", tmp_path / "ds")
    assert any("labelled twice" in p for p in stats["problems"])
