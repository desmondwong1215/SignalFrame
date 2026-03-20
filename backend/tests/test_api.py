import sys
import base64
from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image  # type: ignore[import-not-found]

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.core.settings import settings


client = TestClient(app)


def _force_local_mode() -> None:
    settings.explanation_provider = "local"
    settings.groq_api_key = ""


def _frame_data_url(rgb: tuple[int, int, int]) -> str:
    image = Image.new("RGB", (160, 90), rgb)
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=62)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def test_health() -> None:
    _force_local_mode()
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_high_confidence_warning() -> None:
    _force_local_mode()
    payload = {
        "site": "youtube",
        "pageType": "video",
        "videoId": "abc12345678",
        "title": "Fully AI generated short film made with Sora and Midjourney",
        "channelName": "Synthetic Studio",
        "urlHash": "a" * 64,
    }
    response = client.post("/api/v1/analyze", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["decision"] == "ai_generated"
    assert body["confidence"] == "high"


def test_no_warning() -> None:
    _force_local_mode()
    payload = {
        "site": "youtube",
        "pageType": "video",
        "videoId": "abc12345678",
        "title": "Hiking around Kyoto in spring",
        "channelName": "Travel Notes",
        "urlHash": "b" * 64,
    }
    response = client.post("/api/v1/analyze", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["decision"] == "not_ai_generated"
    assert body["confidence"] is None


def test_fallback_without_api_keys() -> None:
    settings.explanation_provider = "groq"
    settings.groq_api_key = ""

    payload = {
        "site": "youtube",
        "pageType": "video",
        "videoId": "abc12345678",
        "title": "Fully AI generated short film made with Sora and Midjourney",
        "channelName": "Synthetic Studio",
        "urlHash": "c" * 64,
    }
    response = client.post("/api/v1/analyze", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["decision"] == "ai_generated"
    assert "ai-generated" in body["reason"].lower()


def test_explicit_local_mode() -> None:
    _force_local_mode()
    settings.explanation_provider = "local"

    payload = {
        "site": "youtube",
        "pageType": "video",
        "videoId": "abc12345678",
        "title": "Some AI generated concept trailer",
        "channelName": "Prompt Cuts",
        "urlHash": "d" * 64,
    }
    response = client.post("/api/v1/analyze", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["reason"]


def test_visual_signals_are_processed() -> None:
    _force_local_mode()
    payload = {
        "site": "youtube",
        "pageType": "video",
        "videoId": "zz123456789",
        "title": "City walk test clip",
        "channelName": "VideoLab",
        "urlHash": "e" * 64,
        "visualSignals": {
            "frameSamples": [
                {"dataUrl": _frame_data_url((129, 129, 129)), "timestampSec": 5.1, "width": 160, "height": 90},
                {"dataUrl": _frame_data_url((130, 130, 130)), "timestampSec": 5.3, "width": 160, "height": 90},
                {"dataUrl": _frame_data_url((129, 129, 130)), "timestampSec": 5.5, "width": 160, "height": 90},
            ],
            "videoWidth": 160,
            "videoHeight": 90,
            "durationSec": 42.0,
            "playbackRate": 1.0,
        },
    }

    response = client.post("/api/v1/analyze", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert "sampled frames" in body["reason"].lower() or "ai-generated" in body["reason"].lower()
