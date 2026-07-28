import { useEffect, useMemo } from "react";
import { tokenize } from "@/lib/word-timing";

type Props = {
  open: boolean;
  script: string;
  /** Optional character range to visually indicate the target phrase (text highlights) */
  phraseRange?: { start: number; end: number };
  /** Optional label describing the target (region highlights) */
  targetLabel?: string;
  onPick: (triggerWordIndex: number) => void;
  onCancel: () => void;
};

export function TriggerPicker({ open, script, phraseRange, targetLabel, onPick, onCancel }: Props) {
  const tokens = useMemo(() => tokenize(script), [script]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-6 backdrop-blur-sm animate-rise" onClick={onCancel}>
      <div className="w-full max-w-xl rounded-2xl border-2 border-foreground bg-background p-6 offset-shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">Pick the trigger word</div>
        <div className="mt-2 font-display text-xl font-bold leading-tight tracking-tight">
          Fire the highlight <span className="text-muted-foreground">after the narrator finishes …</span>
        </div>
        {phraseRange && (
          <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="eyebrow mb-1">Phrase to highlight</div>
            <div className="font-medium">"{script.slice(phraseRange.start, phraseRange.end)}"</div>
          </div>
        )}
        {targetLabel && (
          <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="eyebrow mb-1">Region</div>
            <div className="font-medium">{targetLabel}</div>
          </div>
        )}

        <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-border bg-background p-3 text-base leading-relaxed">
          {tokens.length === 0 ? (
            <div className="text-sm text-muted-foreground">No script yet — write the narration first, then set a trigger.</div>
          ) : (
            <p className="flex flex-wrap gap-x-1.5 gap-y-1">
              {tokens.map((t) => {
                const inPhrase = phraseRange && t.start >= phraseRange.start && t.end <= phraseRange.end;
                return (
                  <button
                    key={t.index}
                    onClick={() => onPick(t.index)}
                    className={`rounded px-1 transition-colors hover:bg-accent hover:text-accent-foreground ${
                      inPhrase ? "bg-accent/40" : ""
                    }`}
                  >
                    {t.text}
                  </button>
                );
              })}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Esc to cancel</span>
          <button onClick={onCancel} className="rounded-full border border-border px-3 py-1.5 font-semibold text-foreground hover:bg-muted">Cancel</button>
        </div>
      </div>
    </div>
  );
}
