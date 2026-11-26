/*
  # Flashcards with spaced repetition

  - `flashcards`: cards per module (front / back), written by the course owner.
    Readable by anyone who can see the module (same rule as lessons).
  - `flashcard_reviews`: each student's Leitner state per card (box 1-5 and
    the next due time). Rows are private to the student and written only by
    review_flashcard(), which applies the schedule:
      knew it      -> next box (max 5), due in 2/4/8/16 days for box 2..5
                      (a new card answered right goes straight to box 2)
      didn't know  -> box 1, due now (comes back in the same session)
  - course_flashcard_stats(): per module, total / due now / learned (box >= 4)
    for the current student. A card never reviewed counts as due.

  Safe to run more than once.
*/

CREATE TABLE IF NOT EXISTS flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  front text NOT NULL CHECK (char_length(btrim(front)) BETWEEN 1 AND 500),
  back text NOT NULL CHECK (char_length(btrim(back)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flashcards_module ON flashcards(module_id, position);

CREATE TABLE IF NOT EXISTS flashcard_reviews (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  box integer NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
  due_at timestamptz NOT NULL DEFAULT now(),
  reviews integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_id)
);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_due ON flashcard_reviews(user_id, due_at);

ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON flashcards, flashcard_reviews FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON flashcards TO authenticated;
REVOKE ALL ON flashcard_reviews FROM authenticated;
GRANT SELECT ON flashcard_reviews TO authenticated;

DROP POLICY IF EXISTS flashcards_select ON flashcards;
CREATE POLICY flashcards_select ON flashcards FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM modules m WHERE m.id = flashcards.module_id));

DROP POLICY IF EXISTS flashcards_write ON flashcards;
CREATE POLICY flashcards_write ON flashcards FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM modules m JOIN courses c ON c.id = m.course_id
    WHERE m.id = flashcards.module_id AND c.creator_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM modules m JOIN courses c ON c.id = m.course_id
    WHERE m.id = flashcards.module_id AND c.creator_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS flashcard_reviews_own ON flashcard_reviews;
CREATE POLICY flashcard_reviews_own ON flashcard_reviews FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- Record one answer and reschedule the card (Leitner)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.review_flashcard(uuid, boolean);
CREATE FUNCTION public.review_flashcard(p_card_id uuid, p_known boolean)
RETURNS flashcard_reviews
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row flashcard_reviews%ROWTYPE;
  v_box integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;

  -- Only cards of courses the student is enrolled in (or owns).
  IF NOT EXISTS (
    SELECT 1 FROM flashcards f
    JOIN modules m ON m.id = f.module_id
    JOIN courses c ON c.id = m.course_id
    WHERE f.id = p_card_id
      AND (c.creator_id = v_uid
           OR (c.status = 'published'
               AND EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = v_uid AND e.course_id = c.id)))
  ) THEN
    RAISE EXCEPTION 'Card not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_row FROM flashcard_reviews WHERE user_id = v_uid AND card_id = p_card_id FOR UPDATE;
  v_box := CASE
    WHEN NOT p_known THEN 1
    WHEN NOT FOUND THEN 2              -- first time and already known
    ELSE LEAST(v_row.box + 1, 5)
  END;

  INSERT INTO flashcard_reviews (user_id, card_id, box, due_at, reviews, lapses, updated_at)
  VALUES (
    v_uid, p_card_id, v_box,
    CASE WHEN p_known THEN now() + make_interval(days => (2 ^ (v_box - 1))::int) ELSE now() END,
    1, CASE WHEN p_known THEN 0 ELSE 1 END, now()
  )
  ON CONFLICT (user_id, card_id) DO UPDATE SET
    box = EXCLUDED.box,
    due_at = EXCLUDED.due_at,
    reviews = flashcard_reviews.reviews + 1,
    lapses = flashcard_reviews.lapses + EXCLUDED.lapses,
    updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Per-module counts for the current student
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.course_flashcard_stats(uuid);
CREATE FUNCTION public.course_flashcard_stats(p_course_id uuid)
RETURNS TABLE (module_id uuid, total integer, due integer, learned integer, next_due_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT
    f.module_id,
    count(*)::int,
    count(*) FILTER (WHERE r.card_id IS NULL OR r.due_at <= now())::int,
    count(*) FILTER (WHERE r.box >= 4)::int,
    min(r.due_at) FILTER (WHERE r.due_at > now())
  FROM flashcards f
  JOIN modules m ON m.id = f.module_id
  LEFT JOIN flashcard_reviews r ON r.card_id = f.id AND r.user_id = auth.uid()
  WHERE m.course_id = p_course_id
  GROUP BY f.module_id;
$$;

REVOKE ALL ON FUNCTION public.review_flashcard(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.course_flashcard_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_flashcard(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.course_flashcard_stats(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
