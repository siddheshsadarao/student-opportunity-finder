"""
Major League Hacking adapter — the global student hackathon league.

Page:    https://www.mlh.com/seasons/{season}/events
Access:  robots.txt disallows only /account/, /tools/, /_/, /v4/, /auth/ and
         /admin/. The /seasons/ path is permitted. Checked 2026-09-29.

MLH renders with Inertia.js, which embeds the entire page payload as JSON in a
single <script type="application/json"> tag. So although this is an HTML page
rather than an API, we read clean structured objects rather than scraping
markup — no CSS selectors to break when they restyle the site.

Why this source matters: the rest of our catalogue is heavily India-focused
because Unstop lists so much. MLH is almost entirely university hackathons in
North America and Europe, so it is what makes the catalogue genuinely
international rather than one country's listings with a few extras.
"""
from __future__ import annotations

import json
import re
from datetime import date

import requests

from ..common import (
    NormalisedOpportunity,
    PoliteSession,
    clean_text,
    detect_skills,
    is_usable_deadline,
    parse_iso_date,
)
from ..config import settings

SOURCE_KEY = "mlh"
SEASON_URL = "https://www.mlh.com/seasons/{season}/events"

# The Inertia payload lives in the one application/json script tag.
_JSON_RE = re.compile(
    r"<script[^>]*type=[\"']application/json[\"'][^>]*>(.*?)</script>",
    re.DOTALL,
)

REGION_NAMES = {
    "AMER": "North America",
    "EMEA": "Europe / Middle East / Africa",
    "APAC": "Asia Pacific",
    "LATAM": "Latin America",
}


def fetch(session: PoliteSession, max_pages: int = 3) -> list[NormalisedOpportunity]:
    """
    Reads the current and next MLH seasons.

    A season runs across two calendar years and flips around August, so we
    always read this year and next year rather than trying to guess which one
    is current. `max_pages` is accepted for a consistent adapter signature but
    MLH is not paginated.
    """
    results: list[NormalisedOpportunity] = []
    seen_ids: set[str] = set()
    this_year = date.today().year

    for season in (this_year, this_year + 1):
        for item in _fetch_season(session, season):
            opportunity = _convert(item)
            if opportunity and opportunity.source_id not in seen_ids:
                seen_ids.add(opportunity.source_id)
                results.append(opportunity)

    return results


def _fetch_season(session: PoliteSession, season: int) -> list[dict]:
    """Returns the upcoming events for one season, or [] if unavailable."""
    url = SEASON_URL.format(season=season)

    # This endpoint returns HTML, so we bypass the JSON helper but keep the
    # same session so the rate limit and User-Agent still apply.
    session._wait()  # noqa: SLF001 - deliberate: reuse the shared rate limiter
    try:
        response = session.session.get(
            url, timeout=settings.REQUEST_TIMEOUT, allow_redirects=True
        )
    except requests.RequestException as error:
        print(f"  [mlh] season {season} unreachable: {error}")
        return []

    if response.status_code == 403:
        raise PermissionError(f"{url} returned 403; not working around it.")
    if response.status_code != 200:
        print(f"  [mlh] season {season} returned {response.status_code}")
        return []

    match = _JSON_RE.search(response.text)
    if not match:
        print(f"  [mlh] season {season}: page layout changed, no JSON payload found")
        return []

    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError:
        print(f"  [mlh] season {season}: payload was not valid JSON")
        return []

    # Only upcoming events. pastEvents is large and useless to a student.
    events = (payload.get("props") or {}).get("upcomingEvents") or []
    return events if isinstance(events, list) else []


def _convert(item: dict) -> NormalisedOpportunity | None:
    source_id = str(item.get("id") or "").strip()
    title = clean_text(item.get("name"))
    if not source_id or not title:
        return None

    start_date = parse_iso_date(item.get("startsAt"))
    end_date = parse_iso_date(item.get("endsAt"))

    # MLH publishes no registration deadline. Registration closes when the
    # event begins, so the start date is the date a student must act by. The
    # description says this outright rather than implying a deadline we do not
    # actually have.
    deadline = start_date or end_date
    if not is_usable_deadline(deadline):
        return None

    # formatType is "physical", "digital" or "hybrid".
    format_type = str(item.get("formatType") or "").lower()
    if format_type == "digital":
        mode, location = "Remote", "Online"
    else:
        venue = item.get("venueAddress") or {}
        parts = [venue.get("city"), venue.get("state"), venue.get("country")]
        location = ", ".join(clean_text(p) for p in parts if p) or clean_text(
            item.get("location")
        ) or "On campus"
        mode = "Hybrid" if format_type == "hybrid" else "On-site"

    region = REGION_NAMES.get(str(item.get("region") or "").upper(), "")
    date_range = clean_text(item.get("dateRange"))

    description_parts = [
        f"{title} is an official Major League Hacking (MLH) member hackathon"
        + (f" in {region}." if region else "."),
    ]
    if date_range:
        description_parts.append(f"The event runs {date_range}.")
    description_parts.append(
        "MLH hackathons are open to students of all skill levels, including complete "
        "beginners. Teams build a working project over a weekend, with mentors, "
        "workshops and hardware available on site."
    )
    description_parts.append(
        "Registration closes when the event begins, so the date shown here is the "
        "event start date rather than a separate application deadline. Check the "
        "official page for exact registration timings."
    )
    description = " ".join(description_parts)

    # The event's own site is the right place to apply; fall back to MLH's page.
    apply_url = item.get("websiteUrl")
    if not apply_url:
        slug = clean_text(item.get("slug"))
        path = str(item.get("url") or "").split("/prizes")[0]
        apply_url = f"https://www.mlh.com{path}" if path else (
            f"https://www.mlh.com/events/{slug}" if slug else None
        )
    if not apply_url:
        return None

    return NormalisedOpportunity(
        source=SOURCE_KEY,
        source_id=source_id,
        title=title,
        organization="Major League Hacking",
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
        eligibility=(
            "Open to students of all levels, including beginners. "
            "Most MLH events welcome participants from any university."
        ),
        benefits="Mentorship, workshops, hardware lab, prizes and MLH swag.",
        duration=date_range or "Weekend hackathon",
        # MLH lists no skills, so they are inferred from the name and blurb.
        skills=detect_skills(title, description),
        organization_logo=item.get("logoUrl") or item.get("backgroundUrl"),
    )
