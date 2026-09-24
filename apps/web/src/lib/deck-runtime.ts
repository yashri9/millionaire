import type { DeckSlide } from "@/lib/deck-store";
import { getCachedNarration } from "@/lib/tts-cache";
import type { DeckVoiceSettings } from "@/lib/voice-settings";

/** m:ss for runtimes and the playhead. */
export function fmt(s: number) {
  const n = Math.max(0, Math.floor(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

/**
 * Real audio length when the narration clip is cached, otherwise the slide's
 * planned duration. Shared by Rehearse and Publish so both screens show the
 * same runtime (they used to disagree: Rehearse summed durationSec only).
 */
export function slideAudioSec(
  script: string,
  fallback: number,
  voice?: DeckVoiceSettings,
) {
  const cached = getCachedNarration(script, voice);
  const last = cached?.tokens[cached.tokens.length - 1];
  const sec = last ? last.endMs / 1000 : 0;
  return Number.isFinite(sec) && sec > 0.2 ? sec : fallback;
}

export function deckRuntimeSec(slides: DeckSlide[], voice?: DeckVoiceSettings) {
  return slides.reduce(
    (a, s) => a + slideAudioSec(s.script ?? "", s.durationSec ?? 0, voice),
    0,
  );
}

export function slidesMissingNarration(slides: DeckSlide[]) {
  return slides.filter((s) => !s.script?.trim());
}

/* ---- "Rehearsed" marker: set when the owner watches to the last slide ---- */

const KEY_REHEARSED = (deckId: string) => `voxdeck:rehearsed:${deckId}`;

export function markRehearsed(deckId: string, revision: number) {
  try {
    localStorage.setItem(KEY_REHEARSED(deckId), String(revision));
  } catch {
    /* ignore quota */
  }
}

/** Revision the owner last watched end-to-end, or null. */
export function getRehearsedRevision(deckId: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY_REHEARSED(deckId));
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}
