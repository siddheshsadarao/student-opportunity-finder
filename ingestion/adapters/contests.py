"""
Competitive programming contests: Codeforces, CodeChef and Kaggle.

These three are grouped in one file because each is a single small endpoint
with the same job — turn a contest into a Competition opportunity — and three
near-identical 40-line files would be harder to follow than one.

Access, all checked 2026-09-29:
  * Codeforces  https://codeforces.com/api/contest.list
                A documented public API. robots.txt does not disallow /api/.
  * CodeChef    https://www.codechef.com/api/list/contests/all
                robots.txt disallows /includes/, /misc/, /modules/, /profiles/
                — not /api/.
  * Kaggle      POST .../competitions.CompetitionService/ListCompetitions
                robots.txt has no Disallow rules at all.

Why they matter here: contests run continuously and are open to anyone, so they
keep the Competitions category alive between the bigger seasonal events, and
they are genuinely global rather than tied to one country.
"""
from __future__ import annotations

from datetime import datetime, timezone

from ..common import (
    NormalisedOpportunity,
    PoliteSession,
    clean_text,
    detect_skills,
    is_usable_deadline,
    parse_iso_date,
)

# ---------------------------------------------------------------------------
# Codeforces
# ---------------------------------------------------------------------------
CODEFORCES_KEY = "codeforces"
CODEFORCES_URL = "https://codeforces.com/api/contest.list?gym=false"


def fetch_codeforces(session: PoliteSession, max_pages: int = 1) -> list[NormalisedOpportunity]:
    payload = session.get_json(CODEFORCES_URL)
    if not isinstance(payload, dict) or payload.get("status") != "OK":
        return []

    results: list[NormalisedOpportunity] = []
    for item in payload.get("result") or []:
        # BEFORE means the contest has not started yet — the only ones a
        # student can still plan for.
        if item.get("phase") != "BEFORE":
            continue

        source_id = str(item.get("id") or "")
        title = clean_text(item.get("name"))
        start_seconds = item.get("startTimeSeconds")
        if not source_id or not title or not start_seconds:
            continue

        start = datetime.fromtimestamp(start_seconds, tz=timezone.utc).date()
        if not is_usable_deadline(start):
            continue

        hours = round((item.get("durationSeconds") or 0) / 3600, 1)
        description = (
            f"{title} is a rated competitive programming contest on Codeforces, "
            f"lasting about {hours} hours. Problems cover algorithms, data structures, "
            "graphs, dynamic programming and number theory. Anyone can enter free of "
            "charge, and editorials are published afterwards so you can learn from "
            "every problem you did not solve. Registration closes shortly before the "
            "contest begins, so the date shown is the contest date."
        )

        results.append(
            NormalisedOpportunity(
                source=CODEFORCES_KEY,
                source_id=source_id,
                title=title,
                organization="Codeforces",
                description=description,
                category_slug="competition",
                application_url=f"https://codeforces.com/contest/{source_id}",
                source_url=f"https://codeforces.com/contest/{source_id}",
                deadline=start,
                start_date=start,
                end_date=start,
                location="Online",
                mode="Remote",
                prize=None,
                eligibility="Open to everyone. A free Codeforces account is all you need.",
                benefits="Contest rating, global ranking and published editorials.",
                duration=f"{hours} hours",
                skills=["Algorithms", "Data Structures", "Problem Solving", "C++"],
                organization_logo=None,
            )
        )
    return results


# ---------------------------------------------------------------------------
# CodeChef
# ---------------------------------------------------------------------------
CODECHEF_KEY = "codechef"
CODECHEF_URL = "https://www.codechef.com/api/list/contests/all"


