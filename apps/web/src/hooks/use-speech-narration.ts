"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getActiveTokenIndex,
  scaleTokensToAudioDuration,
  timeTokens,
  type Token,
  type TokenTimingSource,
} from "@/lib/word-timing";
import {
  clearAllNarrationAudio,
  ensureNarrationAudio,
  ensureNarrationClip,
  getCachedNarration,
  prefetchNarrationAudio,
  TtsError,
  type CachedNarration,
} from "@/lib/tts-cache";
import { getVoiceSettings, useVoiceSettings } from "@/lib/voice-store";
import { isBrowserVoice, voiceSettingsKey } from "@/lib/voice-settings";

export {
  prefetchNarrationAudio,
  invalidateNarrationAudio,
  clearAllNarrationAudio,
  ensureNarrationClip,
  getCachedNarration,
} from "@/lib/tts-cache";

export type SpeechNarrationState = {
  speakingIdx: number;
  currentTime: number;
  duration: number;
  loading: boolean;
  error: string | null;
  tokens: Token[];
  timingSource: TokenTimingSource | null;
  playing: boolean;
};

const IDLE: SpeechNarrationState = {
  speakingIdx: -1,
  currentTime: 0,
  duration: 0,
  loading: false,
  error: null,
  tokens: [],
  timingSource: null,
  playing: false,
};

const TAP_AGAIN = "Tap Play again to start audio";

/** One persistent element so play() can run inside the same user gesture. */
let sharedAudio: HTMLAudioElement | null = null;
function getSharedAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
  }
  return sharedAudio;
}

const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let audioCtx: AudioContext | null = null;

export function unlockNarrationAudio(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return (async () => {
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AC) {
        if (!audioCtx || audioCtx.state === "closed") audioCtx = new AC();
        if (audioCtx.state === "suspended") await audioCtx.resume();
        const buffer = audioCtx.createBuffer(1, 1, 22050);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start(0);
      }
    } catch {
      try {
        const a = new Audio(SILENT_WAV);
        a.volume = 0.001;
        await a.play();
        a.pause();
      } catch {
        /* ignore */
      }
    }
  })();
}

export async function playObjectUrl(
  audio: HTMLAudioElement,
  objectUrl: string,
): Promise<void> {
  await unlockNarrationAudio();
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {
    /* ignore */
  }
  audio.src = objectUrl;
  await audio.play();
}

type Controls = {
  start: (scriptOverride?: string) => void;
  pause: () => void;
  restart: () => void;
};

/**
 * Gesture-safe narration. Call start() / pause() / restart() from the tap.
 * Audio begins inside that call — never from a later React effect.
 */
