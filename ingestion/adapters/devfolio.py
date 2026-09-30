"""
Devfolio adapter — popular with Indian college hackathons.

Endpoint:  POST https://api.devfolio.co/api/search/hackathons
           body: {"type": "application_open", "from": 0, "size": 20}
Access:    robots.txt says "User-agent: *  Disallow:" (allow all).
           Checked 2026-09-29.

The response is Elasticsearch-shaped: results live under hits.hits[]._source.
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

SOURCE_KEY = "devfolio"
API_URL = "https://api.devfolio.co/api/search/hackathons"
PAGE_SIZE = 20


def fetch(session: PoliteSession, max_pages: int = 3) -> list[NormalisedOpportunity]:
    results: list[NormalisedOpportunity] = []

    for page in range(max_pages):
        payload = session.post_json(
            API_URL,
            {"type": "application_open", "from": page * PAGE_SIZE, "size": PAGE_SIZE},
        )
        hits = ((payload or {}).get("hits") or {}).get("hits") or []
        if not hits:
            break

        for hit in hits:
            opportunity = _convert(hit.get("_source") or {})
            if opportunity:
                results.append(opportunity)

    return results


def _convert(item: dict) -> NormalisedOpportunity | None:
    source_id = str(item.get("uuid") or "").strip()
    title = clean_text(item.get("name"))
    if not source_id or not title:
        return None

    # Private hackathons are not open for anyone to join.
    if item.get("private") is True or item.get("status") != "publish":
        return None

    setting = item.get("hackathon_setting") or {}
    # The registration close date is what matters to a student; fall back to
    # the hackathon end date if it is missing.
    deadline = parse_iso_date(setting.get("reg_ends_at")) or parse_iso_date(item.get("ends_at"))
    if not is_usable_deadline(deadline):
        return None

    themes = [clean_text(theme.get("name")) for theme in item.get("themes") or []]
    themes = [t for t in themes if t]

    tagline = clean_text(item.get("tagline"))
    # `desc` is markdown; clean_text strips any HTML and collapses whitespace.
    description = clean_text(item.get("desc"), limit=1400)
    if len(description) < 40:
        description = " ".join(
            filter(
                None,
                [
                    tagline,
                    f"{title} is a hackathon hosted on Devfolio.",
                    f"Themes: {', '.join(themes)}." if themes else "",
                    "Build and submit a project before registrations close.",
                ],
            )
        )

    is_online = item.get("is_online")
    city = clean_text(item.get("city"))
    location = "Online" if is_online else (city or clean_text(item.get("country")) or "India")
    mode = "Remote" if is_online else detect_mode(location, description)

    prize = _format_prize(item.get("prizes") or [])

    team_size = item.get("team_size")
    eligibility_bits = ["Open to students and developers."]
    if setting.get("women_only"):
        eligibility_bits.append("This edition is for women participants only.")
    if team_size:
        eligibility_bits.append(f"Teams of up to {team_size}.")

    slug = clean_text(item.get("slug"))
    apply_url = f"https://{slug}.devfolio.co" if slug else None
    if not apply_url:
        return None

    return NormalisedOpportunity(
        source=SOURCE_KEY,
        source_id=source_id,
        title=title,
        organization=clean_text(item.get("hosted_by")) or "Devfolio",
        description=description,
        category_slug="hackathon",
        application_url=apply_url,
        source_url=apply_url,
        deadline=deadline,
        start_date=parse_iso_date(item.get("starts_at")),
        end_date=parse_iso_date(item.get("ends_at")),
        location=location,
        mode=mode,
        prize=prize,
        eligibility=" ".join(eligibility_bits),
        benefits=f"Prize pool: {prize}." if prize else "Prizes, swag and certificates for winners.",
        duration="Hackathon",
        skills=detect_skills(title, description, tagline, extra_tags=themes),
        organization_logo=item.get("cover_img"),
    )


def _format_prize(prizes: list) -> str | None:
    """
    Devfolio prize entries carry a free-text description rather than a clean
    number, so we report how many prizes there are instead of inventing a total.
    """
    named = [clean_text(p.get("name")) for p in prizes if p.get("name")]
    named = [n for n in named if n]
    if not named:
        return None
    if len(named) == 1:
        return named[0][:120]
    return f"{len(named)} prizes including {named[0][:70]}"
