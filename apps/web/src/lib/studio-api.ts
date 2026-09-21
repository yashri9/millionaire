import type { DeckSlide, StoredDeck } from "@/lib/deck-store";

export type ServerSlide = {
  id: string;
  order_index: number;
  title: string | null;
  bullets: string[] | null;
  image_url?: string | null;
  thumb_url?: string | null;
};

export type ServerDeckPayload = {
  deck: {
    id: string;
    title: string;
    status: string;
    created_at: string;
    updated_at?: string;
  };
  slides: ServerSlide[];
  script?: { narration?: { slide_id: string; text: string }[] } | null;
  share?: { token: string; url: string } | null;
};

function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(8, Math.round((words / 155) * 60));
}

export function storedDeckFromServer(payload: ServerDeckPayload): StoredDeck {
  const narration = new Map(
    (payload.script?.narration ?? []).map((n) => [n.slide_id, n.text]),
  );
  const slides: DeckSlide[] = payload.slides.map((s) => {
    const bullets = Array.isArray(s.bullets) ? s.bullets : [];
    const pageText = [s.title, ...bullets].filter(Boolean).join("\n");
    const script = narration.get(s.id) || bullets.join(". ") || s.title || "";
    return {
      n: String(s.order_index).padStart(2, "0"),
      title: s.title || `Slide ${s.order_index}`,
      script,
      essentialPoints: bullets.slice(0, 6),
      durationSec: estimateDuration(script),
      thumbnail: s.thumb_url || s.image_url || undefined,
      pageText,
    };
  });
  return {
    id: payload.deck.id,
    title: payload.deck.title,
    createdAt: Date.parse(payload.deck.created_at) || Date.now(),
    updatedAt: payload.deck.updated_at
      ? Date.parse(payload.deck.updated_at)
      : Date.now(),
    revision: 0,
    slides,
    highlights: {},
  };
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export async function loadServerDeck(id: string): Promise<ServerDeckPayload | null> {
  const { ok, data } = await fetchJson<ServerDeckPayload & { error?: string }>(
    `/api/decks/${id}`,
  );
  if (!ok) return null;
  return data;
}

export type UploadProgress = {
  phase: "upload" | "parse" | "ocr" | "narrate";
  current: number;
  total: number;
};

export async function uploadAndProcessPdf(
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<StoredDeck> {
  onProgress?.({ phase: "upload", current: 0, total: 1 });

  // Prefer the existing FormData upload route (service-role storage.upload).
  // createSignedUploadUrl can fail with "Invalid Compact JWS" when the
  // project service key is not a classic JWT; FormData avoids that path.
  const form = new FormData();
  form.append("file", file, file.name);
  const uploaded = await fetch("/api/decks", { method: "POST", body: form });
  const uploadedBody = (await uploaded.json().catch(() => ({}))) as {
    deck?: { id: string; title: string; status?: string };
    warning?: string;
    error?: string;
  };
  if (!uploaded.ok || !uploadedBody.deck?.id) {
    throw new Error(
      uploadedBody.error ||
        "Could not start upload. Sign in and try again.",
    );
  }
  if (uploadedBody.deck.status === "parse_failed") {
    throw new Error(
      uploadedBody.warning ||
        "We couldn't process this PDF. Please try again.",
    );
  }
  onProgress?.({ phase: "upload", current: 1, total: 1 });
  onProgress?.({ phase: "parse", current: 1, total: 1 });

  const deckId = uploadedBody.deck.id;
  const loaded = await loadServerDeck(deckId);
  if (!loaded?.slides?.length) {
    throw new Error("This PDF doesn't contain readable pages. Please upload another file.");
  }

  onProgress?.({ phase: "narrate", current: 0, total: loaded.slides.length });
  const slidePayload = loaded.slides.map((s) => ({
    slideNo: s.order_index,
    totalSlides: loaded.slides.length,
    fingerprint: String(s.id).slice(0, 80),
    titleText: s.title,
    bodyText: Array.isArray(s.bullets) ? s.bullets : [],
    possibleChartRegions: [],
    labeledFacts: [],
    imageCaptions: [],
    footnotes: [],
    extractionMethod: "text-layer" as const,
    ocrDetectedChart: false,
  }));
  const narrated = await fetchJson<{
    error?: string;
    results?: { slideNo: number; narration: string; coveragePoints?: string[] }[];
  }>("/api/script/generate", {
    method: "POST",
    body: JSON.stringify({
      companyName: loaded.deck.title,
      deckPurpose: "pitch",
      slides: slidePayload,
    }),
  });
  if (!narrated.ok) {
    throw new Error(narrated.data.error || "Narration generation failed. Please try again.");
  }

  const byNo = new Map((narrated.data.results ?? []).map((r) => [r.slideNo, r]));
  const narration = loaded.slides.map((s) => ({
    slide_id: s.id,
    text: byNo.get(s.order_index)?.narration || s.title || "",
  }));
  await fetchJson(`/api/decks/${deckId}/script`, {
    method: "PATCH",
    body: JSON.stringify({ narration }),
  });
  onProgress?.({ phase: "narrate", current: loaded.slides.length, total: loaded.slides.length });

  const fresh = await loadServerDeck(deckId);
  if (!fresh) throw new Error("Deck saved but could not be reloaded.");
  return storedDeckFromServer(fresh);
}

