"""Public job-board feeds filtered down to genuine student opportunities."""
from __future__ import annotations

from datetime import date, timedelta

from ..common import NormalisedOpportunity, PoliteSession, clean_text, detect_mode, detect_skills, looks_like_student_opportunity, parse_iso_date

REMOTIVE_KEY = "remotive"
ARBEITNOW_KEY = "arbeitnow"
REMOTIVE_URL = "https://remotive.com/api/remote-jobs"
ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api"
DEFAULT_WINDOW_DAYS = 35


def fetch_remotive(session: PoliteSession, max_pages: int = 1) -> list[NormalisedOpportunity]:
    payload = session.get_json(REMOTIVE_URL) or {}
    return [item for job in payload.get("jobs") or [] if (item := _from_remotive(job))]


def _from_remotive(job: dict) -> NormalisedOpportunity | None:
    title = clean_text(job.get("title"))
    if job.get("job_type") != "internship" and not looks_like_student_opportunity(title):
        return None
    url = job.get("url")
    source_id = str(job.get("id") or "")
    if not url or not source_id:
        return None
    description = clean_text(job.get("description"), limit=1800)
    location = clean_text(job.get("candidate_required_location")) or "Worldwide"
    return NormalisedOpportunity(
        source=REMOTIVE_KEY,
        source_id=source_id,
        title=title,
        organization=clean_text(job.get("company_name")) or "Employer",
        organization_logo=job.get("company_logo"),
        description=description,
        category_slug="internship",
        application_url=url,
        source_url=url,
        deadline=date.today() + timedelta(days=DEFAULT_WINDOW_DAYS),
        start_date=parse_iso_date(job.get("publication_date")),
        location=location,
        mode="Remote",
        eligibility="Remote student or early-career role. Check the source for country restrictions.",
        benefits=clean_text(job.get("salary")) or "See the official listing for compensation.",
        skills=detect_skills(title, description, extra_tags=[job.get("category", "")]),
    )


def fetch_arbeitnow(session: PoliteSession, max_pages: int = 3) -> list[NormalisedOpportunity]:
    results: list[NormalisedOpportunity] = []
    for page in range(1, max_pages + 1):
        payload = session.get_json(ARBEITNOW_URL, params={"page": page}) or {}
        jobs = payload.get("data") or []
        results.extend(item for job in jobs if (item := _from_arbeitnow(job)))
        if not jobs or not (payload.get("links") or {}).get("next"):
            break
    return results


def _from_arbeitnow(job: dict) -> NormalisedOpportunity | None:
    title = clean_text(job.get("title"))
    if not looks_like_student_opportunity(title):
        return None
    url = job.get("url")
    source_id = str(job.get("slug") or job.get("id") or "")
    if not url or not source_id:
        return None
    description = clean_text(job.get("description"), limit=1800)
    location = clean_text(job.get("location")) or "Europe / Remote"
    return NormalisedOpportunity(
        source=ARBEITNOW_KEY,
        source_id=source_id,
        title=title,
        organization=clean_text(job.get("company_name")) or "Employer",
        description=description,
        category_slug="internship",
        application_url=url,
        source_url=url,
        deadline=date.today() + timedelta(days=DEFAULT_WINDOW_DAYS),
        start_date=parse_iso_date(job.get("created_at")),
        location=location,
        mode="Remote" if job.get("remote") else detect_mode(location, description),
        eligibility="Student, trainee or early-career role. Check the source for work-authorisation requirements.",
        benefits="See the official listing for compensation and benefits.",
        skills=detect_skills(title, description, extra_tags=job.get("tags") or []),
    )
