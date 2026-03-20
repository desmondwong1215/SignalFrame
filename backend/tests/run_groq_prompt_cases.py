from __future__ import annotations

import base64
import random
from io import BytesIO

import requests  # type: ignore[import-untyped]
from PIL import Image, ImageDraw

API_URL = "http://127.0.0.1:8000/api/v1/analyze"


def _to_data_url(image: Image.Image) -> str:
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=70)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def _make_solid_frame(rgb: tuple[int, int, int]) -> str:
    image = Image.new("RGB", (320, 180), rgb)
    return _to_data_url(image)


def _make_noisy_frame(seed: int) -> str:
    random.seed(seed)
    image = Image.new("RGB", (320, 180))
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            pixels[x, y] = (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
    return _to_data_url(image)


def _make_checker_text_frame(seed: int) -> str:
    random.seed(seed)
    image = Image.new("RGB", (320, 180), (245, 245, 245))
    draw = ImageDraw.Draw(image)

    # Draw inconsistent blocks and warped text-like shapes.
    for _ in range(35):
        x1 = random.randint(0, 300)
        y1 = random.randint(0, 160)
        x2 = min(319, x1 + random.randint(8, 35))
        y2 = min(179, y1 + random.randint(6, 25))
        color = (random.randint(20, 230), random.randint(20, 230), random.randint(20, 230))
        draw.rectangle((x1, y1, x2, y2), fill=color)

    for idx in range(6):
        draw.text((18 + idx * 45, 65 + (idx % 2) * 6), "TXT", fill=(10, 10, 10))

    return _to_data_url(image)


def _make_unstable_animal_frame(seed: int) -> str:
    random.seed(seed)
    image = Image.new("RGB", (320, 180), (218, 230, 219))
    draw = ImageDraw.Draw(image)

    body_x = 40 + seed * 38
    body_y = 88 + ((seed % 2) * 7)
    body_w = 120 + (seed % 3) * 18
    body_h = 46 + (seed % 4) * 6
    draw.ellipse((body_x, body_y, body_x + body_w, body_y + body_h), fill=(135, 95, 70))

    # Head and limbs intentionally shift in odd ways across frames.
    draw.ellipse((body_x + body_w - 5, body_y - 22, body_x + body_w + 40, body_y + 18), fill=(145, 105, 80))
    for idx in range(4):
        lx = body_x + 12 + idx * 24 + (seed * (idx % 2) * 3)
        draw.rectangle((lx, body_y + body_h - 6, lx + 8, body_y + body_h + 22 + (seed % 3) * 4), fill=(92, 62, 42))

    return _to_data_url(image)


def _make_unstable_building_frame(seed: int) -> str:
    random.seed(seed)
    image = Image.new("RGB", (320, 180), (205, 220, 238))
    draw = ImageDraw.Draw(image)

    # Building walls tilt and windows shift inconsistently between frames.
    left = 58 + seed * 4
    top = 34 + (seed % 2) * 5
    right = 258 + seed * 7
    bottom = 160
    draw.polygon([(left, bottom), (left + 16, top), (right, top + seed * 3), (right - 12, bottom)], fill=(166, 175, 191))

    for row in range(5):
        for col in range(4):
            wx = left + 24 + col * 43 + (seed % 3) * (2 if row % 2 == 0 else -2)
            wy = top + 18 + row * 22 + (seed % 2)
            draw.rectangle((wx, wy, wx + 18, wy + 12), fill=(87, 114, 154))

    return _to_data_url(image)


def _make_unstable_environment_frame(seed: int) -> str:
    random.seed(seed)
    image = Image.new("RGB", (320, 180), (132, 174, 230))
    draw = ImageDraw.Draw(image)

    # Wave and horizon lines morph unnaturally between frames.
    draw.rectangle((0, 110, 320, 180), fill=(63, 139, 186))
    for idx in range(7):
        x = idx * 52 + (seed * 5 % 17)
        y = 122 + (idx % 2) * 8 + (seed % 4) * 3
        draw.arc((x, y, x + 46, y + 22 + seed), start=0, end=180, fill=(219, 242, 251), width=3)

    draw.line((0, 108 + seed * 2, 320, 112 - seed), fill=(222, 238, 245), width=3)
    return _to_data_url(image)


def _make_split_screen_edit_frame(seed: int) -> str:
    random.seed(seed)
    image = Image.new("RGB", (320, 180), (240, 240, 240))
    draw = ImageDraw.Draw(image)

    # Legit split-screen look with stable geometry.
    draw.rectangle((0, 0, 158, 180), fill=(214, 225, 248))
    draw.rectangle((162, 0, 320, 180), fill=(233, 217, 244))
    draw.line((160, 0, 160, 180), fill=(40, 40, 40), width=4)

    for idx in range(5):
        draw.rectangle((20 + idx * 20, 28 + idx * 12, 46 + idx * 20, 42 + idx * 12), fill=(102, 124, 170))
        draw.rectangle((192 + idx * 17, 34 + idx * 11, 216 + idx * 17, 48 + idx * 11), fill=(148, 106, 166))

    return _to_data_url(image)


def _make_flash_transition_frame(seed: int) -> str:
    random.seed(seed)
    bg = (250, 250, 250) if seed % 2 == 0 else (30, 30, 30)
    image = Image.new("RGB", (320, 180), bg)
    draw = ImageDraw.Draw(image)

    # Fast bright/dark transition style frame, common in editing.
    alpha = 120 if seed % 2 == 0 else 200
    for idx in range(6):
        x = 18 + idx * 50
        draw.polygon([(x, 0), (x + 22, 0), (x + 42, 180), (x + 18, 180)], fill=(255, 255, 255, alpha))

    return _to_data_url(image)


def _make_overlay_text_edit_frame(seed: int) -> str:
    random.seed(seed)
    image = Image.new("RGB", (320, 180), (205, 214, 224))
    draw = ImageDraw.Draw(image)

    draw.rectangle((0, 140, 320, 180), fill=(36, 36, 36))
    draw.text((12, 149), "EP 3 - HIGHLIGHTS", fill=(250, 250, 250))
    draw.rectangle((240, 10, 312, 34), fill=(230, 74, 76))
    draw.text((252, 16), "LIVE", fill=(255, 255, 255))

    for idx in range(4):
        draw.ellipse((30 + idx * 62, 42, 66 + idx * 62, 78), fill=(122, 138, 154))

    return _to_data_url(image)


def _visual(frame_builder, note: str, src: str = "https://example-cdn/video.mp4") -> dict:
    return {
        "frameSamples": [
            {"dataUrl": frame_builder(1), "timestampSec": 1.2, "width": 320, "height": 180},
            {"dataUrl": frame_builder(2), "timestampSec": 1.8, "width": 320, "height": 180},
            {"dataUrl": frame_builder(3), "timestampSec": 2.4, "width": 320, "height": 180},
            {"dataUrl": frame_builder(4), "timestampSec": 3.1, "width": 320, "height": 180},
        ],
        "videoWidth": 320,
        "videoHeight": 180,
        "durationSec": 14.5,
        "playbackRate": 1.0,
        "videoSrcUrl": src,
        "videoStreamMimeType": "video/mp4",
        "videoStreamNote": note,
        "videoStreamProbeBase64": "AAECAwQFBgcICQoLDA0ODw==",
    }


def _solid_builder(seed: int) -> str:
    shades = [(118, 118, 118), (120, 120, 120), (121, 121, 121), (119, 119, 119)]
    return _make_solid_frame(shades[(seed - 1) % len(shades)])


def _noise_builder(seed: int) -> str:
    return _make_noisy_frame(seed)


def _checker_builder(seed: int) -> str:
    return _make_checker_text_frame(seed)


def _animal_unstable_builder(seed: int) -> str:
    return _make_unstable_animal_frame(seed)


def _building_unstable_builder(seed: int) -> str:
    return _make_unstable_building_frame(seed)


def _environment_unstable_builder(seed: int) -> str:
    return _make_unstable_environment_frame(seed)


def _split_screen_builder(seed: int) -> str:
    return _make_split_screen_edit_frame(seed)


def _flash_transition_builder(seed: int) -> str:
    return _make_flash_transition_frame(seed)


def _overlay_edit_builder(seed: int) -> str:
    return _make_overlay_text_edit_frame(seed)


def build_cases() -> list[dict]:
    return [
        {
            "id": "A1_metadata_plus_visual_strong",
            "expected": "ai_generated",
            "payload": {
                "site": "youtube",
                "pageType": "short",
                "videoId": "caseA1xyz01",
                "urlHash": "a" * 64,
                "title": "Impossible city transformation in 4 seconds",
                "channelName": "Future Visual Lab",
                "visualSignals": _visual(
                    _checker_builder,
                    "Strong geometry drift, background morphing, and unstable text rendering between sampled frames.",
                ),
            },
        },
        {
            "id": "A2_visual_impossible_motion",
            "expected": "ai_generated",
            "payload": {
                "site": "youtube",
                "pageType": "short",
                "videoId": "caseA2xyz02",
                "urlHash": "b" * 64,
                "title": "Street dance clip",
                "channelName": "Urban Cam",
                "visualSignals": _visual(
                    _checker_builder,
                    "Motion appears physically impossible with abrupt body deformation and hand shape changes.",
                ),
            },
        },
        {
            "id": "A3_metadata_hidden_visual_suspicious",
            "expected": "ai_generated",
            "payload": {
                "site": "youtube",
                "pageType": "video",
                "videoId": "caseA3xyz03",
                "urlHash": "c" * 64,
                "title": "A walk in the park",
                "channelName": "Daily Vlog",
                "visualSignals": _visual(
                    _checker_builder,
                    "Reflections and water patterns shift unrealistically; object edges warp frame-to-frame.",
                ),
            },
        },
        {
            "id": "A4_animal_unstable_anatomy",
            "expected": "ai_generated",
            "payload": {
                "site": "youtube",
                "pageType": "short",
                "videoId": "caseA4xyz04",
                "urlHash": "1" * 64,
                "title": "Running horse in the field",
                "channelName": "WildLife Moment",
                "visualSignals": _visual(
                    _animal_unstable_builder,
                    "Animal limbs and body proportions change unnaturally across consecutive frames.",
                ),
            },
        },
        {
            "id": "A5_building_geometry_break",
            "expected": "ai_generated",
            "payload": {
                "site": "youtube",
                "pageType": "video",
                "videoId": "caseA5xyz05",
                "urlHash": "2" * 64,
                "title": "Downtown skyline timelapse",
                "channelName": "City Lens",
                "visualSignals": _visual(
                    _building_unstable_builder,
                    "Building edges and windows drift and deform in ways that should not happen in real footage.",
                ),
            },
        },
        {
            "id": "A6_environment_impossible_morph",
            "expected": "ai_generated",
            "payload": {
                "site": "youtube",
                "pageType": "short",
                "videoId": "caseA6xyz06",
                "urlHash": "3" * 64,
                "title": "Ocean sunset scene",
                "channelName": "Nature Clips",
                "visualSignals": _visual(
                    _environment_unstable_builder,
                    "Water and horizon structure morph unrealistically from frame to frame.",
                ),
            },
        },
        {
            "id": "N1_human_scene_natural_variation",
            "expected": "not_ai_generated",
            "payload": {
                "site": "youtube",
                "pageType": "video",
                "videoId": "caseN1xyz11",
                "urlHash": "d" * 64,
                "title": "Cooking lunch at home",
                "channelName": "Home Kitchen Notes",
                "visualSignals": _visual(
                    _noise_builder,
                    "No major geometry drift; textures and lighting vary naturally across frames.",
                ),
            },
        },
        {
            "id": "N2_realistic_travel_clip",
            "expected": "not_ai_generated",
            "payload": {
                "site": "youtube",
                "pageType": "short",
                "videoId": "caseN2xyz12",
                "urlHash": "e" * 64,
                "title": "Sunrise walk in Kyoto",
                "channelName": "Travel Journal",
                "visualSignals": _visual(
                    _noise_builder,
                    "Shadows, reflections, and object geometry stay consistent as camera moves.",
                ),
            },
        },
        {
            "id": "N3_low_signal_should_not_overclaim",
            "expected": "not_ai_generated",
            "payload": {
                "site": "youtube",
                "pageType": "video",
                "videoId": "caseN3xyz13",
                "urlHash": "f" * 64,
                "title": "Quiet room ambiance",
                "channelName": "Study Hours",
                "visualSignals": _visual(
                    _solid_builder,
                    "Video is very plain and low-detail; no clear synthetic artifacts found.",
                ),
            },
        },
        {
            "id": "N4_split_screen_editing_effect",
            "expected": "not_ai_generated",
            "payload": {
                "site": "youtube",
                "pageType": "video",
                "videoId": "caseN4xyz14",
                "urlHash": "4" * 64,
                "title": "Interview split-screen recap",
                "channelName": "Studio Edit",
                "visualSignals": _visual(
                    _split_screen_builder,
                    "Deliberate split-screen layout and overlays from normal post-production.",
                ),
            },
        },
        {
            "id": "N5_hard_cut_flash_transition",
            "expected": "not_ai_generated",
            "payload": {
                "site": "youtube",
                "pageType": "short",
                "videoId": "caseN5xyz15",
                "urlHash": "5" * 64,
                "title": "Music teaser with strobe cuts",
                "channelName": "Beat Reel",
                "visualSignals": _visual(
                    _flash_transition_builder,
                    "Rapid hard cuts and flash transitions used as intentional editing style.",
                ),
            },
        },
        {
            "id": "N6_overlay_text_graphics",
            "expected": "not_ai_generated",
            "payload": {
                "site": "youtube",
                "pageType": "video",
                "videoId": "caseN6xyz16",
                "urlHash": "6" * 64,
                "title": "Sports highlight with graphics",
                "channelName": "Replay Hub",
                "visualSignals": _visual(
                    _overlay_edit_builder,
                    "Heavy text overlays, badges, and lower-thirds from standard editing package.",
                ),
            },
        },
    ]


def main() -> None:
    cases = build_cases()
    passed = 0

    print("Running Groq prompt cases against", API_URL)
    print("-" * 80)

    for case in cases:
        response = requests.post(API_URL, json=case["payload"], timeout=40)
        body = response.json()
        got = body.get("decision")
        ok = got == case["expected"]
        passed += int(ok)

        print(f"[{ 'PASS' if ok else 'FAIL' }] {case['id']}")
        print(f"  expected={case['expected']} got={got} confidence={body.get('confidence')}")
        print(f"  reason={body.get('reason')}")
        print("-" * 80)

    print(f"Summary: {passed}/{len(cases)} cases matched expected decision")


if __name__ == "__main__":
    main()
