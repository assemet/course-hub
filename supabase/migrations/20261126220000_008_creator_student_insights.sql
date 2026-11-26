/*
  # Creator tools: student progress and lesson completion

  Students' lesson_progress rows stay private (RLS: own rows only). Creators get
  summaries through two functions that first check the caller owns the course:

  - creator_course_students(course): one row per enrolled student with their
    completed-lesson count, last activity, last reminder and current lesson.
  - creator_lesson_stats(course): how many students completed each lesson.

  Also stores the Telegram client language of each user, so the bot can write
  reminders in the student's language.

  Safe to run more than once.
*/

ALTER TABLE users ADD COLUMN IF NOT EXISTS language_code text;

-- ---------------------------------------------------------------------------
-- Students of a course, with progress
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.creator_course_students(uuid);
CREATE FUNCTION public.creator_course_students(p_course_id uuid)
RETURNS TABLE (
  user_id uuid,
  first_name text,
  username text,
  photo_url text,
  enrolled_at timestamptz,
  last_activity_at timestamptz,
  last_reminded_at timestamptz,
  completed_lessons integer,
  current_lesson_title text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM courses c WHERE c.id = p_course_id AND c.creator_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You can only view students of your own courses' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.first_name,
    u.username,
    u.photo_url,
    e.created_at,
    e.last_activity_at,
    e.last_reminded_at,
    COALESCE((
      -- Only lessons that still exist in this course count.
      SELECT count(*)::int
      FROM lesson_progress lp
      JOIN lessons l ON l.id = lp.lesson_id
      JOIN modules m ON m.id = l.module_id
      WHERE lp.user_id = e.user_id AND m.course_id = p_course_id AND lp.completed
    ), 0),
    cl.title
  FROM enrollments e
  JOIN users u ON u.id = e.user_id
  LEFT JOIN lessons cl ON cl.id = e.last_lesson_id
  WHERE e.course_id = p_course_id
  ORDER BY e.last_activity_at DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- Completions per lesson (where students stop)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.creator_lesson_stats(uuid);
CREATE FUNCTION public.creator_lesson_stats(p_course_id uuid)
RETURNS TABLE (lesson_id uuid, completed_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM courses c WHERE c.id = p_course_id AND c.creator_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You can only view statistics of your own courses' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT l.id, count(lp.id) FILTER (WHERE lp.completed)::int
  FROM lessons l
  JOIN modules m ON m.id = l.module_id
  LEFT JOIN lesson_progress lp
    ON lp.lesson_id = l.id
   -- Only students still enrolled.
   AND EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = lp.user_id AND e.course_id = p_course_id)
  WHERE m.course_id = p_course_id
  GROUP BY l.id;
END;
$$;

REVOKE ALL ON FUNCTION public.creator_course_students(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.creator_lesson_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creator_course_students(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.creator_lesson_stats(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
