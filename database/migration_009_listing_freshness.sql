BEGIN;

ALTER TABLE opportunities ALTER COLUMN deadline DROP NOT NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_board VARCHAR(160);

-- Employers do not publish closing dates for these feeds. Remove old synthetic dates.
CREATE TABLE IF NOT EXISTS sof_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM sof_migrations WHERE name = '009_listing_freshness') THEN
    UPDATE opportunities SET deadline = NULL
     WHERE is_external AND source IN ('greenhouse', 'ashby', 'lever', 'smartrecruiters', 'remotive', 'arbeitnow')
       AND deadline_at IS NULL;
    INSERT INTO sof_migrations(name) VALUES ('009_listing_freshness');
  END IF;
END $$;

INSERT INTO categories (name, slug, icon, color, description)
VALUES ('Jobs', 'job', 'Briefcase', 'blue', 'Graduate, trainee and entry-level jobs from employer career pages.')
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION sof_is_open(listing opportunities)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT COALESCE(listing.is_active AND NOT listing.is_demo
    AND listing.review_status = 'approved'
    AND (listing.deadline_at IS NOT NULL OR listing.deadline IS NULL OR listing.deadline >= CURRENT_DATE)
    AND (listing.deadline_at IS NULL OR listing.deadline_at > NOW())
    AND (NOT listing.is_external OR listing.ingested_at > NOW() - INTERVAL '48 hours'), FALSE);
$$;

CREATE INDEX IF NOT EXISTS idx_opportunities_refresh ON opportunities (ingested_at) WHERE is_external;
COMMIT;
