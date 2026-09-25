"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Silently records homepage visits that arrive with ?ref=… once per load.
 * Renders nothing.
 */
export function TrackOutboundRef() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (!ref) return;

    const key = `link_click:${pathname}:${ref}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage may be blocked; still fire once this mount
    }

    void fetch("/api/track-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref,
        path: pathname || "/",
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      }),
      keepalive: true,
    }).catch(() => {
      // Silent — tracking must never affect UX
    });
  }, [searchParams, pathname]);

  return null;
}
