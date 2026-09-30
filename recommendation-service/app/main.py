"""
FastAPI application for the recommendation microservice.

Start it with:
    uvicorn app.main:app --reload --port 8000

Interactive API documentation (great for a viva demo):
    http://127.0.0.1:8000/docs

Endpoints
    GET  /health              is the service and its database alive?
    POST /recommend           the main endpoint: student_id -> ranked list
    GET  /explain/{sid}/{oid} full score breakdown for one pair
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import (
    close_pool,
    fetch_opportunities,
    fetch_student,
    fetch_student_history,
    health_check,
    init_pool,
)
from .engine.recommender import recommender
from .models import (
    ExplanationResponse,
    HealthResponse,
    RecommendationItem,
    RecommendationRequest,
    RecommendationResponse,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Opens the database pool on start-up and closes it on shutdown."""
    init_pool()
    print(f"[reco] Recommendation service ready on http://{settings.HOST}:{settings.PORT}")
    yield
    close_pool()


app = FastAPI(
    title="Student Opportunity Finder - Recommendation Service",
    description=(
        "Content-based recommendation engine using TF-IDF and cosine "
        "similarity, with rule-based boosts for skills, category, work mode "
        "and location."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Only our own backend and frontend may call this service.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    """Used by the Express backend and the admin dashboard."""
    database_ok = health_check()
    return HealthResponse(
        status="ok" if database_ok else "degraded",
        service="recommendation-service",
        database=database_ok,
        algorithm="TF-IDF + cosine similarity",
    )


@app.post("/recommend", response_model=RecommendationResponse, tags=["recommendations"])
def recommend(request: RecommendationRequest) -> RecommendationResponse:
    """
    Returns ranked opportunity recommendations for one student.

    Request body:
        { "student_id": 2, "limit": 20 }

    Response:
        {
          "student_id": 2,
          "count": 20,
          "algorithm": "tfidf-cosine-v1",
          "recommendations": [
            { "opportunity_id": 7, "recommendation_score": 92,
              "reasons": ["You know Python, SQL", ...], "breakdown": {...} }
          ]
        }

    Note: "student_id" is the user id from the users table (the same id the
    JWT carries), not the student_profiles.id.
    """
    student = fetch_student(request.student_id)
    if student is None:
        raise HTTPException(
            status_code=404,
            detail=f"No student profile found for user id {request.student_id}.",
        )

    opportunities = fetch_opportunities()
    history = fetch_student_history(request.student_id)

    results = recommender.recommend(
        student=student,
        opportunities=opportunities,
        history=history,
        limit=request.limit,
    )

    return RecommendationResponse(
        student_id=request.student_id,
        count=len(results),
        algorithm="tfidf-cosine-v1",
        recommendations=[RecommendationItem(**item) for item in results],
    )


@app.get(
    "/explain/{student_id}/{opportunity_id}",
    response_model=ExplanationResponse,
    tags=["recommendations"],
)
def explain(student_id: int, opportunity_id: int) -> ExplanationResponse:
    """
    Full score breakdown for one student/opportunity pair.

    This is the endpoint to open during a viva: it shows exactly which part
    of the score came from text similarity, which from the skill overlap and
    so on.
    """
    student = fetch_student(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student profile not found.")

    opportunities = fetch_opportunities()
    history = fetch_student_history(student_id)

    # Score everything, then pick out the one we were asked about.
    results = recommender.recommend(
        student=student,
        opportunities=opportunities,
        history=history,
        limit=len(opportunities),
    )
    match = next((r for r in results if r["opportunity_id"] == opportunity_id), None)

    if match is None:
        raise HTTPException(
            status_code=404,
            detail="That opportunity is closed or does not exist, so it was not scored.",
        )

    return ExplanationResponse(
        student_id=student_id,
        opportunity_id=opportunity_id,
        recommendation_score=match["recommendation_score"],
        reasons=match["reasons"],
        breakdown=match["breakdown"],
        weights={
            "content": settings.WEIGHT_CONTENT,
            "skills": settings.WEIGHT_SKILLS,
            "category": settings.WEIGHT_CATEGORY,
            "interests": settings.WEIGHT_INTERESTS,
            "branch": settings.WEIGHT_BRANCH,
            "goal": settings.WEIGHT_GOAL,
            "mode": settings.WEIGHT_MODE,
            "location": settings.WEIGHT_LOCATION,
        },
        analysis=match.get("analysis"),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
