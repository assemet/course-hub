/*
  # Quiz question types and question images

  - `quiz_questions.kind`: 'choice' (multiple choice, as before) or
    'true_false'. A true/false question always stores the options
    ['true', 'false'] (the app shows them in the student's language), so
    grading by `correct_index` in submit_quiz() works unchanged.
  - `quiz_questions.image_file_id`: optional Telegram file_id of a picture
    shown with the question. The creator sends the picture to the bot and picks
    it in the quiz editor; students load it through the `lesson-media`
    function, which reads it with their own permissions (RLS).

  Students may read both new columns; answers stay hidden as before.

  Safe to run more than once.
*/

ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'choice';
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS image_file_id text;

ALTER TABLE quiz_questions DROP CONSTRAINT IF EXISTS quiz_questions_kind_check;
ALTER TABLE quiz_questions ADD CONSTRAINT quiz_questions_kind_check
  CHECK (kind IN ('choice', 'true_false'));

ALTER TABLE quiz_questions DROP CONSTRAINT IF EXISTS quiz_questions_true_false_options;
ALTER TABLE quiz_questions ADD CONSTRAINT quiz_questions_true_false_options
  CHECK (kind <> 'true_false' OR options = ARRAY['true', 'false']::text[]);

ALTER TABLE quiz_questions DROP CONSTRAINT IF EXISTS quiz_questions_image_file_id_check;
ALTER TABLE quiz_questions ADD CONSTRAINT quiz_questions_image_file_id_check
  CHECK (image_file_id IS NULL OR char_length(image_file_id) BETWEEN 1 AND 255);

GRANT SELECT (kind, image_file_id) ON quiz_questions TO authenticated;

-- Creator view of a quiz, now with the question type and image.
CREATE OR REPLACE FUNCTION public.creator_quiz(p_module_id uuid)
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
        'correct_index', qq.correct_index, 'explanation', qq.explanation,
        'kind', qq.kind, 'image_file_id', qq.image_file_id
      ) ORDER BY qq.position, qq.created_at)
      FROM quiz_questions qq WHERE qq.quiz_id = v_quiz.id
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.creator_quiz(uuid) TO authenticated;
