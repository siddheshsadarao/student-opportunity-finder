-- ============================================================================
--  MIGRATION 004 — register the new sources
-- ============================================================================
--  The catalogue had grown 87% Unstop, so the site read as a copy of one
--  website. These six sources spread it across countries and platforms.
--
--  Every one was checked against its own robots.txt on 2026-09-29 before being
--  added, and each returns structured JSON rather than needing markup scraped.
--
--  Safe to run more than once.
-- ============================================================================

INSERT INTO ingestion_sources (key, name, homepage, kind, auto_approve, rate_limit_secs, notes)
VALUES
    ('mlh', 'Major League Hacking', 'https://mlh.com', 'api', TRUE, 2.0,
     'Official student hackathon league, mostly North America and Europe. Reads the JSON payload its own season page embeds, so restyling the site cannot break it. robots.txt permits /seasons/.'),

    ('hackclub', 'Hack Club', 'https://hackathons.hackclub.com', 'api', TRUE, 1.5,
     'Directory of student-run hackathons worldwide, beginner friendly. Public JSON feed; robots.txt has no Disallow rules.'),

    ('codeforces', 'Codeforces', 'https://codeforces.com', 'api', TRUE, 2.0,
     'Competitive programming contests. Documented public API; robots.txt does not disallow /api/.'),

    ('codechef', 'CodeChef', 'https://www.codechef.com', 'api', TRUE, 2.0,
     'Competitive programming contests, strong in India. Public JSON; robots.txt does not disallow /api/.'),

    ('kaggle', 'Kaggle', 'https://www.kaggle.com', 'api', TRUE, 2.0,
     'Machine learning competitions. Public JSON; robots.txt has no Disallow rules.'),

    ('ashby', 'Ashby job boards', 'https://ashbyhq.com', 'api', TRUE, 1.0,
     'Official public job board API that companies publish for aggregators, same idea as Greenhouse. Configure boards in ingestion/config.py.')
ON CONFLICT (key) DO UPDATE
    SET name     = EXCLUDED.name,
        homepage = EXCLUDED.homepage,
        notes    = EXCLUDED.notes;

-- HackerEarth started returning 403 to automated requests. Disable it rather
-- than delete it: the listings it already contributed stay, and re-enabling is
-- one toggle in the admin panel if they open access again.
UPDATE ingestion_sources
   SET is_enabled = FALSE,
       notes      = notes || ' — DISABLED 2026-09-29: began returning 403 to automated requests. We do not work around blocks.'
 WHERE key = 'hackerearth'
   AND is_enabled = TRUE;
