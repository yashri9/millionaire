import "server-only";

/**
 * avatarVideo.ts — real AI talking-avatar video via D-ID (paid, planned as a
 * paid-plan-only feature — the free tier keeps the 2D canvas avatar in
 * components/TalkingAvatar.tsx, which stays available regardless).
 *
 * NOT wired into any UI trigger yet — this is the backend capability only.
 * Before it can actually run end-to-end, two product decisions are still
 * open (see chat): (1) where the avatar source photo comes from (D-ID needs
 * a face image URL — DID_AVATAR_IMAGE_URL is a stopgap single default, not a
 * per-user picker), and (2) the real plan/billing gate — there's no
 * subscription system in this app yet, so "paid plan" isn't enforceable
 * server-side today.
 *
 * D-ID API shape (docs.d-id.com — verified against their docs/community
 * examples, not tested live: this sandbox has no network access to
 * api.d-id.com to run a real request):
 *   - Auth: `Authorization: Basic <base64(DID_API_KEY)>` — the key D-ID
 *     issues is already in "username:password" form; base64-encode the
 *     whole string as-is, don't split and re-join it.
 *   - POST https://api.d-id.com/talks  { source_url, script: { type: "text",
 *     input, provider? } }  ->  { id, status: "created" }
 *   - GET  https://api.d-id.com/talks/:id  -> polls to { status: "done",
 *     result_url } (or "error"). result_url is only valid ~24h, so we
 *     download and re-host it in our own Storage rather than persisting
 *     D-ID's URL.
 */

import { serverEnv } from "@/lib/env";

const DID_API_BASE = "https://api.d-id.com";
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 120_000;

export class AvatarVideoError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function assertConfigured() {
  if (!serverEnv.didApiKey) throw new AvatarVideoError(503, "DID_API_KEY is not set");
  if (!serverEnv.didAvatarImageUrl) throw new AvatarVideoError(503, "DID_AVATAR_IMAGE_URL is not set");
  return serverEnv;
}

function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(apiKey).toString("base64")}`;
}

type CreateTalkResponse = { id: string; status: string };
type GetTalkResponse = { id: string; status: "created" | "started" | "done" | "error"; result_url?: string; error?: unknown };

async function createTalk(sourceUrl: string, text: string, apiKey: string): Promise<string> {
  const res = await fetch(`${DID_API_BASE}/talks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: authHeader(apiKey),
    },
    body: JSON.stringify({
      source_url: sourceUrl,
      script: { type: "text", input: text },
    }),
  });
  if (!res.ok) {
    throw new AvatarVideoError(502, `D-ID create-talk failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as CreateTalkResponse;
  return data.id;
}

async function getTalk(talkId: string, apiKey: string): Promise<GetTalkResponse> {
  const res = await fetch(`${DID_API_BASE}/talks/${talkId}`, {
    headers: { authorization: authHeader(apiKey) },
  });
  if (!res.ok) {
    throw new AvatarVideoError(502, `D-ID get-talk failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Generates a talking-avatar video for the given narration text and returns
 * the (short-lived, ~24h) D-ID result URL. Callers that need to keep the
 * video should download it immediately (see lib/storage.ts's upload
 * helpers for the pattern used elsewhere in this app).
 */
export async function generateAvatarVideo(text: string): Promise<string> {
  const { didApiKey, didAvatarImageUrl } = assertConfigured();

  const talkId = await createTalk(didAvatarImageUrl, text, didApiKey);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const talk = await getTalk(talkId, didApiKey);
    if (talk.status === "done" && talk.result_url) return talk.result_url;
    if (talk.status === "error") {
      throw new AvatarVideoError(502, `D-ID render failed: ${JSON.stringify(talk.error ?? "unknown error")}`);
    }
  }
  throw new AvatarVideoError(504, "D-ID render timed out");
}
