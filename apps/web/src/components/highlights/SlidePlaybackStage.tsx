"use client";

import type { RefObject } from "react";
import type { DeckSlide } from "@/lib/deck-store";
import type { Highlight } from "@/lib/highlight-store";
import { RegionSpotlight } from "@/components/highlights/RegionSpotlight";
import { TextMarker } from "@/components/highlights/TextMarker";
import { SyncedTranscript } from "@/components/highlights/SyncedTranscript";
import type { Token } from "@/lib/word-timing";
import type { ActiveHighlight } from "@/hooks/use-highlight-scheduler";

/**
 * Shared slide stage for Review / Publish preview / Published viewer.
 * Renders thumbnail (or fallback), audio-driven region spotlights, and optional text markers.
 */
export function SlidePlaybackStage({
  slide,
  slideIndex,
  activeHighlights,
  stageRef,
  captionRef,
  script,
  tokens,
  speakingIdx,
  durationSec,
  timingSource,
  showCaption = true,
}: {
  slide: DeckSlide;
  slideIndex: number;
  activeHighlights: ActiveHighlight[];
  stageRef: RefObject<HTMLDivElement | null>;
  captionRef?: RefObject<HTMLDivElement | null>;
  script: string;
  tokens: Token[];
  speakingIdx: number;
  durationSec: number;
  timingSource?: "provider" | "forced_alignment" | "estimated" | "audio" | null;
  showCaption?: boolean;
}) {
  const regionActive = activeHighlights.filter((a) => a.highlight.kind === "region");
  const textActive = activeHighlights.filter((a) => a.highlight.kind === "text");
  const transcriptSource =
    timingSource === "provider" || timingSource === "audio"
      ? ("provider" as const)
      : timingSource === "forced_alignment"
        ? ("forced_alignment" as const)
        : timingSource === "estimated"
          ? ("estimated" as const)
          : null;

  return (
    <>
      <div ref={stageRef} className="relative aspect-[16/9] bg-background">
        {slide.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.thumbnail}
            alt={slide.title}
            data-slide-element="page"
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <>
            <div className="grid-paper absolute inset-0 opacity-40" aria-hidden />
            <div className="relative flex h-full flex-col justify-between p-10">
              <div className="flex items-start justify-between">
                <div>
                  <div className="eyebrow mb-3" data-slide-element="chapter">
                    Chapter {slide.n}
                  </div>
                  <div
                    data-slide-element="title"
                    className="font-display text-6xl font-bold leading-[0.9] tracking-tighter"
                  >
                    {slide.title}
                  </div>
                </div>
                <div
                  className="eyebrow text-right text-muted-foreground"
                  data-slide-element="brand"
                >
                  Scapia · 2026
                </div>
              </div>
              <div data-slide-element="chart" className="flex items-end gap-1.5">
                {[40, 60, 80, 55, 90, 70, 100, 65, 80, 45, 60, 85].map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${h * 0.7}px` }}
                    className={`flex-1 rounded-t transition-colors ${
                      i === slideIndex + 4 ? "bg-accent" : "bg-foreground/80"
                    }`}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {regionActive.map((a) => (
          <RegionSpotlight
            key={a.highlight.id}
            region={a.highlight as Extract<Highlight, { kind: "region" }>}
            progress={a.progress}
          />
        ))}

        {textActive.map((a) => (
          <TextMarker
            key={a.highlight.id + "-slide"}
            containerRef={stageRef}
            phrase={(a.highlight as Extract<Highlight, { kind: "text" }>).text}
            progress={a.progress}
            active
          />
        ))}
      </div>

      {showCaption && (
        <div ref={captionRef} className="relative border-t border-border bg-chalk/40 px-6 py-4">
          <div className="eyebrow mb-2">Narration</div>
          <SyncedTranscript
            script={script}
            tokens={tokens}
            speakingIdx={speakingIdx}
            durationSec={durationSec}
            timingSource={transcriptSource}
          />
          {textActive.map((a) =>
            captionRef ? (
              <TextMarker
                key={a.highlight.id + "-caption"}
                containerRef={captionRef}
                phrase={(a.highlight as Extract<Highlight, { kind: "text" }>).text}
                progress={a.progress}
                active
              />
            ) : null,
          )}
        </div>
      )}
    </>
  );
}
