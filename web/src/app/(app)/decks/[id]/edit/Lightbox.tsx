"use client";

import { useEffect } from "react";
import type { Slide } from "./types";

export function Lightbox({
  slides,
  index,
  onClose,
  onStep,
}: {
  slides: Slide[];
  index: number;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onStep(-1);
      if (e.key === "ArrowRight") onStep(1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);

  const slide = slides[index];
  if (!slide?.image_url) return null;

  return (
    <div className="lightbox" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <button className="lb-close" onClick={onClose}>✕</button>
      <button className="lb-nav lb-prev" onClick={() => onStep(-1)}>◀</button>
      <img src={slide.image_url} alt={`Slide ${slide.order_index}`} />
      <button className="lb-nav lb-next" onClick={() => onStep(1)}>▶</button>
      <div className="lb-cap">Slide {slide.order_index} of {slides.length}</div>
    </div>
  );
}
