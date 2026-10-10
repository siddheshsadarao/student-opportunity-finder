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

from ..common import (
    NormalisedOpportunity,
    PoliteSession,
    clean_text,
    detect_mode,
    detect_skills,
    looks_like_student_opportunity,
    parse_iso_date,
    job_category,
)
from ..config import ASHBY_COMPANIES

SOURCE_KEY = "ashby"
API_URL = "https://api.ashbyhq.com/posting-api/job-board/{board}"

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
            session.board_errors.append(f'{board}: {str(error)[:180]}')
            continue

        company_name = company.get("name") or board.title()
        if not isinstance(payload, dict) or not isinstance(payload.get('jobs'), list):
            raise ValueError(f'Invalid Ashby response for {board}')
        session.completed_boards.append(board)
        for job in (payload or {}).get("jobs") or []:
            opportunity = _convert(job, company_name)
            if opportunity:
                opportunity.source_board = board
                results.append(opportunity)

    return results


def _convert(job: dict, company_name: str) -> NormalisedOpportunity | None:
    if job.get('isListed') is False:
        return None
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

    deadline = parse_iso_date(job.get("closeDate"))

    return NormalisedOpportunity(
        source=SOURCE_KEY,
        source_id=source_id,
        title=title,
        organization=company_name,
        description=description,
        category_slug=job_category(title),
        application_url=apply_url,
        source_url=apply_url,
        deadline=deadline,
        location=location,
        mode=mode,
        prize=None,
        eligibility="See the official listing for eligibility and work authorisation requirements.",
        benefits="Compensation and benefits are listed on the employer's application page.",
        duration=clean_text(job.get("employmentType")) or None,
        skills=detect_skills(title, description),
        organization_logo=None,
    )
