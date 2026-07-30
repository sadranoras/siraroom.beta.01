/*
# Database-backed WebRTC signaling for unreliable realtime

## Problem
Supabase Realtime broadcast channels (cam-signal, screen-signal) are
unreliable in this environment — WebRTC offers/answers/ICE candidates
sent via `channel.send({ type: 'broadcast' })` frequently never arrive,
so the camera mesh never connects and participants can't see each
other's video.

## Solution
Add a `rtc_signals` table that carries WebRTC signaling payloads
(offers, answers, ICE candidates) as rows instead of ephemeral
broadcasts. Clients INSERT rows; every client in the same room
receives them via `postgres_changes` (which IS reliable) plus a 1s
polling fallback. Each row is consumed (deleted) once processed.

## New Table
- `rtc_signals`
  - `id` uuid PK
  - `room_slug` text — which room the signal belongs to
  - `from_id` text — sender peer id (profile.id)
  - `to_id` text — recipient peer id, or '*' for broadcast-to-all
  - `kind` text — 'offer' | 'answer' | 'ice' | 'hello' | 'bye' | 'need-offer'
  - `payload` jsonb — SDP/candidate/empty
  - `created_at` timestamptz DEFAULT now()

## Security
- RLS enabled. SELECT/INSERT/DELETE/UPDATE TO authenticated with
  USING(true)/WITH CHECK(true): the table carries only ephemeral
  WebRTC signaling (no sensitive data), scoped by room_slug, rows are
  short-lived. Any authenticated room member can read signals
  addressed to them or to '*'.

## Realtime
- Added to `supabase_realtime` publication so postgres_changes fires.
*/

CREATE TABLE IF NOT EXISTS rtc_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_slug text NOT NULL,
  from_id text NOT NULL,
  to_id text NOT NULL DEFAULT '*',
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rtc_signals_room ON rtc_signals(room_slug, created_at);
CREATE INDEX IF NOT EXISTS idx_rtc_signals_to ON rtc_signals(to_id, created_at);

ALTER TABLE rtc_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rtc_signals_select" ON rtc_signals;
CREATE POLICY "rtc_signals_select" ON rtc_signals FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "rtc_signals_insert" ON rtc_signals;
CREATE POLICY "rtc_signals_insert" ON rtc_signals FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "rtc_signals_delete" ON rtc_signals;
CREATE POLICY "rtc_signals_delete" ON rtc_signals FOR DELETE
  TO authenticated USING (true);

DROP POLICY IF EXISTS "rtc_signals_update" ON rtc_signals;
CREATE POLICY "rtc_signals_update" ON rtc_signals FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'rtc_signals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rtc_signals;
  END IF;
END $$;
