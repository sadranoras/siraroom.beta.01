-- Add per-file download permission controlled by the uploader.
-- Default true so existing behavior is preserved.
ALTER TABLE files
  ADD COLUMN IF NOT EXISTS allow_download boolean NOT NULL DEFAULT true;
