"""
Turns database rows into the plain-text "documents" that TF-IDF works on.

This step is called FEATURE ENGINEERING and it matters more than the choice
of algorithm. If the text does not contain the right words, no amount of
mathematics will find a good match.

Two tricks are used here:

 1. REPETITION AS WEIGHTING.
    TF-IDF counts how often a term appears, so writing the student's skills
    three times makes skills matter roughly three times as much as a word
    that appears once. This is a simple way to weight a field without
    changing the algorithm.

 2. SYNONYM EXPANSION.
    A student writes "AI/ML" but an opportunity says "machine learning".
    The two documents would not overlap at all. The expansion table below
    adds the related words so the match is found.
"""
from typing import Any

# Words that mean roughly the same thing in this domain. When one appears we
# also add the others, so different wording still matches.
SYNONYMS: dict[str, list[str]] = {
    "ai/ml": ["artificial intelligence", "machine learning"],
    "ai": ["artificial intelligence", "machine learning"],
    "ml": ["machine learning"],
    "artificial intelligence": ["machine learning", "deep learning", "ai"],
    "machine learning": ["artificial intelligence", "ml", "data science"],
    "deep learning": ["machine learning", "neural networks", "artificial intelligence"],
    "data science": ["data analysis", "analytics", "machine learning", "statistics"],
    "data analysis": ["analytics", "data science"],
    "computer science": ["software", "programming", "development"],
    "web development": ["frontend", "backend", "full stack", "react", "javascript"],
    "cybersecurity": ["security", "network security", "information security"],
    "cloud computing": ["cloud", "aws", "azure", "devops"],
    "mobile development": ["android", "ios", "flutter", "app development"],
    "ui/ux": ["design", "user experience", "user interface", "figma"],
    "entrepreneurship": ["startup", "business", "founder"],
    "research": ["fellowship", "publication", "academic", "paper"],
    "software developer": ["software engineer", "developer", "programming"],
    "data scientist": ["data science", "machine learning", "analytics"],
    "ml engineer": ["machine learning", "deep learning", "model"],
    "data analyst": ["data analysis", "analytics", "sql", "dashboard"],
    "cybersecurity engineer": ["security", "soc", "vulnerability"],
    "product manager": ["product", "roadmap", "stakeholder"],
    "node.js": ["nodejs", "backend", "javascript"],
    "react": ["frontend", "javascript", "web"],
    "sql": ["database", "queries", "postgresql"],
    "python": ["scripting", "pandas", "numpy"],
}


def expand(terms: list[str]) -> list[str]:
    """Adds known synonyms to a list of terms."""
    expanded: list[str] = []
    for term in terms:
        if not term:
            continue
        cleaned = str(term).strip().lower()
        expanded.append(cleaned)
        expanded.extend(SYNONYMS.get(cleaned, []))
    return expanded


def build_student_text(student: dict[str, Any]) -> str:
    """
    Builds the student's document.

    Field importance (through repetition):
        skills        x3   -- the strongest signal of what they can do
        interests     x2   -- what they want to work on
        career goal   x2   -- where they are heading
        branch/degree x1   -- background context
        preferences   x1   -- mode, location, opportunity types
    """
    parts: list[str] = []

    skills = expand(student.get("skills", []))
    parts.extend(skills * 3)

    interests = expand(student.get("interests", []))
    parts.extend(interests * 2)

    if student.get("career_goal"):
        parts.extend(expand([student["career_goal"]]) * 2)

    for field in ("branch", "degree", "college"):
        if student.get(field):
            parts.extend(expand([student[field]]))

    parts.extend(expand(student.get("preferred_category_names", [])))

    if student.get("preferred_mode") and student["preferred_mode"] != "Any":
        parts.append(student["preferred_mode"].lower())

    for field in ("preferred_location", "city"):
        if student.get(field):
            parts.append(str(student[field]).lower())

    if student.get("bio"):
        parts.append(str(student["bio"]).lower())

    return " ".join(parts)


def build_opportunity_text(opportunity: dict[str, Any]) -> str:
    """
    Builds an opportunity's document.

    Required skills are repeated three times to mirror the student document,
    so skill words line up on both sides of the comparison.
    """
    parts: list[str] = []

    skills = expand(opportunity.get("skills", []))
    parts.extend(skills * 3)

    if opportunity.get("title"):
        # The title is the most descriptive single field, so it appears twice.
        parts.extend([str(opportunity["title"]).lower()] * 2)

    for field in ("category_name", "organization", "description", "eligibility"):
        if opportunity.get(field):
            parts.append(str(opportunity[field]).lower())

    if opportunity.get("mode"):
        parts.append(str(opportunity["mode"]).lower())
    if opportunity.get("location"):
        parts.append(str(opportunity["location"]).lower())

    # Expand the category too, so "Hackathon" also matches "competition".
    if opportunity.get("category_name"):
        parts.extend(expand([opportunity["category_name"]]))

    return " ".join(parts)
