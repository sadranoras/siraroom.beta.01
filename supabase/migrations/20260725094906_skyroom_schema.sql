/*
# SkyRoom — full online meeting platform schema (single-tenant, no auth)

1. Overview
Persian (RTL) SkyRoom-style meeting platform, single-tenant, no sign-in screen.
Anyone with the anon key can create/join rooms, chat, vote on polls, schedule
meetings, and save recordings metadata. All policies TO anon, authenticated
with USING (true) / WITH CHECK (true) because data is intentionally public
within the platform (rooms joined by slug, chat shared, etc.).

2. New Tables
- rooms               meeting rooms + per-feature toggles + optional password lock
- messages            real-time in-room chat (public), supports system messages
- polls               polls created in a room (options as jsonb array of strings)
- poll_votes          one vote per (poll, voter name) — UNIQUE constraint
- recordings          metadata for recorded sessions (url + duration + size)
- scheduled_meetings  upcoming meetings a host has planned
- files               files shared in a room (metadata only, URL reference)

3. Security
- RLS enabled on every table.
- All policies TO anon, authenticated, USING (true) / WITH CHECK (true),
  documented as intentionally public (single-tenant, no auth).

4. Indexes
- messages(room_id, created_at), polls(room_id, created_at), poll_votes(poll_id),
  recordings(room_id, created_at), scheduled_meetings(start_at), files(room_id, created_at)

5. Notes
- No user_id / auth.uid() anywhere — single-tenant public data by design.
- ON DELETE CASCADE on all child tables keeps data consistent when a room is deleted.
*/

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  host_name text NOT NULL DEFAULT 'میزبان',
  is_locked boolean NOT NULL DEFAULT false,
  password text,
  max_participants int NOT NULL DEFAULT 50,
  allow_chat boolean NOT NULL DEFAULT true,
  allow_file_sharing boolean NOT NULL DEFAULT true,
  allow_screen_share boolean NOT NULL DEFAULT true,
  allow_recording boolean NOT NULL DEFAULT true,
  allow_breakout boolean NOT NULL DEFAULT true,
  allow_whiteboard boolean NOT NULL DEFAULT true,
  allow_polls boolean NOT NULL DEFAULT true,
  allow_reactions boolean NOT NULL DEFAULT true,
  allow_hand_raise boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  sender_avatar text,
  content text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  question text NOT NULL,
  options jsonb NOT NULL,
  is_open boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  voter_name text NOT NULL,
  option_index int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, voter_name)
);

CREATE TABLE IF NOT EXISTS recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  title text NOT NULL,
  duration_seconds int NOT NULL DEFAULT 0,
  url text NOT NULL,
  thumbnail text,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  recorded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scheduled_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  agenda text,
  room_slug text NOT NULL,
  host_name text NOT NULL,
  start_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  shared_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_polls_room_created ON polls(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_recordings_room_created ON recordings(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_start ON scheduled_meetings(start_at);
CREATE INDEX IF NOT EXISTS idx_files_room_created ON files(room_id, created_at);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rooms_select" ON rooms;
CREATE POLICY "rooms_select" ON rooms FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "rooms_insert" ON rooms;
CREATE POLICY "rooms_insert" ON rooms FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "rooms_update" ON rooms;
CREATE POLICY "rooms_update" ON rooms FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "rooms_delete" ON rooms;
CREATE POLICY "rooms_delete" ON rooms FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "messages_update" ON messages;
CREATE POLICY "messages_update" ON messages FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "messages_delete" ON messages;
CREATE POLICY "messages_delete" ON messages FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "polls_select" ON polls;
CREATE POLICY "polls_select" ON polls FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "polls_insert" ON polls;
CREATE POLICY "polls_insert" ON polls FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "polls_update" ON polls;
CREATE POLICY "polls_update" ON polls FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "polls_delete" ON polls;
CREATE POLICY "polls_delete" ON polls FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "poll_votes_select" ON poll_votes;
CREATE POLICY "poll_votes_select" ON poll_votes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "poll_votes_insert" ON poll_votes;
CREATE POLICY "poll_votes_insert" ON poll_votes FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "poll_votes_delete" ON poll_votes;
CREATE POLICY "poll_votes_delete" ON poll_votes FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "recordings_select" ON recordings;
CREATE POLICY "recordings_select" ON recordings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "recordings_insert" ON recordings;
CREATE POLICY "recordings_insert" ON recordings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "recordings_update" ON recordings;
CREATE POLICY "recordings_update" ON recordings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "recordings_delete" ON recordings;
CREATE POLICY "recordings_delete" ON recordings FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "scheduled_select" ON scheduled_meetings;
CREATE POLICY "scheduled_select" ON scheduled_meetings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "scheduled_insert" ON scheduled_meetings;
CREATE POLICY "scheduled_insert" ON scheduled_meetings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "scheduled_update" ON scheduled_meetings;
CREATE POLICY "scheduled_update" ON scheduled_meetings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "scheduled_delete" ON scheduled_meetings;
CREATE POLICY "scheduled_delete" ON scheduled_meetings FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "files_select" ON files;
CREATE POLICY "files_select" ON files FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "files_insert" ON files;
CREATE POLICY "files_insert" ON files FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "files_update" ON files;
CREATE POLICY "files_update" ON files FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "files_delete" ON files;
CREATE POLICY "files_delete" ON files FOR DELETE TO anon, authenticated USING (true);
