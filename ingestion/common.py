"""
Shared helpers for every source adapter.

The single most important idea in this file is the NORMALISED OPPORTUNITY.

Each website describes an opportunity differently: Devpost calls the prize
`prize_amount` and formats dates as "Jul 31 - Oct 01, 2026", Unstop nests
everything under `regn_open` and `festival`, HackerEarth uses unix timestamps.
If that mess reached our database, every page would need source-specific code.

So each adapter's only job is to turn its source's format into ONE common
dictionary shape. Everything after that — deduplication, skill detection,
saving — works identically for every source, and adding a sixth source later
means writing one adapter and changing nothing else.
"""
from __future__ import annotations

import html
import re
import time
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, timedelta, timezone

import requests

from .config import settings


# ---------------------------------------------------------------------------
# The common shape
# ---------------------------------------------------------------------------
@dataclass
class NormalisedOpportunity:
    """One opportunity, in the shape our database expects."""

    source: str                      # "devpost"
    source_id: str                   # the listing's id at that source
    title: str
    organization: str
    description: str
    category_slug: str               # must match a row in our categories table
    application_url: str
    deadline: date

    source_url: str | None = None
    location: str = "Online"
    mode: str = "Remote"             # Remote | Hybrid | On-site
    eligibility: str | None = None
    benefits: str | None = None
    duration: str | None = None
    prize: str | None = None         # "$740,000", "INR 1,00,000"
    start_date: date | None = None
    end_date: date | None = None
    skills: list[str] = field(default_factory=list)
    organization_logo: str | None = None

    def as_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
class PoliteSession:
    """
    A requests session that identifies itself honestly and waits between calls.

    Two things matter here:
      * a descriptive User-Agent, so the site knows who we are and can reach us
        rather than silently blocking us;
      * a delay between requests, so we never put load on someone else's server.

    We do not retry aggressively and we do not attempt to bypass any blocking.
    If a source returns 403, that is the site telling us not to — so we stop.
    """

    def __init__(self, rate_limit: float | None = None):
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": settings.USER_AGENT,
                "Accept": "application/json, text/plain, */*",
            }
        )
        self.rate_limit = rate_limit or settings.DEFAULT_RATE_LIMIT
        self._last_request_at = 0.0

    def _wait(self) -> None:
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < self.rate_limit:
            time.sleep(self.rate_limit - elapsed)
        self._last_request_at = time.monotonic()

    def get_json(self, url: str, **kwargs) -> dict | list | None:
        self._wait()
        response = self.session.get(url, timeout=settings.REQUEST_TIMEOUT, **kwargs)

        if response.status_code == 403:
            raise PermissionError(
                f"{url} returned 403. The site is refusing automated access; "
                "do not try to work around it."
            )
        response.raise_for_status()
        return response.json()

    def get_text(self, url: str, **kwargs) -> str:
        """Fetches a permitted public HTML page for sources without JSON feeds."""
        self._wait()
        response = self.session.get(url, timeout=settings.REQUEST_TIMEOUT, **kwargs)
        if response.status_code == 403:
            raise PermissionError(
                f"{url} returned 403. The site is refusing automated access; "
                "do not try to work around it."
            )
        response.raise_for_status()
        return response.text

    def post_json(self, url: str, payload: dict, **kwargs) -> dict | list | None:
        self._wait()
        response = self.session.post(
            url, json=payload, timeout=settings.REQUEST_TIMEOUT, **kwargs
        )
        if response.status_code == 403:
            raise PermissionError(f"{url} returned 403. Refusing to work around it.")
        response.raise_for_status()
        return response.json()


# ---------------------------------------------------------------------------
# Text cleaning
# ---------------------------------------------------------------------------
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")

# Markdown syntax that must be removed rather than shown literally.
# Devfolio returns raw markdown, so without this a description renders as
# "# QuantHacks ## Code. **QuantHacks** is a hackathon..." on the page.
_MD_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s*", re.MULTILINE)
_MD_BULLET_RE = re.compile(r"^\s{0,3}[*\-+]\s+", re.MULTILINE)
_MD_EMPHASIS_RE = re.compile(r"(\*{1,3}|_{1,3})(?=\S)(.+?)(?<=\S)\1", re.DOTALL)
_MD_LINK_RE = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
_MD_CODE_RE = re.compile(r"`{1,3}([^`]*)`{1,3}", re.DOTALL)
_MD_RULE_RE = re.compile(r"^\s*([-*_])\s*\1\s*\1[\s\S]*?$", re.MULTILINE)


