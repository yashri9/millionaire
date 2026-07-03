"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Free, client-only "lip sync": the Web Speech API gives no audio waveform to
 * analyze (speechSynthesis just plays via the OS, no accessible stream), so
 * there's nothing to sync to at the phoneme level without a paid cloud TTS
 * that returns viseme timing. This drives mouth-open/closed off the
 * utterance's own `boundary` events (fired near each spoken word) where the
 * voice/browser supports them, and falls back to a timed flap otherwise —
 * approximate, not true lip-sync, but free and needs no new dependency.
 */
export function useTalkingMouth() {
  const [mouthOpen, setMouthOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const fallbackTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const gotBoundary = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (fallbackTimer.current) clearInterval(fallbackTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setSpeaking(false);
    setMouthOpen(false);
  }, []);

  /**
   * Wire mouth movement into an utterance. Call once, with everything the
   * caller needs on completion passed as `onDone` — set utter.onend yourself
   * afterward and this hook's handling is lost, since both write to the same
   * event property.
   */
  const attach = useCallback((utter: SpeechSynthesisUtterance, onDone?: () => void) => {
    gotBoundary.current = false;
    utter.onstart = () => {
      setSpeaking(true);
      fallbackTimer.current = setInterval(() => {
        if (!gotBoundary.current) setMouthOpen((o) => !o);
      }, 130);
    };
    utter.onboundary = (e) => {
      if (e.name !== "word") return;
      gotBoundary.current = true;
      setMouthOpen(true);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setMouthOpen(false), 90);
    };
    utter.onend = () => {
      stop();
      onDone?.();
    };
    utter.onerror = () => stop();
  }, [stop]);

  return { mouthOpen, speaking, attach, stop };
}

export function TalkingAvatar({
  speaking,
  mouthOpen,
  size = 72,
}: {
  speaking: boolean;
  mouthOpen: boolean;
  size?: number;
}) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ display: "block" }}>
      <rect x="2" y="2" width="96" height="96" rx="14" fill="var(--primary)" />
      <circle cx="35" cy="42" r="5.5" fill="#fff" />
      <circle cx="65" cy="42" r="5.5" fill="#fff" />
      {speaking && mouthOpen ? (
        <ellipse cx="50" cy="68" rx="13" ry="9" fill="#0f1720" />
      ) : (
        <rect x="35" y="66" width="30" height="5" rx="2.5" fill="#0f1720" />
      )}
    </svg>
  );
}
