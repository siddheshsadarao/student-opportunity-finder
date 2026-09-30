"""
Writes normalised opportunities into PostgreSQL.

Three problems are solved here, and they are the reason ingestion needs more
than a plain INSERT:

1. IDEMPOTENCY — the job runs every few hours. Running it twice must not
   create two copies of the same hackathon. Solved by the unique index on
   (source, source_id): we INSERT ... ON CONFLICT DO UPDATE, so a second run
   refreshes the existing row.

2. CROSS-SOURCE DUPLICATES — the same hackathon is often listed on Devpost AND
   Devfolio AND Unstop with different ids, so the unique index cannot catch it.
   Solved by a fingerprint built from the normalised title plus the deadline.

3. EXPIRY — listings whose deadline has passed should disappear from the site
   without being deleted (the admin may still want the history). Solved by
   setting is_active = FALSE rather than removing rows.
"""
from __future__ import annotations

import re
from contextlib import contextmanager
from dataclasses import dataclass

import psycopg2
import psycopg2.extras

from .common import NormalisedOpportunity
from .config import settings


@dataclass
class RunStats:
    """What one source's run did, shown in the admin panel afterwards."""

    fetched: int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0

    def __str__(self) -> str:
        return (
            f"fetched={self.fetched} created={self.created} "
            f"updated={self.updated} skipped={self.skipped}"
        )


@contextmanager
def get_connection():
    connection = psycopg2.connect(settings.dsn)
    try:
        yield connection
    finally:
        connection.close()


# ---------------------------------------------------------------------------
# Cross-source duplicate detection
# ---------------------------------------------------------------------------
_NOISE_RE = re.compile(r"\b(20\d{2}|hackathon|hack|challenge|contest|edition|v?\d+\.\d+)\b")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")


def fingerprint(title: str, deadline) -> str:
    """
    Builds a comparable key for the same event listed on different sites.

    "HackCelestial 3.0" on Unstop and "HackCelestial 3.0 Hackathon 2026" on
    Devpost both reduce to "hackcelestial" + the deadline, so we can tell they
    are one event. Including the deadline stops us from merging genuinely
    different annual editions of the same hackathon.
    """
    cleaned = _NOISE_RE.sub(" ", (title or "").lower())
    cleaned = _NON_ALNUM_RE.sub("", cleaned)
    return f"{cleaned}|{deadline}"


def slugify(text: str) -> str:
    return _NON_ALNUM_RE.sub("-", (text or "").strip().lower()).strip("-")


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------
def load_category_ids(cursor) -> dict[str, int]:
    cursor.execute("SELECT slug, id FROM categories")
    return {row["slug"]: row["id"] for row in cursor.fetchall()}


def load_existing_fingerprints(cursor) -> dict[str, tuple[str, str]]:
    """Fingerprint -> (source, source_id) for every opportunity already stored."""
    cursor.execute(
        """
        SELECT title, deadline, source, source_id
          FROM opportunities
         WHERE is_active = TRUE AND deadline >= CURRENT_DATE
        """
    )
    return {
        fingerprint(row["title"], row["deadline"]): (row["source"], row["source_id"])
        for row in cursor.fetchall()
    }


def resolve_skill_ids(cursor, names: list[str]) -> list[int]:
    """
    Returns skill ids, creating any that do not exist yet.

    Matching happens on the slug, so "Node.JS" from one source and "Node.js"
    from another resolve to the same row instead of creating duplicates.
    """
    ids: list[int] = []
    for name in names:
        cleaned = (name or "").strip()
        if not cleaned:
            continue
        slug = slugify(cleaned)
        if not slug:
            continue

        cursor.execute(
            """
            INSERT INTO skills (name, slug)
            VALUES (%s, %s)
            ON CONFLICT (slug) DO UPDATE SET name = skills.name
            RETURNING id
            """,
            (cleaned[:80], slug[:80]),
        )
        ids.append(cursor.fetchone()["id"])
    return list(dict.fromkeys(ids))


