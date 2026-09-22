"use client";

import type { SaveStatus } from "@/lib/deck-autosave";

export function SaveStatusIndicator({
  status,
  lastError,
  onRetry,
}: {
  status: SaveStatus;
  lastError?: string | null;
  onRetry?: () => void;
}) {
  if (status === "saved") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700"
        title="Latest revision persisted"
        data-save-status="saved"
      >
        <span aria-hidden className="text-emerald-600">
          ✓
        </span>
        Saved
      </span>
    );
  }

  if (status === "dirty") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700"
        data-save-status="dirty"
      >
        <span aria-hidden className="text-amber-500">
          ●
        </span>
        Unsaved changes
      </span>
    );
  }

  if (status === "saving") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        data-save-status="saving"
      >
        <span
          aria-hidden
          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
        />
        Saving…
      </span>
    );
  }

  if (status === "offline") {
    return (
      <span
        className="inline-flex max-w-[11rem] items-center gap-1.5 text-xs font-medium text-amber-800"
        title={lastError ?? undefined}
        data-save-status="offline"
      >
        Offline — Changes not synced
      </span>
    );
  }

  // error
  return (
    <span
      className="inline-flex max-w-[14rem] items-center gap-1.5 text-xs font-medium text-red-700"
      title={lastError ?? undefined}
      data-save-status="error"
    >
      <span aria-hidden>⚠</span>
      <span className="truncate">{lastError || "Unable to save"}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-1 shrink-0 rounded-full border border-red-300 px-2 py-0.5 text-[10px] font-semibold hover:bg-red-50"
        >
          Retry
        </button>
      )}
    </span>
  );
}
