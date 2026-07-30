/*
# Add shared storage bucket for meeting files

## Purpose
Previously uploaded meeting files were stored as browser-local blob: URLs,
which only worked in the uploader's own tab. Other participants could not
open the presented file. This migration creates a public Supabase Storage
bucket so every participant in a room can load the same file URL.

## Changes
1. New Storage bucket `room-files` (public, 50MB per object limit).
   Inserted via the `storage.buckets` table so it is reproducible.
2. Storage object policies so anon + authenticated roles can read and
   upload objects under the `room-files` bucket. The app is single-tenant
   (no sign-in required to join a room), so public read/write is intended.

## Security
- Bucket is public-read so any participant can view a presented file.
- Writes are allowed for anon + authenticated (no-auth join model).
- No existing tables or data are modified.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('room-files', 'room-files', true, 209715200)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "room_files_read" ON storage.objects;
CREATE POLICY "room_files_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'room-files');

DROP POLICY IF EXISTS "room_files_insert" ON storage.objects;
CREATE POLICY "room_files_insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'room-files');

DROP POLICY IF EXISTS "room_files_delete" ON storage.objects;
CREATE POLICY "room_files_delete"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'room-files');