export function useSpeechNarration(
  script: string,
  onEnd?: () => void,
): SpeechNarrationState & Controls {
  const [state, setState] = useState<SpeechNarrationState>(IDLE);
  const tokensRef = useRef<Token[]>([]);
  const timingSourceRef = useRef<TokenTimingSource | null>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const scriptRef = useRef(script);
  scriptRef.current = script;
  const genRef = useRef(0);
  const rafRef = useRef(0);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voice = useVoiceSettings();
  void voiceSettingsKey(voice);

  const stopClock = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const hardStop = useCallback(() => {
    stopClock();
    genRef.current += 1;
    const audio = getSharedAudio();
    if (audio) {
      audio.onended = null;
      audio.onplaying = null;
      audio.onerror = null;
      audio.ontimeupdate = null;
      audio.pause();
    }
    utterRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [stopClock]);

  useEffect(() => () => hardStop(), [hardStop]);

  const publishFromClock = useCallback(
    (now: number, dur: number, extra: Partial<SpeechNarrationState> = {}) => {
      let useTokens = tokensRef.current;
      if (dur > 0 && useTokens.length > 0) {
        if (timingSourceRef.current === "estimated") {
          const lastEnd = useTokens[useTokens.length - 1]!.endMs / 1000;
          if (lastEnd > 0 && Math.abs(lastEnd - dur) > 0.25) {
            useTokens = timeTokens(scriptRef.current, dur);
            tokensRef.current = useTokens;
          }
        } else {
          const scaled = scaleTokensToAudioDuration(useTokens, dur);
          if (scaled !== useTokens) {
            useTokens = scaled;
            tokensRef.current = scaled;
          }
        }
      }
      const idx = getActiveTokenIndex(useTokens, now);
      setState((prev) => ({
        ...prev,
        speakingIdx: idx,
        currentTime: now,
        duration: dur,
        tokens: useTokens,
        timingSource: timingSourceRef.current,
        ...extra,
      }));
    },
    [],
  );

  const startBrowserVoice = useCallback(
    (text: string, reason: string | null) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setState((s) => ({ ...s, playing: false, error: TAP_AGAIN, loading: false }));
        return;
      }
      const settings = getVoiceSettings();
      const tokens = timeTokens(
        text,
        Math.max(3, (text.trim().split(/\s+/).length / 155) * 60),
      );
      tokensRef.current = tokens;
      timingSourceRef.current = "estimated";
      const estimatedDur =
        tokens.length > 0 ? tokens[tokens.length - 1]!.endMs / 1000 : 8;
      const started = performance.now();
      const gen = genRef.current;

      const utter = new SpeechSynthesisUtterance(text.trim());
      utter.rate = settings.speed;
      utterRef.current = utter;

      const tick = () => {
        if (gen !== genRef.current || utterRef.current !== utter) return;
        const now = Math.min(estimatedDur, (performance.now() - started) / 1000);
        publishFromClock(now, estimatedDur);
        rafRef.current = requestAnimationFrame(tick);
      };

      utter.onstart = () => {
        if (gen !== genRef.current) return;
        setState((s) => ({
          ...s,
          playing: true,
          loading: false,
          error: reason && /quota/i.test(reason) ? reason : null,
        }));
        rafRef.current = requestAnimationFrame(tick);
      };
      utter.onend = () => {
        if (gen !== genRef.current) return;
        stopClock();
        setState((s) => ({ ...s, playing: false, currentTime: 0, speakingIdx: -1 }));
        onEndRef.current?.();
      };
      utter.onerror = (ev) => {
        if (gen !== genRef.current) return;
        const err = (ev as SpeechSynthesisErrorEvent).error;
        if (err === "interrupted" || err === "canceled") return;
        stopClock();
        setState((s) => ({
          ...s,
          playing: false,
          error: err === "not-allowed" ? TAP_AGAIN : reason || TAP_AGAIN,
        }));
      };

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    },
    [publishFromClock, stopClock],
  );

  const startClip = useCallback(
    (clip: CachedNarration, gen: number) => {
      const audio = getSharedAudio();
      if (!audio) {
        setState((s) => ({ ...s, error: TAP_AGAIN, loading: false }));
        return;
      }
      tokensRef.current = clip.tokens;
      timingSourceRef.current = clip.timingSource;
      audio.onended = () => {
        if (gen !== genRef.current) return;
        stopClock();
        setState((s) => ({ ...s, playing: false, currentTime: 0, speakingIdx: -1 }));
        onEndRef.current?.();
      };
      audio.onerror = () => {
        if (gen !== genRef.current) return;
        startBrowserVoice(scriptRef.current, "Audio playback failed — using browser voice");
      };
      audio.onplaying = () => {
        if (gen !== genRef.current) return;
        setState((s) => ({ ...s, playing: true, loading: false, error: null }));
        const tick = () => {
          if (gen !== genRef.current) return;
          const dur =
            Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
          publishFromClock(audio.currentTime, dur, { playing: true, loading: false });
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      };
      if (audio.src !== clip.url) audio.src = clip.url;
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      const playResult = audio.play();
      if (playResult && typeof playResult.then === "function") {
        playResult.catch((err: unknown) => {
          if (gen !== genRef.current) return;
          const name = err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
          setState((s) => ({
            ...s,
            playing: false,
            loading: false,
            error: name === "NotAllowedError" ? TAP_AGAIN : TAP_AGAIN,
          }));
        });
      }
    },
    [publishFromClock, startBrowserVoice, stopClock],
  );

  const start = useCallback(
    (scriptOverride?: string) => {
      const text = (scriptOverride ?? scriptRef.current).trim();
      if (!text) return;
      void unlockNarrationAudio();
      hardStop();
      const gen = ++genRef.current;
      const settings = getVoiceSettings();
      setState((s) => ({ ...s, loading: false, error: null }));

      if (isBrowserVoice(settings.voiceId)) {
        startBrowserVoice(text, null);
        return;
      }

      const cached = getCachedNarration(text, settings);
      if (cached) {
        startClip(cached, gen);
        return;
      }

      setState((s) => ({
        ...s,
        playing: false,
        loading: true,
        error: "Loading voice — tap Play again when ready",
      }));
      void ensureNarrationClip(text, settings)
        .then((clip) => {
          if (gen !== genRef.current) return;
          setState((s) => ({
            ...s,
            loading: false,
            error: "Voice ready — tap Play to start",
          }));
        })
        .catch((err) => {
          if (gen !== genRef.current) return;
          const msg = err instanceof Error ? err.message : "TTS failed";
          if (!(err instanceof TtsError && err.isQuota)) {
            console.warn("[tts]", msg);
          }
          startBrowserVoice(text, msg);
        });
    },
    [hardStop, startBrowserVoice, startClip],
  );

  const pause = useCallback(() => {
    hardStop();
    setState((s) => ({ ...s, playing: false, loading: false }));
  }, [hardStop]);

  const restart = useCallback(() => {
    start(scriptRef.current);
  }, [start]);

  useEffect(() => {
    pause();
  }, [script, pause]);

  return { ...state, start, pause, restart };
}

export function usePrefetchNarration(scripts: string[]) {
  const total = scripts.map((s) => s.trim()).filter(Boolean).length;
  return { ready: 0, total, prefetching: false };
}

export async function previewVoiceSample(
  sampleText?: string,
  voice = getVoiceSettings(),
) {
  const text =
    sampleText?.trim() ||
    "This is how I'll sound walking your prospect through the deck.";
  await unlockNarrationAudio();

  if (isBrowserVoice(voice.voiceId)) {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = voice.speed;
      window.speechSynthesis.speak(utter);
      return null;
    }
    throw new Error("Browser speech not available");
  }

  try {
    const url = await ensureNarrationAudio(text, voice);
    const audio = getSharedAudio() ?? new Audio();
    await playObjectUrl(audio, url);
    return audio;
  } catch (err) {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utter);
      return null;
    }
    throw err;
  }
}

export function regenerateAllVoices(scripts: string[]) {
  clearAllNarrationAudio();
  return prefetchNarrationAudio(scripts, {
    concurrency: 3,
    voice: getVoiceSettings(),
  });
}
