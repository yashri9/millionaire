-- ============================================================================
-- Deck Agent v1 — real AI avatar video column (lib/avatarVideo.ts, D-ID)
-- Idempotent: safe to re-run. Not exposed in any UI yet — see the file
-- comment in lib/avatarVideo.ts for what's still undecided before it is.
-- ============================================================================

alter table slides add column if not exists avatar_video_path text;
