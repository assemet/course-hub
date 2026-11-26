/*
  # Module quizzes and course certificates

  ## Quizzes
  - One optional quiz per module (`quizzes`), multiple-choice questions
    (`quiz_questions`, 2-6 options), pass mark per quiz (default 70%).
  - The correct answer and explanation are NOT readable by clients: column
    privileges expose only id/quiz_id/position/question/options. Students are
    graded by submit_quiz() in the database, which returns the corrections
    only after an attempt. Creators read answers through creator_quiz().
  - `courses.quiz_gating`: when on, a module's lessons open only after the
    previous modules' quizzes are passed (enforced in the app).

  ## Certificates
  - issue_certificate() checks, in the database, that the caller completed
    every lesson and passed every quiz of the course, then stores a snapshot
    (student name, course title, teacher) with a random verification code.
  - verify_certificate(code) is public: anyone with the code can check it.

  Safe to run more than once.
*/

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
ALTER TABLE courses ADD COLUMN IF NOT EXISTS quiz_gating boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL UNIQUE REFERENCES modules(id) ON DELETE CASCADE,
  pass_percent integer NOT NULL DEFAULT 70 CHECK (pass_percent BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  question text NOT NULL CHECK (char_length(btrim(question)) BETWEEN 1 AND 500),
  options text[] NOT NULL CHECK (array_length(options, 1) BETWEEN 2 AND 6),
  correct_index integer NOT NULL,
  explanation text CHECK (explanation IS NULL OR char_length(explanation) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (correct_index >= 0 AND correct_index < array_length(options, 1))
);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id, position);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score integer NOT NULL,
  total integer NOT NULL,
  passed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id, quiz_id);

CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_name text NOT NULL,
  course_title text NOT NULL,
  creator_name text NOT NULL,
  lesson_count integer NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Privileges: hide answers; attempts and certificates are written by functions only
-- ---------------------------------------------------------------------------
REVOKE ALL ON quizzes, quiz_questions, quiz_attempts, certificates FROM anon;
REVOKE ALL ON quiz_questions FROM authenticated;
GRANT SELECT (id, quiz_id, position, question, options) ON quiz_questions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON quiz_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON quizzes TO authenticated;
REVOKE ALL ON quiz_attempts, certificates FROM authenticated;
GRANT SELECT ON quiz_attempts, certificates TO authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS quizzes_select ON quizzes;
CREATE POLICY quizzes_select ON quizzes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM modules m WHERE m.id = quizzes.module_id));

DROP POLICY IF EXISTS quizzes_write ON quizzes;
CREATE POLICY quizzes_write ON quizzes FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM modules m JOIN courses c ON c.id = m.course_id
    WHERE m.id = quizzes.module_id AND c.creator_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM modules m JOIN courses c ON c.id = m.course_id
    WHERE m.id = quizzes.module_id AND c.creator_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS quiz_questions_select ON quiz_questions;
CREATE POLICY quiz_questions_select ON quiz_questions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id));

DROP POLICY IF EXISTS quiz_questions_write ON quiz_questions;
CREATE POLICY quiz_questions_write ON quiz_questions FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM quizzes q JOIN modules m ON m.id = q.module_id JOIN courses c ON c.id = m.course_id
    WHERE q.id = quiz_questions.quiz_id AND c.creator_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM quizzes q JOIN modules m ON m.id = q.module_id JOIN courses c ON c.id = m.course_id
    WHERE q.id = quiz_questions.quiz_id AND c.creator_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS quiz_attempts_select ON quiz_attempts;
CREATE POLICY quiz_attempts_select ON quiz_attempts FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM quizzes q JOIN modules m ON m.id = q.module_id JOIN courses c ON c.id = m.course_id
      WHERE q.id = quiz_attempts.quiz_id AND c.creator_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS certificates_select ON certificates;
CREATE POLICY certificates_select ON certificates FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM courses c WHERE c.id = certificates.course_id AND c.creator_id = (SELECT auth.uid())));

