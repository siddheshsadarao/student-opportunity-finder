"""
Structured profile signals.

The TF-IDF model compares words. That catches a lot, but it misses things we
know precisely from the student's profile — their branch, their year, their
career goal. A Data Science student and a Mechanical student can produce very
similar text documents if both wrote "Python", yet the right hackathon for each
is completely different.

So this module turns three profile fields into explicit, checkable signals:

    branch        -> is this opportunity in their field?
    career_goal   -> does this move them towards the job they want?
    year          -> are they actually eligible to apply?

Each function returns a score between 0 and 1 plus a short human-readable
reason, so the "full analysis" panel on the website can show a student exactly
why a number came out the way it did.
"""
from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Branch -> the words that indicate work in that field
# ---------------------------------------------------------------------------
BRANCH_KEYWORDS: dict[str, list[str]] = {
    "data science": [
        "data science", "data analysis", "analytics", "machine learning",
        "statistics", "data engineer", "big data", "visualisation", "visualization",
    ],
    "ai/ml": [
        "artificial intelligence", "machine learning", "deep learning", "neural",
        "nlp", "computer vision", "genai", "llm", "model",
    ],
    "computer science": [
        "software", "programming", "developer", "algorithm", "data structure",
        "backend", "frontend", "full stack", "coding", "application",
    ],
    "it": [
        "software", "information technology", "systems", "network", "cloud",
        "devops", "database", "web",
    ],
    "electronics": [
        "electronics", "embedded", "iot", "vlsi", "circuit", "signal",
        "hardware", "robotics", "sensor", "microcontroller",
    ],
    "electrical": [
        "electrical", "power", "energy", "circuit", "grid", "motor",
        "renewable", "hardware",
    ],
    "mechanical": [
        "mechanical", "cad", "design", "manufacturing", "automotive",
        "thermal", "robotics", "sae", "automobile",
    ],
    "civil": [
        "civil", "construction", "structural", "infrastructure", "surveying",
        "architecture", "urban", "smart city",
    ],
}

# ---------------------------------------------------------------------------
# Career goal -> the words that indicate progress towards that goal
# ---------------------------------------------------------------------------
GOAL_KEYWORDS: dict[str, list[str]] = {
    "data scientist": [
        "data science", "machine learning", "analytics", "statistics",
        "predictive", "model", "dataset",
    ],
    "ml engineer": [
        "machine learning", "deep learning", "mlops", "model", "training",
        "pytorch", "tensorflow", "ai",
    ],
    "data analyst": [
        "data analysis", "analytics", "sql", "dashboard", "reporting",
        "power bi", "tableau", "insight", "excel",
    ],
    "software developer": [
        "software", "developer", "engineering", "programming", "full stack",
        "backend", "frontend", "application", "build",
    ],
    "cybersecurity engineer": [
        "security", "cybersecurity", "vulnerability", "penetration", "soc",
        "threat", "encryption", "infosec",
    ],
    "product manager": [
        "product", "roadmap", "stakeholder", "user research", "strategy",
        "go to market", "product management",
    ],
    "entrepreneur": [
        "startup", "founder", "business", "venture", "pitch", "incubat",
        "entrepreneur", "innovation",
    ],
    "researcher": [
        "research", "publication", "paper", "fellowship", "thesis",
        "laboratory", "academic", "symposium",
    ],
}

# ---------------------------------------------------------------------------
# Year eligibility
# ---------------------------------------------------------------------------
_YEAR_WORDS: dict[int, list[str]] = {
    1: ["1st year", "first year", "freshman"],
    2: ["2nd year", "second year", "sophomore"],
    3: ["3rd year", "third year", "junior"],
    4: ["4th year", "fourth year", "final year", "senior", "graduating"],
}
_OPEN_ENDED = ("onwards", "or above", "and above", "or later", "+")


def branch_score(branch: str | None, haystack: str) -> tuple[float, str | None]:
    """
    How well does this opportunity fit the student's branch?

    Returns 0.5 (neutral) when we have no branch or no keyword list for it,
    so that a student from an unlisted branch is never penalised.
    """
    if not branch:
        return 0.5, None

    keywords = BRANCH_KEYWORDS.get(branch.strip().lower())
    if not keywords:
        return 0.5, None

    hits = [word for word in keywords if word in haystack]
    if not hits:
        return 0.25, None

    # Two or more field-specific words is a strong signal.
    score = 1.0 if len(hits) >= 2 else 0.7
    return score, f"Relevant to {branch} ({hits[0]})"


def goal_score(career_goal: str | None, haystack: str) -> tuple[float, str | None]:
    """Does this opportunity move the student towards their stated career goal?"""
    if not career_goal:
        return 0.5, None

    goal = career_goal.strip().lower()
    keywords = GOAL_KEYWORDS.get(goal)

    # An unlisted goal still matches if its own words appear in the text.
    if not keywords:
        return (1.0, f"Matches your goal: {career_goal}") if goal in haystack else (0.5, None)

    hits = [word for word in keywords if word in haystack]
    if not hits:
        return 0.2, None

    score = 1.0 if len(hits) >= 2 else 0.7
    return score, f"Builds towards becoming a {career_goal}"


def interest_score(interests: list[str], haystack: str) -> tuple[float, list[str]]:
    """Fraction of the student's interests that this opportunity touches."""
    if not interests:
        return 0.5, []

    matched = [interest for interest in interests if interest.strip().lower() in haystack]
    if not matched:
        return 0.15, []

    # Matching two interests is already a strong signal; more is capped.
    return min(1.0, len(matched) / 2.0), matched


def check_year_eligibility(year: int | None, eligibility: str | None) -> tuple[str, str | None]:
    """
    Reads the free-text eligibility field and decides whether this student's
    year qualifies.

    Returns one of:
        ("eligible",   "Open to year 3 students")
        ("ineligible", "Looks restricted to final year students")
        ("unknown",    None)

    We are deliberately conservative. Eligibility is written by hand by
    whoever posted the listing, so it can say anything. We only report
    "ineligible" when the text clearly names specific years and the student's
    year is not among them — and even then the score is reduced, never
    filtered out, because the text may be incomplete.
    """
    if not year or not eligibility:
        return "unknown", None

    text = eligibility.lower()

    # "2nd year onwards", "3rd year or above" -> everyone at or after that year.
    for listed_year, words in _YEAR_WORDS.items():
        for word in words:
            if word in text:
                window = text[max(0, text.find(word) - 10): text.find(word) + len(word) + 24]
                if any(marker in window for marker in _OPEN_ENDED):
                    if year >= listed_year:
                        return "eligible", f"Open to year {listed_year} students and above"
                    return "ineligible", f"Appears to need year {listed_year} or above"

    mentioned = [
        listed_year
        for listed_year, words in _YEAR_WORDS.items()
        if any(word in text for word in words)
    ]
    if not mentioned:
        return "unknown", None

    if year in mentioned:
        return "eligible", f"Open to year {year} students"

    readable = ", ".join(str(y) for y in sorted(mentioned))
    return "ineligible", f"Appears to be for year {readable} students"


def degree_matches(degree: str | None, eligibility: str | None) -> bool | None:
    """
    TRUE when the eligibility text names the student's degree, FALSE when it
    clearly names other degrees only, None when it says nothing useful.
    """
    if not degree or not eligibility:
        return None

    text = eligibility.lower()
    normalised = degree.strip().lower().replace(".", "")

    known = ["btech", "be", "bsc", "bca", "mca", "mba"]
    present = [d for d in known if re.search(rf"\b{d}\b", text.replace(".", ""))]
    if not present:
        return None
    return normalised in present
