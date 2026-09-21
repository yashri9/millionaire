"use client";

import { useEffect, useRef, useState } from "react";
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
  /** Active word index for caption highlight (−1 when idle / before first word). */
  speakingIdx: number;
  /** Seconds into the current clip (audio-synced). */
  currentTime: number;
  /** Clip length in seconds once known. */
  duration: number;
  loading: boolean;
  error: string | null;
  /** Word tokens aligned to this clip (provider or estimated). */
  tokens: Token[];
  timingSource: TokenTimingSource | null;
};

const IDLE: SpeechNarrationState = {
  speakingIdx: -1,
  currentTime: 0,
  duration: 0,
  loading: false,
  error: null,
  tokens: [],
  timingSource: null,
};

/** Tiny silent WAV — used only if AudioContext unlock fails. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let audioCtx: AudioContext | null = null;

/**
 * Call from pointerdown/click (same user gesture) so later `audio.play()` is allowed
 * after an await (TTS fetch). Safe to call repeatedly.
 */
export function unlockNarrationAudio(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  return (async () => {
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AC) {
        if (!audioCtx || audioCtx.state === "closed") {
          audioCtx = new AC();
        }
        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }
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
        /* gesture may still cover HTMLAudioElement.play after fetch */
      }
    }
  })();
}

/** Play an object URL on an HTMLAudioElement, waiting until it can start. */
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

  if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        // Try play anyway — blob URLs are often ready enough.
        resolve();
      }, 8000);
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Audio failed to load"));
      };
      const cleanup = () => {
        window.clearTimeout(timer);
        audio.removeEventListener("canplaythrough", onReady);
        audio.removeEventListener("canplay", onReady);
        audio.removeEventListener("error", onError);
      };
      audio.addEventListener("canplaythrough", onReady, { once: true });
      audio.addEventListener("canplay", onReady, { once: true });
      audio.addEventListener("error", onError, { once: true });
      audio.load();
    });
  }

  await audio.play();
}

/**
 * Speaks a script via ElevenLabs TTS (cached object URLs + voice settings).
 * Falls back to speechSynthesis if TTS fails so Play never goes silent.
 * `currentTime` is the audio clock; `speakingIdx` is derived from alignment tokens.
 */
