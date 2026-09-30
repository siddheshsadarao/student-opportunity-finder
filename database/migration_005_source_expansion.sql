-- Additional live feeds plus indexes used by the balanced opportunity queries.
-- Safe to run repeatedly.

INSERT INTO ingestion_sources (key, name, homepage, kind, auto_approve, rate_limit_secs, notes)
VALUES
  ('lever', 'Lever company boards', 'https://www.lever.co', 'api', TRUE, 1.0,
   'Official public Postings API. Only internship, graduate, student, trainee and apprenticeship titles are imported.'),
  ('smartrecruiters', 'SmartRecruiters company boards', 'https://www.smartrecruiters.com', 'api', TRUE, 1.0,
   'Public company postings API. Senior roles are removed before import.'),
  ('remotive', 'Remotive', 'https://remotive.com', 'api', TRUE, 5.0,
   'Public remote-jobs API. Source attribution and original links are preserved as required by its API terms.'),
  ('arbeitnow', 'Arbeitnow', 'https://www.arbeitnow.com', 'api', TRUE, 2.0,
   'Public job-board API, filtered to internships, apprenticeships, trainees and graduate roles.'),
  ('atcoder', 'AtCoder', 'https://atcoder.jp', 'scraper', TRUE, 2.0,
   'Upcoming programming contests from the public contest schedule. No login or restricted pages are accessed.')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  homepage = EXCLUDED.homepage,
  kind = EXCLUDED.kind,
  notes = EXCLUDED.notes;

-- MLH season pages are an event directory, not a dependable live deadline
-- feed. Keep historical rows but stop scheduling new imports.
UPDATE ingestion_sources
   SET is_enabled = FALSE,
       notes = 'Disabled: the season directory is not a reliable live application-deadline feed.'
 WHERE key = 'mlh';

CREATE INDEX IF NOT EXISTS idx_opportunities_active_deadline
    ON opportunities (is_active, deadline);
CREATE INDEX IF NOT EXISTS idx_opportunities_source_active_deadline
    ON opportunities (source, is_active, deadline);
CREATE INDEX IF NOT EXISTS idx_opportunities_category_active_deadline
    ON opportunities (category_id, is_active, deadline);
CREATE INDEX IF NOT EXISTS idx_opportunity_skills_skill_opportunity
    ON opportunity_skills (skill_id, opportunity_id);
