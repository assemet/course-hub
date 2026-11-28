/*
  # Lesson questions and course announcements

  ## lesson_questions
  A student asks under a lesson; the course's creator answers. Questions are
  public to the course's enrolled students by default (everyone learns from the
  answer); `is_private` ones are seen only by their author and the creator.
  Written only through the functions below:
    ask_question()     enrolled students of a published course; 20 a day each
    answer_question()  the course's creator (answering again edits the answer)
    delete_question()  the author while unanswered, or the creator
  `teacher_notified_at` / `student_notified_at` are set by the question-notify
  Edge Function so each bot message goes out once.

  ## course_announcements
  Messages the creator sends to all enrolled students. Rows are written by the
  course-announce Edge Function (it also sends them and enforces 3 a day);
  creators and enrolled students can read them.

  Safe to run more than once.
*/

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lesson_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  is_private boolean NOT NULL DEFAULT false,
  answer text CHECK (answer IS NULL OR char_length(btrim(answer)) BETWEEN 1 AND 4000),
  answered_by uuid REFERENCES users(id) ON DELETE SET NULL,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  teacher_notified_at timestamptz,
  student_notified_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_lesson_questions_lesson ON lesson_questions(lesson_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lesson_questions_unanswered ON lesson_questions(course_id, created_at)
  WHERE answered_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lesson_questions_author ON lesson_questions(author_id, created_at);

CREATE TABLE IF NOT EXISTS course_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  recipients integer NOT NULL DEFAULT 0,
  delivered integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_course_announcements_course ON course_announcements(course_id, created_at DESC);

ALTER TABLE lesson_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_announcements ENABLE ROW LEVEL SECURITY;

-- Clients only read; every write goes through the functions (or the service role).
REVOKE ALL ON lesson_questions, course_announcements FROM anon, authenticated;
GRANT SELECT (id, lesson_id, course_id, author_id, body, is_private, answer, answered_at, created_at)
  ON lesson_questions TO authenticated;
GRANT SELECT ON course_announcements TO authenticated;

-- ---------------------------------------------------------------------------
-- Who can read
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS lesson_questions_select ON lesson_questions;
CREATE POLICY lesson_questions_select ON lesson_questions FOR SELECT TO authenticated
  USING (
    author_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM courses c
               WHERE c.id = lesson_questions.course_id AND c.creator_id = (SELECT auth.uid()))
    OR (NOT is_private AND EXISTS (
          SELECT 1 FROM enrollments e JOIN courses c ON c.id = e.course_id
          WHERE e.course_id = lesson_questions.course_id
            AND e.user_id = (SELECT auth.uid())
            AND c.status = 'published'))
  );

DROP POLICY IF EXISTS course_announcements_select ON course_announcements;
CREATE POLICY course_announcements_select ON course_announcements FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM courses c
            WHERE c.id = course_announcements.course_id
              AND (c.creator_id = (SELECT auth.uid())
                   OR (c.status = 'published' AND EXISTS (
                         SELECT 1 FROM enrollments e
                         WHERE e.course_id = c.id AND e.user_id = (SELECT auth.uid())))))
  );

-- ---------------------------------------------------------------------------
-- Ask
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ask_question(uuid, text, boolean);
CREATE FUNCTION public.ask_question(p_lesson_id uuid, p_body text, p_private boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_course uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF char_length(v_body) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Question must be 1-2000 characters' USING ERRCODE = '22023';
  END IF;

  -- The lesson's course, if the caller is enrolled in it and it is published.
  SELECT c.id INTO v_course
  FROM lessons l
  JOIN modules m ON m.id = l.module_id
  JOIN courses c ON c.id = m.course_id
  WHERE l.id = p_lesson_id
    AND c.status = 'published'
    AND EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = c.id AND e.user_id = v_uid);
  IF v_course IS NULL THEN RAISE EXCEPTION 'Lesson not found' USING ERRCODE = 'P0002'; END IF;

  -- Keeps the creator's inbox (and the bot) from being flooded.
  IF (SELECT count(*) FROM lesson_questions
      WHERE author_id = v_uid AND created_at > now() - interval '1 day') >= 20 THEN
    RAISE EXCEPTION 'Too many questions today' USING ERRCODE = '54000';
  END IF;

  INSERT INTO lesson_questions (lesson_id, course_id, author_id, body, is_private)
  VALUES (p_lesson_id, v_course, v_uid, v_body, coalesce(p_private, false))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Answer (or edit the answer)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.answer_question(uuid, text);
CREATE FUNCTION public.answer_question(p_question_id uuid, p_answer text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_answer text := btrim(coalesce(p_answer, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF char_length(v_answer) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'Answer must be 1-4000 characters' USING ERRCODE = '22023';
  END IF;

  UPDATE lesson_questions q
  SET answer = v_answer,
      answered_by = v_uid,
      answered_at = coalesce(q.answered_at, now())
  FROM courses c
  WHERE q.id = p_question_id AND c.id = q.course_id AND c.creator_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found' USING ERRCODE = 'P0002'; END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Delete
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.delete_question(uuid);
CREATE FUNCTION public.delete_question(p_question_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  DELETE FROM lesson_questions q
  WHERE q.id = p_question_id
    AND (
      (q.author_id = v_uid AND q.answered_at IS NULL)
      OR EXISTS (SELECT 1 FROM courses c WHERE c.id = q.course_id AND c.creator_id = v_uid)
    );
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found' USING ERRCODE = 'P0002'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ask_question(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.answer_question(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_question(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_question(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.answer_question(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_question(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
