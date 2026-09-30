-- ============================================================================
--  MIGRATION 002 — Automatic opportunity ingestion
-- ============================================================================
--  Adds everything needed to pull real opportunities from external sources
--  (Devpost, Unstop, Devfolio, HackerEarth, company ATS boards) instead of
--  typing every listing by hand.
--
--  Run AFTER schema.sql:
--      psql -U postgres -d student_opportunity_finder -f migration_002_ingestion.sql
--
--  This migration is written to be safe to re-run: every statement uses
--  IF NOT EXISTS, so running it twice changes nothing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New columns on opportunities
-- ----------------------------------------------------------------------------
ALTER TABLE opportunities
    -- The listing's own id at the source ("devpost:12345"). Together with
    -- `source` this identifies one external listing uniquely, which is how we
    -- update an existing row instead of inserting a duplicate on every run.
    ADD COLUMN IF NOT EXISTS source_id     VARCHAR(160),

    -- Link back to the original listing page (not the apply link).
    ADD COLUMN IF NOT EXISTS source_url    TEXT,

    -- Hackathons have a start and end date as well as a registration deadline.
    ADD COLUMN IF NOT EXISTS start_date    DATE,
    ADD COLUMN IF NOT EXISTS end_date      DATE,

    -- Moderation state for anything that arrived automatically.
    --   approved -> visible to students
    --   pending  -> waiting in the admin review queue
    --   rejected -> hidden, and never re-imported
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) NOT NULL DEFAULT 'approved',

    -- When the ingester last saw this listing at the source.
    ADD COLUMN IF NOT EXISTS ingested_at   TIMESTAMPTZ,

    -- TRUE when the row came from an ingester rather than the admin form.
    ADD COLUMN IF NOT EXISTS is_external   BOOLEAN NOT NULL DEFAULT FALSE,

    -- Free-text prize/award as published by the source (e.g. "$740,000").
    ADD COLUMN IF NOT EXISTS prize         VARCHAR(160);

-- Valid moderation states only.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'opportunities_review_status_check'
    ) THEN
        ALTER TABLE opportunities
            ADD CONSTRAINT opportunities_review_status_check
            CHECK (review_status IN ('approved', 'pending', 'rejected'));
    END IF;
END $$;

-- One row per external listing. This is the constraint that makes the whole
-- ingester idempotent: re-running it UPDATEs instead of duplicating.
-- Manually added opportunities have source_id = NULL, and PostgreSQL treats
-- NULLs as distinct, so they are never affected by this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunities_source_unique
    ON opportunities (source, source_id)
    WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_review  ON opportunities (review_status);
CREATE INDEX IF NOT EXISTS idx_opportunities_external ON opportunities (is_external);
CREATE INDEX IF NOT EXISTS idx_opportunities_start    ON opportunities (start_date);

-- ----------------------------------------------------------------------------
-- 2. SOURCES — one row per external source, so the admin can turn a
--    misbehaving source off without touching any code.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingestion_sources (
    id              SERIAL       PRIMARY KEY,
    key             VARCHAR(40)  NOT NULL UNIQUE,  -- "devpost", "unstop"
    name            VARCHAR(120) NOT NULL,
    homepage        TEXT,
    kind            VARCHAR(20)  NOT NULL DEFAULT 'api',
    is_enabled      BOOLEAN      NOT NULL DEFAULT TRUE,

    -- TRUE  -> listings go live immediately (trusted structured APIs)
    -- FALSE -> listings land in the admin review queue as 'pending'
    auto_approve    BOOLEAN      NOT NULL DEFAULT TRUE,

    -- Politeness: seconds to wait between requests to this source.
    rate_limit_secs NUMERIC(5,2) NOT NULL DEFAULT 1.0,
    notes           TEXT,
    last_run_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT ingestion_sources_kind_check CHECK (kind IN ('api', 'scraper', 'feed', 'manual'))
);

-- ----------------------------------------------------------------------------
-- 3. RUN LOG — every ingestion run, so the admin page can show what happened
--    and so a failing source is obvious instead of silent.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingestion_runs (
    id            SERIAL       PRIMARY KEY,
    source_key    VARCHAR(40)  NOT NULL,
    started_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    finished_at   TIMESTAMPTZ,
    status        VARCHAR(20)  NOT NULL DEFAULT 'running',
    fetched_count INTEGER      NOT NULL DEFAULT 0,  -- items returned by the source
    created_count INTEGER      NOT NULL DEFAULT 0,  -- new rows inserted
    updated_count INTEGER      NOT NULL DEFAULT 0,  -- existing rows refreshed
    skipped_count INTEGER      NOT NULL DEFAULT 0,  -- duplicates / expired / invalid
    error_message TEXT,

    CONSTRAINT ingestion_runs_status_check CHECK (status IN ('running', 'success', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source ON ingestion_runs (source_key, started_at DESC);

-- ----------------------------------------------------------------------------
-- 4. Seed the source registry
--
--    Only sources whose robots.txt permits automated access are listed.
--    Checked on 2026-09-29:
--      devpost.com    -> "User-agent: *  Disallow:"        (allow all)
--      unstop.com     -> "Allow: /api/public/*"            (explicitly allowed)
--      devfolio.co    -> "User-agent: *  Disallow:"        (allow all)
--      hackerearth.com-> "User-agent: *  Allow: /"         (allow all)
--      greenhouse.io  -> public job board API, published for aggregators
--
--    Deliberately NOT included, because their robots.txt or terms forbid it:
--      LinkedIn, Indeed, Internshala, foundit/Zuni, Wellfound, RippleMatch,
--      Simplify. See docs/DATA_INGESTION.md for the evidence.
-- ----------------------------------------------------------------------------
INSERT INTO ingestion_sources (key, name, homepage, kind, auto_approve, rate_limit_secs, notes)
VALUES
    ('devpost',     'Devpost',            'https://devpost.com',      'api', TRUE, 1.5,
     'Public JSON API at /api/hackathons. robots.txt allows all user agents.'),
    ('unstop',      'Unstop',             'https://unstop.com',       'api', TRUE, 1.5,
     'Public JSON API. robots.txt explicitly allows /api/public/*. Best source for Indian students.'),
    ('devfolio',    'Devfolio',           'https://devfolio.co',      'api', TRUE, 1.5,
     'Public search API at api.devfolio.co. robots.txt allows all user agents.'),
    ('hackerearth', 'HackerEarth',        'https://hackerearth.com',  'api', TRUE, 1.5,
     'Public events JSON. robots.txt allows /.'),
    ('greenhouse',  'Greenhouse job boards', 'https://greenhouse.io', 'api', TRUE, 1.0,
     'Official public board API that companies publish for aggregators. Configure company slugs in ingestion/config.py.')
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Everything that already exists was added by hand and is already live.
-- ----------------------------------------------------------------------------
UPDATE opportunities
   SET review_status = 'approved',
       is_external   = FALSE
 WHERE review_status IS NULL OR is_external IS NULL;