def strip_markdown(text: str) -> str:
    """Turns markdown into readable plain text, keeping the words."""
    text = _MD_LINK_RE.sub(r"\1", text)   # [label](url) -> label
    text = _MD_CODE_RE.sub(r"\1", text)   # `code`       -> code
    text = _MD_RULE_RE.sub(" ", text)     # --- / ***    -> gone
    text = _MD_HEADING_RE.sub("", text)   # ## Heading   -> Heading
    text = _MD_BULLET_RE.sub("", text)    # * item       -> item
    text = _MD_EMPHASIS_RE.sub(r"\2", text)  # **bold**  -> bold
    # Some listings have an unmatched "**", which the paired rule above cannot
    # remove. Strip any leftover runs so no raw markers reach the page.
    text = re.sub(r"\*{2,}", "", text)
    return text


def clean_text(value: str | None, limit: int | None = None) -> str:
    """Strips HTML tags and markdown, decodes entities, collapses whitespace."""
    if not value:
        return ""
    text = _TAG_RE.sub(" ", str(value))
    text = html.unescape(text)
    text = strip_markdown(text)
    text = _WS_RE.sub(" ", text).strip()
    if limit and len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0] + "..."
    return text


# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------
def parse_iso_date(value) -> date | None:
    """Parses '2026-10-01', '2026-10-01T18:30:00+00:00' and unix timestamps."""
    if value in (None, "", "null"):
        return None

    # Unix timestamp (HackerEarth uses these).
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc).date()
        except (ValueError, OSError, OverflowError):
            return None

    text = str(value).strip()
    if not text:
        return None

    # Numeric string that is actually a timestamp.
    if text.isdigit() and len(text) >= 9:
        try:
            return datetime.fromtimestamp(int(text), tz=timezone.utc).date()
        except (ValueError, OSError, OverflowError):
            return None

    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError:
        pass

    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y", "%b %d, %Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text[:20], fmt).date()
        except ValueError:
            continue
    return None


# "Jul 31 - Oct 01, 2026"  ->  (2026-07-31, 2026-10-01)
_RANGE_RE = re.compile(
    r"([A-Z][a-z]{2})\s+(\d{1,2})\s*[-–]\s*([A-Z][a-z]{2})\s+(\d{1,2}),?\s*(\d{4})"
)
# "Oct 01, 2026"
_SINGLE_RE = re.compile(r"([A-Z][a-z]{2})\s+(\d{1,2}),?\s*(\d{4})")

_MONTHS = {
    m: i
    for i, m in enumerate(
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        start=1,
    )
}


def parse_date_range(value: str | None) -> tuple[date | None, date | None]:
    """
    Parses Devpost's human-readable ranges such as "Jul 31 - Oct 01, 2026".

    The year only appears once, at the end. When the range crosses a new year
    (for example "Dec 20 - Jan 05, 2027") the start month is greater than the
    end month, so the start belongs to the previous year.
    """
    if not value:
        return None, None

    text = clean_text(value)

    match = _RANGE_RE.search(text)
    if match:
        start_month_name, start_day, end_month_name, end_day, year = match.groups()
        start_month = _MONTHS.get(start_month_name)
        end_month = _MONTHS.get(end_month_name)
        if start_month and end_month:
            year = int(year)
            start_year = year - 1 if start_month > end_month else year
            try:
                return (
                    date(start_year, start_month, int(start_day)),
                    date(year, end_month, int(end_day)),
                )
            except ValueError:
                return None, None

    match = _SINGLE_RE.search(text)
    if match:
        month_name, day, year = match.groups()
        month = _MONTHS.get(month_name)
        if month:
            try:
                return None, date(int(year), month, int(day))
            except ValueError:
                return None, None

    return None, None


def is_usable_deadline(deadline: date | None) -> bool:
    """Keeps only deadlines that are in the future and not absurdly far away."""
    if deadline is None:
        return False
    today = date.today()
    return today <= deadline <= today + timedelta(days=settings.MAX_DEADLINE_DAYS)