-- ---------------------------------------------------------------------------
-- Creator: read a module's quiz with answers
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.creator_quiz(uuid);
CREATE FUNCTION public.creator_quiz(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_quiz quizzes%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM modules m JOIN courses c ON c.id = m.course_id
    WHERE m.id = p_module_id AND c.creator_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You can only edit quizzes of your own courses' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_quiz FROM quizzes WHERE module_id = p_module_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'id', v_quiz.id,
    'module_id', v_quiz.module_id,
    'pass_percent', v_quiz.pass_percent,
    'questions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', qq.id, 'position', qq.position, 'question', qq.question, 'options', to_jsonb(qq.options),
        'correct_index', qq.correct_index, 'explanation', qq.explanation
      ) ORDER BY qq.position, qq.created_at)
      FROM quiz_questions qq WHERE qq.quiz_id = v_quiz.id
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Student: quiz status for a course (no answers)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.course_quiz_status(uuid);
CREATE FUNCTION public.course_quiz_status(p_course_id uuid)
RETURNS TABLE (
  quiz_id uuid, module_id uuid, pass_percent integer, question_count integer,
  attempts integer, best_score integer, best_total integer, passed boolean
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT
    q.id, q.module_id, q.pass_percent,
    (SELECT count(*)::int FROM quiz_questions qq WHERE qq.quiz_id = q.id),
    (SELECT count(*)::int FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.user_id = auth.uid()),
    best.score, best.total,
    COALESCE((SELECT bool_or(a.passed) FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.user_id = auth.uid()), false)
  FROM quizzes q
  JOIN modules m ON m.id = q.module_id
  LEFT JOIN LATERAL (
    SELECT a.score, a.total FROM quiz_attempts a
    WHERE a.quiz_id = q.id AND a.user_id = auth.uid()
    ORDER BY (a.score::float / GREATEST(a.total, 1)) DESC, a.created_at DESC
    LIMIT 1
  ) best ON true
  WHERE m.course_id = p_course_id;
$$;

-- ---------------------------------------------------------------------------
-- Student: submit answers, get graded
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_quiz(uuid, integer[]);
CREATE FUNCTION public.submit_quiz(p_quiz_id uuid, p_answers integer[])
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_course uuid;
  v_status text;
  v_owner uuid;
  v_pass integer;
  v_total integer := 0;
  v_score integer := 0;
  v_passed boolean;
  v_results jsonb := '[]'::jsonb;
  v_chosen integer;
  r record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;

  SELECT m.course_id, c.status, c.creator_id, q.pass_percent
    INTO v_course, v_status, v_owner, v_pass
  FROM quizzes q JOIN modules m ON m.id = q.module_id JOIN courses c ON c.id = m.course_id
  WHERE q.id = p_quiz_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz not found' USING ERRCODE = 'P0002'; END IF;

  -- Students must be enrolled; the course owner may try their own quiz.
  IF v_uid <> v_owner AND NOT EXISTS (
    SELECT 1 FROM enrollments e WHERE e.user_id = v_uid AND e.course_id = v_course
  ) THEN
    RAISE EXCEPTION 'Enroll in the course to take this quiz' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'published' AND v_uid <> v_owner THEN
    RAISE EXCEPTION 'Quiz not found' USING ERRCODE = 'P0002';
  END IF;

  FOR r IN
    SELECT qq.id, qq.correct_index, qq.explanation,
           row_number() OVER (ORDER BY qq.position, qq.created_at) AS n
    FROM quiz_questions qq WHERE qq.quiz_id = p_quiz_id
    ORDER BY qq.position, qq.created_at
  LOOP
    v_total := v_total + 1;
    v_chosen := COALESCE(p_answers[r.n], -1);  -- arrays are 1-based
    IF v_chosen = r.correct_index THEN v_score := v_score + 1; END IF;
    v_results := v_results || jsonb_build_object(
      'question_id', r.id, 'chosen', v_chosen, 'correct_index', r.correct_index,
      'is_correct', v_chosen = r.correct_index, 'explanation', r.explanation);
  END LOOP;

  IF v_total = 0 THEN RAISE EXCEPTION 'This quiz has no questions yet' USING ERRCODE = 'P0002'; END IF;

  v_passed := v_score * 100 >= v_pass * v_total;
  INSERT INTO quiz_attempts (quiz_id, user_id, score, total, passed)
  VALUES (p_quiz_id, v_uid, v_score, v_total, v_passed);

  RETURN jsonb_build_object('score', v_score, 'total', v_total, 'passed', v_passed,
                            'pass_percent', v_pass, 'results', v_results);
END;
$$;

-- ---------------------------------------------------------------------------
-- Certificates
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.issue_certificate(uuid, text);
CREATE FUNCTION public.issue_certificate(p_course_id uuid, p_name text)
RETURNS certificates
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cert certificates%ROWTYPE;
  v_name text := btrim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g'));
  v_lessons integer;
  v_done integer;
  v_title text;
  v_creator text;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;

  -- Already issued: return it unchanged (the name is fixed at issue time).
  SELECT * INTO v_cert FROM certificates WHERE user_id = v_uid AND course_id = p_course_id;
  IF FOUND THEN RETURN v_cert; END IF;

  IF NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = v_uid AND e.course_id = p_course_id) THEN
    RAISE EXCEPTION 'You are not enrolled in this course' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_name) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'The name must be 2 to 80 characters' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::int INTO v_lessons
  FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = p_course_id;
  SELECT count(*)::int INTO v_done
  FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN modules m ON m.id = l.module_id
  WHERE m.course_id = p_course_id AND lp.user_id = v_uid AND lp.completed;
  IF v_lessons = 0 OR v_done < v_lessons THEN
    RAISE EXCEPTION 'Complete every lesson to get the certificate' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM quizzes q JOIN modules m ON m.id = q.module_id
    WHERE m.course_id = p_course_id
      AND EXISTS (SELECT 1 FROM quiz_questions qq WHERE qq.quiz_id = q.id)
      AND NOT EXISTS (SELECT 1 FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.user_id = v_uid AND a.passed)
  ) THEN
    RAISE EXCEPTION 'Pass every module quiz to get the certificate' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.title, u.first_name INTO v_title, v_creator
  FROM courses c JOIN users u ON u.id = c.creator_id WHERE c.id = p_course_id;

  -- 10 random characters from an unambiguous alphabet (~10^15 combinations).
  -- Built-ins only (gen_random_uuid + md5): pgcrypto lives in another schema on Supabase.
  LOOP
    SELECT string_agg(substr(v_alphabet, 1 + (get_byte(b, i) % 32), 1), '' ORDER BY i)
      INTO v_code
    FROM (SELECT decode(md5(gen_random_uuid()::text || clock_timestamp()::text), 'hex') AS b) x,
         generate_series(0, 9) i;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM certificates WHERE code = v_code);
  END LOOP;

  INSERT INTO certificates (code, user_id, course_id, student_name, course_title, creator_name, lesson_count)
  VALUES (v_code, v_uid, p_course_id, v_name, v_title, COALESCE(v_creator, ''), v_lessons)
  RETURNING * INTO v_cert;
  RETURN v_cert;
END;
$$;

DROP FUNCTION IF EXISTS public.verify_certificate(text);
CREATE FUNCTION public.verify_certificate(p_code text)
RETURNS TABLE (code text, student_name text, course_title text, creator_name text, lesson_count integer, issued_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.code, c.student_name, c.course_title, c.creator_name, c.lesson_count, c.issued_at
  FROM certificates c
  WHERE c.code = upper(regexp_replace(COALESCE(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.creator_quiz(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.course_quiz_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_quiz(uuid, integer[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_certificate(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.creator_quiz(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.course_quiz_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz(uuid, integer[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_certificate(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
