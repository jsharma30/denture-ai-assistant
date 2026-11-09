import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main
from app.model_runner import open_upright, tooth_item


def jpeg(w=40, h=20, orientation=None) -> bytes:
    img = Image.new("RGB", (w, h), (200, 180, 170))
    buf = io.BytesIO()
    if orientation:
        exif = Image.Exif()
        exif[0x0112] = orientation
        img.save(buf, "JPEG", exif=exif)
    else:
        img.save(buf, "JPEG")
    return buf.getvalue()


class FakeDetector:
    """Test double only: proves the response wiring, never used by the server itself."""
    version = "test-double"

    def detect(self, image):
        return [tooth_item("fdi_14_artificial", 10, 5, 8, 6, 3.0, 0.9)]


@pytest.fixture
def client():
    main.app.dependency_overrides.clear()
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def post(client, view="FRONTAL", data=None):
    return client.post("/v1/analyze", files={"photo": ("p.jpg", data or jpeg(), "image/jpeg")}, data={"view": view, "case": "{}"})


def test_health_without_model(client):
    main.app.dependency_overrides[main.get_detector] = lambda: None
    assert client.get("/health").json() == {"status": "ok", "model_loaded": False, "model_version": None}


def test_no_model_means_503_not_fake_output(client):
    main.app.dependency_overrides[main.get_detector] = lambda: None
    r = post(client)
    assert r.status_code == 503
    assert "No trained model" in r.json()["detail"]


def test_real_model_result_is_labelled(client):
    main.app.dependency_overrides[main.get_detector] = lambda: FakeDetector()
    body = post(client).json()
    assert body["source"] == "REAL_MODEL"
    assert body["items"][0]["attributes"] == {"fdi": 14, "kind": "artificial", "visibility": "full"}
    assert body["image_size"] == {"width": 40, "height": 20}


def test_unknown_view_and_bad_photo(client):
    main.app.dependency_overrides[main.get_detector] = lambda: FakeDetector()
    assert post(client, view="LATERAL").status_code == 422
    assert post(client, data=b"not an image").status_code == 422


def test_exif_rotation_applied_to_copy_only():
    data = jpeg(40, 20, orientation=6)  # rotate 90°
    before = bytes(data)
    img = open_upright(data)
    assert (img.width, img.height) == (20, 40)
    assert data == before


def test_class_names_are_validated():
    with pytest.raises(ValueError):
        tooth_item("fdi_19_natural", 0, 0, 1, 1, 0, 1)
    with pytest.raises(ValueError):
        tooth_item("fdi_14_metal", 0, 0, 1, 1, 0, 1)


def test_default_loader_finds_no_weights(tmp_path, monkeypatch):
    from app import model_runner
    monkeypatch.setenv("TOOTH_MODEL_PATH", str(tmp_path / "missing.pt"))
    assert model_runner.load_detector() is None
