-- Only explicitly marked fictional listings are removed. Foreign keys cascade
-- their saves, applications, views and notifications; real listings are retained.
BEGIN;
DELETE FROM opportunities WHERE is_demo = TRUE;
COMMIT;
