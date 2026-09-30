"""
Hack Club adapter — high-school and university hackathons worldwide.

Endpoint:  GET https://hackathons.hackclub.com/api/events/upcoming
Access:    robots.txt has no Disallow rules for this host. Checked 2026-09-29.

Hack Club runs a directory of student-organised hackathons, mostly in the US
but with events across Asia and Europe too. Every entry is upcoming by
definition, so nothing has to be filtered out for being stale.
"""
from __future__ import annotations

from ..common import (
    NormalisedOpportunity,
    PoliteSession,
    clean_text,
    detect_skills,
    is_usable_deadline,
    parse_iso_date,
)

SOURCE_KEY = "hackclub"
API_URL = "https://hackathons.hackclub.com/api/events/upcoming"


def fetch(session: PoliteSession, max_pages: int = 1) -> list[NormalisedOpportunity]:
    """This feed is a single unpaginated list, so max_pages is unused."""
    payload = session.get_json(API_URL)
    events = payload if isinstance(payload, list) else []

    results: list[NormalisedOpportunity] = []
    for item in events:
        opportunity = _convert(item)
        if opportunity:
            results.append(opportunity)
    return results


def _convert(item: dict) -> NormalisedOpportunity | None:
    source_id = str(item.get("id") or "").strip()
    title = clean_text(item.get("name"))
    apply_url = item.get("website")
    if not source_id or not title or not apply_url:
        return None

    start_date = parse_iso_date(item.get("start"))
    end_date = parse_iso_date(item.get("end"))

    # Hack Club publishes no registration deadline. Registration shuts when the
    # event starts, so that is the date a student has to act by.
    deadline = start_date or end_date
    if not is_usable_deadline(deadline):
        return None

    if item.get("virtual"):
        mode, location = "Remote", "Online"
    else:
        parts = [item.get("city"), item.get("state"), item.get("country")]
        location = ", ".join(clean_text(p) for p in parts if p) or "On site"
        mode = "Hybrid" if item.get("hybrid") else "On-site"

    affiliations = []
    if item.get("mlhAssociated"):
        affiliations.append("an MLH member event")
    if item.get("hack_club_event"):
        affiliations.append("run by Hack Club itself")

    description = (
        f"{title} is a student hackathon listed in the Hack Club directory"
        + (f", {' and '.join(affiliations)}" if affiliations else "")
        + ". Hack Club events are built around beginners: you can turn up with no "
        "experience, join a team on the day and ship something by the end. "
        "Registration closes when the event starts, so the date shown is the event "
        "start date rather than a separate application deadline."
    )

    return NormalisedOpportunity(
        source=SOURCE_KEY,
        source_id=source_id,
        title=title,
        organization="Hack Club",
        description=description,
        category_slug="hackathon",
        application_url=apply_url,
        source_url=apply_url,
        deadline=deadline,
        start_date=start_date,
        end_date=end_date,
        location=location,
        mode=mode,
        prize=None,
        eligibility="Open to students, including complete beginners. No experience needed.",
        benefits="Mentors, workshops, hardware and prizes. Most events are free to enter.",
        duration="Hackathon",
        skills=detect_skills(title, description),
        organization_logo=item.get("logo") or item.get("banner"),
    )
