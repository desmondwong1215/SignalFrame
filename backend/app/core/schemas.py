from enum import Enum

from pydantic import BaseModel, Field


class Decision(str, Enum):
    NOT_AI_GENERATED = "not_ai_generated"
    AI_GENERATED = "ai_generated"


class Confidence(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class FrameSample(BaseModel):
    dataUrl: str = Field(min_length=32, max_length=250000)
    timestampSec: float = Field(ge=0, le=100000)
    width: int = Field(ge=32, le=1920)
    height: int = Field(ge=32, le=1080)


class VisualSignals(BaseModel):
    frameSamples: list[FrameSample] = Field(default_factory=list, max_length=4)
    videoWidth: int = Field(ge=32, le=4096)
    videoHeight: int = Field(ge=32, le=2160)
    durationSec: float = Field(ge=0, le=200000)
    playbackRate: float = Field(ge=0.25, le=4)
    videoSrcUrl: str | None = Field(default=None, max_length=2048)
    videoStreamProbeBase64: str | None = Field(default=None, max_length=200000)
    videoStreamMimeType: str | None = Field(default=None, max_length=80)
    videoStreamNote: str | None = Field(default=None, max_length=300)


class AnalyzeRequest(BaseModel):
    site: str = Field(pattern=r"^(youtube|facebook|x|tiktok|instagram)$")
    pageType: str = Field(pattern=r"^(video|short)$")
    videoId: str = Field(min_length=3, max_length=32)
    title: str = Field(default="", max_length=220)
    channelName: str = Field(default="", max_length=100)
    urlHash: str = Field(min_length=32, max_length=128)
    visualSignals: VisualSignals | None = None


class AnalyzeResponse(BaseModel):
    decision: Decision
    confidence: Confidence | None = None
    reason: str = Field(min_length=10, max_length=300)
    ttlSeconds: int = Field(ge=5, le=3600)
