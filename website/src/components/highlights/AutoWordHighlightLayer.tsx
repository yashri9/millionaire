import { useEffect, useRef, useState } from "react";
import type { AutoWordHighlight } from "@/hooks/use-auto-word-highlights";

/**
 * Overlay lime highlight boxes over words on a PDF-rendered slide image.
 * Coordinates are 0..1 in the image's own space; we compute the object-contain
 * rect inside the container so boxes stay aligned as the stage resizes.
 */
export function AutoWordHighlightLayer({
  imgRef,
  containerRef,
  boxes,
}: {
  imgRef: React.RefObject<HTMLImageElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  boxes: AutoWordHighlight[];
}) {
  const [rect, setRect] = useState<{ left: number; top: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;

    const compute = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const iw = img.naturalWidth || 1;
      const ih = img.naturalHeight || 1;
      const scale = Math.min(cw / iw, ch / ih);
      const w = iw * scale;
      const h = ih * scale;
      setRect({ left: (cw - w) / 2, top: (ch - h) / 2, w, h });
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    if (img.complete) compute();
    else img.addEventListener("load", compute);
    return () => {
      ro.disconnect();
      img.removeEventListener("load", compute);
    };
  }, [imgRef, containerRef]);

  if (!rect || boxes.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: rect.left, top: rect.top, width: rect.w, height: rect.h }}
      aria-hidden
    >
      {boxes.map((b) => (
        <span
          key={b.key}
          className="absolute animate-in fade-in duration-150"
          style={{
            left: `${b.x * 100}%`,
            top: `${b.y * 100}%`,
            width: `${b.w * 100}%`,
            height: `${b.h * 100}%`,
            background: "hsl(75 95% 60% / 0.55)",
            mixBlendMode: "multiply",
            borderRadius: "2px",
            boxShadow: "0 0 0 1px hsl(75 95% 45% / 0.6)",
          }}
        />
      ))}
    </div>
  );
}
