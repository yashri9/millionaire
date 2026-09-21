/**
 * Centralized deck autosave — revision sequencing + status state machine.
 * Persistence target is pluggable (localStorage today; API later).
 */

export const AUTOSAVE_DEBOUNCE_MS = 1000;

export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "offline";

export type DeckChangeType =
  | "slide_content"
  | "narration_text"
  | "narration_audio"
  | "highlight_created"
  | "highlight_updated"
  | "highlight_deleted"
  | "highlight_timing_updated"
  | "voice_changed"
  | "avatar_changed"
  | "slide_added"
  | "slide_deleted"
  | "slide_reordered"
  | "design_changed"
  | "essential_points"
  | "other";

export type PersistResult =
  | { ok: true; revision: number; updatedAt: number }
  | { ok: false; error: string; offline?: boolean };

export type DeckAutosaveSnapshot = {
  /** Monotonic local revision of the latest in-memory edits. */
  localRevision: number;
  /** Last revision confirmed by persistence. */
  savedRevision: number;
  status: SaveStatus;
  lastError: string | null;
  lastSavedAt: number | null;
};

type PersistFn = (localRevision: number) => Promise<PersistResult>;

/**
 * Pure transition helper — used by the controller and unit tests.
 * Only mark saved when the completed revision matches the latest local revision.
 */
export function applyPersistResult(
  snap: DeckAutosaveSnapshot,
  completedLocalRevision: number,
  result: PersistResult,
): DeckAutosaveSnapshot {
  if (!result.ok) {
    if (result.offline) {
      return { ...snap, status: "offline", lastError: result.error };
    }
    // Newer edits may already exist — keep dirty if local advanced past this attempt
    if (snap.localRevision > completedLocalRevision) {
      return { ...snap, status: "dirty", lastError: result.error };
    }
    return { ...snap, status: "error", lastError: result.error };
  }

  // Stale response: an older save finished after a newer edit — ignore for Saved
  if (completedLocalRevision < snap.localRevision) {
    return {
      ...snap,
      savedRevision: Math.max(snap.savedRevision, result.revision),
      status: "dirty",
      lastError: null,
    };
  }

  if (completedLocalRevision === snap.localRevision) {
    return {
      ...snap,
      savedRevision: result.revision,
      status: "saved",
      lastError: null,
      lastSavedAt: result.updatedAt,
    };
  }

  // completed > local should not happen; treat as saved of that rev
  return {
    ...snap,
    savedRevision: result.revision,
    status: "saved",
    lastError: null,
    lastSavedAt: result.updatedAt,
  };
}

export function createInitialAutosaveSnapshot(
  savedRevision = 0,
  lastSavedAt: number | null = null,
): DeckAutosaveSnapshot {
  return {
    localRevision: savedRevision,
    savedRevision,
    status: "saved",
    lastError: null,
    lastSavedAt,
  };
}

/**
 * Autosave controller with debounce, flush, and revision-safe persist completion.
 */
export class DeckAutosaveController {
  private snap: DeckAutosaveSnapshot;
  private persist: PersistFn;
  private debounceMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private pendingAfterFlight = false;
  private listeners = new Set<(s: DeckAutosaveSnapshot) => void>();
  private getOnline: () => boolean;

  constructor(
    persist: PersistFn,
    opts?: {
      debounceMs?: number;
      initial?: DeckAutosaveSnapshot;
      getOnline?: () => boolean;
    },
  ) {
    this.persist = persist;
    this.debounceMs = opts?.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
    this.snap = opts?.initial ?? createInitialAutosaveSnapshot();
    this.getOnline = opts?.getOnline ?? (() =>
      typeof navigator === "undefined" ? true : navigator.onLine !== false);
  }

  getSnapshot(): DeckAutosaveSnapshot {
    return this.snap;
  }

  subscribe(fn: (s: DeckAutosaveSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.snap);
  }

  private setSnap(next: DeckAutosaveSnapshot) {
    this.snap = next;
    this.emit();
  }

  /** Mark dirty immediately; schedule debounced save. */
  markDirty(_changeType?: DeckChangeType) {
    const nextRev = this.snap.localRevision + 1;
    this.setSnap({
      ...this.snap,
      localRevision: nextRev,
      status: this.getOnline() ? "dirty" : "offline",
      lastError: this.getOnline() ? this.snap.lastError : "Offline — Changes not synced",
    });
    this.schedule();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runPersist();
    }, this.debounceMs);
  }

  /** Cancel debounce and persist now. Resolves when latest revision is saved (or error). */
  async flush(): Promise<DeckAutosaveSnapshot> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.snap.localRevision === this.snap.savedRevision && this.snap.status === "saved") {
      return this.snap;
    }
    await this.runPersist();
    // If edits landed during flight, run again until caught up or error
    while (
      this.snap.localRevision > this.snap.savedRevision &&
      this.snap.status !== "error" &&
      this.snap.status !== "offline"
    ) {
      await this.runPersist();
    }
    return this.snap;
  }

  async retry(): Promise<DeckAutosaveSnapshot> {
    if (!this.getOnline()) {
      this.setSnap({
        ...this.snap,
        status: "offline",
        lastError: "Offline — Changes not synced",
      });
      return this.snap;
    }
    // Ensure at least one revision pending if we are in error with unsaved work
    if (this.snap.localRevision === this.snap.savedRevision && this.snap.status === "error") {
      this.setSnap({
        ...this.snap,
        localRevision: this.snap.localRevision + 1,
        status: "dirty",
      });
    } else if (this.snap.status === "error" || this.snap.status === "offline") {
      this.setSnap({ ...this.snap, status: "dirty" });
    }
    return this.flush();
  }

  private async runPersist(): Promise<void> {
    if (!this.getOnline()) {
      this.setSnap({
        ...this.snap,
        status: "offline",
        lastError: "Offline — Changes not synced",
      });
      return;
    }

    if (this.inFlight) {
      this.pendingAfterFlight = true;
      await this.inFlight;
      if (this.pendingAfterFlight) {
        this.pendingAfterFlight = false;
        if (this.snap.localRevision > this.snap.savedRevision) {
          await this.runPersist();
        }
      }
      return;
    }

    const targetRev = this.snap.localRevision;
    if (targetRev <= this.snap.savedRevision && this.snap.status === "saved") {
      return;
    }

    this.setSnap({ ...this.snap, status: "saving", lastError: null });

    this.inFlight = (async () => {
      const result = await this.persist(targetRev);
      this.setSnap(applyPersistResult(this.snap, targetRev, result));
    })();

    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
  }
}
