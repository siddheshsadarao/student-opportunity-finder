"""Student roles from SmartRecruiters' public company postings API."""
from __future__ import annotations

from ..common import NormalisedOpportunity, PoliteSession, clean_text, detect_mode, detect_skills, looks_like_student_opportunity, job_category
from ..config import SMARTRECRUITERS_COMPANIES

SOURCE_KEY = "smartrecruiters"
API_URL = "https://api.smartrecruiters.com/v1/companies/{company}/postings"


def fetch(session: PoliteSession, max_pages: int = 2) -> list[NormalisedOpportunity]:
    results: list[NormalisedOpportunity] = []
    for board in SMARTRECRUITERS_COMPANIES:
        for page in range(max_pages):
            try:
                payload = session.get_json(
                    API_URL.format(company=board["company"]),
                    params={"limit": 100, "offset": page * 100},
                ) or {}
            except Exception as error:
                print(f"  [smartrecruiters] skipping {board['company']}: {error}")
                session.board_errors.append(f"{board['company']}: {str(error)[:180]}")
                break

            if not isinstance(payload, dict) or not isinstance(payload.get('content'), list):
                raise ValueError(f"Invalid SmartRecruiters response for {board['company']}")
            content = payload.get("content") or []
            for job in content:
                item = _convert(job, board["name"])
                if item:
                    item.source_board = board['company']
                    results.append(item)
            if len(content) < 100:
                session.completed_boards.append(board['company'])
                break
    return results


def _convert(job: dict, company_name: str) -> NormalisedOpportunity | None:
    title = clean_text(job.get("name"))
    source_id = str(job.get("id") or "")
    if not title or not source_id or not looks_like_student_opportunity(title):
        return None

    location_data = job.get("location") or {}
    location = clean_text(
        ", ".join(filter(None, [location_data.get("city"), location_data.get("region"), location_data.get("country")]))
    ) or "Not specified"
    company_key = (job.get("company") or {}).get("identifier")
    if not company_key:
        return None
    ref = f"https://jobs.smartrecruiters.com/{company_key}/{source_id}"
    department = clean_text(
        (job.get("department") or {}).get("label")
        or (job.get("function") or {}).get("label")
        or (job.get("industry") or {}).get("label")
    )
    description = f"{title} at {company_name}. {department}. Full responsibilities and eligibility are on the official application page."
    if location_data.get("remote"):
        mode = "Remote"
    elif location_data.get("hybrid"):
        mode = "Hybrid"
    else:
        mode = detect_mode(location, title)

    return NormalisedOpportunity(
        source=SOURCE_KEY,
        source_id=source_id,
        title=title,
        organization=company_name,
        description=description,
        category_slug=job_category(title),
        application_url=ref,
        source_url=ref,
        deadline=None,
        location=location,
        mode=mode,
        eligibility="Student or early-career opening. Check the official posting for degree and location requirements.",
        benefits="See the official employer listing for compensation and benefits.",
        skills=detect_skills(title, department),
    )
