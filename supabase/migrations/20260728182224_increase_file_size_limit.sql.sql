-- Increase the room-files bucket size limit to 200MB to support large
-- Word/PowerPoint presentations.
UPDATE storage.buckets
SET file_size_limit = 209715200
WHERE id = 'room-files';
