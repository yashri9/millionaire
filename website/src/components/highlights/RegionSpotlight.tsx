import type { RegionHighlight } from "@/lib/highlight-store";

/** Full-slide SVG overlay: dims everything except the region shape. */
export function RegionSpotlight({ region, progress }: { region: RegionHighlight; progress: number }) {
  // dim-in for first 15%, hold, dim-out for last 15%
  const dimAlpha =
    progress < 0.15 ? (progress / 0.15) * 0.7 :
    progress > 0.85 ? ((1 - progress) / 0.15) * 0.7 :
    0.7;

  const maskId = `spotlight-${region.id}`;
  const { x, y, w, h } = region.bbox;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <mask id={maskId}>
          <rect x="0" y="0" width="100" height="100" fill="white" />
          {region.shape === "ellipse" ? (
            <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="black" />
          ) : (
            <rect x={x} y={y} width={w} height={h} rx="1" fill="black" />
          )}
        </mask>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="oklch(0.14 0 0)" opacity={dimAlpha} mask={`url(#${maskId})`} />
      {region.shape === "ellipse" ? (
        <ellipse
          cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2}
          fill="none" stroke="var(--lime)"
          strokeWidth={0.35}
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 6px var(--lime))" }}
        />
      ) : (
        <rect
          x={x} y={y} width={w} height={h} rx="1"
          fill="none" stroke="var(--lime)"
          strokeWidth={0.35}
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 6px var(--lime))" }}
        />
      )}
    </svg>
  );
}

/** Static outline of a region (edit mode). */
export function RegionOutline({ region, onDelete }: { region: RegionHighlight; onDelete?: () => void }) {
  const { x, y, w, h } = region.bbox;
  return (
    <div
      className="pointer-events-auto absolute z-20 rounded-sm border-2 border-dashed border-accent/80 bg-accent/5"
      style={{
        left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`,
        borderRadius: region.shape === "ellipse" ? "9999px" : 4,
      }}
    >
      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-foreground bg-background text-[10px] font-bold text-foreground hover:bg-danger hover:text-background"
          aria-label="Delete region highlight"
        >×</button>
      )}
    </div>
  );
}
