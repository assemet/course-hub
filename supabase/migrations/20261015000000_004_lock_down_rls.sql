/*
# Lock down Row Level Security

Previously every table had `USING (true)` policies for `anon`, so anyone holding
the public anon key could read, edit or delete all data and make themselves a
creator. Identity is now established by the `auth-telegram` Edge Function, which
verifies Telegram initData and issues a JWT whose `sub` is `users.id`. Policies
below are scoped to `auth.uid()`.

Deploy order matters:
  1. deploy the `auth-telegram` function and set its secrets
  2. deploy the new frontend
  3. run this migration

1. Changes
- Adds `enrollments.last_reminded_at` (used to rate-limit reminders).
- Drops every existing policy on the app tables and replaces them.
- `anon` loses all access to app tables.
- `users`: authenticated users can read public profile columns (not telegram_id)
  and update only their own `role`. Row creation/profile sync is done by the
  Edge Function with the service role.

2. Access model
- courses: published ones are readable by everyone signed in; owners see/manage their own.
- modules / lessons / resources: readable when the parent course is visible,
  writable only by the course owner.
- enrollments / lesson_progress: a user manages their own rows; a course owner
  can read enrollments for their courses (student counts).
- imported_messages: creator-only.
*/

ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

-- ---------------------------------------------------------------------------
-- Drop all existing policies on app tables
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('users','courses','modules','lessons','resources',
                        'enrollments','lesson_progress','imported_messages')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.users, public.courses, public.modules, public.lessons,
              public.resources, public.enrollments, public.lesson_progress,
              public.imported_messages FROM anon;

-- users: hide telegram_id from clients and allow changing only `role`.
REVOKE ALL ON public.users FROM authenticated;
GRANT SELECT (id, username, first_name, photo_url, role, created_at)
  ON public.users TO authenticated;
GRANT UPDATE (role) ON public.users TO authenticated;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE POLICY users_select ON users FOR SELECT TO authenticated
  USING (true);

CREATE POLICY users_update_self ON users FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
CREATE POLICY courses_select ON courses FOR SELECT TO authenticated
  USING (status = 'published' OR creator_id = (SELECT auth.uid()));

CREATE POLICY courses_insert ON courses FOR INSERT TO authenticated
  WITH CHECK (creator_id = (SELECT auth.uid()));

CREATE POLICY courses_update ON courses FOR UPDATE TO authenticated
  USING (creator_id = (SELECT auth.uid()))
  WITH CHECK (creator_id = (SELECT auth.uid()));

CREATE POLICY courses_delete ON courses FOR DELETE TO authenticated
  USING (creator_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- modules (visibility follows the parent course's own RLS)
-- ---------------------------------------------------------------------------
CREATE POLICY modules_select ON modules FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM courses c WHERE c.id = modules.course_id));

CREATE POLICY modules_write ON modules FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM courses c
    WHERE c.id = modules.course_id AND c.creator_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM courses c
    WHERE c.id = modules.course_id AND c.creator_id = (SELECT auth.uid())));

-- ---------------------------------------------------------------------------
-- lessons
-- ---------------------------------------------------------------------------
CREATE POLICY lessons_select ON lessons FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM modules m WHERE m.id = lessons.module_id));

CREATE POLICY lessons_write ON lessons FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM modules m JOIN courses c ON c.id = m.course_id
    WHERE m.id = lessons.module_id AND c.creator_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM modules m JOIN courses c ON c.id = m.course_id
    WHERE m.id = lessons.module_id AND c.creator_id = (SELECT auth.uid())));

-- ---------------------------------------------------------------------------
-- resources
-- ---------------------------------------------------------------------------
CREATE POLICY resources_select ON resources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM lessons l WHERE l.id = resources.lesson_id));

CREATE POLICY resources_write ON resources FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM lessons l
    JOIN modules m ON m.id = l.module_id
    JOIN courses c ON c.id = m.course_id
    WHERE l.id = resources.lesson_id AND c.creator_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM lessons l
    JOIN modules m ON m.id = l.module_id
    JOIN courses c ON c.id = m.course_id
    WHERE l.id = resources.lesson_id AND c.creator_id = (SELECT auth.uid())));

-- ---------------------------------------------------------------------------
-- enrollments
-- ---------------------------------------------------------------------------
CREATE POLICY enrollments_select ON enrollments FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = enrollments.course_id AND c.creator_id = (SELECT auth.uid()))
  );

CREATE POLICY enrollments_insert ON enrollments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM courses c WHERE c.id = enrollments.course_id)
  );

CREATE POLICY enrollments_update ON enrollments FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY enrollments_delete ON enrollments FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- lesson_progress
-- ---------------------------------------------------------------------------
CREATE POLICY lesson_progress_own ON lesson_progress FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM lessons l WHERE l.id = lesson_progress.lesson_id)
  );

-- ---------------------------------------------------------------------------
-- imported_messages
-- ---------------------------------------------------------------------------
CREATE POLICY imported_messages_own ON imported_messages FOR ALL TO authenticated
  USING (creator_id = (SELECT auth.uid()))
  WITH CHECK (creator_id = (SELECT auth.uid()));
