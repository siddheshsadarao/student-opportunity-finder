-- ============================================================================
--  MIGRATION 003 — register Major League Hacking as a source
-- ============================================================================
--  The catalogue had grown 87% Unstop, which made the site look like a copy
--  of one website. MLH lists university hackathons across North America and
--  Europe, so it is what makes the mix genuinely international.
--
--  Safe to run more than once.
-- ============================================================================

INSERT INTO ingestion_sources (key, name, homepage, kind, auto_approve, rate_limit_secs, notes)
VALUES (
    'mlh',
    'Major League Hacking',
    'https://mlh.com',
    'api',
    TRUE,
    2.0,
    'Official student hackathon league. Reads the Inertia JSON payload embedded in /seasons/{year}/events. robots.txt permits /seasons/. Mostly North America and Europe, which balances the India-heavy sources.'
)
ON CONFLICT (key) DO UPDATE
    SET name     = EXCLUDED.name,
        homepage = EXCLUDED.homepage,
        notes    = EXCLUDED.notes;
