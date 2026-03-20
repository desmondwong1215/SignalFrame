from __future__ import annotations

import json
import re

import httpx

from app.core.detector import SignalDetector
from app.core.schemas import AnalyzeRequest, AnalyzeResponse, Confidence, Decision
from app.core.settings import settings


def _choose_groq() -> bool:
    pref = settings.explanation_provider.strip().lower()
    if pref == "local" or pref == "none":
        return False
    return bool(settings.groq_api_key)


def _build_payload_bundle(payload: AnalyzeRequest, fallback: AnalyzeResponse, signal_summary: str) -> dict:
    visual = payload.visualSignals
    frame_samples = visual.frameSamples if visual else []
    stream_probe = visual.videoStreamProbeBase64 if visual and visual.videoStreamProbeBase64 else ""

    return {
        "site": payload.site,
        "pageType": payload.pageType,
        "videoId": payload.videoId,
        "urlHash": payload.urlHash,
        "title": payload.title,
        "channelName": payload.channelName,
        "visualSignals": {
            "videoWidth": visual.videoWidth if visual else None,
            "videoHeight": visual.videoHeight if visual else None,
            "durationSec": visual.durationSec if visual else None,
            "playbackRate": visual.playbackRate if visual else None,
            "videoSrcUrl": visual.videoSrcUrl if visual else None,
            "videoStreamMimeType": visual.videoStreamMimeType if visual else None,
            "videoStreamNote": visual.videoStreamNote if visual else None,
            "videoStreamProbeBase64Preview": stream_probe[:512] if stream_probe else None,
            "videoStreamProbeLength": len(stream_probe) if stream_probe else 0,
            "frameSamples": [
                {
                    "timestampSec": frame.timestampSec,
                    "width": frame.width,
                    "height": frame.height,
                    "dataUrlPreview": frame.dataUrl[:80],
                }
                for frame in frame_samples
            ],
            "frameSampleCount": len(frame_samples),
            "note": "Full frame images are attached to this request as image blocks.",
        },
        "localFallback": {
            "decision": fallback.decision,
            "confidence": fallback.confidence,
            "reason": fallback.reason,
            "signalSummary": signal_summary,
        },
    }


def _prompt(bundle: dict) -> str:
    return (
        "You are the final decision maker for AI-video detection.\n"
        "Decide using ALL provided data, including raw frame images, video stream probe bytes, videoId, and urlHash.\n"
        "Output STRICT JSON only with keys: decision, confidence, reason.\n"
        "Rules:\n"
        "- decision must be exactly 'ai_generated' or 'not_ai_generated'.\n"
        "- confidence must be one of 'low','medium','high' only when decision is 'ai_generated'.\n"
        "- confidence must be null when decision is 'not_ai_generated'.\n"
        "- reason must be 25-70 words in plain, everyday language for non-technical users.\n"
        "- reason should mention only the most helpful clues and avoid jargon, scores, or model internals.\n"
        "- reason must be normal sentence text only; do not use arrays, brackets, bullet points, or JSON fragments.\n"
        "- strongly prioritize visual evidence from frames over metadata-only hints.\n"
        "- do NOT treat normal editing effects as AI evidence: transitions, cuts, split-screen, speed ramps, color grading, overlays, and common filters are allowed.\n"
        "- classify as AI-generated only when there are genuinely unnatural artifacts that cannot be explained by normal editing.\n"
        "- check for inconsistent object geometry across frames.\n"
        "- check for impossible physics or motion.\n"
        "- check for backgrounds or details that morph between frames.\n"
        "- check for unnatural reflections, water, hands, teeth, eyes, or text rendering.\n"
        "- check for audio and lip-sync mismatch when evidence is available; if audio is unavailable, state that limitation briefly and continue with visual evidence.\n"
        "- reference concrete evidence from metadata and visual/stream inputs when available.\n"
        "- Do not add extra keys or markdown.\n"
        f"INPUT_JSON={json.dumps(bundle, ensure_ascii=True)}"
    )


def _sanitize_reason_text(reason: str) -> str:
    cleaned = " ".join(reason.replace("\n", " ").split())
    cleaned = cleaned.replace("[", "").replace("]", "")
    cleaned = cleaned.replace("{", "").replace("}", "")
    cleaned = cleaned.replace("\"", "")
    if len(cleaned) > 300:
        cleaned = cleaned[:297].rstrip() + "..."
    return cleaned


def _extract_json_object(text: str) -> dict:
    try:
        return json.loads(text)
    except Exception:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise ValueError("No JSON object found in model response")
        return json.loads(match.group(0))


