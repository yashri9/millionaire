/**
 * types.ts — shared TypeScript types mirroring the §5 data model.
 * Keep in sync with web/supabase/migrations.
 */

export type DeckStatus = "uploading" | "parse_failed" | "draft" | "published";
export type ShareStatus = "active" | "revoked";
export type EventType =
  | "opened"
  | "slide_viewed"
  | "question_asked"
  | "escalated"
  | "completed";
export type NotificationChannel = "email";
export type NotificationStatus = "sent" | "failed";

export interface Profile {
  id: string; // = auth.users.id
  name: string | null;
  google_id: string | null;
  narration_prompt: string | null; // custom override for lib/prompts.ts's DEFAULT_NARRATION_INSTRUCTIONS
  created_at: string;
  updated_at: string;
}

export interface Deck {
  id: string;
  user_id: string;
  title: string;
  status: DeckStatus;
  source_file_url: string | null;
  last_viewed_slide_index: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Slide {
  id: string;
  deck_id: string;
  order_index: number;
  title: string;
  bullets: string[];
  image_path: string | null;
  thumb_path: string | null;
  avatar_video_path: string | null; // lib/avatarVideo.ts (D-ID) — not wired into any UI yet
}

export interface ScriptVersion {
  id: string;
  deck_id: string;
  is_published: boolean;
  narration: { slide_id: string; text: string }[];
  created_at: string;
}

export interface Share {
  id: string;
  deck_id: string;
  token: string;
  script_version_id: string;
  status: ShareStatus;
  created_at: string;
}

export interface Session {
  id: string;
  share_id: string;
  opened_at: string;
  last_seen_at: string;
  completed: boolean;
}

export interface DeckEvent {
  id: string;
  session_id: string;
  type: EventType;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Question {
  id: string;
  session_id: string;
  text: string;
  answer_text: string | null;
  escalated: boolean;
  confidence: number | null;
  slide_ref: number | null;
  bullet_ref: number | null;
  created_at: string;
}