# ---------------------------------------------------------------------------
# Skill detection
# ---------------------------------------------------------------------------
# Most sources give tags/themes rather than a clean skill list, so we look for
# known skills in the title, description and tags. The keys are what we search
# for; the values are the canonical names used in our skills table.
SKILL_PATTERNS: dict[str, str] = {
    r"\bpython\b": "Python",
    r"\bjava\b(?!script)": "Java",
    r"\bc\+\+\b": "C++",
    r"\bjavascript\b|\bjs\b": "JavaScript",
    r"\btypescript\b": "TypeScript",
    r"\breact(?:\.?js)?\b": "React",
    r"\bnode(?:\.?js)?\b": "Node.js",
    r"\bhtml\b|\bcss\b": "HTML/CSS",
    r"\bsql\b|\bpostgres|\bmysql\b|\bdatabase\b": "SQL",
    r"\bmachine learning\b|\bml\b(?!h)": "Machine Learning",
    r"\bdeep learning\b|\bneural net": "Deep Learning",
    r"\bdata science\b|\bdatascience\b": "Data Science",
    r"\bdata analysis\b|\banalytics\b": "Data Analysis",
    r"\bstatistic": "Statistics",
    r"\bpandas\b": "Pandas",
    r"\bnumpy\b": "NumPy",
    r"\btensorflow\b": "TensorFlow",
    r"\bpytorch\b": "PyTorch",
    r"\bpower ?bi\b": "Power BI",
    r"\btableau\b": "Tableau",
    r"\bexcel\b|\bspreadsheet": "Excel",
    r"\bcloud\b|\bazure\b|\bgcp\b": "Cloud Computing",
    r"\baws\b|\bamazon web services\b": "AWS",
    r"\bdocker\b|\bkubernetes\b": "Docker",
    r"\blinux\b|\bunix\b": "Linux",
    r"\bcyber ?security\b|\binfosec\b|\bsecurity\b": "Cybersecurity",
    r"\bnetworking\b": "Networking",
    r"\bandroid\b|\bkotlin\b": "Android",
    r"\bflutter\b|\bdart\b": "Flutter",
    r"\bui\b|\bux\b|\buser experience\b|\bdesign\b": "UI/UX",
    r"\bfigma\b": "Figma",
    r"\bmarketing\b": "Marketing",
    r"\bfinance\b|\bfintech\b": "Finance",
    r"\bblockchain\b|\bweb3\b|\bsolidity\b": "Blockchain",
    r"\bai\b|\bartificial intelligence\b|\bgenai\b|\bllm\b": "Machine Learning",
    r"\biot\b|\binternet of things\b": "IoT",
    r"\brobotic": "Robotics",
    r"\bgit\b|\bgithub\b": "Git",
    r"\balgorithm|\bdata structure": "Algorithms",
    r"\bteamwork\b|\bcollaborat": "Teamwork",
    r"\bproblem.solving\b": "Problem Solving",
    r"\bcommunicat": "Communication",
}

_COMPILED_SKILLS = [(re.compile(p, re.IGNORECASE), name) for p, name in SKILL_PATTERNS.items()]


def detect_skills(*texts: str, extra_tags: list[str] | None = None, limit: int = 8) -> list[str]:
    """
    Finds known skills mentioned in the given text.

    This matters more than it looks: the recommendation engine weights skill
    overlap at 20% of the score, so an opportunity with no skills attached can
    never match a student strongly. Tags from the source are checked first
    because they are the most reliable signal.
    """
    haystack = " ".join(t for t in texts if t)
    if extra_tags:
        haystack += " " + " ".join(str(t) for t in extra_tags)

    found: list[str] = []
    for pattern, canonical in _COMPILED_SKILLS:
        if canonical in found:
            continue
        if pattern.search(haystack):
            found.append(canonical)
        if len(found) >= limit:
            break
    return found


# ---------------------------------------------------------------------------
# Work mode
# ---------------------------------------------------------------------------
def detect_mode(*texts: str) -> str:
    """Returns Remote, Hybrid or On-site based on how the listing describes itself."""
    haystack = " ".join(t for t in texts if t).lower()

    if any(word in haystack for word in ("hybrid", "online + offline", "online and offline")):
        return "Hybrid"
    if any(word in haystack for word in ("online", "remote", "virtual", "anywhere", "worldwide")):
        return "Remote"
    if any(word in haystack for word in ("on-site", "onsite", "in person", "in-person", "offline")):
        return "On-site"
    return "Remote"


def looks_like_student_opportunity(title: str) -> bool:
    """
    TRUE when a job title suggests an internship or early-career role.

    The match must be on whole words. A plain substring test looks correct but
    is not: "Internal Audit Lead" contains "intern", so a senior audit role
    would be published to students as an internship. Word boundaries fix that.
    """
    from .config import INTERNSHIP_TITLE_HINTS

    return any(
        re.search(rf"(?<![a-z]){re.escape(hint)}(?![a-z])", title, re.IGNORECASE)
        for hint in INTERNSHIP_TITLE_HINTS
    )
