/*
  # Media thumbnails and durations

  Telegram attaches a small preview image to most files (a frame for videos,
  the first page for PDFs uploaded from Telegram apps, album art for audio) and
  reports the length of videos and audio. Keep both so lists can show what a
  lesson is before it is opened.

  - `thumb_file_id`: Telegram file_id of the preview (JPEG, ~320px). For photos
    it is a mid-size version of the photo itself.
  - `duration`: seconds, for video and audio.

  Safe to run more than once.
*/

ALTER TABLE imported_messages
  ADD COLUMN IF NOT EXISTS thumb_file_id text,
  ADD COLUMN IF NOT EXISTS duration integer;

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS media_thumb_file_id text,
  ADD COLUMN IF NOT EXISTS media_duration integer;

ALTER TABLE imported_messages DROP CONSTRAINT IF EXISTS imported_messages_duration_check;
ALTER TABLE imported_messages ADD CONSTRAINT imported_messages_duration_check
  CHECK (duration IS NULL OR duration >= 0);

ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_media_duration_check;
ALTER TABLE lessons ADD CONSTRAINT lessons_media_duration_check
  CHECK (media_duration IS NULL OR media_duration >= 0);

NOTIFY pgrst, 'reload schema';
