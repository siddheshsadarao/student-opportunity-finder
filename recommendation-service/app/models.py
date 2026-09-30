"""
Request and response shapes (Pydantic models).

FastAPI uses these to validate incoming JSON, to serialise responses and to
generate the interactive documentation at /docs automatically.
"""
from typing import Any

from pydantic import BaseModel, Field


class RecommendationRequest(BaseModel):
    """Body of POST /recommend."""

    student_id: int = Field(..., ge=1, description="users.id of the student")
    limit: int = Field(20, ge=1, le=200, description="How many results to return")


class SignalBreakdown(BaseModel):
    """One scoring signal, with how much it contributed."""

    key: str
    label: str
    score: float = Field(..., description="This signal's own score, 0 to 1")
    weight: float = Field(..., description="How much this signal counts overall")
    points: float = Field(..., description="score x weight x 100, the actual contribution")
    detail: str | None = Field(None, description="Plain-English explanation")


class EligibilityVerdict(BaseModel):
    status: str = Field(..., description="eligible | ineligible | unknown")
    reason: str | None = None
    degreeMatch: bool | None = None


class MatchAnalysis(BaseModel):
    """The full analysis rendered by the 'Why this matches you' panel."""

    score: int
    verdict: str = Field(..., description="Excellent match / Strong match / ...")
    signals: list[SignalBreakdown]
    matchedSkills: list[str]
    missingSkills: list[str] = Field(..., description="Skills to learn for a better match")
    matchedInterests: list[str]
    eligibility: EligibilityVerdict
    strengths: list[str]
    gaps: list[str] = Field(..., description="Honest reasons this may not fit")
    profileUsed: dict[str, Any] = Field(..., description="Which profile fields were available")


class RecommendationItem(BaseModel):
    """One scored opportunity."""

    opportunity_id: int
    recommendation_score: int = Field(..., ge=0, le=100, description="Match percentage")
    reasons: list[str] = Field(default_factory=list)
    breakdown: dict[str, float] = Field(default_factory=dict)
    analysis: MatchAnalysis | None = None


class RecommendationResponse(BaseModel):
    """Body of the POST /recommend response."""

    student_id: int
    count: int
    algorithm: str
    recommendations: list[RecommendationItem]


class ExplanationResponse(BaseModel):
    """Body of the GET /explain/{student_id}/{opportunity_id} response."""

    student_id: int
    opportunity_id: int
    recommendation_score: int
    reasons: list[str]
    breakdown: dict[str, float]
    weights: dict[str, float]
    analysis: MatchAnalysis | None = None


class HealthResponse(BaseModel):
    """Body of the GET /health response."""

    status: str
    service: str
    database: bool
    algorithm: str
