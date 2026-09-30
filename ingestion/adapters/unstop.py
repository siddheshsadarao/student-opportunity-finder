"""
Unstop adapter — the most useful source for Indian students.

Endpoint:  GET https://unstop.com/api/public/opportunity/search-result
Access:    Unstop's own robots.txt contains "Allow: /api/public/*", so this
           endpoint is explicitly permitted. Checked 2026-09-29.

Unstop is the richest source we have. Unlike the others it gives us:
  * `required_skills` — a real skill list, which feeds the matching engine
  * `filters` with type "eligible" — genuine eligibility text
  * `prizes` with the cash amount and currency
  * `regnRequirements.end_regn_dt` — the actual registration deadline
and it covers hackathons, competitions, internships and scholarships, so one
adapter fills four categories.
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

SOURCE_KEY = "unstop"
API_URL = "https://unstop.com/api/public/opportunity/search-result"

# Unstop's own listing types, mapped to our category slugs.
TYPE_MAP: dict[str, str] = {
    "hackathons": "hackathon",
    "competitions": "competition",
    "internships": "internship",
    "scholarships": "scholarship",
    "workshops-webinars": "workshop",
}

# Rupee/dollar icon names Unstop uses in the prizes array.
CURRENCY_SYMBOLS = {"fa-rupee": "INR", "fa-dollar": "USD", "fa-euro": "EUR"}


def fetch(
    session: PoliteSession,
    max_pages: int = 3,
    types: list[str] | None = None,
) -> list[NormalisedOpportunity]:
    """Pulls several opportunity types and returns them in our common shape."""
    results: list[NormalisedOpportunity] = []
    wanted = types or list(TYPE_MAP.keys())

    for unstop_type in wanted:
        category_slug = TYPE_MAP.get(unstop_type)
        if not category_slug:
            continue

        for page in range(1, max_pages + 1):
            # `oppstatus=open` is essential. Without it the API's default sort
            # returns mostly closed listings from previous years — we measured
            # 0 out of 20 still open — and everything gets filtered out later.
            payload = session.get_json(
                API_URL,
                params={
                    "opportunity": unstop_type,
                    "oppstatus": "open",
                    "page": page,
                    "per_page": 20,
                },
            )
            items = ((payload or {}).get("data") or {}).get("data") or []
            if not items:
                break

            for item in items:
                opportunity = _convert(item, category_slug)
                if opportunity:
                    results.append(opportunity)

    return results


def _convert(item: dict, category_slug: str) -> NormalisedOpportunity | None:
    source_id = str(item.get("id") or "").strip()
    title = clean_text(item.get("title"))
    if not source_id or not title:
        return None

    # Only listings that are live and still accepting registrations.
    if str(item.get("status", "")).upper() != "LIVE":
        return None
    if str(item.get("regn_open", "")) not in ("1", "true", "True"):
        return None

    # The registration deadline is the date students actually care about.
    registration = item.get("regnRequirements") or {}
    deadline = parse_iso_date(registration.get("end_regn_dt")) or parse_iso_date(
        item.get("end_date")
    )
    if not is_usable_deadline(deadline):
        return None

    organisation = item.get("organisation") or {}
    organization = clean_text(organisation.get("name")) or "Unstop"

    description = clean_text(item.get("details"), limit=1400)
    if len(description) < 40:
        description = (
            f"{title} is a {category_slug} hosted by {organization} on Unstop. "
            "Full details, rules and rewards are on the official listing page."
        )

    # --- location and mode ---
    address = item.get("address_with_country_logo") or {}
    city = clean_text(address.get("city"))
    region = clean_text(item.get("region"))  # "online" / "offline"
    location = city or ("Online" if region == "online" else "India")
    mode = "Remote" if region == "online" else detect_mode(region, location, description)

    # --- prize ---
    prize = _format_prize(item.get("prizes") or [])

    # --- skills: Unstop gives these directly, which is ideal ---
    skills = [
        clean_text(entry.get("skill_name") or entry.get("skill"))
        for entry in item.get("required_skills") or []
    ]
    skills = [s for s in skills if s][:8]
    if not skills:
        skills = detect_skills(title, description)

    # --- eligibility comes from the "eligible" filters ---
    eligibility_terms = [
        clean_text(entry.get("name"))
        for entry in item.get("filters") or []
        if entry.get("type") == "eligible"
    ]
    eligibility = (
        ", ".join(t for t in eligibility_terms if t)
        or "Open to students. Check the official page for detailed eligibility."
    )

    apply_url = item.get("seo_url") or item.get("short_url")
    if not apply_url and item.get("public_url"):
        apply_url = f"https://unstop.com/{item['public_url']}"
    if not apply_url:
        return None

    return NormalisedOpportunity(
        source=SOURCE_KEY,
        source_id=source_id,
        title=title,
        organization=organization,
        description=description,
        category_slug=category_slug,
        application_url=apply_url,
        source_url=apply_url,
        deadline=deadline,
        start_date=parse_iso_date(registration.get("start_regn_dt")),
        end_date=parse_iso_date(item.get("end_date")),
        location=location,
        mode=mode,
        prize=prize,
        eligibility=eligibility,
        benefits=f"Prize pool: {prize}." if prize else "Certificates and rewards for winners.",
        duration=None,
        skills=skills,
        organization_logo=item.get("logoUrl2") or organisation.get("logoUrl"),
    )


def _format_prize(prizes: list) -> str | None:
    """Turns Unstop's prize array into "INR 1,50,000"."""
    total = 0
    currency = "INR"

    for prize in prizes:
        cash = prize.get("cash")
        if isinstance(cash, (int, float)) and cash > 0:
            total += cash
            currency = CURRENCY_SYMBOLS.get(prize.get("currency"), currency)

    if total <= 0:
        return None
    return f"{currency} {total:,.0f}"
