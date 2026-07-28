import { useEffect, useRef, useState } from "react";
import { tokenize } from "@/lib/word-timing";

/**
 * Speaks a script via the browser SpeechSynthesis API and reports which
 * script token is *actually* being spoken right now (via the `boundary`
 * event's charIndex). This is what drives PDF word highlighting, so
 * highlights track the voice, not a time estimate.
 *
 * onEnd fires when the utterance finishes so the caller can advance slides.
 */
export function useSpeechNarration(
  script: string,
  playing: boolean,
  onEnd?: () => void,
) {
  const [speakingIdx, setSpeakingIdx] = useState(-1);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    // Reset when script changes or we stop
    window.speechSynthesis.cancel();
    setSpeakingIdx(-1);
    if (!playing || !script.trim()) return;

    const toks = tokenize(script);
    const u = new SpeechSynthesisUtterance(script);
    u.rate = 1;
    u.pitch = 1;
    utterRef.current = u;

    u.onboundary = (ev: SpeechSynthesisEvent) => {
      if (ev.name && ev.name !== "word") return;
      const off = ev.charIndex ?? 0;
      // Find token whose [start,end] contains this char offset.
      // toks are ordered; do a small linear scan (script is short per slide).
      let idx = -1;
      for (let i = 0; i < toks.length; i++) {
        if (off >= toks[i].start && off < toks[i].end + 1) { idx = i; break; }
        if (toks[i].start > off) break;
      }
      if (idx >= 0) setSpeakingIdx(idx);
    };
    u.onend = () => {
      setSpeakingIdx(-1);
      onEndRef.current?.();
    };
    u.onerror = () => setSpeakingIdx(-1);

    window.speechSynthesis.speak(u);
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [script, playing]);

  return speakingIdx;
}
