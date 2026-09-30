"""
Devpost adapter — the largest hackathon platform (about 14,000 listings).

Endpoint:  GET https://devpost.com/api/hackathons?page=N
Access:    robots.txt says "User-agent: *  Disallow:" (an empty Disallow means
           everything is allowed). Checked 2026-09-29.

One quirk to know: the API gives no description field. It gives the themes,
location, prize and registration count instead, so we build a readable summary
from those. That summary is what the recommendation engine reads, so it must
contain the meaningful keywords — which is exactly why the themes go into it.
"""
from __future__ import annotations

from ..common import (
    NormalisedOpportunity,
    PoliteSession,
    clean_text,
    detect_mode,
    detect_skills,
    is_usable_deadline,
    parse_date_range,
)

SOURCE_KEY = "devpost"
API_URL = "https://devpost.com/api/hackathons"


def fetch(session: PoliteSession, max_pages: int = 3) -> list[NormalisedOpportunity]:
    """Pulls open hackathons and returns them in our common shape."""
    results: list[NormalisedOpportunity] = []

    for page in range(1, max_pages + 1):
        payload = session.get_json(
            API_URL,
            params={"page": page, "status[]": "open", "order_by": "deadline"},
        )
        hackathons = (payload or {}).get("hackathons", [])
        if not hackathons:
            break

        for item in hackathons:
            opportunity = _convert(item)
            if opportunity:
                results.append(opportunity)

    return results


def _convert(item: dict) -> NormalisedOpportunity | None:
    """Turns one Devpost record into our normalised shape, or None if unusable."""
    source_id = str(item.get("id") or "").strip()
    title = clean_text(item.get("title"))
    if not source_id or not title:
        return None

    # Devpost hides invite-only events behind an application, so they are not
    # something a student can simply apply to. Skip them.
    if item.get("invite_only"):
        return None

    # "Jul 31 - Oct 01, 2026" -> (start, end). The end date is the submission
    # deadline, which is what a student needs to know.
    start_date, deadline = parse_date_range(item.get("submission_period_dates"))
    if not is_usable_deadline(deadline):
        return None

    themes = [clean_text(theme.get("name")) for theme in item.get("themes") or []]
    themes = [t for t in themes if t]

    location = clean_text((item.get("displayed_location") or {}).get("location")) or "Online"

    # prize_amount arrives as HTML: "$<span data-currency-value>740,000</span>"
    prize = clean_text(item.get("prize_amount"))

    registrations = item.get("registrations_count") or 0
    organization = clean_text(item.get("organization_name")) or "Devpost"

    # Build the description Devpost does not give us.
    description_parts = [
        f"{title} is an online hackathon hosted by {organization}."
        if location.lower() == "online"
        else f"{title} is a hackathon hosted by {organization} in {location}."
    ]
    if themes:
        description_parts.append(f"Themes: {', '.join(themes)}.")
    if prize:
        description_parts.append(f"Prize pool: {prize}.")
    if registrations:
        description_parts.append(f"{registrations:,} participants have registered so far.")
    description_parts.append(
        "Build a working project with your team and submit it before the deadline. "
        "Full rules, judging criteria and resources are on the official page."
    )
    description = " ".join(description_parts)

    return NormalisedOpportunity(
        source=SOURCE_KEY,
        source_id=source_id,
        title=title,
        organization=organization,
        description=description,
        category_slug="hackathon",
        application_url=item.get("url") or "",
        source_url=item.get("url"),
        deadline=deadline,
        start_date=start_date,
        end_date=deadline,
        location=location,
        mode=detect_mode(location),
        prize=prize or None,
        eligibility="Open to participants worldwide. Check the official page for age and team rules.",
        benefits=f"Prize pool: {prize}." if prize else "Certificates and prizes for winning teams.",
        duration="Hackathon",
        skills=detect_skills(title, description, extra_tags=themes),
        organization_logo=_fix_protocol(item.get("thumbnail_url")),
    )


def _fix_protocol(url: str | None) -> str | None:
    """Devpost returns protocol-relative URLs like //d112y698adiu2z.cloudfront.net/…"""
    if not url:
        return None
    return f"https:{url}" if url.startswith("//") else url
