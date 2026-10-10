"""
The ingestion runner — this is the command you actually schedule.

    python -m ingestion.run                    # every enabled source
    python -m ingestion.run --source unstop    # just one source
    python -m ingestion.run --dry-run          # fetch and report, write nothing
    python -m ingestion.run --list             # show configured sources

On the VPS, run it every 6 hours with cron:

    0 */6 * * * cd /var/www/sof && ./ingestion/venv/bin/python -m ingestion.run >> /var/log/sof-ingest.log 2>&1

Important: this never runs while a student is browsing. The website only ever
reads from the database, so a slow or failing source can never make a page slow
or break it.
"""
from __future__ import annotations

import argparse
import sys
import traceback
import os
from pathlib import Path

from .common import PoliteSession
from .config import SOURCE_PAGE_LIMITS, settings
from .store import (
    RunStats,
    expire_old_opportunities,
    finish_run,
    get_enabled_sources,
    save_opportunities,
    reconcile_completed_boards,
    start_run,
)

from .adapters import (
    ashby,
    contests,
    devfolio,
    devpost,
    greenhouse,
    hackclub,
    hackerearth,
    mlh,
    lever,
    smartrecruiters,
    jobs,
    atcoder,
    unstop,
)

# Adding a new source later means writing one adapter and adding one line here.
ADAPTERS = {
    devpost.SOURCE_KEY: devpost.fetch,
    unstop.SOURCE_KEY: unstop.fetch,
    devfolio.SOURCE_KEY: devfolio.fetch,
    hackerearth.SOURCE_KEY: hackerearth.fetch,
    mlh.SOURCE_KEY: mlh.fetch,
    hackclub.SOURCE_KEY: hackclub.fetch,
    contests.CODEFORCES_KEY: contests.fetch_codeforces,
    contests.CODECHEF_KEY: contests.fetch_codechef,
    contests.KAGGLE_KEY: contests.fetch_kaggle,
    greenhouse.SOURCE_KEY: greenhouse.fetch,
    ashby.SOURCE_KEY: ashby.fetch,
    lever.SOURCE_KEY: lever.fetch,
    smartrecruiters.SOURCE_KEY: smartrecruiters.fetch,
    jobs.REMOTIVE_KEY: jobs.fetch_remotive,
    jobs.ARBEITNOW_KEY: jobs.fetch_arbeitnow,
    atcoder.SOURCE_KEY: atcoder.fetch,
}


def run_source(
    source_key: str,
    auto_approve: bool = True,
    rate_limit: float | None = None,
    max_pages: int | None = None,
    dry_run: bool = False,
) -> RunStats:
    """Runs one source end to end and records the result."""
    fetcher = ADAPTERS.get(source_key)
    if fetcher is None:
        print(f"  ! no adapter named '{source_key}'")
        return RunStats(failed=True)

    print(f"\n=== {source_key} ===")
    run_id = None if dry_run else start_run(source_key)
    session = PoliteSession(rate_limit=rate_limit)

    # An explicit --pages wins; otherwise use this source's own limit so one
    # large source cannot drown out the others.
    pages = max_pages or SOURCE_PAGE_LIMITS.get(source_key, settings.MAX_PAGES)

    try:
        items = fetcher(session, pages)
        print(f"  fetched {len(items)} listings")

        if dry_run:
            for item in items[:5]:
                print(
                    f"    - {item.title[:58]:<58} | {item.deadline} | "
                    f"{item.mode:<7} | {', '.join(item.skills[:3])}"
                )
            if len(items) > 5:
                print(f"    ... and {len(items) - 5} more")
            return RunStats(fetched=len(items), failed=bool(session.board_errors))

        stats = save_opportunities(items, auto_approve=auto_approve)
        removed = reconcile_completed_boards(source_key, session.completed_boards, items)
        if removed:
            print(f'  hidden {removed} removed employer listing(s)')
        print(f"  {stats}")
        if session.board_errors:
            stats.failed = True
        finish_run(run_id, source_key, stats, error='; '.join(session.board_errors)[:500] or None)
        return stats

    except PermissionError as error:
        # The site told us not to. Record it and move on — never work around it.
        print(f"  ! access refused: {error}")
        if run_id:
            finish_run(run_id, source_key, RunStats(), error=str(error))
        return RunStats(failed=True)

    except Exception as error:  # noqa: BLE001 - one bad source must not stop the rest
        print(f"  ! failed: {error}")
        traceback.print_exc(limit=2)
        if run_id:
            finish_run(run_id, source_key, RunStats(), error=str(error)[:500])
        return RunStats(failed=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest opportunities from external sources.")
    parser.add_argument("--source", help="Run only this source (e.g. unstop)")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and print, write nothing")
    parser.add_argument("--list", action="store_true", help="List configured sources and exit")
    parser.add_argument("--pages", type=int, help="Pages to fetch per source")
    parser.add_argument(
        "--review",
        action="store_true",
        help="Send everything to the admin review queue instead of publishing",
    )
    args = parser.parse_args()

    if args.list:
        print("Configured sources:\n")
        for source in get_enabled_sources():
            has_adapter = "yes" if source["key"] in ADAPTERS else "NO ADAPTER"
            print(
                f"  {source['key']:<14} {source['name']:<24} "
                f"auto-approve={source['auto_approve']}  adapter={has_adapter}"
            )
        return 0

    try:
        if args.dry_run and args.source in ADAPTERS:
            sources = [{'key': args.source, 'auto_approve': True, 'rate_limit_secs': 1}]
        else:
            sources = get_enabled_sources()
    except Exception as error:  # noqa: BLE001
        print(f"Cannot reach the database: {error}")
        print("Check ingestion/.env, and that PostgreSQL is running.")
        return 1

    if args.source:
        sources = [s for s in sources if s["key"] == args.source]
        if not sources:
            print(f"Source '{args.source}' is not enabled or does not exist.")
            return 1

    print(f"Ingestion starting — {len(sources)} source(s)")
    if args.dry_run:
        print("DRY RUN: nothing will be written to the database.")

    total = RunStats()
    for source in sources:
        stats = run_source(
            source["key"],
            auto_approve=source["auto_approve"] and not args.review,
            rate_limit=float(source["rate_limit_secs"]),
            max_pages=args.pages,
            dry_run=args.dry_run,
        )
        total.fetched += stats.fetched
        total.created += stats.created
        total.updated += stats.updated
        total.skipped += stats.skipped
        total.failed = total.failed or stats.failed

    if not args.dry_run:
        expired = expire_old_opportunities()
        print(f"\nExpired {expired} past-deadline listing(s).")

    print(f"\nTOTAL: {total}")
    return 1 if total.failed else 0


def run_locked() -> int:
    if os.name != 'posix':
        return main()
    import fcntl
    with Path(__file__).with_name('.run.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Another import is running; skipped overlapping run.')
            return 0
        return main()


if __name__ == "__main__":
    sys.exit(run_locked())
