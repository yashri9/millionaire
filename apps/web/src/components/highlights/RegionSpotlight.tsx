"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { RegionHighlight } from "@/lib/highlight-store";

/** Full-slide SVG overlay: dims everything except the region shape. */
export function RegionSpotlight({
  region,
  progress,
}: {
  region: RegionHighlight;
  progress: number;
}) {
  const ramp = 0.1;
  const dimAlpha =
    progress < ramp
      ? (progress / ramp) * 0.7
      : progress > 1 - ramp
        ? ((1 - progress) / ramp) * 0.7
        : 0.7;

  const maskId = `spotlight-${region.id}`;
  const { x, y, w, h } = region.bbox;
  const isOval = region.shape === "oval";

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
          {isOval ? (
            <ellipse
              cx={x + w / 2}
              cy={y + h / 2}
              rx={w / 2}
              ry={h / 2}
              fill="black"
            />
          ) : (
            <rect x={x} y={y} width={w} height={h} rx="1" fill="black" />
          )}
        </mask>
      </defs>
      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        fill="oklch(0.14 0 0)"
        opacity={dimAlpha}
        mask={`url(#${maskId})`}
      />
      {isOval ? (
        <ellipse
          cx={x + w / 2}
          cy={y + h / 2}
          rx={w / 2}
          ry={h / 2}
          fill="none"
          stroke="oklch(0.94 0.22 118)"
          strokeWidth={0.25}
          strokeOpacity={0.55}
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx="1"
          fill="none"
          stroke="oklch(0.94 0.22 118)"
          strokeWidth={0.25}
          strokeOpacity={0.55}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

type BBox = { x: number; y: number; w: number; h: number };
type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function clampBBox(b: BBox, lockSquare: boolean): BBox {
  let { x, y, w, h } = b;
  w = Math.max(2, w);
  h = Math.max(2, h);
  if (lockSquare) {
    const side = Math.max(w, h);
    w = side;
    h = side;
  }
  if (x + w > 100) x = 100 - w;
  if (y + h > 100) y = 100 - h;
  x = clamp(x, 0, 100 - w);
  y = clamp(y, 0, 100 - h);
  return { x, y, w, h };
}

function applyResize(
  start: BBox,
  handle: Handle,
  dx: number,
  dy: number,
  lockSquare: boolean,
): BBox {
  let { x, y, w, h } = start;
  if (handle.includes("e")) w = start.w + dx;
  if (handle.includes("w")) {
    w = start.w - dx;
    x = start.x + dx;
  }
  if (handle.includes("s")) h = start.h + dy;
  if (handle.includes("n")) {
    h = start.h - dy;
    y = start.y + dy;
  }
  if (lockSquare) {
    const side = Math.max(Math.max(2, w), Math.max(2, h));
    if (handle.includes("w")) x = start.x + start.w - side;
    if (handle.includes("n")) y = start.y + start.h - side;
    w = side;
    h = side;
  }
  return clampBBox({ x, y, w, h }, lockSquare);
}

const HANDLES: { id: Handle; style: CSSProperties; cursor: string }[] = [
  { id: "nw", style: { left: 0, top: 0, transform: "translate(-50%, -50%)" }, cursor: "nwse-resize" },
  { id: "n", style: { left: "50%", top: 0, transform: "translate(-50%, -50%)" }, cursor: "ns-resize" },
  { id: "ne", style: { right: 0, top: 0, transform: "translate(50%, -50%)" }, cursor: "nesw-resize" },
  { id: "e", style: { right: 0, top: "50%", transform: "translate(50%, -50%)" }, cursor: "ew-resize" },
  { id: "se", style: { right: 0, bottom: 0, transform: "translate(50%, 50%)" }, cursor: "nwse-resize" },
  { id: "s", style: { left: "50%", bottom: 0, transform: "translate(-50%, 50%)" }, cursor: "ns-resize" },
  { id: "sw", style: { left: 0, bottom: 0, transform: "translate(-50%, 50%)" }, cursor: "nesw-resize" },
  { id: "w", style: { left: 0, top: "50%", transform: "translate(-50%, -50%)" }, cursor: "ew-resize" },
];

/** Editable outline: select, drag to move, resize handles, ⋮ menu (Sync / Delete). */
export function RegionOutline({
  region,
  selected,
  onSelect,
  onChangeBBox,
  onDelete,
  onSync,
}: {
  region: RegionHighlight;
  selected?: boolean;
  onSelect?: () => void;
  onChangeBBox?: (bbox: BBox) => void;
  onDelete?: () => void;
  onSync?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [liveBBox, setLiveBBox] = useState<BBox | null>(null);
  const liveBBoxRef = useRef<BBox | null>(null);
  const dragRef = useRef<{
    mode: "move" | "resize";
    handle?: Handle;
    startX: number;
    startY: number;
    startBBox: BBox;
    parentW: number;
    parentH: number;
  } | null>(null);

  const bbox = liveBBox ?? region.bbox;
  const { x, y, w, h } = bbox;
  const lockSquare = region.shape === "square";
  const title =
    region.shape === "square"
      ? "Square highlight"
      : region.shape === "oval"
        ? "Oval highlight"
        : "Rectangle highlight";

  useEffect(() => {
    if (!menuOpen && !selected) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [menuOpen, selected]);

  // Sync external bbox when not dragging
  useEffect(() => {
    if (!dragRef.current) {
      liveBBoxRef.current = null;
      setLiveBBox(null);
    }
  }, [region.bbox.x, region.bbox.y, region.bbox.w, region.bbox.h]);

  function beginDrag(
    e: ReactPointerEvent,
    mode: "move" | "resize",
    handle?: Handle,
  ) {
    e.stopPropagation();
    e.preventDefault();
    onSelect?.();
    const parent = rootRef.current?.offsetParent as HTMLElement | null;
    const pr = parent?.getBoundingClientRect();
    if (!pr || pr.width < 1 || pr.height < 1) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      mode,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startBBox: { ...(liveBBoxRef.current ?? region.bbox) },
      parentW: pr.width,
      parentH: pr.height,
    };
  }

  function onPointerMove(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = ((e.clientX - d.startX) / d.parentW) * 100;
    const dy = ((e.clientY - d.startY) / d.parentH) * 100;
    let next: BBox;
    if (d.mode === "move") {
      next = clampBBox(
        {
          x: d.startBBox.x + dx,
          y: d.startBBox.y + dy,
          w: d.startBBox.w,
          h: d.startBBox.h,
        },
        false,
      );
    } else if (d.handle) {
      next = applyResize(d.startBBox, d.handle, dx, dy, lockSquare);
    } else {
      return;
    }
    liveBBoxRef.current = next;
    setLiveBBox(next);
  }

  function endDrag() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const final = liveBBoxRef.current;
    if (final && onChangeBBox) onChangeBBox(final);
  }

  return (
    <div
      ref={rootRef}
      className={`pointer-events-auto absolute z-20 border-2 ${
        selected
          ? "border-foreground bg-accent/10"
          : "border-dashed border-accent/80 bg-accent/5"
      }`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${w}%`,
        height: `${h}%`,
        borderRadius: region.shape === "oval" ? "9999px" : 4,
        cursor: selected ? "move" : "pointer",
      }}
      title={title}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-region-ui]")) return;
        beginDrag(e, "move");
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
    >
      {/* ⋮ menu */}
      <div className="absolute -right-2 -top-2 z-30" data-region-ui>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.();
            setMenuOpen((o) => !o);
          }}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-foreground bg-background text-[11px] font-bold leading-none text-foreground shadow-sm hover:bg-muted"
          aria-label="Highlight options"
          aria-expanded={menuOpen}
        >
          ⋮
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-7 z-40 min-w-[7.5rem] overflow-hidden rounded-xl border-2 border-foreground bg-background py-1 offset-shadow-sm"
            data-region-ui
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full px-3 py-2 text-left text-xs font-semibold hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                onSync?.();
              }}
            >
              Sync
            </button>
            <button
              type="button"
              className="flex w-full px-3 py-2 text-left text-xs font-semibold text-danger hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                onDelete?.();
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Resize handles when selected */}
      {selected &&
        HANDLES.map((hnd) => (
          <span
            key={hnd.id}
            data-region-ui
            onPointerDown={(e) => beginDrag(e, "resize", hnd.id)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute z-30 h-2.5 w-2.5 rounded-sm border border-foreground bg-accent"
            style={{ ...hnd.style, cursor: hnd.cursor }}
            aria-hidden
          />
        ))}
    </div>
  );
}
