"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_VOICE_SETTINGS,
  type DeckVoiceSettings,
  type VoicePresetId,
} from "@/lib/voice-settings";

type Listener = () => void;

let settings: DeckVoiceSettings = { ...DEFAULT_VOICE_SETTINGS };
/** Stable snapshot reference — only replaced when settings actually change. */
let snapshot: DeckVoiceSettings = { ...settings };
/** SSR / first paint — must be a cached constant (React requirement). */
const SERVER_SNAPSHOT: DeckVoiceSettings = { ...DEFAULT_VOICE_SETTINGS };

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

function normalize(s: DeckVoiceSettings): DeckVoiceSettings {
  return {
    ...DEFAULT_VOICE_SETTINGS,
    ...s,
    modelId: s.modelId || DEFAULT_VOICE_SETTINGS.modelId,
  };
}

export function getVoiceSettings(): DeckVoiceSettings {
  return snapshot;
}

export function setVoiceSettings(patch: Partial<DeckVoiceSettings>) {
  settings = normalize({ ...settings, ...patch });
  snapshot = settings;
  emit();
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("voxdeck:deck-dirty", {
        detail: { changeType: "voice_changed" },
      }),
    );
  }
}

export function setVoicePreset(voiceId: VoicePresetId) {
  setVoiceSettings({ voiceId });
}

export function subscribeVoiceSettings(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getServerSnapshot(): DeckVoiceSettings {
  return SERVER_SNAPSHOT;
}

export function useVoiceSettings(): DeckVoiceSettings {
  return useSyncExternalStore(
    subscribeVoiceSettings,
    getVoiceSettings,
    getServerSnapshot,
  );
}
