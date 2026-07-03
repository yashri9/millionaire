-- ============================================================================
-- Deck Agent v1 — rendered page images (Studio parity with backend/server.py)
-- Idempotent: safe to re-run.
-- ============================================================================

alter table slides add column if not exists image_path text;
alter table slides add column if not exists thumb_path text;
