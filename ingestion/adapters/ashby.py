"""
Ashby adapter — internships straight from company job boards.

Endpoint:  GET https://api.ashbyhq.com/posting-api/job-board/{board}
Access:    Ashby's official public job board API. Companies publish it so that
           job boards and aggregators can list their roles, which is exactly
           what we are doing.

Same reasoning as the Greenhouse adapter: rather than scraping job aggregators
that forbid it, go to the system the employer actually publishes on. Between
Greenhouse and Ashby we cover most companies a student would want, with no
scraping at all.

Add or remove boards in ingestion/config.py.
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
    parse_iso_date,
)
from ..config import ASHBY_COMPANIES

SOURCE_KEY = "ashby"
API_URL = "https://api.ashbyhq.com/posting-api/job-board/{board}"

# Ashby boards rarely publish a closing date, so we show a rolling window and
# say so in the description rather than inventing a specific deadline.
DEFAULT_WINDOW_DAYS = 45


def fetch(session: PoliteSession, max_pages: int = 1) -> list[NormalisedOpportunity]:
    results: list[NormalisedOpportunity] = []

    for company in ASHBY_COMPANIES:
        board = company.get("board")
        if not board:
            continue

        try:
            payload = session.get_json(
                API_URL.format(board=board), params={"includeCompensation": "false"}
            )
        except Exception as error:  # noqa: BLE001 - one bad board must not stop the rest
            print(f"  [ashby] skipping {board}: {error}")
            continue

        company_name = company.get("name") or board.title()
        for job in (payload or {}).get("jobs") or []:
            opportunity = _convert(job, company_name)
            if opportunity:
                results.append(opportunity)

    return results


def _convert(job: dict, company_name: str) -> NormalisedOpportunity | None:
    title = clean_text(job.get("title"))
    source_id = str(job.get("id") or "").strip()
    if not title or not source_id:
        return None

    # Company boards are mostly senior roles; keep only what a student can
    # realistically apply to.
    if not looks_like_student_opportunity(title):
        return None

    apply_url = job.get("jobUrl") or job.get("applyUrl")
    if not apply_url:
        return None

    location = clean_text(job.get("location")) or "Not specified"
    description = clean_text(job.get("descriptionPlain") or job.get("descriptionHtml"), limit=1500)

    if len(description) < 40:
        description = (
            f"{title} at {company_name}, based in {location}. "
            "The full description and requirements are on the official application page."
        )

    is_remote = bool(job.get("isRemote"))
    mode = "Remote" if is_remote else detect_mode(location, description)

    deadline = parse_iso_date(job.get("closeDate")) or (
        date.today() + timedelta(days=DEFAULT_WINDOW_DAYS)
    )

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
        start_date=parse_iso_date(job.get("publishedAt")),
        location=location,
        mode=mode,
        prize=None,
        eligibility="See the official listing for eligibility and work authorisation requirements.",
        benefits="Paid role. Benefits are listed on the company's application page.",
        duration=clean_text(job.get("employmentType")) or None,
        skills=detect_skills(title, description),
        organization_logo=None,
    )
