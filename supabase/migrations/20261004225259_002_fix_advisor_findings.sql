/*
# Fix advisor findings: drop unused view, set search_path on trigger function

1. Drops `course_progress_view` — progress is calculated in the app from lesson_progress + lessons, so the view is unused.
2. Drops and recreates `set_updated_at()` with an explicit `search_path` to resolve the mutable search_path warning.
   Uses CASCADE to drop dependent triggers, then re-creates them.
*/

DROP VIEW IF EXISTS course_progress_view;

DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

CREATE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_courses_updated_at ON courses;
CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_lessons_updated_at ON lessons;
CREATE TRIGGER trg_lessons_updated_at
  BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_lesson_progress_updated_at ON lesson_progress;
CREATE TRIGGER trg_lesson_progress_updated_at
  BEFORE UPDATE ON lesson_progress
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
