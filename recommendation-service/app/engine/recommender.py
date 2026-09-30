"""
===============================================================================
 THE RECOMMENDATION ENGINE
===============================================================================

A CONTENT-BASED recommender. In one sentence:

    We describe the student as text, we describe every opportunity as text, we
    measure how similar they are, and then we adjust that with the things we
    know exactly — their skills, branch, year, goal and preferences.

Why content-based and not collaborative filtering ("students like you also
applied to...")? Collaborative filtering needs a large history of user
behaviour, which a new platform does not have. That is the cold-start problem.
A content-based model works correctly for the very first student who signs up.

-------------------------------------------------------------------------------
 THE EIGHT SIGNALS
-------------------------------------------------------------------------------
 1. content    0.32  TF-IDF cosine similarity of the two text documents
 2. skills     0.22  fraction of required skills the student actually has
 3. category   0.10  is this an opportunity type they asked for?
 4. interests  0.10  how many of their interests does it touch?
 5. branch     0.08  is it in their field of study?
 6. goal       0.08  does it move them towards the job they want?
 7. mode       0.05  remote / hybrid / on-site preference
 8. location   0.05  city or preferred location
                     (+ a small bonus for similarity to things they saved)
                     (× an eligibility multiplier when their year does not fit)

Signals 4 to 6 were added because pure text similarity treated a Data Science
student and a Mechanical student almost identically whenever both wrote
"Python". Making branch, interests and goal explicit fixed that.

-------------------------------------------------------------------------------
 WHAT IT RETURNS
-------------------------------------------------------------------------------
Not just a number. Every recommendation carries a full analysis: each signal
with its own score, weight and contribution in points; which skills matched and
which are missing; an eligibility verdict; and plain-English strengths and
gaps. That is what the "Why this matches you" panel renders, and it is what
makes the score defensible rather than magical.

-------------------------------------------------------------------------------
 HOW TO REPLACE THIS MODEL LATER
-------------------------------------------------------------------------------
The class has one public method, `recommend()`. To swap in sentence embeddings
or a neural ranker, write a new class with the same signature and point
main.py at it. Nothing else in the project changes.
===============================================================================
"""
from typing import Any

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from ..config import settings
from . import profile_signals as signals
from .text_builder import build_opportunity_text, build_student_text


