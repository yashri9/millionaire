"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Silently records homepage visits that arrive with ?ref=… once per browser session.
 * Renders nothing.
 */
export function RefTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (!ref) return;

    const key = `ref_click:${ref}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage blocked — still fire once this mount
    }

    void fetch("/api/track-ref", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      }),
      keepalive: true,
    }).catch(() => {
      // Silent — tracking must never affect UX
    });
  }, [searchParams]);

  return null;
}
