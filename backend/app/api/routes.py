from fastapi import APIRouter

from app.core.explainer import decide_with_groq
from app.core.schemas import AnalyzeRequest, AnalyzeResponse

router = APIRouter(prefix="/api/v1", tags=["analysis"])


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    return decide_with_groq(payload)


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
