/*
# SkyRoom — authentication + persistent room roles

1. Overview
Adds email/password authentication. Each user gets a profile. Room membership
persists in room_members with role + per-participant capability grants per
room. Room creation records owner_user_id.

2. New Tables
- profiles (id -> auth.users, display_name, avatar_color, created_at)
- room_members (room_id, user_id, role, can_use_mic/cam/draw_board/
  share_screen/share_file, joined_at; UNIQUE room+user)

3. Modified Tables
- rooms: + owner_user_id (nullable for legacy)
- messages: + sender_user_id (nullable)
- poll_votes: + voter_user_id (nullable)
- scheduled_meetings: + owner_user_id (nullable)

4. Security
- RLS on profiles + room_members.
- profiles: SELECT any authenticated, UPDATE own.
- room_members: SELECT any authenticated; INSERT/UPDATE/DELETE own OR room owner.
- rooms: SELECT any authenticated; write owner-scoped.
- Child tables scoped to room membership; scheduled_meetings owner-scoped.
- Auth trigger auto-creates profile on signup.

5. Notes
- Breaking: requires sign-in. Auth flow built in same task.
- Email confirmation OFF. owner columns nullable for legacy rows.
- Ordering matters: rooms.owner_user_id is added BEFORE room_members policies
  reference it.
*/

-- 1. Add owner_user_id to rooms FIRST (room_members policies reference it)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'rooms' AND column_name = 'owner_user_id') THEN
    ALTER TABLE rooms ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rooms_owner ON rooms(owner_user_id);

-- 2. profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_color text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_any" ON profiles;
CREATE POLICY "profiles_select_any" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 3. room_members table
CREATE TABLE IF NOT EXISTS room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer',
  can_use_mic boolean NOT NULL DEFAULT false,
  can_use_cam boolean NOT NULL DEFAULT false,
  can_draw_board boolean NOT NULL DEFAULT false,
  can_share_screen boolean NOT NULL DEFAULT false,
  can_share_file boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);

ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_members_select" ON room_members;
CREATE POLICY "room_members_select" ON room_members FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "room_members_insert_own" ON room_members;
CREATE POLICY "room_members_insert_own" ON room_members FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "room_members_update_own" ON room_members;
CREATE POLICY "room_members_update_own" ON room_members FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "room_members_update_owner" ON room_members;
CREATE POLICY "room_members_update_owner" ON room_members FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM rooms WHERE rooms.id = room_members.room_id AND rooms.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM rooms WHERE rooms.id = room_members.room_id AND rooms.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "room_members_delete_own" ON room_members;
CREATE POLICY "room_members_delete_own" ON room_members FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "room_members_delete_owner" ON room_members;
CREATE POLICY "room_members_delete_owner" ON room_members FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM rooms WHERE rooms.id = room_members.room_id AND rooms.owner_user_id = auth.uid()));

-- 4. rooms policies
DROP POLICY IF EXISTS "rooms_select" ON rooms;
CREATE POLICY "rooms_select" ON rooms FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "rooms_insert" ON rooms;
CREATE POLICY "rooms_insert" ON rooms FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "rooms_update" ON rooms;
CREATE POLICY "rooms_update" ON rooms FOR UPDATE
  TO authenticated USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "rooms_delete" ON rooms;
CREATE POLICY "rooms_delete" ON rooms FOR DELETE
  TO authenticated USING (auth.uid() = owner_user_id);

-- 5. messages: add sender_user_id + membership policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'messages' AND column_name = 'sender_user_id') THEN
    ALTER TABLE messages ADD COLUMN sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_members.room_id = messages.room_id AND room_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM room_members WHERE room_members.room_id = messages.room_id AND room_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "messages_update" ON messages;
CREATE POLICY "messages_update" ON messages FOR UPDATE
  TO authenticated USING (auth.uid() = sender_user_id) WITH CHECK (true);

DROP POLICY IF EXISTS "messages_delete" ON messages;
CREATE POLICY "messages_delete" ON messages FOR DELETE
  TO authenticated USING (auth.uid() = sender_user_id);

-- 6. polls
DROP POLICY IF EXISTS "polls_select" ON polls;
CREATE POLICY "polls_select" ON polls FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_members.room_id = polls.room_id AND room_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "polls_insert" ON polls;
CREATE POLICY "polls_insert" ON polls FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM room_members WHERE room_members.room_id = polls.room_id AND room_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "polls_update" ON polls;
CREATE POLICY "polls_update" ON polls FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_members.room_id = polls.room_id AND room_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "polls_delete" ON polls;
CREATE POLICY "polls_delete" ON polls FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_members.room_id = polls.room_id AND room_members.user_id = auth.uid())
  );

-- 7. poll_votes: add voter_user_id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'poll_votes' AND column_name = 'voter_user_id') THEN
    ALTER TABLE poll_votes ADD COLUMN voter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DROP POLICY IF EXISTS "poll_votes_select" ON poll_votes;
CREATE POLICY "poll_votes_select" ON poll_votes FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM polls JOIN room_members ON room_members.room_id = polls.room_id
           WHERE polls.id = poll_votes.poll_id AND room_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "poll_votes_insert" ON poll_votes;
CREATE POLICY "poll_votes_insert" ON poll_votes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = voter_user_id);

DROP POLICY IF EXISTS "poll_votes_delete" ON poll_votes;
CREATE POLICY "poll_votes_delete" ON poll_votes FOR DELETE
  TO authenticated USING (auth.uid() = voter_user_id);

-- 8. recordings
DROP POLICY IF EXISTS "recordings_select" ON recordings;
CREATE POLICY "recordings_select" ON recordings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_members.room_id = recordings.room_id AND room_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "recordings_insert" ON recordings;
CREATE POLICY "recordings_insert" ON recordings FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM room_members WHERE room_members.room_id = recordings.room_id AND room_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "recordings_update" ON recordings;
CREATE POLICY "recordings_update" ON recordings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_members.room_id = recordings.room_id AND room_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "recordings_delete" ON recordings;
CREATE POLICY "recordings_delete" ON recordings FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_members.room_id = recordings.room_id AND room_members.user_id = auth.uid())
  );

-- 9. scheduled_meetings: add owner_user_id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'scheduled_meetings' AND column_name = 'owner_user_id') THEN
    ALTER TABLE scheduled_meetings ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DROP POLICY IF EXISTS "scheduled_select" ON scheduled_meetings;
CREATE POLICY "scheduled_select" ON scheduled_meetings FOR SELECT
  TO authenticated USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "scheduled_insert" ON scheduled_meetings;
CREATE POLICY "scheduled_insert" ON scheduled_meetings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "scheduled_update" ON scheduled_meetings;
CREATE POLICY "scheduled_update" ON scheduled_meetings FOR UPDATE
  TO authenticated USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "scheduled_delete" ON scheduled_meetings;
CREATE POLICY "scheduled_delete" ON scheduled_meetings FOR DELETE
  TO authenticated USING (auth.uid() = owner_user_id);

-- 10. files
DROP POLICY IF EXISTS "files_select" ON files;
CREATE POLICY "files_select" ON files FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_members.room_id = files.room_id AND room_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "files_insert" ON files;
CREATE POLICY "files_insert" ON files FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM room_members WHERE room_members.room_id = files.room_id AND room_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "files_update" ON files;
CREATE POLICY "files_update" ON files FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_members.room_id = files.room_id AND room_members.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "files_delete" ON files;
CREATE POLICY "files_delete" ON files FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_members.room_id = files.room_id AND room_members.user_id = auth.uid())
  );

-- 11. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
