"""Upcoming AtCoder competitions from its public contests page."""
from __future__ import annotations

import re
from datetime import datetime

from ..common import NormalisedOpportunity, PoliteSession, clean_text, detect_skills, is_usable_deadline

SOURCE_KEY = "atcoder"
URL = "https://atcoder.jp/contests/?lang=en"
ROW_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.DOTALL | re.IGNORECASE)
TIME_RE = re.compile(r"<time[^>]*>(.*?)</time>", re.DOTALL | re.IGNORECASE)
LINK_RE = re.compile(r'href="(/contests/([a-z0-9_-]+))"[^>]*>(.*?)</a>', re.DOTALL | re.IGNORECASE)


def fetch(session: PoliteSession, max_pages: int = 1) -> list[NormalisedOpportunity]:
    html = session.get_text(URL)
    results: list[NormalisedOpportunity] = []
    for row in ROW_RE.findall(html):
        time_match = TIME_RE.search(row)
        link_match = LINK_RE.search(row)
        if not time_match or not link_match:
            continue
        raw_time = clean_text(time_match.group(1)).replace("+0900", "+09:00")
        try:
            start = datetime.fromisoformat(raw_time).date()
        except ValueError:
            continue
        if not is_usable_deadline(start):
            continue
        path, contest_id, raw_title = link_match.groups()
        title = clean_text(raw_title)
        contest_url = f"https://atcoder.jp{path}"
        results.append(
            NormalisedOpportunity(
                source=SOURCE_KEY,
                source_id=contest_id,
                title=title,
                organization="AtCoder",
                description=f"Upcoming competitive programming contest on AtCoder: {title}. Registration and rules are available on the official contest page.",
                category_slug="competition",
                application_url=contest_url,
                source_url=contest_url,
                deadline=start,
                start_date=start,
                location="Online",
                mode="Remote",
                eligibility="Open online programming contest. Check the official page for rating or team restrictions.",
                benefits="Practice algorithms, improve your rating and compete globally.",
                skills=detect_skills(title, "competitive programming algorithms data structures", extra_tags=["Algorithms"]),
            )
        )
    return results
