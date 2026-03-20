from __future__ import annotations

from app.core.schemas import AnalyzeRequest, AnalyzeResponse, Confidence, Decision
from app.core.visual_detector import analyze_visual_signals

KEYWORDS_HIGH = {
    "ai generated",
    "made with ai",
    "fully ai",
    "midjourney",
    "sora",
    "veo",
    "runway",
    "synthetic video",
}

KEYWORDS_MEDIUM = {
    "ai",
    "generated",
    "prompt",
    "text to video",
    "image to video",
    "stable diffusion",
}


class SignalDetector:
    @staticmethod
    def _normalize(request: AnalyzeRequest) -> str:
        return f"{request.title} {request.channelName}".strip().lower()

    @classmethod
    def evaluate(cls, request: AnalyzeRequest) -> AnalyzeResponse:
        text = cls._normalize(request)

        matched_high = sorted([token for token in KEYWORDS_HIGH if token in text])
        matched_medium = sorted([token for token in KEYWORDS_MEDIUM if token in text])

        text_score = min(100, len(matched_high) * 50 + len(matched_medium) * 12)
        visual = analyze_visual_signals(request.visualSignals)

        if request.visualSignals and len(request.visualSignals.frameSamples) > 0:
            score = min(100, int(round(text_score * 0.55 + visual.score * 0.45)))
        else:
            score = text_score

        if score >= 75:
            confidence: Confidence | None = Confidence.HIGH
        elif score >= 55:
            confidence = Confidence.MEDIUM
        elif score >= 35:
            confidence = Confidence.LOW
        else:
            confidence = None

        if confidence is None:
            reason = (
                "This video looks like regular human-made content. "
                "We did not find strong AI clues in the title, channel, or sampled frames."
            )
            return AnalyzeResponse(
                decision=Decision.NOT_AI_GENERATED,
                confidence=None,
                reason=reason[:300],
                ttlSeconds=180,
            )

        metadata_clues = matched_high[:2] or matched_medium[:2]
        if metadata_clues:
            metadata_text = ", ".join(metadata_clues)
        else:
            metadata_text = "no strong metadata clues"

        visual_text = visual.evidence[0] if visual.evidence else "limited visual clues"

        reason = (
            "This video may be AI-generated. "
            f"We found AI-related clues in the title or channel, such as {metadata_text}, "
            f"and signs in sampled frames, including {visual_text}."
        )
        return AnalyzeResponse(
            decision=Decision.AI_GENERATED,
            confidence=confidence,
            reason=reason[:300],
            ttlSeconds=120,
        )

    @classmethod
    def signal_summary(cls, request: AnalyzeRequest) -> str:
        result = cls.evaluate(request)
        visual = analyze_visual_signals(request.visualSignals)
        return (
            f"decision={result.decision}, confidence={result.confidence}, visual_score={visual.score}, "
            f"visual_evidence={visual.evidence[:3]}, video_id={request.videoId}, url_hash={request.urlHash}, "
            f"title='{request.title[:120]}', channel='{request.channelName[:80]}'"
        )
