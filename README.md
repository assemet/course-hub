# course-hub

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-txdfxcsl)

Telegram Mini App for creating and following courses (React + Vite + Supabase).

## Local setup

```bash
cp .env.example .env      # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm install
npm run dev
npm run typecheck && npm run lint && npm run build
```

The app only works inside Telegram (it needs signed `initData`).

## How authentication works

1. The Mini App sends Telegram's signed `initData` to the `auth-telegram` Edge Function.
2. The function verifies the HMAC with the bot token, upserts the user, and returns a
   1-hour Supabase JWT whose `sub` is `users.id`.
3. The client uses that JWT for every query, and Row Level Security scopes data with
   `auth.uid()` (see `supabase/migrations/*_004_lock_down_rls.sql`).

The anon key alone has **no** access to any table.

## Deploying the backend

Secrets (the CLI refuses names starting with `SUPABASE_`, hence `APP_JWT_SECRET`):

```bash
supabase secrets set \
  TELEGRAM_BOT_TOKEN=<bot token from @BotFather> \
  APP_JWT_SECRET=<Project Settings > API > JWT Secret> \
  TELEGRAM_WEBHOOK_SECRET=<long random string>
```

Deploy in this order so the live app is never left without access:

```bash
supabase functions deploy auth-telegram
supabase functions deploy send-reminder
supabase functions deploy telegram-webhook
# deploy the new frontend, THEN:
supabase db push          # applies the RLS lockdown migration
```

Point the bot webhook at the function with the secret token:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<project>.supabase.co/functions/v1/telegram-webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

> If the bot token was ever deployed in a build that included `VITE_TELEGRAM_BOT_TOKEN`,
> treat it as leaked: revoke it in @BotFather (`/revoke`) and set the new one as a secret.

## Language (Arabic / English)

The UI is translated in `src/lib/i18n.tsx` (one dictionary per language).
The language is picked in this order: the user's choice in the Profile tab
(saved in localStorage), then the Telegram client language, then Arabic.
Arabic switches the whole layout to RTL (`<html dir="rtl">`).

To add or change text, add the key to **both** `en` and `ar`; TypeScript fails
the build if a key is missing from the Arabic dictionary.

## Theme (light / dark)

By default the app follows Telegram's theme (and updates live when the user
switches it); Profile → Appearance can force Light or Dark.

Colors are CSS variables: `tailwind.config.js` maps the palette (`slate`,
`blue`, ...) and `surface` (card background) to variables defined in
`src/index.css`, and `.dark` on `<html>` swaps them. Use the normal classes
(`bg-surface` for cards instead of `bg-white`); no `dark:` variants are needed.

## Navigation

Telegram's native back button (and Android's back key) is driven by
`useBackButton()` in `src/hooks/useBackButton.ts`: screens and modals register
a handler, the latest one wins, and the button hides on the main tabs.

## Student experience

- **Course page**: one clear next step: *Start the course*, *Continue: <lesson>*
  (resumes the last opened lesson, or the next unfinished one), or a
  *You finished this course* banner with *Review from the start*.
- **Lesson page**: "Lesson 3 of 12 · module" line and a list button open a
  sheet with every lesson and its status, to jump anywhere. After completing a
  lesson, the bottom bar becomes *Next: <title>*.
- **Finishing a course** shows a celebration (CSS confetti, off when the device
  asks for reduced motion) with *Share your achievement* (Telegram share link).
- **Search** in Browse (shown from 4 courses) matches title and description,
  ignoring Arabic spelling variants: hamza forms (أ/إ/آ → ا, ؤ/ئ → ء),
  ة/ه, ى/ي, diacritics, tatweel and Arabic-Indic digits (`src/lib/search.ts`).

## Quizzes and certificates

**Module quizzes** (Course editor → Modules → *Module quiz*): multiple-choice
questions (2-6 answers), optional explanation, pass mark per quiz (default 70%).

- Correct answers never reach students: column privileges hide
  `quiz_questions.correct_index`/`explanation`; `submit_quiz()` grades in the
  database and returns corrections only after an attempt. Students can't write
  attempts directly. Creators read answers via `creator_quiz()`.
- *Require passing module quizzes* (course setting, off by default): a module
  opens only after the previous modules' quizzes are passed (enforced in the
  app; the course page, lesson list and lesson page show locks).
- After the last lesson of a module, the next step is that module's quiz.

