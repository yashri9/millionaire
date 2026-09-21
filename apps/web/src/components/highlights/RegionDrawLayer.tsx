"use client";

import { useEffect, useRef, useState } from "react";

export type RegionShape = "rect" | "square" | "oval";

export type DrawnRegion = {
  shape: RegionShape;
  bbox: { x: number; y: number; w: number; h: number }; // 0-100 percent
  snappedTo?: string;
  label: string;
};

type Props = {
  active: boolean;
  shape: RegionShape;
  onCommit: (r: DrawnRegion) => void;
  onCancel: () => void;
};

type Point = { x: number; y: number };

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function shapeLabel(shape: RegionShape) {
  if (shape === "square") return "square";
  if (shape === "oval") return "oval";
  return "rectangle";
}

/** Build a bbox from origin + current pointer; square locks equal sides. */
function bboxFromDrag(origin: Point, cur: Point, shape: RegionShape) {
  let x = Math.min(origin.x, cur.x);
  let y = Math.min(origin.y, cur.y);
  let w = Math.abs(cur.x - origin.x);
  let h = Math.abs(cur.y - origin.y);

  if (shape === "square") {
    const side = Math.max(w, h);
    if (cur.x < origin.x) x = origin.x - side;
    else x = origin.x;
    if (cur.y < origin.y) y = origin.y - side;
    else y = origin.y;
    w = side;
    h = side;
  }

  if (x < 0) {
    w += x;
    x = 0;
  }
  if (y < 0) {
    h += y;
    y = 0;
  }
  if (x + w > 100) w = 100 - x;
  if (y + h > 100) h = 100 - y;
  if (shape === "square") {
    const side = Math.min(w, h);
    w = side;
    h = side;
  }

  return {
    x: clamp(x, 0, 100),
    y: clamp(y, 0, 100),
    w: Math.max(0, w),
    h: Math.max(0, h),
  };
}

export function RegionDrawLayer({ active, shape, onCommit, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);

  useEffect(() => {
    if (!active) {
      setOrigin(null);
      setCurrent(null);
    }
  }, [active]);

  if (!active) return null;

  const toLocal = (e: React.PointerEvent) => {
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100),
      y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100),
    };
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toLocal(e);
    setOrigin(p);
    setCurrent(p);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!origin) return;
    setCurrent(toLocal(e));
  };

  const onUp = () => {
    if (!origin || !current) {
      onCancel();
      setOrigin(null);
      setCurrent(null);
      return;
    }
    const raw = bboxFromDrag(origin, current, shape);
    setOrigin(null);
    setCurrent(null);

    if (raw.w < 1.5 || raw.h < 1.5) {
      onCancel();
      return;
    }

    const el = ref.current!;
    const containerRect = el.getBoundingClientRect();
    const containerArea = Math.max(1, containerRect.width * containerRect.height);
    const targets = Array.from(
      el.parentElement?.querySelectorAll<HTMLElement>("[data-slide-element]") ?? [],
    );
    let best: {
      pct: { x: number; y: number; w: number; h: number };
      label: string;
      overlap: number;
    } | null = null;
    const drawnAbs = {
      x: containerRect.left + (raw.x / 100) * containerRect.width,
      y: containerRect.top + (raw.y / 100) * containerRect.height,
      r: containerRect.left + ((raw.x + raw.w) / 100) * containerRect.width,
      b: containerRect.top + ((raw.y + raw.h) / 100) * containerRect.height,
    };
    const drawnArea = Math.max(1, (drawnAbs.r - drawnAbs.x) * (drawnAbs.b - drawnAbs.y));

    for (const t of targets) {
      const key = t.dataset.slideElement ?? "";
      // Never snap to the full slide image / page — that expands the highlight
      // to 100% of the stage (especially on a second draw over the page).
      if (key === "page" || key === "slide") continue;

      const tr = t.getBoundingClientRect();
      const targetArea = tr.width * tr.height;
      // Skip near-full-bleed targets (effectively the whole canvas)
      if (targetArea / containerArea > 0.7) continue;

      const ox = Math.max(0, Math.min(drawnAbs.r, tr.right) - Math.max(drawnAbs.x, tr.left));
      const oy = Math.max(0, Math.min(drawnAbs.b, tr.bottom) - Math.max(drawnAbs.y, tr.top));
      const overlap = ox * oy;
      // Require meaningful coverage of the *drawn* region, not of the target
      if (overlap < drawnArea * 0.5) continue;
      if (overlap > targetArea * 0.35 && (!best || overlap > best.overlap)) {
        const pad = 1.5;
        let pct = {
          x: Math.max(0, ((tr.left - containerRect.left) / containerRect.width) * 100 - pad),
          y: Math.max(0, ((tr.top - containerRect.top) / containerRect.height) * 100 - pad),
          w: Math.min(100, (tr.width / containerRect.width) * 100 + pad * 2),
          h: Math.min(100, (tr.height / containerRect.height) * 100 + pad * 2),
        };
        // Clamp so a snap never becomes a full-slide box
        if (pct.w > 70 || pct.h > 70) continue;
        if (shape === "square") {
          const side = Math.max(pct.w, pct.h);
          pct = { ...pct, w: side, h: side };
          if (pct.x + pct.w > 100) pct.x = Math.max(0, 100 - pct.w);
          if (pct.y + pct.h > 100) pct.y = Math.max(0, 100 - pct.h);
        }
        best = {
          overlap,
          label: key || "region",
          pct,
        };
      }
    }

    // Always prefer the user's drawn box; snap only for small labeled regions
    const region: DrawnRegion = best
      ? {
          shape,
          bbox: best.pct,
          snappedTo: best.label,
          label: `Snapped to ${best.label}`,
        }
      : {
          shape,
          bbox: raw,
          label: `${shapeLabel(shape)} region`,
        };

    onCommit(region);
  };

  const preview = origin && current ? bboxFromDrag(origin, current, shape) : null;

  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        setOrigin(null);
        setCurrent(null);
      }}
      className="absolute inset-0 z-40 cursor-crosshair touch-none select-none"
      style={{ background: "oklch(0.14 0 0 / 0.06)" }}
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {preview &&
          (shape === "oval" ? (
            <ellipse
              cx={preview.x + preview.w / 2}
              cy={preview.y + preview.h / 2}
              rx={preview.w / 2}
              ry={preview.h / 2}
              fill="var(--lime)"
              fillOpacity={0.12}
              stroke="var(--lime)"
              strokeWidth={0.35}
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <rect
              x={preview.x}
              y={preview.y}
              width={preview.w}
              height={preview.h}
              fill="var(--lime)"
              fillOpacity={0.12}
              stroke="var(--lime)"
              strokeWidth={0.35}
              vectorEffect="non-scaling-stroke"
            />
          ))}
      </svg>
      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-foreground px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-background">
        Drag a {shapeLabel(shape)} · Esc to cancel
      </div>
    </div>
  );
}
