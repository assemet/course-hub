/*
  # Protect course files from forwarding and saving

  When on, the bot sends the course's files to students with Telegram's
  `protect_content`, like a channel with "Restrict Saving Content": the
  student can watch/open them but not forward or save them.

  Telegram limitation: on Android, protected documents (PDF) and audio can
  still be saved to the device; videos and photos are fully protected.

  On by default: most teachers who share paid or exclusive material already
  restrict their channels. Creators can turn it off per course.

  Safe to run more than once.
*/

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS protect_content boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
