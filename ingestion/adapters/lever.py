"""Student roles from Lever's documented public Postings API."""
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
from ..config import LEVER_COMPANIES

SOURCE_KEY = "lever"
API_URL = "https://api.lever.co/v0/postings/{board}"
DEFAULT_WINDOW_DAYS = 45


def fetch(session: PoliteSession, max_pages: int = 1) -> list[NormalisedOpportunity]:
    results: list[NormalisedOpportunity] = []
    for company in LEVER_COMPANIES:
        board = company["board"]
        try:
            jobs = session.get_json(API_URL.format(board=board), params={"mode": "json"}) or []
        except Exception as error:  # one company board must not stop the run
            print(f"  [lever] skipping {board}: {error}")
            continue

        for job in jobs:
            item = _convert(job, company["name"])
            if item:
                results.append(item)
    return results


def _convert(job: dict, company_name: str) -> NormalisedOpportunity | None:
    title = clean_text(job.get("text"))
    source_id = str(job.get("id") or "")
    if not title or not source_id or not looks_like_student_opportunity(title):
        return None

    categories = job.get("categories") or {}
    location = clean_text(categories.get("location")) or "Not specified"
    lists = " ".join(
        f"{entry.get('text', '')} {entry.get('content', '')}"
        for entry in (job.get("lists") or [])
    )
    description = clean_text(
        f"{job.get('descriptionPlain') or job.get('description') or ''} {lists}",
        limit=1800,
    )
    hosted_url = job.get("hostedUrl") or job.get("applyUrl")
    if not hosted_url:
        return None

    return NormalisedOpportunity(
        source=SOURCE_KEY,
        source_id=source_id,
        title=title,
        organization=company_name,
        description=description or f"{title} at {company_name}. See the official role page for details.",
        category_slug="internship",
        application_url=hosted_url,
        source_url=hosted_url,
        deadline=date.today() + timedelta(days=DEFAULT_WINDOW_DAYS),
        location=location,
        mode=detect_mode(job.get("workplaceType", ""), location, description),
        eligibility="Student, intern, graduate or early-career role. Check the official listing for exact requirements.",
        benefits="Compensation and benefits are listed on the employer's official application page.",
        duration=clean_text(categories.get("commitment")) or None,
        skills=detect_skills(title, description, extra_tags=job.get("tags") or []),
    )
