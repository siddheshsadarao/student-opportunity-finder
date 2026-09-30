"""
HackerEarth adapter — hackathons and coding challenges, strong in India.

Endpoint:  GET https://www.hackerearth.com/chrome-extension/events/
Access:    robots.txt says "User-agent: *  Allow: /". Checked 2026-09-29.

This endpoint powers HackerEarth's own browser extension, so it returns a
compact JSON list of current events. It is a small feed (a handful of live
events), which is normal — quality over quantity.
"""
from __future__ import annotations

from ..common import (
    NormalisedOpportunity,
    PoliteSession,
    clean_text,
    detect_mode,
    detect_skills,
    is_usable_deadline,
    parse_iso_date,
)

SOURCE_KEY = "hackerearth"
API_URL = "https://www.hackerearth.com/chrome-extension/events/"


def fetch(session: PoliteSession, max_pages: int = 1) -> list[NormalisedOpportunity]:
    """This feed is not paginated, so max_pages is accepted but unused."""
    payload = session.get_json(API_URL)
    events = (payload or {}).get("response") or []

    results: list[NormalisedOpportunity] = []
    for item in events:
        opportunity = _convert(item)
        if opportunity:
            results.append(opportunity)
    return results


def _convert(item: dict) -> NormalisedOpportunity | None:
    title = clean_text(item.get("title"))
    url = item.get("url") or ""
    if not title or not url:
        return None

    # There is no numeric id in this feed, so the URL slug is the stable
    # identifier — it is unique per challenge and never changes.
    source_id = url.rstrip("/").split("/")[-1]
    if not source_id:
        return None

    # Only events that are still running or about to start.
    if str(item.get("status", "")).upper() not in ("ONGOING", "UPCOMING"):
        return None

    # "end_tz" is a full timestamp like "2026-10-04 23:59:00+05:30".
    deadline = parse_iso_date(item.get("end_tz")) or parse_iso_date(item.get("end_utc_tz"))
    if not is_usable_deadline(deadline):
        return None

    description = clean_text(item.get("description"), limit=1200)
    challenge_type = clean_text(item.get("challenge_type"))

    if len(description) < 40:
        description = (
            f"{title} is a {challenge_type or 'coding challenge'} hosted on HackerEarth. "
            "Solve the problem statements and submit your work before the deadline."
        )

    # This feed carries no location field; HackerEarth challenges run online.
    is_college_event = bool(item.get("college"))

    return NormalisedOpportunity(
        source=SOURCE_KEY,
        source_id=source_id,
        title=title,
        organization="HackerEarth" if item.get("is_hackerearth") else (challenge_type or "HackerEarth"),
        description=description,
        category_slug="hackathon",
        application_url=url,
        source_url=url,
        deadline=deadline,
        start_date=parse_iso_date(item.get("start_tz")),
        end_date=deadline,
        location="Online",
        mode=detect_mode("online", description),
        prize=None,
        eligibility=(
            "Open to college students."
            if is_college_event
            else "Open to all developers. Check the official page for details."
        ),
        benefits="Certificates, prizes and recruiter visibility for top performers.",
        duration=challenge_type or None,
        skills=detect_skills(title, description, challenge_type),
        organization_logo=item.get("thumbnail"),
    )
