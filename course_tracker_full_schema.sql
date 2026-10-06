-- ============================================================
-- Course Tracker — Complete Database Schema & Seed Data
-- ============================================================
-- Run this entire script in your external Supabase SQL Editor.
-- It creates all tables, RLS policies, indexes, triggers, and
-- inserts demo data (3 courses, 2 users, modules, lessons,
-- resources, enrollments, and lesson progress).
-- ============================================================

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
-- updated_at trigger function (with fixed search_path)
-- =============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
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

-- =============================================================
-- SEED DATA
-- =============================================================

-- Demo creator
INSERT INTO users (id, telegram_id, username, first_name, photo_url, role)
VALUES
('a1111111-1111-1111-1111-111111111111', 100000001, 'course_creator', 'Alex Creator', NULL, 'creator')
ON CONFLICT (telegram_id) DO NOTHING;

-- Demo student
INSERT INTO users (id, telegram_id, username, first_name, photo_url, role)
VALUES
('b2222222-2222-2222-2222-222222222222', 100000002, 'jane_student', 'Jane Student', NULL, 'student')
ON CONFLICT (telegram_id) DO NOTHING;

-- Courses
INSERT INTO courses (id, creator_id, title, description, status, slug)
VALUES
('c3333333-3333-3333-3333-333333333301', 'a1111111-1111-1111-1111-111111111111', 'Python for Beginners', 'Learn the fundamentals of Python programming from scratch. No prior experience needed.', 'published', 'python-for-beginners'),
('c3333333-3333-3333-3333-333333333302', 'a1111111-1111-1111-1111-111111111111', 'Digital Marketing Basics', 'Master the fundamentals of digital marketing — SEO, social media, email, and paid ads.', 'published', 'digital-marketing-basics'),
('c3333333-3333-3333-3333-333333333303', 'a1111111-1111-1111-1111-111111111111', 'English Conversation', 'Improve your English speaking skills through practical conversations and real-life scenarios.', 'published', 'english-conversation')
ON CONFLICT (slug) DO NOTHING;

-- Python modules
INSERT INTO modules (id, course_id, title, description, position)
VALUES
('10000000-0000-0000-0000-000000000001', 'c3333333-3333-3333-3333-333333333301', 'Python Fundamentals', 'Getting started with Python basics', 0),
('10000000-0000-0000-0000-000000000002', 'c3333333-3333-3333-3333-333333333301', 'Variables and Data Types', 'Understanding how Python stores data', 1),
('10000000-0000-0000-0000-000000000003', 'c3333333-3333-3333-3333-333333333301', 'Conditions and Loops', 'Control flow in Python', 2),
('10000000-0000-0000-0000-000000000004', 'c3333333-3333-3333-3333-333333333301', 'Functions', 'Reusable code blocks', 3)
ON CONFLICT DO NOTHING;

