/*
# Fix realtime sync fallbacks for participants, webcam, and file presentation

## Problem
Three features are broken because Supabase Realtime broadcast/presence
channels are unreliable in this environment:
1. Participants panel only shows self (presence sync not working cross-client)
2. Host webcam not visible to others (cam-signal broadcast channel not delivering)
3. File presentation not visible to other users (present-file broadcast not delivering)

## Solution
Add database-backed fallbacks that use `postgres_changes` (which IS in the
realtime publication and works reliably) instead of relying solely on
ephemeral broadcast/presence events:

1. **File presentation**: Add `presented_file_id` column to `rooms`. When the
   host presents a file, they update this column. All clients subscribe to
   `postgres_changes` on `rooms` and react to the change — no broadcast needed.

2. **Participant sync**: Add `room_members` to the `supabase_realtime`
   publication so clients can subscribe to member join/leave/update events
   as a reliable fallback alongside presence. Add `last_heartbeat` column
   so we can detect stale members.

3. **Camera mesh**: The `cam-hello` re-announcement is handled in frontend
   code (periodic re-broadcast), not in this migration.

## Changes
- `rooms.presented_file_id` (uuid, nullable) — references `files(id)` or NULL
  when no file is being presented.
- `room_members.last_heartbeat` (timestamptz, default now()) — updated
  periodically by each client to signal they're still in the room.
- `room_members` added to `supabase_realtime` publication.

## Security
- No RLS policy changes needed: `rooms` and `room_members` already have
  appropriate RLS policies that allow authenticated room members to read.
- The `presented_file_id` column is readable by anyone who can read the room
  row, and writable only by the host (enforced by existing room update policy).
*/

-- 1. Add presented_file_id to rooms for reliable file presentation sync
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS presented_file_id uuid;

-- 2. Add last_heartbeat to room_members for stale-member detection
ALTER TABLE room_members
  ADD COLUMN IF NOT EXISTS last_heartbeat timestamptz DEFAULT now();

-- 3. Add room_members to the realtime publication so clients can subscribe
--    to member join/leave/heartbeat events as a reliable fallback.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'room_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
  END IF;
END $$;

-- 4. Ensure last_heartbeat has a proper default
ALTER TABLE room_members
  ALTER COLUMN last_heartbeat SET DEFAULT now();
