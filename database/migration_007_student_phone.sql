-- Optional contact number; SMS verification is intentionally not claimed.
ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS phone VARCHAR(24);
