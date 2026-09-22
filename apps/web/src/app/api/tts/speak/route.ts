import { requireUser } from "@/lib/auth";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { handle, ApiError } from "@/lib/http";
import {
  getPreset,
  toElevenLabsVoiceSettings,
  type DeckVoiceSettings,
  type VoicePresetId,
  VOICE_PRESETS,
  DEFAULT_VOICE_SETTINGS,
} from "@/lib/voice-settings";

export const maxDuration = 60;

const PRESET_IDS = new Set(VOICE_PRESETS.map((v) => v.id));

/**
 * POST /api/tts/speak — ElevenLabs TTS with character alignment when available.
 *
 * Response JSON:
 * {
 *   audioBase64: string,
 *   mimeType: "audio/mpeg",
 *   alignment: { characters, characterStartTimesSeconds, characterEndTimesSeconds } | null,
 *   source: "provider" | "none"
 * }
 */
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    if (!apiKey) {
      throw new ApiError(503, "ELEVENLABS_API_KEY is not configured");
    }

    const body = (await req.json().catch(() => ({}))) as {
      text?: string;
      voiceId?: string;
      modelId?: string;
      stability?: number;
      similarityBoost?: number;
      style?: number;
      speed?: number;
      useSpeakerBoost?: boolean;
    };

    const text = String(body.text ?? "").trim();
    if (!text) throw new ApiError(400, "text is required");
    if (text.length > 5000) throw new ApiError(400, "text too long (max 5000 chars)");

    if (body.voiceId === "browser") {
      throw new ApiError(400, "Browser voice does not use ElevenLabs TTS");
    }

    const presetId = (
      PRESET_IDS.has(body.voiceId as VoicePresetId) && body.voiceId !== "browser"
        ? body.voiceId
        : "daniel"
    ) as VoicePresetId;

    const modelId =
      typeof body.modelId === "string" && body.modelId.startsWith("eleven_")
        ? body.modelId
        : DEFAULT_VOICE_SETTINGS.modelId;

    const settings: DeckVoiceSettings = {
      voiceId: presetId,
      modelId,
      stability: clampNum(body.stability, 0, 1, DEFAULT_VOICE_SETTINGS.stability),
      similarityBoost: clampNum(
        body.similarityBoost,
        0,
        1,
        DEFAULT_VOICE_SETTINGS.similarityBoost,
      ),
      style: clampNum(body.style, 0, 1, DEFAULT_VOICE_SETTINGS.style),
      speed: clampNum(body.speed, 0.7, 1.2, DEFAULT_VOICE_SETTINGS.speed),
      useSpeakerBoost:
        typeof body.useSpeakerBoost === "boolean"
          ? body.useSpeakerBoost
          : DEFAULT_VOICE_SETTINGS.useSpeakerBoost,
    };

    const preset = getPreset(settings.voiceId);
    const voiceSettings = toElevenLabsVoiceSettings(settings);
    const client = new ElevenLabsClient({ apiKey });

    const voicePayload = {
      text,
      modelId: settings.modelId,
      outputFormat: "mp3_44100_128" as const,
      voiceSettings: {
        stability: voiceSettings.stability,
        similarityBoost: voiceSettings.similarityBoost,
        style: voiceSettings.style,
        speed: voiceSettings.speed,
        useSpeakerBoost: voiceSettings.useSpeakerBoost,
      },
    };

    try {
      const cacheKeyVoice = `${preset.elevenLabsId}:${settings.modelId}`;
      const { getTtsCachedSignedUrl, putTtsCache } = await import("@/lib/tts-storage-cache");
      const { trackPipelineEvent } = await import("@/lib/observe");
      const { withRetry } = await import("@/lib/provider-resilience");

      // Storage-backed durable cache (survives cold starts).
      const cachedUrl = await getTtsCachedSignedUrl({
        voiceId: cacheKeyVoice,
        text,
        modelId: settings.modelId,
      });
      if (cachedUrl) {
        trackPipelineEvent("tts_cache_hit", { voiceId: settings.voiceId });
        const audioRes = await fetch(cachedUrl);
        if (audioRes.ok) {
          const buf = Buffer.from(await audioRes.arrayBuffer());
          return Response.json({
            audioBase64: buf.toString("base64"),
            mimeType: "audio/mpeg",
            alignment: null,
            source: "storage-cache",
          });
        }
      }
      trackPipelineEvent("tts_cache_miss", { voiceId: settings.voiceId });

      const timed = await withRetry("elevenlabs", () =>
        client.textToSpeech.convertWithTimestamps(preset.elevenLabsId, voicePayload),
      );

      // Prefer original-text alignment; keep normalized as fallback for the client
      const primary = timed.alignment ?? null;
      const normalized = timed.normalizedAlignment ?? null;
      const alignment = primary ?? normalized;

      if (timed.audioBase64) {
        void putTtsCache({
          voiceId: cacheKeyVoice,
          text,
          modelId: settings.modelId,
          bytes: Buffer.from(timed.audioBase64, "base64"),
        });
      }

      return Response.json(
        {
          audioBase64: timed.audioBase64,
          mimeType: "audio/mpeg",
          alignment: alignment
            ? {
                characters: alignment.characters,
                characterStartTimesSeconds: alignment.characterStartTimesSeconds,
                characterEndTimesSeconds: alignment.characterEndTimesSeconds,
              }
            : null,
          normalizedAlignment: normalized
            ? {
                characters: normalized.characters,
                characterStartTimesSeconds: normalized.characterStartTimesSeconds,
                characterEndTimesSeconds: normalized.characterEndTimesSeconds,
              }
            : null,
          source: alignment ? "provider" : "none",
        },
        {
          status: 200,
          headers: { "Cache-Control": "private, max-age=300" },
        },
      );
    } catch (err: unknown) {
      const detail = extractElevenLabsDetail(err);
      if (detail?.code === "quota_exceeded") {
        throw new ApiError(
          402,
          detail.message ||
            "ElevenLabs quota exceeded. Top up credits or wait for reset.",
          "quota_exceeded",
        );
      }

      // Fall back to plain convert (audio only) if timestamps endpoint fails
      try {
        const audio = await client.textToSpeech.convert(
          preset.elevenLabsId,
          voicePayload,
        );
        const reader = (audio as ReadableStream<Uint8Array>).getReader();
        const chunks: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }
        let binary = "";
        for (let i = 0; i < merged.length; i++) {
          binary += String.fromCharCode(merged[i]!);
        }
        const audioBase64 =
          typeof Buffer !== "undefined"
            ? Buffer.from(merged).toString("base64")
            : btoa(binary);

        return Response.json(
          {
            audioBase64,
            mimeType: "audio/mpeg",
            alignment: null,
            source: "none",
          },
          {
            status: 200,
            headers: { "Cache-Control": "private, max-age=300" },
          },
        );
      } catch (err2: unknown) {
        const d2 = extractElevenLabsDetail(err2) ?? detail;
        const msg =
          d2?.message ||
          (err2 instanceof Error
            ? err2.message
            : err instanceof Error
              ? err.message
              : "ElevenLabs TTS failed");
        throw new ApiError(502, msg, d2?.code);
      }
    }
  });
}

function clampNum(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function extractElevenLabsDetail(err: unknown): {
  code?: string;
  message?: string;
} | null {
  if (!err || typeof err !== "object") return null;
  const body = (err as { body?: { detail?: { code?: string; message?: string } } })
    .body;
  const detail = body?.detail;
  if (detail && typeof detail === "object") {
    return {
      code: typeof detail.code === "string" ? detail.code : undefined,
      message: typeof detail.message === "string" ? detail.message : undefined,
    };
  }
  return null;
}
