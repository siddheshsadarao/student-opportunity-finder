"""
Configuration for the opportunity ingestion service.

WHAT THIS SERVICE DOES
----------------------
It pulls real, currently-open opportunities from external sources on a
schedule, converts every source's own format into one common shape, removes
duplicates, and writes them into the same PostgreSQL database the website
reads from.

WHICH SOURCES, AND WHY ONLY THESE
---------------------------------
Every source below was checked against its own robots.txt before being added
(evidence and dates are in docs/DATA_INGESTION.md). We only use sources that
publish a public JSON API and permit automated access.

We deliberately do NOT touch LinkedIn, Indeed, Internshala, foundit, Wellfound,
RippleMatch or Simplify. Their robots.txt or terms of service forbid it, and
several of them actively block automated requests. Ignoring that would be both
a legal problem and a technical dead end.

For internships we use company ATS boards (Greenhouse) instead of scraping job
aggregators. Companies publish those endpoints on purpose so that job boards
can list their roles, so using them is exactly what they are for.
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # --- Database (same database the backend and ML service use) -----------
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: int = int(os.getenv("DB_PORT", "5432"))
    DB_NAME: str = os.getenv("DB_NAME", "student_opportunity_finder")
    DB_USER: str = os.getenv("DB_USER", "postgres")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "postgres")

    # --- Politeness --------------------------------------------------------
    # A descriptive User-Agent is good manners: it tells the site who is
    # calling and lets them contact us instead of silently blocking us.
    USER_AGENT: str = os.getenv(
        "INGEST_USER_AGENT",
        "StudentOpportunityFinder/1.0 (college project; contact: student@example.edu)",
    )
    REQUEST_TIMEOUT: int = int(os.getenv("INGEST_TIMEOUT", "20"))

    # Seconds to wait between requests to the same source.
    DEFAULT_RATE_LIMIT: float = float(os.getenv("INGEST_RATE_LIMIT", "1.5"))

    # How many pages to pull per source per run. Keeping this small means one
    # run finishes quickly and we stay well within polite request volumes.
    MAX_PAGES: int = int(os.getenv("INGEST_MAX_PAGES", "3"))

    # --- Filtering ---------------------------------------------------------
    # Ignore anything whose deadline is further away than this. Listings two
    # years out are almost always bad data.
    MAX_DEADLINE_DAYS: int = 365

    # Skip listings whose description is shorter than this — usually stubs.
    MIN_DESCRIPTION_CHARS: int = 40

    @property
    def dsn(self) -> str:
        return (
            f"host={self.DB_HOST} port={self.DB_PORT} dbname={self.DB_NAME} "
            f"user={self.DB_USER} password={self.DB_PASSWORD}"
        )


settings = Settings()


# ---------------------------------------------------------------------------
# Pages to fetch per source, overriding MAX_PAGES.
#
# Without this the catalogue skews badly. Unstop covers five opportunity types
# and returns 20 results a page, so at a shared page count it produced 87% of
# everything we had, and the site looked like a copy of Unstop with a few
# extras. Devpost has only ~49 hackathons open at any time, so asking for more
# pages there is wasted effort.
#
# Balancing here rather than by discarding rows keeps every listing we fetch.
# ---------------------------------------------------------------------------
SOURCE_PAGE_LIMITS: dict[str, int] = {
    "unstop": 4,        # ~20 per page x 5 types = plenty on its own
    "devpost": 6,       # 9 per page; only ~49 are open worldwide, so 6 covers it
    "devfolio": 10,     # 20 per page, but few are open at once
    "hackerearth": 1,   # single unpaginated feed
    "mlh": 1,           # one page per season, not paginated
    "hackclub": 1,      # single unpaginated feed
    "codeforces": 1,    # single unpaginated feed
    "codechef": 1,      # single unpaginated feed
    "kaggle": 3,        # 20 per page
    "greenhouse": 1,    # per-company, not paginated
    "ashby": 1,         # per-company, not paginated
    "lever": 1,         # per-company public job boards
    "smartrecruiters": 2,
    "remotive": 1,      # one public API response
    "arbeitnow": 3,     # 100 listings per page
    "atcoder": 1,       # one upcoming-contests page
}


# ---------------------------------------------------------------------------
# Company job boards to pull internships from.
#
# These are Greenhouse board tokens. To find one for a company, open their
# careers page and look for "boards.greenhouse.io/<token>" or
# "job-boards.greenhouse.io/<token>" in the URL or page source.
#
# Add or remove companies here — no code changes needed.
# ---------------------------------------------------------------------------
GREENHOUSE_COMPANIES: list[dict] = [
    {"token": "stripe", "name": "Stripe"},
    {"token": "databricks", "name": "Databricks"},
    {"token": "figma", "name": "Figma"},
    {"token": "gitlab", "name": "GitLab"},
    {"token": "airbnb", "name": "Airbnb"},
    {"token": "reddit", "name": "Reddit"},
]


# ---------------------------------------------------------------------------
# Ashby job boards. Same idea as Greenhouse, different ATS.
# The board name is the last part of the company's Ashby careers URL:
#     jobs.ashbyhq.com/<board>
# ---------------------------------------------------------------------------
ASHBY_COMPANIES: list[dict] = [
    {"board": "openai", "name": "OpenAI"},
    {"board": "ramp", "name": "Ramp"},
    {"board": "notion", "name": "Notion"},
    {"board": "linear", "name": "Linear"},
]

# Lever's documented public Postings API. These boards currently carry a
# useful number of internships and new-graduate roles.
LEVER_COMPANIES: list[dict] = [
    {"board": "palantir", "name": "Palantir"},
    {"board": "zoox", "name": "Zoox"},
    {"board": "shieldai", "name": "Shield AI"},
]

# SmartRecruiters' public company postings API. The adapter still filters
# aggressively, so senior/full-time roles never reach the student catalogue.
SMARTRECRUITERS_COMPANIES: list[dict] = [
    {"company": "BoschGroup", "name": "Bosch"},
    {"company": "ServiceNow", "name": "ServiceNow"},
    {"company": "Ubisoft2", "name": "Ubisoft"},
]

# Only keep ATS roles whose title looks like a student opportunity — company
# boards are mostly senior roles we do not want to show students.
INTERNSHIP_TITLE_HINTS = (
    "intern",
    "internship",
    "graduate",
    "new grad",
    "campus",
    "trainee",
    "apprentice",
    "early career",
    "entry level",
    "entry-level",
    "junior",
    "student",
    "co-op",
)
