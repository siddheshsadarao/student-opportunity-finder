"""
Configuration for the recommendation microservice.

Reads the same PostgreSQL database that the Express backend uses. The service
is read-only: it never writes to the database, it only loads student profiles
and opportunities in order to score them.
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """All tunable values in one place."""

    # --- Database ---------------------------------------------------------
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: int = int(os.getenv("DB_PORT", "5432"))
    DB_NAME: str = os.getenv("DB_NAME", "student_opportunity_finder")
    DB_USER: str = os.getenv("DB_USER", "postgres")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "postgres")

    # --- Service ----------------------------------------------------------
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))

    # Only the Express backend should be able to call this service.
    ALLOWED_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "ALLOWED_ORIGINS", "http://localhost:5000,http://localhost:5173"
        ).split(",")
        if origin.strip()
    ]

    # --- Scoring weights --------------------------------------------------
    # The final score is a weighted blend of eight signals. These add up to
    # 1.0 and are the main thing to explain in a viva: "how much does each
    # signal matter, and why?"
    #
    # Text similarity used to carry 0.55 on its own. That made a Data Science
    # student and a Mechanical student score almost identically whenever both
    # listed "Python", because the wording overlapped. Moving weight onto the
    # structured signals below (branch, interests, goal) fixed that, and the
    # scores now clearly separate students with different profiles.
    WEIGHT_CONTENT: float = 0.32    # TF-IDF cosine similarity of the text
    WEIGHT_SKILLS: float = 0.22     # fraction of required skills the student has
    WEIGHT_CATEGORY: float = 0.10   # student's preferred opportunity types
    WEIGHT_INTERESTS: float = 0.10  # explicit interest overlap
    WEIGHT_BRANCH: float = 0.08     # is it in their field of study?
    WEIGHT_GOAL: float = 0.08       # does it lead to the job they want?
    WEIGHT_MODE: float = 0.05       # remote / hybrid / on-site preference
    WEIGHT_LOCATION: float = 0.05   # city / preferred location

    # A small bonus for opportunities similar to ones the student already
    # saved (simple behaviour-based personalisation). Kept small on purpose,
    # otherwise a student gets trapped seeing only more of the same.
    HISTORY_BONUS: float = 0.08

    # Applied when the eligibility text clearly excludes the student's year.
    # It reduces the score rather than hiding the opportunity, because
    # eligibility is free text written by hand and may be incomplete.
    INELIGIBLE_PENALTY: float = 0.6

    @property
    def dsn(self) -> str:
        """Connection string used by psycopg2."""
        return (
            f"host={self.DB_HOST} port={self.DB_PORT} dbname={self.DB_NAME} "
            f"user={self.DB_USER} password={self.DB_PASSWORD}"
        )


settings = Settings()
