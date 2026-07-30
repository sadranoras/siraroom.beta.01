/*
# Add allow_view_participants column to rooms

1. Modified Tables
- `rooms`: added `allow_view_participants` boolean column (default true)
  Controls whether non-host participants can see the participants list.

2. Security
- No RLS policy changes needed — existing room update policies for hosts cover this column.
*/

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS allow_view_participants boolean NOT NULL DEFAULT true;
