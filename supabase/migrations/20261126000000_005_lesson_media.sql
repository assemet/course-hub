/*
  # Lesson media: keep the Telegram file behind imported posts

  Until now an imported post kept only its text and, for public channels, a
  t.me link. Photos and files from private channels or direct uploads were lost.

  The bot now stores the Telegram `file_id` of the attachment. The file itself
  stays on Telegram's servers (no storage cost, no size limit); the
  `lesson-media` Edge Function uses the bot token to show images in the app
  and to send videos, PDFs, audio and other files to the student's chat.

  `*_kind` is the exact Telegram object type. A file_id can only be resent with
  the matching Bot API method (sendPhoto, sendVideo, sendVoice, ...).

  Safe to run more than once.
*/

-- ---------------------------------------------------------------------------
-- imported_messages: the attachment of the forwarded post
-- ---------------------------------------------------------------------------
ALTER TABLE imported_messages
  ADD COLUMN IF NOT EXISTS file_id text,
  ADD COLUMN IF NOT EXISTS file_kind text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_mime_type text,
  ADD COLUMN IF NOT EXISTS file_size bigint;

ALTER TABLE imported_messages DROP CONSTRAINT IF EXISTS imported_messages_media_type_check;
ALTER TABLE imported_messages ADD CONSTRAINT imported_messages_media_type_check
  CHECK (media_type IN ('video', 'pdf', 'text', 'link', 'image', 'file', 'audio'));

ALTER TABLE imported_messages DROP CONSTRAINT IF EXISTS imported_messages_file_kind_check;
ALTER TABLE imported_messages ADD CONSTRAINT imported_messages_file_kind_check
  CHECK (file_kind IS NULL OR file_kind IN
    ('photo', 'video', 'video_note', 'animation', 'document', 'audio', 'voice'));

-- ---------------------------------------------------------------------------
-- lessons: the attachment carried over on import
-- ---------------------------------------------------------------------------
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_kind text,
  ADD COLUMN IF NOT EXISTS media_file_id text,
  ADD COLUMN IF NOT EXISTS media_file_name text,
  ADD COLUMN IF NOT EXISTS media_mime_type text,
  ADD COLUMN IF NOT EXISTS media_file_size bigint;

ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_media_type_check;
ALTER TABLE lessons ADD CONSTRAINT lessons_media_type_check
  CHECK (media_type IS NULL OR media_type IN ('video', 'pdf', 'image', 'file', 'audio'));

ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_media_kind_check;
ALTER TABLE lessons ADD CONSTRAINT lessons_media_kind_check
  CHECK (media_kind IS NULL OR media_kind IN
    ('photo', 'video', 'video_note', 'animation', 'document', 'audio', 'voice'));

-- A file needs both its id and the method to resend it.
ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_media_complete_check;
ALTER TABLE lessons ADD CONSTRAINT lessons_media_complete_check
  CHECK ((media_file_id IS NULL) = (media_kind IS NULL));

-- Make the new columns visible to the API right away.
NOTIFY pgrst, 'reload schema';