-- Python lessons
INSERT INTO lessons (id, module_id, title, description, content, position)
VALUES
('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Introduction', 'Welcome to Python!', 'Welcome to Python for Beginners! In this lesson you will learn what Python is, why it is popular, and how to set up your development environment.

Python is a high-level, interpreted programming language known for its simple, readable syntax. It is used in web development, data science, automation, AI, and more.

To get started, download Python from python.org and install a code editor like VS Code.', 0),
('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Variables', 'Storing data in Python', 'Variables are containers for storing data values. In Python, you do not need to declare a variable type — Python figures it out automatically.

Example:
name = "Alice"
age = 25
pi = 3.14', 1),
('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Data Types', 'Strings, integers, floats, booleans', 'Python has several built-in data types:

- str: text values like "hello"
- int: whole numbers like 42
- float: decimal numbers like 3.14
- bool: True or False
- list: ordered collections like [1, 2, 3]
- dict: key-value pairs like {"name": "Alice"}', 2),
('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Exercises', 'Practice what you learned', 'Try these exercises:

1. Create a variable called city and assign it your city name.
2. Print the type of each variable using type().
3. Create a list of your favorite fruits.', 3),
('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'String Operations', 'Working with text', 'Strings are one of the most common data types in Python. You can concatenate, slice, and format them.

Example:
greeting = "Hello" + " " + "World"
name = "Alice"
message = f"Hi {name}!"', 0),
('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', 'Numbers and Math', 'Arithmetic in Python', 'Python supports all standard arithmetic operations: +, -, *, /, %, **.

Example:
result = 10 + 5
remainder = 10 % 3
power = 2 ** 8', 1),
('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', 'Lists', 'Ordered collections', 'Lists store multiple items in a single variable.

fruits = ["apple", "banana", "cherry"]
fruits.append("date")
print(fruits[0])  # apple', 2),
('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000003', 'If / Else', 'Conditional statements', 'Conditional statements allow your program to make decisions.

if age >= 18:
    print("Adult")
else:
    print("Minor")', 0),
('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000003', 'For Loops', 'Iterating over sequences', 'For loops let you repeat actions.

for fruit in fruits:
    print(fruit)

for i in range(5):
    print(i)', 1),
('20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000003', 'While Loops', 'Repeating until a condition changes', 'While loops repeat as long as a condition is true.

count = 0
while count < 5:
    print(count)
    count += 1', 2),
('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000003', 'Quiz Practice', 'Test your knowledge', 'Answer these questions:
1. What does the % operator do?
2. How is a for loop different from a while loop?
3. Write a loop that prints even numbers from 0 to 10.', 3),
('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000004', 'Defining Functions', 'Creating reusable code', 'Functions group code into reusable blocks.

def greet(name):
    return f"Hello, {name}!"

print(greet("Alice"))', 0),
('20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000004', 'Arguments and Return Values', 'Passing data to functions', 'Functions can accept multiple arguments and return values.

def add(a, b):
    return a + b

result = add(3, 5)', 1),
('20000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000004', 'Project: Calculator', 'Build your first app', 'Put it all together by building a simple calculator that can add, subtract, multiply, and divide. Use functions for each operation.', 2)
ON CONFLICT DO NOTHING;

-- Python resources
INSERT INTO resources (lesson_id, title, type, url, description)
VALUES
('20000000-0000-0000-0000-000000000001', 'Python Official Documentation', 'link', 'https://docs.python.org/3/', 'Official Python docs'),
('20000000-0000-0000-0000-000000000001', 'Python Setup Guide PDF', 'pdf', 'https://example.com/python-setup.pdf', 'Step-by-step installation guide'),
('20000000-0000-0000-0000-000000000002', 'Variables Cheat Sheet', 'pdf', 'https://example.com/variables.pdf', 'Quick reference for variable types'),
('20000000-0000-0000-0000-000000000008', 'Telegram Channel: Python Tips', 'telegram', 'https://t.me/python_tips', 'Daily Python tips'),
('20000000-0000-0000-0000-000000000012', 'Functions Reference', 'link', 'https://docs.python.org/3/tutorial/controlflow.html#defining-functions', 'Official functions tutorial')
ON CONFLICT DO NOTHING;

-- Marketing modules
INSERT INTO modules (id, course_id, title, description, position)
VALUES
('10000000-0000-0000-0000-000000000005', 'c3333333-3333-3333-3333-333333333302', 'Introduction to Digital Marketing', 'What digital marketing is and why it matters', 0),
('10000000-0000-0000-0000-000000000006', 'c3333333-3333-3333-3333-333333333302', 'SEO Fundamentals', 'Search engine optimization basics', 1),
('10000000-0000-0000-0000-000000000007', 'c3333333-3333-3333-3333-333333333302', 'Social Media Marketing', 'Marketing on social platforms', 2),
('10000000-0000-0000-0000-000000000008', 'c3333333-3333-3333-3333-333333333302', 'Email Marketing', 'Building email campaigns', 3)
ON CONFLICT DO NOTHING;

-- Marketing lessons
INSERT INTO lessons (id, module_id, title, description, content, position)
VALUES
('20000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000005', 'What is Digital Marketing?', 'Overview of the field', 'Digital marketing encompasses all marketing efforts that use an electronic device or the internet. Businesses leverage digital channels such as search engines, social media, email, and other websites to connect with current and prospective customers.', 0),
('20000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000005', 'Key Channels', 'Understanding the marketing landscape', 'Key digital marketing channels include:
- SEO (Search Engine Optimization)
- SEM (Search Engine Marketing / Paid Ads)
- Social Media Marketing
- Email Marketing
- Content Marketing
- Affiliate Marketing', 1),
('20000000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000006', 'How Search Engines Work', 'Crawling, indexing, ranking', 'Search engines like Google use three primary functions: crawl, index, and rank. Understanding how these work helps you optimize your content to appear higher in search results.', 0),
('20000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000006', 'On-Page SEO', 'Optimizing your content', 'On-page SEO involves optimizing individual web pages to rank higher. Key elements include title tags, meta descriptions, headers, keyword usage, and internal linking.', 1),
('20000000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000006', 'Keyword Research', 'Finding the right keywords', 'Keyword research is the process of finding what your audience searches for. Tools like Google Keyword Planner, Ubersuggest, and Ahrefs can help.', 2),
('20000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000007', 'Choosing Platforms', 'Where to focus your efforts', 'Not every platform is right for every business. Choose based on where your audience spends time:
- Instagram: visual brands
- LinkedIn: B2B
- TikTok: younger audiences
- Facebook: broad audience', 0),
('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000007', 'Content Strategy', 'Planning your posts', 'A good content strategy includes a content calendar, mix of content types (educational, promotional, entertaining), and consistent posting schedule.', 1),
('20000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000008', 'Building an Email List', 'Starting your email marketing', 'Email marketing has one of the highest ROIs in digital marketing. Start by building an email list through lead magnets, opt-in forms, and landing pages.', 0),
('20000000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000008', 'Writing Effective Emails', 'Crafting campaigns that convert', 'Effective marketing emails have clear subject lines, personalization, a single call-to-action, and mobile-friendly design.', 1),
('20000000-0000-0000-0000-000000000024', '10000000-0000-0000-0000-000000000008', 'Email Analytics', 'Measuring success', 'Key email metrics: open rate, click-through rate, conversion rate, bounce rate, and unsubscribe rate. Track these to optimize your campaigns.', 2)
ON CONFLICT DO NOTHING;

-- Marketing resources
INSERT INTO resources (lesson_id, title, type, url, description)
VALUES
('20000000-0000-0000-0000-000000000015', 'Digital Marketing Guide PDF', 'pdf', 'https://example.com/digital-marketing-guide.pdf', 'Complete beginner guide'),
('20000000-0000-0000-0000-000000000017', 'Google Search Central', 'link', 'https://developers.google.com/search/docs', 'Official Google SEO docs'),
('20000000-0000-0000-0000-000000000019', 'Keyword Research Template', 'file', 'https://example.com/keyword-template.xlsx', 'Excel template for keyword research'),
('20000000-0000-0000-0000-000000000020', 'Telegram Channel: Marketing Tips', 'telegram', 'https://t.me/marketing_tips', 'Daily marketing insights')
ON CONFLICT DO NOTHING;

-- English modules
INSERT INTO modules (id, course_id, title, description, position)
VALUES
('10000000-0000-0000-0000-000000000009', 'c3333333-3333-3333-3333-333333333303', 'Everyday Conversations', 'Common daily interactions', 0),
('10000000-0000-0000-0000-000000000010', 'c3333333-3333-3333-3333-333333333303', 'Travel English', 'English for traveling', 1),
('10000000-0000-0000-0000-000000000011', 'c3333333-3333-3333-3333-333333333303', 'Business English', 'Professional communication', 2),
('10000000-0000-0000-0000-000000000012', 'c3333333-3333-3333-3333-333333333303', 'Advanced Expressions', 'Idioms and natural speech', 3)
ON CONFLICT DO NOTHING;

-- English lessons
INSERT INTO lessons (id, module_id, title, description, content, position)
VALUES
('20000000-0000-0000-0000-000000000025', '10000000-0000-0000-0000-000000000009', 'Greetings and Introductions', 'Saying hello and introducing yourself', 'Common greetings:
- "Hi, how are you?"
- "Nice to meet you."
- "My name is..."

Practice introducing yourself in different situations — formal and informal.', 0),
('20000000-0000-0000-0000-000000000026', '10000000-0000-0000-0000-000000000009', 'Small Talk', 'Casual conversation topics', 'Small talk topics include weather, weekend plans, hobbies, and current events. Keep it light and friendly.

"How was your weekend?"
"Did you see the game last night?"', 1),
('20000000-0000-0000-0000-000000000027', '10000000-0000-0000-0000-000000000009', 'Asking Questions', 'How to ask politely', 'Polite question forms:
"Could you tell me...?"
"Would you mind...?"
"Do you happen to know...?"', 2),
('20000000-0000-0000-0000-000000000028', '10000000-0000-0000-0000-000000000010', 'At the Airport', 'Airport conversations', 'Key phrases for the airport:
"Where is the check-in counter?"
"How many bags can I check?"
"My flight is at 3 PM."', 0),
('20000000-0000-0000-0000-000000000029', '10000000-0000-0000-0000-000000000010', 'At the Hotel', 'Checking in and requesting services', 'Hotel phrases:
"I have a reservation under..."
"Could I get a wake-up call?"
"Is breakfast included?"', 1),
('20000000-0000-0000-0000-000000000030', '10000000-0000-0000-0000-000000000010', 'Ordering Food', 'Restaurant conversations', 'At a restaurant:
"Could I see the menu?"
"I would like to order..."
"Could we get the check, please?"', 2),
('20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000011', 'Meetings and Introductions', 'Professional introductions', 'In business settings:
"Let me introduce you to..."
"I am responsible for..."
"Let us start the meeting."', 0),
('20000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000011', 'Email and Phone English', 'Professional written/spoken communication', 'Professional email phrases:
"I am writing to..."
"Please let me know if..."
"Looking forward to hearing from you."', 1),
('20000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000012', 'Common Idioms', 'Natural English expressions', 'Popular idioms:
"Break a leg" — good luck
"Piece of cake" — very easy
"Hit the books" — to study', 0),
('20000000-0000-0000-0000-000000000034', '10000000-0000-0000-0000-000000000012', 'Phrasal Verbs', 'Essential phrasal verbs', 'Common phrasal verbs:
"Give up" — to quit
"Look forward to" — to anticipate
"Figure out" — to solve or understand', 1),
('20000000-0000-0000-0000-000000000035', '10000000-0000-0000-0000-000000000012', 'Practice Conversation', 'Put it all together', 'Practice combining idioms and phrasal verbs in a conversation. Try role-playing a job interview or a friendly chat.', 2)
ON CONFLICT DO NOTHING;

-- English resources
INSERT INTO resources (lesson_id, title, type, url, description)
VALUES
('20000000-0000-0000-0000-000000000025', 'Conversation Phrases PDF', 'pdf', 'https://example.com/conversation-phrases.pdf', '100 essential conversation phrases'),
('20000000-0000-0000-0000-000000000028', 'Travel English Cheat Sheet', 'pdf', 'https://example.com/travel-english.pdf', 'Quick reference for travel'),
('20000000-0000-0000-0000-000000000033', 'Idioms Dictionary', 'link', 'https://www.oxfordlearnersdictionaries.com/idioms/', 'Online idioms reference'),
('20000000-0000-0000-0000-000000000025', 'Telegram Channel: Daily English', 'telegram', 'https://t.me/daily_english', 'Daily English practice')
ON CONFLICT DO NOTHING;

-- Enrollments
INSERT INTO enrollments (user_id, course_id, last_lesson_id, last_activity_at)
VALUES
('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333301', '20000000-0000-0000-0000-000000000008', now()),
('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333302', '20000000-0000-0000-0000-000000000018', now() - interval '2 days'),
('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333303', NULL, now() - interval '5 days')
ON CONFLICT (user_id, course_id) DO NOTHING;

-- Python progress (8 of 14 completed)
INSERT INTO lesson_progress (user_id, course_id, lesson_id, completed, completed_at)
VALUES
('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333301', '20000000-0000-0000-0000-000000000001', true, now() - interval '10 days'),
('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333301', '20000000-0000-0000-0000-000000000002', true, now() - interval '9 days'),
('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333301', '20000000-0000-0000-0000-000000000003', true, now() - interval '8 days'),
('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333301', '20000000-0000-0000-0000-000000000004', true, now() - interval '8 days'),
('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333301', '20000000-0000-0000-0000-000000000005', true, now() - interval '7 days'),
('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333301', '20000000-0000-0000-0000-000000000006', true, now() - interval '6 days'),
('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333301', '20000000-0000-0000-0000-000000000007', true, now() - interval '5 days'),
('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333301', '20000000-0000-0000-0000-000000000008', true, now() - interval '4 days')
ON CONFLICT (user_id, lesson_id) DO NOTHING;

-- Marketing progress (3 of 10 completed)
INSERT INTO lesson_progress (user_id, course_id, lesson_id, completed, completed_at)
VALUES
('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333302', '20000000-0000-0000-0000-000000000015', true, now() - interval '3 days'),
('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333302', '20000000-0000-0000-0000-000000000016', true, now() - interval '3 days'),
('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333302', '20000000-0000-0000-0000-000000000017', true, now() - interval '2 days')
ON CONFLICT (user_id, lesson_id) DO NOTHING;