# ---------------------------------------------------------------------------
# Saving
# ---------------------------------------------------------------------------
def save_opportunities(
    items: list[NormalisedOpportunity],
    auto_approve: bool = True,
) -> RunStats:
    """Upserts a batch of normalised opportunities and returns what happened."""
    stats = RunStats(fetched=len(items))
    if not items:
        return stats

    review_status = "approved" if auto_approve else "pending"

    with get_connection() as connection:
        with connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            categories = load_category_ids(cursor)
            seen_fingerprints = load_existing_fingerprints(cursor)

            for item in items:
                category_id = categories.get(item.category_slug)
                if category_id is None:
                    stats.skipped += 1
                    continue

                if len(item.description or "") < settings.MIN_DESCRIPTION_CHARS:
                    stats.skipped += 1
                    continue
                if not item.application_url:
                    stats.skipped += 1
                    continue

                # --- cross-source duplicate check ---
                key = fingerprint(item.title, item.deadline)
                owner = seen_fingerprints.get(key)
                if owner and owner != (item.source, item.source_id):
                    # Already have this event from another site; keep the first.
                    stats.skipped += 1
                    continue

                cursor.execute(
                    """
                    INSERT INTO opportunities
                        (title, organization, organization_logo, category_id, description,
                         eligibility, benefits, location, mode, duration, stipend, prize,
                         deadline, start_date, end_date, application_url, source, source_id,
                         source_url, is_demo, is_external, is_active, review_status, ingested_at)
                    VALUES
                        (%(title)s, %(organization)s, %(logo)s, %(category_id)s, %(description)s,
                         %(eligibility)s, %(benefits)s, %(location)s, %(mode)s, %(duration)s,
                         %(prize)s, %(prize)s,
                         %(deadline)s, %(start_date)s, %(end_date)s, %(application_url)s,
                         %(source)s, %(source_id)s, %(source_url)s,
                         FALSE, TRUE, TRUE, %(review_status)s, NOW())
                    ON CONFLICT (source, source_id) WHERE source_id IS NOT NULL
                    DO UPDATE SET
                        title           = EXCLUDED.title,
                        organization    = EXCLUDED.organization,
                        description     = EXCLUDED.description,
                        eligibility     = EXCLUDED.eligibility,
                        benefits        = EXCLUDED.benefits,
                        location        = EXCLUDED.location,
                        mode            = EXCLUDED.mode,
                        prize           = EXCLUDED.prize,
                        stipend         = EXCLUDED.stipend,
                        deadline        = EXCLUDED.deadline,
                        start_date      = EXCLUDED.start_date,
                        end_date        = EXCLUDED.end_date,
                        application_url = EXCLUDED.application_url,
                        is_active       = TRUE,
                        ingested_at     = NOW()
                    RETURNING id, (xmax = 0) AS was_inserted
                    """,
                    {
                        "title": item.title[:200],
                        "organization": item.organization[:160],
                        "logo": item.organization_logo,
                        "category_id": category_id,
                        "description": item.description,
                        "eligibility": item.eligibility,
                        "benefits": item.benefits,
                        "location": (item.location or "Online")[:120],
                        "mode": item.mode,
                        "duration": (item.duration or None),
                        "prize": (item.prize or None),
                        "deadline": item.deadline,
                        "start_date": item.start_date,
                        "end_date": item.end_date,
                        "application_url": item.application_url,
                        "source": item.source,
                        "source_id": item.source_id,
                        "source_url": item.source_url,
                        "review_status": review_status,
                    },
                )

                row = cursor.fetchone()
                opportunity_id = row["id"]
                # xmax = 0 is PostgreSQL's way of saying "this row was inserted,
                # not updated" by an ON CONFLICT statement.
                if row["was_inserted"]:
                    stats.created += 1
                else:
                    stats.updated += 1

                seen_fingerprints[key] = (item.source, item.source_id)

                # --- skills ---
                if item.skills:
                    skill_ids = resolve_skill_ids(cursor, item.skills)
                    cursor.execute(
                        "DELETE FROM opportunity_skills WHERE opportunity_id = %s",
                        (opportunity_id,),
                    )
                    for skill_id in skill_ids:
                        cursor.execute(
                            """
                            INSERT INTO opportunity_skills (opportunity_id, skill_id)
                            VALUES (%s, %s) ON CONFLICT DO NOTHING
                            """,
                            (opportunity_id, skill_id),
                        )

        connection.commit()

    return stats


def expire_old_opportunities() -> int:
    """
    Hides externally-ingested listings whose deadline has passed.

    They are kept in the database (the admin may want the history and the
    analytics counts), just marked inactive so students stop seeing them.
    """
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE opportunities
                   SET is_active = FALSE
                 WHERE is_external = TRUE
                   AND is_active = TRUE
                   AND deadline < CURRENT_DATE
                """
            )
            count = cursor.rowcount
        connection.commit()
    return count


# ---------------------------------------------------------------------------
# Run logging
# ---------------------------------------------------------------------------
def start_run(source_key: str) -> int:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO ingestion_runs (source_key, status) VALUES (%s, 'running') RETURNING id",
                (source_key,),
            )
            run_id = cursor.fetchone()[0]
        connection.commit()
    return run_id


def finish_run(run_id: int, source_key: str, stats: RunStats, error: str | None = None) -> None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE ingestion_runs
                   SET finished_at   = NOW(),
                       status        = %s,
                       fetched_count = %s,
                       created_count = %s,
                       updated_count = %s,
                       skipped_count = %s,
                       error_message = %s
                 WHERE id = %s
                """,
                (
                    "failed" if error else "success",
                    stats.fetched,
                    stats.created,
                    stats.updated,
                    stats.skipped,
                    error,
                    run_id,
                ),
            )
            cursor.execute(
                "UPDATE ingestion_sources SET last_run_at = NOW() WHERE key = %s",
                (source_key,),
            )
        connection.commit()


def get_enabled_sources() -> list[dict]:
    with get_connection() as connection:
        with connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT key, name, auto_approve, rate_limit_secs
                  FROM ingestion_sources
                 WHERE is_enabled = TRUE
                 ORDER BY id
                """
            )
            return [dict(row) for row in cursor.fetchall()]
