import { findLargestDropoff } from "@voxdeck/decks/slide-dropoff";
import { PanelCard, PanelEmpty } from "./PanelCard";
import type { SlideViews } from "./analytics-types";

const BLUE = "#176bff";
const ORANGE = "#d4764a";

export function SlideEngagement({ slides, hasOpens }: { slides: SlideViews[]; hasOpens: boolean }) {
  const maxViews = Math.max(1, ...slides.map((s) => s.views));
  const dropIndex = hasOpens ? findLargestDropoff(slides.map((s) => s.views)) : null;
  const badge = hasOpens ? `${slides.length} ${slides.length === 1 ? "slide" : "slides"}` : "No views";

  return (
    <PanelCard
      title="Slide engagement"
      subtitle="Views recorded on each slide"
      badge={badge}
      footer={
        hasOpens && slides.length > 0
          ? `Bars compare slide views to the most-viewed slide.${dropIndex != null ? " Orange marks the largest drop from one slide to the next." : ""}`
          : undefined
      }
    >
      {!hasOpens || slides.length === 0 ? (
        <PanelEmpty
          icon={<BarsIcon />}
          title="No views yet"
          body="Slide views will appear after someone opens your shared deck."
        />
      ) : (
        <ol className="grid gap-4 sm:gap-3">
          {slides.map((s, i) => {
            const isDrop = i === dropIndex;
            const pct = (s.views / maxViews) * 100;
            return (
              <li
                key={s.order_index}
                className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[2rem_minmax(0,15rem)_1fr_3rem] sm:gap-x-4"
              >
                <span className="text-xs tabular-nums text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <span className="truncate text-sm" title={s.title || "Untitled slide"}>
                  {s.title || "Untitled slide"}
                </span>
                <span
                  className="order-last col-span-2 col-start-2 h-2.5 overflow-hidden rounded-full bg-[#176bff]/10 sm:order-none sm:col-span-1 sm:col-start-auto"
                  role="img"
                  aria-label={`${s.views} views${isDrop ? ", largest drop" : ""}`}
                >
                  <span
                    className="block h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${pct}%`, background: isDrop ? ORANGE : BLUE }}
                  />
                </span>
                <span
                  className="text-right text-sm font-semibold tabular-nums"
                  style={isDrop ? { color: ORANGE } : undefined}
                >
                  {s.views}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </PanelCard>
  );
}

function BarsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="14" height="14" rx="1.5" />
      <path d="M7 6v8M10 6v8M13 6v8" />
    </svg>
  );
}
