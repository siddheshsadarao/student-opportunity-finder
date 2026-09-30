"""
Database access for the recommendation service.

Everything here is a plain SELECT -- the service never modifies data.
Queries use %s placeholders (psycopg2's parameter style), which keeps them
safe from SQL injection just like the $1 placeholders on the Node side.
"""
from contextlib import contextmanager
from typing import Any

import psycopg2
import psycopg2.extras
from psycopg2 import pool as pg_pool

from .config import settings

# A small connection pool created once when the service starts.
_connection_pool: pg_pool.SimpleConnectionPool | None = None


def init_pool() -> None:
    """Called on application start-up."""
    global _connection_pool
    if _connection_pool is None:
        _connection_pool = pg_pool.SimpleConnectionPool(1, 5, settings.dsn)


def close_pool() -> None:
    """Called on application shutdown."""
    global _connection_pool
    if _connection_pool is not None:
        _connection_pool.closeall()
        _connection_pool = None


@contextmanager
def get_cursor():
    """Borrows a connection from the pool and returns rows as dictionaries."""
    if _connection_pool is None:
        init_pool()

    connection = _connection_pool.getconn()
    try:
        with connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            yield cursor
        connection.commit()
    finally:
        _connection_pool.putconn(connection)


def fetch_student(user_id: int) -> dict[str, Any] | None:
    """
    Loads one student's complete profile: the profile row plus their skills,
    interests and preferred opportunity categories.

    Returns None when the user does not exist or has no profile yet.
    """
    with get_cursor() as cursor:
        cursor.execute(
            """
            SELECT p.id AS profile_id, p.user_id, p.college, p.degree, p.branch,
                   p.year, p.city, p.career_goal, p.preferred_mode,
                   p.preferred_location, p.bio
              FROM student_profiles p
             WHERE p.user_id = %s
            """,
            (user_id,),
        )
        profile = cursor.fetchone()
        if profile is None:
            return None

        profile_id = profile["profile_id"]

        cursor.execute(
            """
            SELECT s.name
              FROM student_skills ss
              JOIN skills s ON s.id = ss.skill_id
             WHERE ss.profile_id = %s
            """,
            (profile_id,),
        )
        skills = [row["name"] for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT i.name
              FROM student_interests si
              JOIN interests i ON i.id = si.interest_id
             WHERE si.profile_id = %s
            """,
            (profile_id,),
        )
        interests = [row["name"] for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT c.id, c.name
              FROM student_preferred_categories spc
              JOIN categories c ON c.id = spc.category_id
             WHERE spc.profile_id = %s
            """,
            (profile_id,),
        )
        categories = cursor.fetchall()

        return {
            **dict(profile),
            "skills": skills,
            "interests": interests,
            "preferred_category_ids": [row["id"] for row in categories],
            "preferred_category_names": [row["name"] for row in categories],
        }


def fetch_opportunities() -> list[dict[str, Any]]:
    """
    Loads every open opportunity together with its required skills.

    Only active opportunities whose deadline has not passed are returned --
    there is no point recommending something a student can no longer apply to.
    """
    with get_cursor() as cursor:
        cursor.execute(
            """
            SELECT o.id, o.title, o.organization, o.description, o.eligibility,
                   o.location, o.mode, o.category_id, o.deadline,
                   c.name AS category_name,
                   COALESCE(
                     (SELECT array_agg(s.name ORDER BY s.name)
                        FROM opportunity_skills os
                        JOIN skills s ON s.id = os.skill_id
                       WHERE os.opportunity_id = o.id),
                     ARRAY[]::varchar[]
                   ) AS skills
              FROM opportunities o
              JOIN categories c ON c.id = o.category_id
             WHERE o.is_active = TRUE
               AND o.deadline >= CURRENT_DATE
            """
        )
        rows = cursor.fetchall()

    return [{**dict(row), "skills": list(row["skills"] or [])} for row in rows]


def fetch_student_history(user_id: int) -> dict[str, list[int]]:
    """
    Which opportunities has this student already saved or viewed?

    Saved items tell us what they liked, so we give similar opportunities a
    small bonus. Already-saved items themselves are still recommended (the
    student may want to apply), but the frontend shows them as saved.
    """
    with get_cursor() as cursor:
        cursor.execute(
            "SELECT opportunity_id FROM saved_opportunities WHERE user_id = %s",
            (user_id,),
        )
        saved = [row["opportunity_id"] for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT DISTINCT opportunity_id
              FROM opportunity_views
             WHERE user_id = %s
             ORDER BY opportunity_id
             LIMIT 50
            """,
            (user_id,),
        )
        viewed = [row["opportunity_id"] for row in cursor.fetchall()]

    return {"saved": saved, "viewed": viewed}


def health_check() -> bool:
    """Returns True when the database answers."""
    try:
        with get_cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return True
    except Exception:
        return False
