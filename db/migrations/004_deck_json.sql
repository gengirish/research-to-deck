-- The render-ready deck (slides, bullets, speaker notes, numbered references) that
-- the worker hands to python-pptx. Stored so the UI can show the deck it just built
-- instead of only offering the .pptx binary for download.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deck_json JSONB;
