from __future__ import annotations

import base64
from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageFilter, ImageOps  # type: ignore[import-not-found]

from app.core.schemas import VisualSignals


@dataclass
class VisualScore:
    score: int
    confidence_hint: str
    evidence: list[str]


def _decode_data_url(data_url: str) -> Image.Image | None:
    if not data_url.startswith("data:image") or "," not in data_url:
        return None

    _, encoded = data_url.split(",", 1)
    try:
        data = base64.b64decode(encoded, validate=False)
        image = Image.open(BytesIO(data))
        return image.convert("RGB")
    except Exception:
        return None


def _image_entropy(image: Image.Image) -> float:
    gray = ImageOps.grayscale(image.resize((96, 54)))
    # Use Pillow entropy because it is numerically stable for grayscale histograms.
    return float(gray.entropy())


def _edge_density(image: Image.Image) -> float:
    gray = ImageOps.grayscale(image.resize((96, 54)))
    edges = gray.filter(ImageFilter.FIND_EDGES)
    values = list(edges.getdata())
    if not values:
        return 0.0
    strong = sum(1 for value in values if value > 28)
    return strong / len(values)


def _average_hash(image: Image.Image) -> int:
    gray = ImageOps.grayscale(image.resize((8, 8)))
    pixels = list(gray.getdata())
    avg = sum(pixels) / len(pixels)
    bits = 0
    for pixel in pixels:
        bits = (bits << 1) | int(pixel >= avg)
    return bits


def _hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def analyze_visual_signals(visual: VisualSignals | None) -> VisualScore:
    if visual is None or len(visual.frameSamples) == 0:
        return VisualScore(score=0, confidence_hint="low", evidence=["No visual frame samples were available."])

    images = []
    for frame in visual.frameSamples[:4]:
        decoded = _decode_data_url(frame.dataUrl)
        if decoded is not None:
            images.append(decoded)

    if len(images) == 0:
        return VisualScore(score=0, confidence_hint="low", evidence=["Frame samples could not be decoded."])

    entropies = [_image_entropy(image) for image in images]
    edge_densities = [_edge_density(image) for image in images]
    hashes = [_average_hash(image) for image in images]

    avg_entropy = sum(entropies) / len(entropies)
    avg_edges = sum(edge_densities) / len(edge_densities)

    similarities = []
    for idx in range(1, len(hashes)):
        distance = _hamming(hashes[idx - 1], hashes[idx])
        similarities.append(1 - (distance / 64))

    avg_similarity = sum(similarities) / len(similarities) if similarities else 0.0

    score = 0
    evidence: list[str] = []

    if avg_entropy < 3.4:
        score += 22
        evidence.append("Frames show low visual entropy and reduced texture diversity.")

    if avg_edges < 0.13:
        score += 18
        evidence.append("Edge density is unusually low, which can indicate over-smoothed synthetic visuals.")

    if avg_similarity > 0.92 and len(images) > 1:
        score += 28
        evidence.append("Consecutive sampled frames are highly similar with minimal natural variation.")

    # Rapid large changes can come from normal editing (hard cuts/transitions),
    # so treat them as a false-positive guard, not an AI signal.
    if avg_similarity < 0.28 and len(images) > 1:
        score -= 18
        evidence.append("Rapid frame changes look like normal cuts or transitions.")

    # Very high edge density can indicate split-screen/text overlays, which are
    # common editing effects and not AI evidence by themselves.
    if avg_edges > 0.33:
        score -= 14
        evidence.append("Strong overlays or split-screen style edges were detected.")

    if visual.videoWidth <= 480 and visual.videoHeight <= 360:
        score += 6
        evidence.append("Low resolution limits certainty and can hide visual artifacts.")

    score = max(0, min(100, score))

    if score >= 65:
        confidence = "high"
    elif score >= 35:
        confidence = "medium"
    else:
        confidence = "low"

    if not evidence:
        evidence.append("Visual samples did not show strong synthetic-content indicators.")

    return VisualScore(score=score, confidence_hint=confidence, evidence=evidence)
