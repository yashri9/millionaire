import { useEffect, useRef, useState } from "react";

type Props = {
  /** Container whose descendant text will be scanned for `phrase` */
  containerRef: React.RefObject<HTMLElement | null>;
  phrase: string;
  /** 0..1 — width scaled from 0→1 across the swipe */
  progress: number;
  active: boolean;
};

type Rect = { top: number; left: number; width: number; height: number };

/** Overlays a lime marker across the client rects of `phrase` inside container. */
export function TextMarker({ containerRef, phrase, progress, active }: Props) {
  const [rects, setRects] = useState<Rect[]>([]);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!active) { setRects([]); return; }
    const measure = () => {
      const container = containerRef.current;
      if (!container || !phrase) return;
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const cRect = container.getBoundingClientRect();
      const needle = phrase.toLowerCase();
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.textContent ?? "";
        const idx = text.toLowerCase().indexOf(needle);
        if (idx >= 0) {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + phrase.length);
          const list = Array.from(range.getClientRects()).map((r) => ({
            top: r.top - cRect.top,
            left: r.left - cRect.left,
            width: r.width,
            height: r.height,
          }));
          setRects(list);
          return;
        }
      }
      setRects([]);
    };
    // wait a frame so layout settles
    raf.current = requestAnimationFrame(measure);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", onResize);
    };
  }, [containerRef, phrase, active]);

  if (!active || rects.length === 0) return null;
  // Swipe: first 25% of progress draws the marker, rest holds
  const drawProgress = Math.min(1, progress / 0.25);
  return (
    <div className="pointer-events-none absolute inset-0 z-30" aria-hidden>
      {rects.map((r, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: r.top + r.height * 0.15,
            left: r.left,
            width: r.width * drawProgress,
            height: r.height * 0.85,
            background: "var(--lime)",
            opacity: 0.55,
            mixBlendMode: "multiply",
            borderRadius: 3,
            transition: "width 80ms linear",
          }}
        />
      ))}
    </div>
  );
}