def _heuristic_decision_from_text(raw: str) -> AnalyzeResponse:
    low = raw.lower()
    if "not_ai_generated" in low or "not ai-generated" in low or "not ai generated" in low:
        decision = Decision.NOT_AI_GENERATED
        confidence = None
    else:
        decision = Decision.AI_GENERATED if "ai_generated" in low or "ai-generated" in low else Decision.NOT_AI_GENERATED
        if "high" in low:
            confidence = Confidence.HIGH
        elif "medium" in low:
            confidence = Confidence.MEDIUM
        elif "low" in low:
            confidence = Confidence.LOW
        else:
            confidence = Confidence.LOW if decision == Decision.AI_GENERATED else None

    reason = _sanitize_reason_text(raw)
    if len(reason) < 10:
        reason = "We checked the video and found mixed clues, so this is our best current result."

    return AnalyzeResponse(
        decision=decision,
        confidence=confidence,
        reason=reason,
        ttlSeconds=120,
    )


def _call_groq(prompt: str, frame_data_urls: list[str]) -> str:
    with httpx.Client(timeout=2.8) as client:
        headers = {
            "Authorization": f"Bearer {settings.groq_api_key}",
            "Content-Type": "application/json",
        }

        tried_errors: list[str] = []

        vision_candidates = [
            settings.groq_model,
            "llama-3.2-90b-vision-preview",
            "llama-3.2-11b-vision-preview",
        ]

        # Deduplicate while preserving order.
        seen: set[str] = set()
        vision_models: list[str] = []
        for model_name in vision_candidates:
            if not model_name or model_name in seen:
                continue
            seen.add(model_name)
            vision_models.append(model_name)

        if frame_data_urls:
            for model in vision_models:
                content: list[dict] = [{"type": "text", "text": prompt}]
                for data_url in frame_data_urls[:4]:
                    content.append({"type": "image_url", "image_url": {"url": data_url}})

                response = client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers=headers,
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": "Return valid compact JSON only."},
                            {"role": "user", "content": content},
                        ],
                        "temperature": 0.1,
                        "max_tokens": 260,
                    },
                )

                if response.is_success:
                    data = response.json()
                    return data["choices"][0]["message"]["content"].strip()

                tried_errors.append(f"vision:{model}:{response.status_code}")

        text_candidates = [
            settings.groq_model,
            "meta-llama/llama-4-scout-17b-16e-instruct",
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "openai/gpt-oss-20b",
        ]

        seen_text: set[str] = set()
        text_models: list[str] = []
        for model_name in text_candidates:
            if not model_name or model_name in seen_text:
                continue
            seen_text.add(model_name)
            text_models.append(model_name)

        for model in text_models:
            response = client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "Return valid compact JSON only."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 260,
                    "response_format": {"type": "json_object"},
                },
            )

            if response.is_success:
                data = response.json()
                return data["choices"][0]["message"]["content"].strip()

            tried_errors.append(f"text:{model}:{response.status_code}")

        raise RuntimeError("Groq request failed across model fallbacks: " + ", ".join(tried_errors))


def _parse_groq_decision(raw: str) -> AnalyzeResponse:
    try:
        parsed = _extract_json_object(raw)
    except Exception:
        return _heuristic_decision_from_text(raw)
    decision = Decision(parsed.get("decision", "not_ai_generated"))
    raw_confidence = parsed.get("confidence")

    confidence: Confidence | None
    if decision == Decision.AI_GENERATED and raw_confidence in {"low", "medium", "high"}:
        confidence = Confidence(raw_confidence)
    elif decision == Decision.AI_GENERATED:
        confidence = Confidence.LOW
    else:
        confidence = None

    reason = str(parsed.get("reason", "We checked the video and shared clues. The result was generated from those clues.")).strip()
    reason = _sanitize_reason_text(reason)

    return AnalyzeResponse(
        decision=decision,
        confidence=confidence,
        reason=reason,
        ttlSeconds=120,
    )


def decide_with_groq(payload: AnalyzeRequest) -> AnalyzeResponse:
    fallback = SignalDetector.evaluate(payload)
    signal_summary = SignalDetector.signal_summary(payload)

    if not _choose_groq():
        return fallback

    bundle = _build_payload_bundle(payload, fallback, signal_summary)
    prompt = _prompt(bundle)
    frame_data_urls = [frame.dataUrl for frame in (payload.visualSignals.frameSamples if payload.visualSignals else [])]

    try:
        raw = _call_groq(prompt, frame_data_urls)
        return _parse_groq_decision(raw)
    except Exception:
        return fallback
