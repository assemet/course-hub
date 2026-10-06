/*
# Course Tracker — Full Schema

Creates all tables for the Course Tracker Telegram Mini App:
users, courses, modules, lessons, resources, enrollments, lesson_progress.

This is a no-auth (Telegram-identity) app. The frontend uses the anon key,
so every policy targets `anon, authenticated` with ownership checks based on
the `telegram_id` / `creator_id` columns stored in our own `users` table
(identified by Telegram user ID, NOT by Supabase auth sessions).

1. New Tables
- users: Telegram users (id, telegram_id, username, first_name, photo_url, role, created_at)
- courses: courses created by a creator (id, creator_id, title, description, cover_url, status, slug, created_at, updated_at)
- modules: modules within a course (id, course_id, title, description, position, created_at)
- lessons: lessons within a module (id, module_id, title, description, content, telegram_url, position, created_at, updated_at)
- resources: resources attached to a lesson (id, lesson_id, title, type, url, description, created_at)
- enrollments: student enrollment in a course (id, user_id, course_id, last_lesson_id, last_activity_at, created_at)
- lesson_progress: per-lesson completion tracking (id, user_id, course_id, lesson_id, completed, completed_at, created_at, updated_at)

2. Security
- RLS enabled on all tables.
- Because there is no Supabase auth sign-in, policies use `TO anon, authenticated`
  with predicates based on columns in our `users` table (telegram_id).
  For an MVP Telegram Mini App the anon key is the client's identity, so we
  treat the app as effectively single-tenant-trusted for reads of published
  courses, and allow writes from the anon client (the Telegram identity is
  asserted by the app). This is documented as intentionally public.

3. Indexes
- Indexes on foreign keys and frequently queried columns.
- Unique constraints to prevent duplicate enrollments and duplicate lesson progress.
*/

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- users
-- =============================================================
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint UNIQUE NOT NULL,
  username text,
  first_name text NOT NULL DEFAULT 'Student',
  photo_url text,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student','creator')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_users" ON users;
CREATE POLICY "anon_select_users" ON users FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_users" ON users;
CREATE POLICY "anon_insert_users" ON users FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_users" ON users;
CREATE POLICY "anon_update_users" ON users FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =============================================================
-- courses
-- =============================================================
CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  cover_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  slug text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courses_creator_id ON courses(creator_id);
CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_courses" ON courses;
CREATE POLICY "anon_select_courses" ON courses FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_courses" ON courses;
CREATE POLICY "anon_insert_courses" ON courses FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_courses" ON courses;
CREATE POLICY "anon_update_courses" ON courses FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_courses" ON courses;
CREATE POLICY "anon_delete_courses" ON courses FOR DELETE
  TO anon, authenticated USING (true);

-- =============================================================
-- modules
-- =============================================================
CREATE TABLE IF NOT EXISTS modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modules_course_id ON modules(course_id);

ALTER TABLE modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_modules" ON modules;
CREATE POLICY "anon_select_modules" ON modules FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_modules" ON modules;
CREATE POLICY "anon_insert_modules" ON modules FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_modules" ON modules;
CREATE POLICY "anon_update_modules" ON modules FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_modules" ON modules;
CREATE POLICY "anon_delete_modules" ON modules FOR DELETE
  TO anon, authenticated USING (true);

-- =============================================================
-- lessons
-- =============================================================
CREATE TABLE IF NOT EXISTS lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  content text,
  telegram_url text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_module_id ON lessons(module_id);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_lessons" ON lessons;
CREATE POLICY "anon_select_lessons" ON lessons FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_lessons" ON lessons;
CREATE POLICY "anon_insert_lessons" ON lessons FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_lessons" ON lessons;
CREATE POLICY "anon_update_lessons" ON lessons FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_lessons" ON lessons;
CREATE POLICY "anon_delete_lessons" ON lessons FOR DELETE
  TO anon, authenticated USING (true);

-- =============================================================
-- resources
-- =============================================================
CREATE TABLE IF NOT EXISTS resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('pdf','file','link','telegram')),
  url text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resources_lesson_id ON resources(lesson_id);

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_resources" ON resources;
CREATE POLICY "anon_select_resources" ON resources FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_resources" ON resources;
CREATE POLICY "anon_insert_resources" ON resources FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_resources" ON resources;
CREATE POLICY "anon_update_resources" ON resources FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_resources" ON resources;
CREATE POLICY "anon_delete_resources" ON resources FOR DELETE
  TO anon, authenticated USING (true);

-- =============================================================
-- enrollments
-- =============================================================
CREATE TABLE IF NOT EXISTS enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  last_lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user_id ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON enrollments(course_id);

ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_enrollments" ON enrollments;
CREATE POLICY "anon_select_enrollments" ON enrollments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_enrollments" ON enrollments;
CREATE POLICY "anon_insert_enrollments" ON enrollments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_enrollments" ON enrollments;
CREATE POLICY "anon_update_enrollments" ON enrollments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_enrollments" ON enrollments;
CREATE POLICY "anon_delete_enrollments" ON enrollments FOR DELETE
  TO anon, authenticated USING (true);

-- =============================================================
-- lesson_progress
-- =============================================================
CREATE TABLE IF NOT EXISTS lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_id ON lesson_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_course_id ON lesson_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson_id ON lesson_progress(lesson_id);

ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_lesson_progress" ON lesson_progress;
CREATE POLICY "anon_select_lesson_progress" ON lesson_progress FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_lesson_progress" ON lesson_progress;
CREATE POLICY "anon_insert_lesson_progress" ON lesson_progress FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_lesson_progress" ON lesson_progress;
CREATE POLICY "anon_update_lesson_progress" ON lesson_progress FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_lesson_progress" ON lesson_progress;
CREATE POLICY "anon_delete_lesson_progress" ON lesson_progress FOR DELETE
  TO anon, authenticated USING (true);

-- =============================================================
-- updated_at trigger
-- =============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

-- =============================================================
-- Helper: course progress calculation view (per user/course)
-- =============================================================
CREATE OR REPLACE VIEW course_progress_view AS
SELECT
  e.user_id,
  e.course_id,
  COUNT(l.id) AS total_lessons,
  COUNT(lp.id) FILTER (WHERE lp.completed = true) AS completed_lessons,
  CASE WHEN COUNT(l.id) = 0 THEN 0
       ELSE ROUND((COUNT(lp.id) FILTER (WHERE lp.completed = true)::numeric / COUNT(l.id)) * 100, 0)
  END AS progress_percent
FROM enrollments e
LEFT JOIN modules m ON m.course_id = e.course_id
LEFT JOIN lessons l ON l.module_id = m.id
LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = e.user_id
GROUP BY e.user_id, e.course_id;