def fetch_codechef(session: PoliteSession, max_pages: int = 1) -> list[NormalisedOpportunity]:
    payload = session.get_json(CODECHEF_URL)
    if not isinstance(payload, dict):
        return []

    results: list[NormalisedOpportunity] = []
    for item in payload.get("future_contests") or []:
        source_id = str(item.get("contest_code") or item.get("contest_id") or "")
        title = clean_text(item.get("contest_name"))
        start = parse_iso_date(item.get("contest_start_date_iso"))
        if not source_id or not title or not is_usable_deadline(start):
            continue

        minutes = item.get("contest_duration")
        duration = f"{minutes} minutes" if minutes else None

        description = (
            f"{title} is a competitive programming contest on CodeChef"
            + (f", running for {minutes} minutes" if minutes else "")
            + ". Problems are set at several difficulty levels, so beginners and "
            "experienced competitors are rated separately. Entry is free, and "
            "editorials are published after the contest. The date shown is when the "
            "contest starts."
        )

        results.append(
            NormalisedOpportunity(
                source=CODECHEF_KEY,
                source_id=source_id,
                title=title,
                organization="CodeChef",
                description=description,
                category_slug="competition",
                application_url=f"https://www.codechef.com/{source_id}",
                source_url=f"https://www.codechef.com/{source_id}",
                deadline=start,
                start_date=start,
                end_date=parse_iso_date(item.get("contest_end_date_iso")) or start,
                location="Online",
                mode="Remote",
                prize=None,
                eligibility="Open to everyone. Beginners are rated in their own division.",
                benefits="Contest rating, certificates for top performers and editorials.",
                duration=duration,
                skills=["Algorithms", "Data Structures", "Problem Solving", "C++"],
                organization_logo=None,
            )
        )
    return results


# ---------------------------------------------------------------------------
# Kaggle
# ---------------------------------------------------------------------------
KAGGLE_KEY = "kaggle"
KAGGLE_URL = (
    "https://www.kaggle.com/api/i/competitions.CompetitionService/ListCompetitions"
)


def fetch_kaggle(session: PoliteSession, max_pages: int = 2) -> list[NormalisedOpportunity]:
    results: list[NormalisedOpportunity] = []

    for page in range(1, max_pages + 1):
        payload = session.post_json(KAGGLE_URL, {"page": page, "pageSize": 20})
        competitions = (payload or {}).get("competitions") or []
        if not competitions:
            break

        for item in competitions:
            opportunity = _convert_kaggle(item)
            if opportunity:
                results.append(opportunity)

    return results


def _convert_kaggle(item: dict) -> NormalisedOpportunity | None:
    source_id = str(item.get("id") or "")
    title = clean_text(item.get("title"))
    slug = clean_text(item.get("competitionName"))
    if not source_id or not title or not slug:
        return None

    deadline = parse_iso_date(item.get("deadline"))
    if not is_usable_deadline(deadline):
        return None

    brief = clean_text(item.get("briefDescription"), limit=900)
    prize_count = item.get("numPrizes") or 0

    description = brief or f"{title} is a machine learning competition hosted on Kaggle."
    description += (
        " Submissions are scored on a hidden test set and ranked on a public "
        "leaderboard. Kaggle competitions are one of the most direct ways to build a "
        "portfolio a recruiter can actually verify."
    )

    return NormalisedOpportunity(
        source=KAGGLE_KEY,
        source_id=source_id,
        title=title,
        organization="Kaggle",
        description=description,
        category_slug="competition",
        application_url=f"https://www.kaggle.com/competitions/{slug}",
        source_url=f"https://www.kaggle.com/competitions/{slug}",
        deadline=deadline,
        start_date=parse_iso_date(item.get("dateEnabled")),
        end_date=deadline,
        location="Online",
        mode="Remote",
        prize=f"{prize_count} prizes" if prize_count else None,
        eligibility="Open to everyone. Some competitions restrict prize eligibility by country.",
        benefits="Leaderboard ranking, Kaggle medals and a public, verifiable portfolio project.",
        duration=None,
        skills=detect_skills(title, description) or ["Machine Learning", "Python", "Data Science"],
        organization_logo=None,
    )
