/*
  # Students report (Excel export)

  creator_students_report(course) returns, for the course's owner only, what
  the `students-export` function puts into the Excel file:
  - lessons: every lesson in order, with how many enrolled students completed it
  - quizzes: module quizzes that have questions
  - students: one row per enrolled student with progress, certificate and
    number of questions asked
  - quiz_results: each student's best attempt per quiz

  Safe to run more than once.
*/

DROP FUNCTION IF EXISTS public.creator_students_report(uuid);
CREATE FUNCTION public.creator_students_report(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  SELECT c.title INTO v_title FROM courses c WHERE c.id = p_course_id AND c.creator_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You can only export students of your own courses' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'course_title', v_title,
    'lessons', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'title', l.title, 'module_title', m.title,
        'completed', (
          SELECT count(*) FROM lesson_progress lp
          JOIN enrollments e ON e.user_id = lp.user_id AND e.course_id = p_course_id
          WHERE lp.lesson_id = l.id AND lp.completed
        )
      ) ORDER BY m.position, m.created_at, l.position, l.created_at)
      FROM lessons l JOIN modules m ON m.id = l.module_id
      WHERE m.course_id = p_course_id
    ), '[]'::jsonb),
    'quizzes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id, 'module_title', m.title, 'pass_percent', q.pass_percent,
        'question_count', (SELECT count(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id)
      ) ORDER BY m.position, m.created_at)
      FROM quizzes q JOIN modules m ON m.id = q.module_id
      WHERE m.course_id = p_course_id
        AND EXISTS (SELECT 1 FROM quiz_questions qq WHERE qq.quiz_id = q.id)
    ), '[]'::jsonb),
    'students', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', u.id,
        'first_name', u.first_name,
        'username', u.username,
        'enrolled_at', e.created_at,
        'last_activity_at', e.last_activity_at,
        'completed_lessons', (
          SELECT count(*) FROM lesson_progress lp
          JOIN lessons l ON l.id = lp.lesson_id
          JOIN modules m ON m.id = l.module_id
          WHERE lp.user_id = e.user_id AND m.course_id = p_course_id AND lp.completed
        ),
        'current_lesson_title', cl.title,
        'certificate_code', cert.code,
        'certificate_issued_at', cert.issued_at,
        'questions_asked', (
          SELECT count(*) FROM lesson_questions lq
          WHERE lq.course_id = p_course_id AND lq.author_id = e.user_id
        )
      ) ORDER BY e.created_at)
      FROM enrollments e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN lessons cl ON cl.id = e.last_lesson_id
      LEFT JOIN certificates cert ON cert.user_id = e.user_id AND cert.course_id = p_course_id
      WHERE e.course_id = p_course_id
    ), '[]'::jsonb),
    'quiz_results', COALESCE((
      SELECT jsonb_agg(r) FROM (
        SELECT DISTINCT ON (a.user_id, a.quiz_id)
          jsonb_build_object(
            'user_id', a.user_id, 'quiz_id', a.quiz_id,
            'best_score', a.score, 'total', a.total,
            'passed', bool_or(a.passed) OVER (PARTITION BY a.user_id, a.quiz_id),
            'attempts', count(*) OVER (PARTITION BY a.user_id, a.quiz_id),
            'last_attempt_at', max(a.created_at) OVER (PARTITION BY a.user_id, a.quiz_id)
          ) AS r
        FROM quiz_attempts a
        JOIN quizzes q ON q.id = a.quiz_id
        JOIN modules m ON m.id = q.module_id
        JOIN enrollments e ON e.user_id = a.user_id AND e.course_id = p_course_id
        WHERE m.course_id = p_course_id
        ORDER BY a.user_id, a.quiz_id,
          (a.score::numeric / NULLIF(a.total, 0)) DESC NULLS LAST, a.created_at DESC
      ) best
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.creator_students_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creator_students_report(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