**Certificates**: when every lesson is completed and every quiz passed,
`issue_certificate()` (checked in the database) stores a snapshot with a
10-character verification code; the student confirms the name first (fixed
afterwards). The image is drawn in the app (`renderCertificate`, Arabic or
English) and `certificate-send` has the bot send it to the student with a
*Verify* button. The link `t.me/<bot>/app?startapp=cert_<CODE>` opens the
verification screen (`verify_certificate()`). The image is only a picture; the
code is what proves a certificate.

Deploy: `supabase functions deploy certificate-send` (and redeploy
`send-reminder`, which now shares `getBotUsername`).

## Flashcards

**Creators** (Course editor → Modules → *Flashcards*): cards per module, each a
front (question/term, up to 500 characters) and back (answer, up to 1000).
*Paste a list* adds many at once: one card per line as `front | back`; a tab
(two columns copied from a spreadsheet), ` = ` or ` : ` also work. Lines that
can't be read are listed and skipped.

**Students** review with spaced repetition (Leitner boxes 1-5). From the course
page: *Review flashcards* (whole course, due cards only) or a module's
*Flashcards* row. A session holds up to 20 cards: due reviews first, then new
cards in course order. *I knew it* moves a card up a box (next review in 2, 4,
8, 16 days); *I didn't know* sends it back to box 1 and shows it again at the
end of the session. When nothing is due, students can practise all cards
anyway. Modules locked by quiz gating are left out.

- `review_flashcard()` checks the student is enrolled in a published course
  (or owns it) and does the scheduling in the database; students can only read
  their own `flashcard_reviews` and can't write them directly.
- `course_flashcard_stats()` gives totals, due and learned (box 4+) per module.

Deploy: run `supabase/migrations/20261127100000_010_flashcards.sql`. No new
edge functions.

## Creator tools

- **Students and progress** (Dashboard → a course → *Students and progress*):
  each student's completed lessons, last activity and current lesson; filters
  for inactive (3+ days) and finished students; remind one student or all
  inactive ones (at most one reminder per student per 24 h).
- **Lessons tab**: how many students finished each lesson, with the biggest
  drop-off highlighted ("many stop here").
- Data comes from `creator_course_students()` / `creator_lesson_stats()`
  (migration 008). They check the caller owns the course; students' raw
  progress rows stay private.
- **Reminders** are written in the student's Telegram language (stored at
  sign-in), include their progress, and have a *Continue the course* button.
- **Import all**: the Import Inbox imports every pending message into the
  chosen module in the order they were sent.

## Importing from Telegram

Creators forward channel posts to the bot; they land in the **Import Inbox**
(Dashboard → Import Inbox) and become lessons with one tap. Only users in
creator mode can import; the bot replies in the chat to confirm, or to explain
why a message was not imported.

### Attachments (photos, PDFs, videos, audio, files)

The bot stores the Telegram `file_id` of each attachment; the file itself stays
on Telegram (no storage cost, no size limit, works for private channels).
On the lesson page:

- **Images** are shown inline (downloaded through the `lesson-media` function).
- **PDFs, videos, audio and other files**: the student taps *Send to my Telegram
  chat* and the bot sends the file to them, where Telegram's own viewer/player
  opens it. If the student never started the bot, the app asks for permission.

`lesson-media` reads the lesson with the student's own permissions (RLS), so a
student only gets files from lessons they can see. Deploy it with:

```bash
supabase functions deploy lesson-media
```

**Content protection.** Each course has *Prevent saving and forwarding* (on
by default, Course editor → Overview). When on, the bot sends files with
Telegram's `protect_content`, like a channel with "Restrict Saving Content":
videos and photos can't be forwarded or saved. Telegram limitation: on Android,
protected PDFs and audio can still be saved to the device. If the setting
can't be read, files are sent protected.

**Restricted channels.** Posts from a channel with "Restrict Saving Content"
can't be forwarded, even by its owner. Either turn the restriction off for a
moment, forward the posts to the bot, and turn it back on (the bot keeps its
copies), or send the original files to the bot directly.

**Thumbnails and durations.** Telegram sends a small preview with most files
(a video frame, the first page of PDFs uploaded from Telegram apps, album art);
the bot keeps it with the video/audio length. Lists (course page, Import
Inbox) and the lesson page show them through `lesson-media` (`action: "thumb"`).
The app loads previews only when they scroll into view, at most 4 at a time,
and keeps them for the session.

A `file_id` belongs to one bot: if you ever switch to a different bot token,
re-import the posts.

## Notes

- `course_tracker_full_schema.sql` is an old all-in-one script with demo data and
  permissive policies. Use the files in `supabase/migrations/` instead.
