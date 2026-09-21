/**
 * Shared ElevenLabs audio + alignment cache.
 * Audio URL and word tokens are versioned together by voice settings + script.
 */

import { getVoiceSettings } from "@/lib/voice-store";
import {
  type DeckVoiceSettings,
  voiceSettingsKey,
  isBrowserVoice,
} from "@/lib/voice-settings";
import {
  tokensFromCharacterAlignment,
  timeTokens,
  type CharacterAlignment,
  type Token,
  type TokenTimingSource,
} from "@/lib/word-timing";

export type CachedNarration = {
  url: string;
  tokens: Token[];
  timingSource: TokenTimingSource;
  /** Fingerprint of the exact script used to generate this clip. */
  scriptFingerprint: string;
};

const cacheByKey = new Map<string, CachedNarration>();
const inflight = new Map<string, Promise<CachedNarration>>();

/** Once ElevenLabs returns quota_exceeded, stop hitting the API until reset. */
let quotaBlockedUntil = 0;

export class TtsError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, opts?: { code?: string; status?: number }) {
    super(message);
    this.name = "TtsError";
    this.code = opts?.code;
    this.status = opts?.status;
  }
  get isQuota() {
    return (
      this.code === "quota_exceeded" ||
      this.status === 402 ||
      /quota/i.test(this.message)
    );
  }
}

export function isTtsQuotaBlocked() {
  return Date.now() < quotaBlockedUntil;
}

export function clearTtsQuotaBlock() {
  quotaBlockedUntil = 0;
}

function cacheKey(script: string, voice: DeckVoiceSettings) {
  // v2: alignment-aware clips (invalidate old MP3-only / bad-map caches)
  return `v2::${voiceSettingsKey(voice)}::${script.trim()}`;
}

export function scriptContentFingerprint(script: string): string {
  let h = 0;
  const s = script.trim();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

export function getCachedNarration(
  script: string,
  voice: DeckVoiceSettings = getVoiceSettings(),
): CachedNarration | undefined {
  const key = script.trim();
  if (!key) return undefined;
  return cacheByKey.get(cacheKey(key, voice));
}

export function getCachedNarrationUrl(
  script: string,
  voice: DeckVoiceSettings = getVoiceSettings(),
): string | undefined {
  return getCachedNarration(script, voice)?.url;
}

export function hasCachedNarration(
  script: string,
  voice: DeckVoiceSettings = getVoiceSettings(),
): boolean {
  return Boolean(getCachedNarrationUrl(script, voice));
}

function base64ToBlob(b64: string, mimeType: string): Blob {
  const binary =
    typeof atob === "function"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || "audio/mpeg" });
}

export async function ensureNarrationAudio(
  script: string,
  voice: DeckVoiceSettings = getVoiceSettings(),
): Promise<string> {
  const clip = await ensureNarrationClip(script, voice);
  return clip.url;
}

/** Fetch (or reuse) audio + word alignment for a script/voice pair. */
export async function ensureNarrationClip(
  script: string,
  voice: DeckVoiceSettings = getVoiceSettings(),
): Promise<CachedNarration> {
    const text = script.trim();
  if (!text) throw new TtsError("empty script");

  if (isBrowserVoice(voice.voiceId)) {
    throw new TtsError("Browser voice selected — ElevenLabs TTS skipped", {
      code: "browser_voice",
    });
  }

  const key = cacheKey(text, voice);
  const hit = cacheByKey.get(key);
  if (hit) return hit;

  if (isTtsQuotaBlocked()) {
    throw new TtsError(
      "ElevenLabs quota exceeded. Top up credits or wait for reset.",
      { code: "quota_exceeded", status: 402 },
    );
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async (): Promise<CachedNarration> => {
    const res = await fetch("/api/tts/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voiceId: voice.voiceId,
        modelId: voice.modelId,
        stability: voice.stability,
        similarityBoost: voice.similarityBoost,
        style: voice.style,
        speed: voice.speed,
        useSpeakerBoost: voice.useSpeakerBoost,
      }),
    });
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      const code = errBody.code || (res.status === 402 ? "quota_exceeded" : undefined);
      if (code === "quota_exceeded" || res.status === 402) {
        quotaBlockedUntil = Date.now() + 10 * 60 * 1000;
      }
      throw new TtsError(errBody.error || `TTS failed (${res.status})`, {
        code,
        status: res.status,
      });
    }

    const payload = (await res.json()) as {
      audioBase64?: string;
      mimeType?: string;
      alignment?: CharacterAlignment | null;
      normalizedAlignment?: CharacterAlignment | null;
      source?: string;
    };

    if (!payload.audioBase64) throw new TtsError("TTS returned empty audio");

    const blob = base64ToBlob(payload.audioBase64, payload.mimeType || "audio/mpeg");
    if (!blob.size) throw new TtsError("TTS returned empty audio");
    const url = URL.createObjectURL(blob);

    let tokens: Token[] | null = null;
    let timingSource: TokenTimingSource = "estimated";

    if (payload.alignment) {
      tokens = tokensFromCharacterAlignment(text, payload.alignment);
    }
    if (!tokens && payload.normalizedAlignment) {
      tokens = tokensFromCharacterAlignment(text, payload.normalizedAlignment);
    }
    if (tokens) timingSource = "provider";

    if (!tokens) {
      tokens = timeTokens(text, Math.max(3, (text.split(/\s+/).length / 155) * 60));
      timingSource = "estimated";
    }
    const entry: CachedNarration = {
      url,
      tokens,
      timingSource,
      scriptFingerprint: scriptContentFingerprint(text),
    };
    cacheByKey.set(key, entry);
    return entry;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, job);
  return job;
}

/** Drop cached audio for one script under the current (or given) voice. */
export function invalidateNarrationAudio(
  script: string,
  voice: DeckVoiceSettings = getVoiceSettings(),
) {
  const text = script.trim();
  if (!text) return;
  const key = cacheKey(text, voice);
  const hit = cacheByKey.get(key);
  if (hit) {
    URL.revokeObjectURL(hit.url);
    cacheByKey.delete(key);
  }
  inflight.delete(key);
}

/** Clear every cached clip (e.g. after Apply to all / voice change). */
export function clearAllNarrationAudio() {
  for (const hit of cacheByKey.values()) {
    URL.revokeObjectURL(hit.url);
  }
  cacheByKey.clear();
  inflight.clear();
}

/**
 * Prefetch TTS for every non-empty script with the active voice settings.
 */
export async function prefetchNarrationAudio(
  scripts: string[],
  opts?: {
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
    voice?: DeckVoiceSettings;
  },
): Promise<void> {
  if (isTtsQuotaBlocked()) {
    opts?.onProgress?.(0, 0);
    return;
  }

  const voice = opts?.voice ?? getVoiceSettings();
  const unique = [...new Set(scripts.map((s) => s.trim()).filter(Boolean))];
  const missing = unique.filter((s) => {
    const k = cacheKey(s, voice);
    return !cacheByKey.has(k) && !inflight.has(k);
  });
  if (missing.length === 0) {
    opts?.onProgress?.(unique.length, unique.length);
    return;
  }

  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 3, 6));
  let done = unique.length - missing.length;
  opts?.onProgress?.(done, unique.length);

  let i = 0;
  async function worker() {
    while (i < missing.length) {
      if (isTtsQuotaBlocked()) return;
      const idx = i++;
      const script = missing[idx]!;
      try {
        await ensureNarrationClip(script, voice);
      } catch {
        /* expected when quota / network fails — UI handles fallback */
      }
      done += 1;
      opts?.onProgress?.(done, unique.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, missing.length) }, () => worker()),
  );
}
