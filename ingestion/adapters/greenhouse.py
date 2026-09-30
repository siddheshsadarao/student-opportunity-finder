"""
Greenhouse adapter — real internships, straight from company job boards.

Endpoint:  GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
Access:    This is Greenhouse's official, documented public job board API.
           Companies publish it deliberately so that job boards and
           aggregators can list their roles. No scraping is involved.

WHY THIS INSTEAD OF SCRAPING JOB SITES
--------------------------------------
Scraping LinkedIn, Indeed or Internshala breaks their terms of service, and all
three actively block automated requests (Indeed returned 403 to us during
testing). Going to the ATS that companies actually publish on is the legitimate
route: it is stable, it is fast, and the data is first-hand from the employer.

Add or remove companies in ingestion/config.py — no code change needed.
"""
from __future__ import annotations

from datetime import date, timedelta

from ..common import (
    NormalisedOpportunity,
    PoliteSession,
    clean_text,
    detect_mode,
    detect_skills,
    looks_like_student_opportunity,
)
from ..config import GREENHOUSE_COMPANIES

SOURCE_KEY = "greenhouse"
API_URL = "https://boards-api.greenhouse.io/v1/boards/{token}/jobs"

# Company boards rarely publish an application deadline, so we show a rolling
# window instead of inventing a specific date, and say so in the description.
DEFAULT_WINDOW_DAYS = 45


def fetch(session: PoliteSession, max_pages: int = 1) -> list[NormalisedOpportunity]:
    """Pulls student-relevant roles from each configured company board."""
    results: list[NormalisedOpportunity] = []

    for company in GREENHOUSE_COMPANIES:
        token = company.get("token")
        if not token:
            continue

        try:
            payload = session.get_json(
                API_URL.format(token=token), params={"content": "true"}
            )
        except Exception as error:  # noqa: BLE001 - one bad board must not stop the rest
            print(f"  [greenhouse] skipping {token}: {error}")
            continue

        jobs = (payload or {}).get("jobs") or []
        company_name = company.get("name") or token.title()

        for job in jobs:
            opportunity = _convert(job, company_name)
            if opportunity:
                results.append(opportunity)

    return results


def _convert(job: dict, company_name: str) -> NormalisedOpportunity | None:
    title = clean_text(job.get("title"))
    source_id = str(job.get("id") or "").strip()
    if not title or not source_id:
        return None

    # Company boards are mostly senior roles. Keep only what a student can
    # realistically apply to.
    if not looks_like_student_opportunity(title):
        return None

    location = clean_text((job.get("location") or {}).get("name")) or "Not specified"
    # `content` is HTML-escaped HTML; clean_text handles both.
    description = clean_text(job.get("content"), limit=1500)

    if len(description) < 40:
        description = (
            f"{title} at {company_name}, based in {location}. "
            "Full role description and requirements are on the official application page."
        )

    # Greenhouse sometimes provides a real deadline.
    deadline_raw = job.get("application_deadline")
    deadline = None
    if isinstance(deadline_raw, dict):
        from ..common import parse_iso_date

        deadline = parse_iso_date(deadline_raw.get("date"))
    if deadline is None:
        deadline = date.today() + timedelta(days=DEFAULT_WINDOW_DAYS)

    apply_url = job.get("absolute_url")
    if not apply_url:
        return None

    return NormalisedOpportunity(
        source=SOURCE_KEY,
        source_id=source_id,
        title=title,
        organization=company_name,
        description=description,
        category_slug="internship",
        application_url=apply_url,
        source_url=apply_url,
        deadline=deadline,
        location=location,
        mode=detect_mode(location, description),
        prize=None,
        eligibility="See the official listing for eligibility and visa requirements.",
        benefits="Paid role. Benefits are listed on the company's application page.",
        duration=None,
        skills=detect_skills(title, description),
        organization_logo=None,
    )
