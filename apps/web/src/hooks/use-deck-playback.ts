"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeckSlide } from "@/lib/deck-store";
import { useHighlights } from "@/lib/highlight-store";
import { useHighlightScheduler } from "@/hooks/use-highlight-scheduler";
import { useSpeechNarration } from "@/hooks/use-speech-narration";
import { ensureNarrationClip, getCachedNarration } from "@/lib/tts-cache";
import { getVoiceSettings, useVoiceSettings } from "@/lib/voice-store";
import { isBrowserVoice } from "@/lib/voice-settings";
import { slideAudioSec } from "@/lib/deck-runtime";

/** How long a slide with no narration stays on screen during playback. */
const SILENT_SLIDE_SEC = 4;

/**
 * One playback engine for Rehearse and Publish (they used to carry two
 * copies of the same transport with the same bugs).
 *
 * Fixes vs the old inline code:
 * - auto-advance keeps playing (see startedTextRef in useSpeechNarration)
 * - Restart plays slide 1, not the current slide
 * - Prev/Next/jump keep playing if you were playing
 * - slides without narration are shown for a few seconds instead of
 *   silently stalling the run
 * - the next slide's voice is fetched while the current one plays, so
 *   the hand-off doesn't stop on "Loading voice — tap Play again"
 * - reaching the end sets `finished` so the page can show a next step
 */
export function useDeckPlayback({
  deckId,
  slides,
  onFinished,
}: {
  deckId: string;
  slides: DeckSlide[];
  onFinished?: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [finished, setFinished] = useState(false);
  const [silent, setSilent] = useState(false);
  const idxRef = useRef(0);
  idxRef.current = idx;
  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const silentTimer = useRef<number | null>(null);
  const endRef = useRef<() => void>(() => undefined);
  const voice = useVoiceSettings();

  useEffect(() => {
    if (idx > 0 && idx > slides.length - 1) setIdx(0);
  }, [idx, slides.length]);

  const active = slides[idx] ?? slides[0];
  const { items: highlights } = useHighlights(deckId, active?.n ?? "01");

  const narration = useSpeechNarration(active?.script ?? "", () => endRef.current());

  const clearSilent = useCallback(() => {
    if (silentTimer.current != null) window.clearTimeout(silentTimer.current);
    silentTimer.current = null;
    setSilent(false);
  }, []);

  useEffect(() => () => clearSilent(), [clearSilent]);

  const prefetch = useCallback((s?: DeckSlide) => {
    const text = s?.script?.trim();
    if (!text) return;
    const v = getVoiceSettings();
    if (isBrowserVoice(v.voiceId) || getCachedNarration(text, v)) return;
    void ensureNarrationClip(text, v).catch(() => undefined);
  }, []);

  /** Start slide i from its first word. Must be called from a tap or from onEnd. */
  const playAt = useCallback(
    (i: number) => {
      const list = slidesRef.current;
      const s = list[i];
      if (!s) return;
      clearSilent();
      setFinished(false);
      idxRef.current = i;
      setIdx(i);
      const text = s.script?.trim() ?? "";
      if (text) {
        narration.start(text);
      } else {
        narration.pause();
        setSilent(true);
        silentTimer.current = window.setTimeout(() => endRef.current(), SILENT_SLIDE_SEC * 1000);
      }
      prefetch(list[i + 1]);
    },
    [clearSilent, narration, prefetch],
  );

  endRef.current = () => {
    const next = idxRef.current + 1;
    if (next < slidesRef.current.length) {
      playAt(next);
      return;
    }
    clearSilent();
    setFinished(true);
    onFinishedRef.current?.();
  };

  const playing = narration.playing || silent;

  const pause = useCallback(() => {
    clearSilent();
    narration.pause();
  }, [clearSilent, narration]);

  const toggle = useCallback(() => {
    if (playing) pause();
    else playAt(finished ? 0 : idxRef.current);
  }, [playing, pause, playAt, finished]);

  const jump = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(slidesRef.current.length - 1, i));
      if (playing) {
        playAt(clamped);
        return;
      }
      pause();
      setFinished(false);
      idxRef.current = clamped;
      setIdx(clamped);
    },
    [playing, playAt, pause],
  );

  const restart = useCallback(() => playAt(0), [playAt]);

  /* ---- timing ---- */
  const durations = useMemo(
    () => slides.map((s) => slideAudioSec(s.script ?? "", s.durationSec ?? 0, voice)),
    // narration.duration changes when a clip lands in the cache — recompute then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slides, voice, narration.duration],
  );
  const totalDur = durations.reduce((a, b) => a + b, 0);
  const priorDur = durations.slice(0, idx).reduce((a, b) => a + b, 0);
  const elapsed = narration.currentTime;
  const slideDur = narration.duration > 0 ? narration.duration : (durations[idx] ?? 0);
  const currentAbs = finished ? totalDur : priorDur + Math.min(elapsed, slideDur || elapsed);
  const progressPct = totalDur > 0 ? (currentAbs / totalDur) * 100 : 0;

  const activeHighlights = useHighlightScheduler(
    active?.script ?? "",
    slideDur || 8,
    highlights,
    elapsed,
  );

  return {
    idx,
    active,
    slides,
    finished,
    silent,
    playing,
    loading: narration.loading,
    /** Voice status from the narration engine ("Loading voice…", fallbacks). */
    message: narration.error,
    narration,
    highlights,
    activeHighlights,
    durations,
    totalDur,
    currentAbs,
    progressPct,
    slideDur,
    toggle,
    pause,
    jump,
    next: () => jump(idxRef.current + 1),
    prev: () => jump(idxRef.current - 1),
    restart,
    setFinished,
  };
}

export type DeckPlayback = ReturnType<typeof useDeckPlayback>;
