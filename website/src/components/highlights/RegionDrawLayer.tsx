import { useRef, useState } from "react";

export type DrawnRegion = {
  shape: "rect" | "ellipse";
  bbox: { x: number; y: number; w: number; h: number }; // 0-100 percent
  snappedTo?: string;
  label: string;
};

type Props = {
  active: boolean;
  onCommit: (r: DrawnRegion) => void;
  onCancel: () => void;
};

type Point = { x: number; y: number };

export function RegionDrawLayer({ active, onCommit, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pts, setPts] = useState<Point[]>([]);
  const [drawing, setDrawing] = useState(false);

  if (!active) return null;

  const toLocal = (e: React.PointerEvent) => {
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrawing(true);
    setPts([toLocal(e)]);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    setPts((p) => [...p, toLocal(e)]);
  };
  const onUp = () => {
    if (!drawing) return;
    setDrawing(false);
    commit();
  };

  const commit = () => {
    const el = ref.current!;
    if (pts.length < 3) { onCancel(); setPts([]); return; }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.max(0, Math.min(...xs));
    const maxX = Math.min(100, Math.max(...xs));
    const minY = Math.max(0, Math.min(...ys));
    const maxY = Math.min(100, Math.max(...ys));
    const raw = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

    // Detect shape: aspect + variance suggests ellipse if user drew round
    const w = raw.w, h = raw.h;
    const aspect = w / Math.max(1, h);
    const roundish = aspect > 0.6 && aspect < 1.7;
    // Ellipse if stroke bounds are roundish AND the path is loop-like
    const shape: "rect" | "ellipse" = roundish ? "ellipse" : "rect";

    // Snap to nearest data-slide-element
    const containerRect = el.getBoundingClientRect();
    const targets = Array.from(el.parentElement?.querySelectorAll<HTMLElement>("[data-slide-element]") ?? []);
    let best: { pct: { x: number; y: number; w: number; h: number }; label: string; overlap: number } | null = null;
    const drawnAbs = {
      x: containerRect.left + (raw.x / 100) * containerRect.width,
      y: containerRect.top + (raw.y / 100) * containerRect.height,
      r: containerRect.left + ((raw.x + raw.w) / 100) * containerRect.width,
      b: containerRect.top + ((raw.y + raw.h) / 100) * containerRect.height,
    };
    for (const t of targets) {
      const tr = t.getBoundingClientRect();
      const ox = Math.max(0, Math.min(drawnAbs.r, tr.right) - Math.max(drawnAbs.x, tr.left));
      const oy = Math.max(0, Math.min(drawnAbs.b, tr.bottom) - Math.max(drawnAbs.y, tr.top));
      const overlap = ox * oy;
      const area = tr.width * tr.height;
      if (overlap > area * 0.35 && (!best || overlap > best.overlap)) {
        const pad = 1.5;
        best = {
          overlap,
          label: t.dataset.slideElement ?? "region",
          pct: {
            x: Math.max(0, ((tr.left - containerRect.left) / containerRect.width) * 100 - pad),
            y: Math.max(0, ((tr.top - containerRect.top) / containerRect.height) * 100 - pad),
            w: Math.min(100, (tr.width / containerRect.width) * 100 + pad * 2),
            h: Math.min(100, (tr.height / containerRect.height) * 100 + pad * 2),
          },
        };
      }
    }

    const region: DrawnRegion = best
      ? { shape, bbox: best.pct, snappedTo: best.label, label: `Snapped to ${best.label}` }
      : { shape, bbox: raw, label: "Freehand region" };

    setPts([]);
    onCommit(region);
  };

  // Preview bbox from current stroke
  const preview = pts.length >= 2 ? (() => {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return {
      x: Math.min(...xs), y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  })() : null;

  const pathD = pts.length > 0
    ? "M " + pts.map((p) => `${p.x} ${p.y}`).join(" L ")
    : "";

  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => { setDrawing(false); setPts([]); }}
      className="absolute inset-0 z-40 cursor-crosshair touch-none select-none"
      style={{ background: "oklch(0.14 0 0 / 0.06)" }}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={pathD} fill="none" stroke="var(--lime)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {preview && (
          <rect
            x={preview.x} y={preview.y} width={preview.w} height={preview.h}
            fill="none" stroke="var(--ink)" strokeDasharray="1 1"
            strokeWidth={0.25} vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-foreground px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-background">
        Draw around the element · Esc to cancel
      </div>
    </div>
  );
}
