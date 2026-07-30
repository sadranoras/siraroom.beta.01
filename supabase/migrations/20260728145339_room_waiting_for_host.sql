/*
# Room waiting room — host must arrive first

1. Changes
- Set `is_active` default to `false` on the `rooms` table so new rooms start inactive.
- Update all existing rooms to `is_active = false` so the waiting-room logic
  applies uniformly (the host will re-activate on next join).
2. Security
- No RLS or policy changes.
3. Notes
- The frontend already sets `is_active = false` when the host leaves and
  broadcasts a `host-left` event that kicks everyone. This migration makes
  rooms start in the closed state so non-hosts wait until the host opens
  the room.
*/

ALTER TABLE rooms
  ALTER COLUMN is_active SET DEFAULT false;

UPDATE rooms SET is_active = false WHERE is_active = true;
