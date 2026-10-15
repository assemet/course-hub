/*
# Add imported_messages table for Telegram Forwarding Import

## Purpose
Stores messages that creators forward from their Telegram channels to the bot.
These are parsed into draft lessons that creators can organize in the Quick Editor.

## New Table
- `imported_messages`
  - id (uuid, primary key)
  - creator_id (uuid, references users.id ON DELETE CASCADE)
  - telegram_message_id (bigint, Telegram's message ID from the forwarded message)
  - raw_content (text, the full text content of the forwarded message)
  - parsed_title (text, auto-extracted title — first line or media caption)
  - media_type (text: 'video', 'pdf', 'text', 'link', 'image', 'file')
  - media_url (text, URL to media if extractable — YouTube links, Telegram file links, etc.)
  - status (text: 'pending' = not yet imported into a course, 'imported' = has been used)
  - created_at (timestamptz)

## Constraints
- UNIQUE (creator_id, telegram_message_id) — prevent duplicate imports of same forwarded message
- CHECK on media_type values
- CHECK on status values

## Security
- RLS enabled, anon+authenticated CRUD (same pattern as all other tables in this app)
*/

CREATE TABLE IF NOT EXISTS imported_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_message_id bigint NOT NULL,
  raw_content text,
  parsed_title text,
  media_type text NOT NULL DEFAULT 'text',
  media_url text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Unique constraint to prevent duplicate imports
CREATE UNIQUE INDEX IF NOT EXISTS imported_messages_creator_msg_unique
  ON imported_messages (creator_id, telegram_message_id);

-- CHECK constraints
ALTER TABLE imported_messages DROP CONSTRAINT IF EXISTS imported_messages_media_type_check;
ALTER TABLE imported_messages ADD CONSTRAINT imported_messages_media_type_check
  CHECK (media_type IN ('video', 'pdf', 'text', 'link', 'image', 'file'));

ALTER TABLE imported_messages DROP CONSTRAINT IF EXISTS imported_messages_status_check;
ALTER TABLE imported_messages ADD CONSTRAINT imported_messages_status_check
  CHECK (status IN ('pending', 'imported'));

-- Enable RLS
ALTER TABLE imported_messages ENABLE ROW LEVEL SECURITY;

-- Policies (anon+authenticated, same as all other tables in this no-auth Telegram app)
DROP POLICY IF EXISTS "anon_select_imported_messages" ON imported_messages;
CREATE POLICY "anon_select_imported_messages"
  ON imported_messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_imported_messages" ON imported_messages;
CREATE POLICY "anon_insert_imported_messages"
  ON imported_messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_imported_messages" ON imported_messages;
CREATE POLICY "anon_update_imported_messages"
  ON imported_messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_imported_messages" ON imported_messages;
CREATE POLICY "anon_delete_imported_messages"
  ON imported_messages FOR DELETE
  TO anon, authenticated USING (true);

-- Index for querying by creator
CREATE INDEX IF NOT EXISTS imported_messages_creator_id_idx
  ON imported_messages (creator_id);

-- Index for filtering pending messages
CREATE INDEX IF NOT EXISTS imported_messages_status_idx
  ON imported_messages (status);
