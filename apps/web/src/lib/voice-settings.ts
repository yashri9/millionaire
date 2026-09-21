/**
 * Voice presets: browser (default, free) + ElevenLabs voices (opt-in, uses credits).
 */

export type VoicePresetId =
  | "browser"
  | "daniel"
  | "charlotte"
  | "george"
  | "sarah";

/** Values map 1:1 to ElevenLabs `voice_settings` (ignored for browser). */
export type DeckVoiceSettings = {
  voiceId: VoicePresetId;
  /** ElevenLabs model id */
  modelId: string;
  /** 0–1 — higher = steadier, less emotional variation */
  stability: number;
  /** 0–1 — higher = closer to the original voice sample */
  similarityBoost: number;
  /** 0–1 — exaggerates the voice’s speaking style (v2+ models) */
  style: number;
  /** 0.7–1.2 — speech rate (studio-safe range) */
  speed: number;
  /** Clarity / similarity post-process */
  useSpeakerBoost: boolean;
};

export const VOICE_PRESETS: {
  id: VoicePresetId;
  name: string;
  tag: string;
  /** Empty for browser — no ElevenLabs id */
  elevenLabsId: string;
  engine: "browser" | "elevenlabs";
}[] = [
  {
    id: "browser",
    name: "Browser voice",
    tag: "Free · device speech",
    elevenLabsId: "",
    engine: "browser",
  },
  {
    id: "daniel",
    name: "Daniel",
    tag: "ElevenLabs · Authoritative",
    elevenLabsId: "onwK4e9ZLuTAKqWW03F9",
    engine: "elevenlabs",
  },
  {
    id: "charlotte",
    name: "Charlotte",
    tag: "ElevenLabs · Conversational",
    elevenLabsId: "XB0fDUnXU5powFXDhCwa",
    engine: "elevenlabs",
  },
  {
    id: "george",
    name: "George",
    tag: "ElevenLabs · Warm",
    elevenLabsId: "JBFqnCBsd6RMkjVDRZzb",
    engine: "elevenlabs",
  },
  {
    id: "sarah",
    name: "Sarah",
    tag: "ElevenLabs · Soft",
    elevenLabsId: "EXAVITQu4vr4xnSDxMaL",
    engine: "elevenlabs",
  },
];

/** Default = browser so ElevenLabs credits are not used unless chosen. */
export const DEFAULT_VOICE_SETTINGS: DeckVoiceSettings = {
  voiceId: "browser",
  modelId: "eleven_multilingual_v2",
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0.0,
  speed: 1.0,
  useSpeakerBoost: true,
};

export const VOICE_SAMPLE = "Hi — this is your deck voice.";

export function getPreset(id: VoicePresetId) {
  return VOICE_PRESETS.find((v) => v.id === id) ?? VOICE_PRESETS[0]!;
}

export function isBrowserVoice(id: VoicePresetId | string): boolean {
  return id === "browser";
}

export function isElevenLabsVoice(id: VoicePresetId | string): boolean {
  return !isBrowserVoice(id);
}

/** Pass-through for the API (already in ElevenLabs units). */
export function toElevenLabsVoiceSettings(s: DeckVoiceSettings) {
  return {
    stability: clamp(s.stability, 0, 1),
    similarityBoost: clamp(s.similarityBoost, 0, 1),
    style: clamp(s.style, 0, 1),
    speed: clamp(s.speed, 0.7, 1.2),
    useSpeakerBoost: Boolean(s.useSpeakerBoost),
  };
}

export function formatPct01(n: number) {
  return `${Math.round(clamp(n, 0, 1) * 100)}%`;
}

export function formatSpeed(n: number) {
  return `${clamp(n, 0.7, 1.2).toFixed(2)}×`;
}

/** Cache / request fingerprint. */
export function voiceSettingsKey(s: DeckVoiceSettings): string {
  return [
    s.voiceId,
    s.modelId,
    `st${s.stability.toFixed(2)}`,
    `sim${s.similarityBoost.toFixed(2)}`,
    `sty${s.style.toFixed(2)}`,
    `sp${s.speed.toFixed(2)}`,
    s.useSpeakerBoost ? "sb1" : "sb0",
  ].join("|");
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