export function useSpeechNarration(
  script: string,
  playing: boolean,
  onEnd?: () => void,
): SpeechNarrationState {
  const [state, setState] = useState<SpeechNarrationState>(IDLE);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tokensRef = useRef<Token[]>([]);
  const timingSourceRef = useRef<TokenTimingSource | null>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const voice = useVoiceSettings();
  const voiceKey = voiceSettingsKey(voice);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let fallbackUtterance: SpeechSynthesisUtterance | null = null;

    function stopAudio() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      const a = audioRef.current;
      if (a) {
        a.onended = null;
        a.ontimeupdate = null;
        a.onerror = null;
        a.onloadedmetadata = null;
        a.pause();
        a.removeAttribute("src");
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      fallbackUtterance = null;
    }

    stopAudio();
    tokensRef.current = [];
    timingSourceRef.current = null;
    setState(IDLE);

    if (!playing || !script.trim()) return;

    const settings = getVoiceSettings();

    function publishFromClock(now: number, dur: number, error: string | null = null) {
      let useTokens = tokensRef.current;

      if (dur > 0 && useTokens.length > 0) {
        if (timingSourceRef.current === "estimated") {
          const lastEnd = useTokens[useTokens.length - 1]!.endMs / 1000;
          if (lastEnd > 0 && Math.abs(lastEnd - dur) > 0.25) {
            useTokens = timeTokens(script, dur);
            tokensRef.current = useTokens;
          }
        } else {
          // Provider times can drift from decoded MP3 duration — scale to match
          const scaled = scaleTokensToAudioDuration(useTokens, dur);
          if (scaled !== useTokens) {
            useTokens = scaled;
            tokensRef.current = scaled;
          }
        }
      }

      const idx = getActiveTokenIndex(useTokens, now);
      setState((prev) => {
        // Skip redundant React work when the active word hasn't changed
        if (
          prev.speakingIdx === idx &&
          Math.abs(prev.currentTime - now) < 0.04 &&
          prev.duration === dur &&
          prev.loading === false &&
          prev.error === error &&
          prev.tokens === useTokens
        ) {
          return prev;
        }
        return {
          speakingIdx: idx,
          currentTime: now,
          duration: dur,
          loading: false,
          error,
          tokens: useTokens,
          timingSource: timingSourceRef.current,
        };
      });
    }

    function syncFromAudio(audio: HTMLAudioElement) {
      const dur =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : 0;
      publishFromClock(audio.currentTime, dur);
    }

    function tickAudio(audio: HTMLAudioElement) {
      if (cancelled) return;
      syncFromAudio(audio);
      raf = requestAnimationFrame(() => tickAudio(audio));
    }

    function speakFallback(reason: string) {
      if (cancelled) return;
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setState({ ...IDLE, error: reason });
        onEndRef.current?.();
        return;
      }

      const tokens = timeTokens(
        script,
        Math.max(3, (script.trim().split(/\s+/).length / 155) * 60),
      );
      tokensRef.current = tokens;
      timingSourceRef.current = "estimated";
      const estimatedDur =
        tokens.length > 0 ? tokens[tokens.length - 1]!.endMs / 1000 : 8;
      const started = performance.now();

      const utter = new SpeechSynthesisUtterance(script.trim());
      utter.rate = settings.speed;
      fallbackUtterance = utter;

      const tickFallback = () => {
        if (cancelled || fallbackUtterance !== utter) return;
        const now = Math.min(estimatedDur, (performance.now() - started) / 1000);
        publishFromClock(
          now,
          estimatedDur,
          reason && reason.includes("quota") ? reason : null,
        );
        raf = requestAnimationFrame(tickFallback);
      };

      utter.onend = () => {
        if (cancelled) return;
        if (raf) cancelAnimationFrame(raf);
        setState({ ...IDLE, tokens: tokensRef.current, timingSource: "estimated" });
        onEndRef.current?.();
      };
      utter.onerror = (ev) => {
        if (cancelled) return;
        const err = (ev as SpeechSynthesisErrorEvent).error;
        if (err === "interrupted" || err === "canceled") return;
        if (raf) cancelAnimationFrame(raf);
        setState({
          ...IDLE,
          error: reason || null,
          tokens: tokensRef.current,
          timingSource: "estimated",
        });
        onEndRef.current?.();
      };

      publishFromClock(0, estimatedDur, reason && reason.includes("quota") ? reason : null);
      raf = requestAnimationFrame(tickFallback);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    }

    async function run() {
      setState((s) => ({ ...s, loading: true, error: null }));
      await unlockNarrationAudio();
      if (cancelled) return;

      // Default path: free device speech — never hits ElevenLabs
      if (isBrowserVoice(settings.voiceId)) {
        speakFallback("");
        return;
      }

      try {
        const clip = await ensureNarrationClip(script, settings);
        if (cancelled) return;

        tokensRef.current = clip.tokens;
        timingSourceRef.current = clip.timingSource;

        const audio = new Audio(clip.url);
        audio.preload = "auto";
        audioRef.current = audio;

        audio.onended = () => {
          if (cancelled) return;
          if (raf) cancelAnimationFrame(raf);
          setState({
            ...IDLE,
            tokens: tokensRef.current,
            timingSource: timingSourceRef.current,
          });
          onEndRef.current?.();
        };
        audio.onerror = () => {
          if (cancelled) return;
          stopAudio();
          speakFallback("Audio playback failed — using browser voice");
        };
        audio.onloadedmetadata = () => {
          if (!cancelled) syncFromAudio(audio);
        };

        try {
          await audio.play();
        } catch {
          await unlockNarrationAudio();
          if (cancelled) return;
          await audio.play();
        }

        if (cancelled) {
          audio.pause();
          return;
        }
        tickAudio(audio);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "TTS failed";
        const quiet =
          err instanceof TtsError ? err.isQuota : /quota/i.test(msg);
        if (!quiet) {
          console.warn("[tts]", msg);
        }
        speakFallback(msg);
      }
    }

    void run();

    return () => {
      cancelled = true;
      stopAudio();
    };
  }, [script, playing, voiceKey]);

  return state;
}

/** Prefetch TTS for a list of slide scripts with the active voice. */
export function usePrefetchNarration(scripts: string[]) {
  // Auto-prefetch of every slide burns ElevenLabs credits quickly.
  // Active-slide warm-cache lives in useSpeechNarration instead.
  const total = scripts.map((s) => s.trim()).filter(Boolean).length;
  return { ready: 0, total, prefetching: false };
}

/** Preview a short line with the selected (or given) voice. */
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
    const audio = new Audio();
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