class ContentBasedRecommender:
    """TF-IDF + cosine similarity, blended with structured profile signals."""

    def __init__(self) -> None:
        # ---------------------------------------------------------------
        #   stop_words='english'  drop "the", "and", "a" — no meaning
        #   ngram_range=(1, 2)    index word pairs, so "machine learning"
        #                         is one concept, not two unrelated words
        #   sublinear_tf=True     1 + log(tf), so a word repeated 10 times
        #                         is not 10x more important than one
        # ---------------------------------------------------------------
        self.vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            min_df=1,
            sublinear_tf=True,
            lowercase=True,
        )

    # ------------------------------------------------------------------
    # Individual signals (each returns a value between 0 and 1)
    # ------------------------------------------------------------------

    @staticmethod
    def _skill_signal(
        student_skills: list[str], opportunity_skills: list[str]
    ) -> tuple[float, list[str], list[str]]:
        """
        Fraction of the opportunity's required skills that the student has,
        plus the matched and missing lists.

        The missing list is genuinely useful on its own: it tells a student
        exactly what to learn to become a stronger candidate.
        """
        if not opportunity_skills:
            # Nothing required — neutral rather than zero, so an opportunity
            # with no tagged skills is not pushed to the bottom.
            return 0.5, [], []

        student_lower = {skill.lower() for skill in student_skills}
        matched = [s for s in opportunity_skills if s.lower() in student_lower]
        missing = [s for s in opportunity_skills if s.lower() not in student_lower]

        return len(matched) / len(opportunity_skills), matched, missing

    @staticmethod
    def _category_signal(preferred_ids: list[int], category_id: int) -> float:
        if not preferred_ids:
            return 0.5  # no preference stated -> do not punish anything
        return 1.0 if category_id in preferred_ids else 0.0

    @staticmethod
    def _mode_signal(preferred_mode: str | None, opportunity_mode: str) -> float:
        if not preferred_mode or preferred_mode == "Any":
            return 0.6
        if preferred_mode == opportunity_mode:
            return 1.0
        if opportunity_mode == "Hybrid":
            return 0.6  # a fair compromise for both Remote and On-site seekers
        return 0.2

    @staticmethod
    def _location_signal(student: dict[str, Any], opportunity: dict[str, Any]) -> float:
        if opportunity.get("mode") == "Remote":
            return 0.9  # remote suits any location

        wanted = (student.get("preferred_location") or student.get("city") or "").strip().lower()
        location = (opportunity.get("location") or "").strip().lower()

        if not wanted:
            return 0.5
        if wanted and wanted in location:
            return 1.0
        if location in ("india", "international", "online"):
            return 0.6
        return 0.2

    # ------------------------------------------------------------------
    # Analysis
    # ------------------------------------------------------------------

    @staticmethod
    def _verdict(percentage: int) -> str:
        if percentage >= 85:
            return "Excellent match"
        if percentage >= 70:
            return "Strong match"
        if percentage >= 55:
            return "Good match"
        if percentage >= 40:
            return "Worth a look"
        return "Weak match"

    def _build_analysis(
        self,
        percentage: int,
        components: list[dict],
        matched_skills: list[str],
        missing_skills: list[str],
        matched_interests: list[str],
        eligibility: dict,
        student: dict[str, Any],
        opportunity: dict[str, Any],
    ) -> dict:
        """
        Assembles the object the website's analysis panel renders.

        `strengths` are the reasons this is a good match; `gaps` are honest
        statements about what does not fit, which matter just as much — a
        student should be able to see why something scored 45% and not just
        be shown a low number.
        """
        strengths: list[str] = []
        gaps: list[str] = []

        for component in components:
            if component["score"] >= 0.7 and component["detail"]:
                strengths.append(component["detail"])
            elif component["score"] <= 0.3 and component["gap"]:
                gaps.append(component["gap"])

        if missing_skills:
            shown = ", ".join(missing_skills[:3])
            gaps.append(f"Skills you could add: {shown}")

        if eligibility["status"] == "ineligible" and eligibility["reason"]:
            gaps.append(eligibility["reason"])

        return {
            "score": percentage,
            "verdict": self._verdict(percentage),
            "signals": [
                {
                    "key": c["key"],
                    "label": c["label"],
                    "score": round(c["score"], 4),
                    "weight": c["weight"],
                    "points": round(c["score"] * c["weight"] * 100, 1),
                    "detail": c["detail"] or c["neutral"],
                }
                for c in components
            ],
            "matchedSkills": matched_skills,
            "missingSkills": missing_skills[:6],
            "matchedInterests": matched_interests,
            "eligibility": eligibility,
            "strengths": strengths[:5],
            "gaps": gaps[:4],
            "profileUsed": {
                "skills": len(student.get("skills", [])),
                "interests": len(student.get("interests", [])),
                "branch": student.get("branch"),
                "year": student.get("year"),
                "careerGoal": student.get("career_goal"),
                "preferredMode": student.get("preferred_mode"),
            },
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def recommend(
        self,
        student: dict[str, Any],
        opportunities: list[dict[str, Any]],
        history: dict[str, list[int]] | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """
        Scores every opportunity for one student, best first.

        Each result:
            {
              "opportunity_id": 7,
              "recommendation_score": 92,
              "reasons": [...],
              "breakdown": {...},
              "analysis": {...}
            }
        """
        if not opportunities:
            return []

        history = history or {"saved": [], "viewed": []}
        saved_ids = set(history.get("saved", []))

        # --- STEP 1: build the text documents --------------------------
        student_text = build_student_text(student)
        opportunity_texts = [build_opportunity_text(o) for o in opportunities]

        # --- STEP 2: TF-IDF --------------------------------------------
        # The student goes first, so row 0 is the student and rows 1..n are
        # the opportunities. Fitting together guarantees a shared vocabulary.
        matrix = self.vectorizer.fit_transform([student_text] + opportunity_texts)

        # --- STEP 3: cosine similarity ---------------------------------
        content_scores = cosine_similarity(matrix[0:1], matrix[1:]).flatten()

        # Similarity to things the student already saved (small bonus).
        saved_positions = [i for i, o in enumerate(opportunities) if o["id"] in saved_ids]
        if saved_positions:
            history_scores = cosine_similarity(matrix[1:][saved_positions], matrix[1:]).max(axis=0)
        else:
            history_scores = [0.0] * len(opportunities)

        student_interests = student.get("interests", [])
        results: list[dict[str, Any]] = []

        for index, opportunity in enumerate(opportunities):
            # One lowercase blob used by every keyword-based signal.
            haystack = " ".join(
                str(opportunity.get(field) or "").lower()
                for field in ("title", "description", "eligibility", "category_name")
            )

            content = float(content_scores[index])

            skill_score, matched_skills, missing_skills = self._skill_signal(
                student.get("skills", []), opportunity.get("skills", [])
            )
            category_score = self._category_signal(
                student.get("preferred_category_ids", []), opportunity.get("category_id")
            )
            interest_value, matched_interests = signals.interest_score(student_interests, haystack)
            branch_value, branch_reason = signals.branch_score(student.get("branch"), haystack)
            goal_value, goal_reason = signals.goal_score(student.get("career_goal"), haystack)
            mode_score = self._mode_signal(student.get("preferred_mode"), opportunity.get("mode"))
            location_score = self._location_signal(student, opportunity)

            # --- STEP 4: describe every component -----------------------
            components = [
                {
                    "key": "content",
                    "label": "Overall text similarity",
                    "score": content,
                    "weight": settings.WEIGHT_CONTENT,
                    "detail": "Your profile closely matches this description"
                    if content >= 0.3
                    else None,
                    "gap": "Little overlap with your profile wording",
                    "neutral": "Some overlap with your profile",
                },
                {
                    "key": "skills",
                    "label": "Skill match",
                    "score": skill_score,
                    "weight": settings.WEIGHT_SKILLS,
                    "detail": (
                        f"You have {len(matched_skills)} of "
                        f"{len(matched_skills) + len(missing_skills)} required skills: "
                        + ", ".join(matched_skills[:3])
                    )
                    if matched_skills
                    else None,
                    "gap": "You have none of the listed skills yet",
                    "neutral": "No specific skills listed for this opportunity",
                },
                {
                    "key": "category",
                    "label": "Opportunity type",
                    "score": category_score,
                    "weight": settings.WEIGHT_CATEGORY,
                    "detail": f"{opportunity.get('category_name')} is one of your preferred types"
                    if category_score >= 1.0
                    else None,
                    "gap": f"{opportunity.get('category_name')} is not in your preferred types",
                    "neutral": "You have not set preferred opportunity types",
                },
                {
                    "key": "interests",
                    "label": "Your interests",
                    "score": interest_value,
                    "weight": settings.WEIGHT_INTERESTS,
                    "detail": f"Matches your interest in {', '.join(matched_interests[:2])}"
                    if matched_interests
                    else None,
                    "gap": "Does not mention any of your stated interests",
                    "neutral": "Add interests to improve this signal",
                },
                {
                    "key": "branch",
                    "label": "Your branch",
                    "score": branch_value,
                    "weight": settings.WEIGHT_BRANCH,
                    "detail": branch_reason,
                    "gap": f"Not obviously related to {student.get('branch')}"
                    if student.get("branch")
                    else "Add your branch to improve this signal",
                    "neutral": "Branch relevance could not be determined",
                },
                {
                    "key": "goal",
                    "label": "Career goal",
                    "score": goal_value,
                    "weight": settings.WEIGHT_GOAL,
                    "detail": goal_reason,
                    "gap": f"Does not obviously lead towards {student.get('career_goal')}"
                    if student.get("career_goal")
                    else "Set a career goal to improve this signal",
                    "neutral": "Career goal relevance unclear",
                },
                {
                    "key": "mode",
                    "label": "Work mode",
                    "score": mode_score,
                    "weight": settings.WEIGHT_MODE,
                    "detail": f"{opportunity.get('mode')} matches your preference"
                    if mode_score >= 1.0
                    else None,
                    "gap": f"{opportunity.get('mode')} does not match your "
                    f"{student.get('preferred_mode')} preference",
                    "neutral": f"{opportunity.get('mode')} opportunity",
                },
                {
                    "key": "location",
                    "label": "Location",
                    "score": location_score,
                    "weight": settings.WEIGHT_LOCATION,
                    "detail": f"Located in {opportunity.get('location')}"
                    if location_score >= 1.0
                    else ("Remote, so location is not a barrier" if location_score >= 0.9 else None),
                    "gap": f"Based in {opportunity.get('location')}, away from you",
                    "neutral": f"Location: {opportunity.get('location')}",
                },
            ]

            # --- STEP 5: blend -----------------------------------------
            base = sum(c["score"] * c["weight"] for c in components)

            history_similarity = float(history_scores[index])
            bonus = settings.HISTORY_BONUS * history_similarity
            similar_to_saved = history_similarity > 0.35 and opportunity["id"] not in saved_ids

            # Eligibility never removes an opportunity — the text is written by
            # hand and may be incomplete — but a clear mismatch reduces the score.
            status, reason = signals.check_year_eligibility(
                student.get("year"), opportunity.get("eligibility")
            )
            eligibility_multiplier = settings.INELIGIBLE_PENALTY if status == "ineligible" else 1.0

            raw_score = (base + bonus) * eligibility_multiplier

            # Cosine values on short documents rarely exceed ~0.5, so a straight
            # ×100 would make every match look weak. We stretch the useful range
            # and cap at 99 — claiming a "100% match" would be dishonest for a
            # text-similarity model.
            percentage = int(round(min(0.99, raw_score * 1.35) * 100))
            percentage = max(1, min(99, percentage))

            eligibility = {
                "status": status,
                "reason": reason,
                "degreeMatch": signals.degree_matches(
                    student.get("degree"), opportunity.get("eligibility")
                ),
            }

            # --- STEP 6: explanations -----------------------------------
            reasons = [c["detail"] for c in components if c["score"] >= 0.7 and c["detail"]]
            if similar_to_saved:
                reasons.append("Similar to opportunities you saved earlier")
            if not reasons:
                reasons.append("Recently added and open for applications")

            analysis = self._build_analysis(
                percentage,
                components,
                matched_skills,
                missing_skills,
                matched_interests,
                eligibility,
                student,
                opportunity,
            )

            results.append(
                {
                    "opportunity_id": opportunity["id"],
                    "recommendation_score": percentage,
                    "reasons": reasons[:4],
                    "breakdown": {
                        "content_similarity": round(content, 4),
                        "skill_match": round(skill_score, 4),
                        "category_match": round(category_score, 4),
                        "interest_match": round(interest_value, 4),
                        "branch_match": round(branch_value, 4),
                        "goal_match": round(goal_value, 4),
                        "mode_match": round(mode_score, 4),
                        "location_match": round(location_score, 4),
                        "history_bonus": round(bonus, 4),
                        "eligibility_multiplier": eligibility_multiplier,
                    },
                    "analysis": analysis,
                }
            )

        results.sort(key=lambda item: item["recommendation_score"], reverse=True)
        return results[:limit]


# One shared instance for the whole service.
recommender = ContentBasedRecommender()
