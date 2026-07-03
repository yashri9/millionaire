"use client";

import { useRef, useState } from "react";

// Mirrors lib/parse.ts's validateUpload — this is just a fast client-side
// pre-check to avoid an upload round-trip; the server re-validates for real,
// so if you change one, change the other.
const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = [".pptx", ".pdf"];

function validate(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (!ACCEPT.some((e) => lower.endsWith(e))) return `Unsupported file type. Accepted: ${ACCEPT.join(", ")}`;
  if (file.size > MAX_BYTES) return "File too large (max 25MB).";
  return null;
}

/**
 * PRD §4.5 New deck — upload. Accepts .pptx/.pdf, max 25MB. Parsing runs
 * inline in the POST /api/decks request (see lib/parse.ts); this page shows a
 * spinner for that duration rather than polling a background job.
 */
export default function NewDeckPage() {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    const validationError = validate(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/decks", { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setUploading(false);
      setError(data?.error ?? "Upload failed. Try again.");
      return;
    }
    window.location.href = `/decks/${data.deck.id}/edit`;
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload(file);
  }

  return (
    <>
      <h1>New deck</h1>
      <div
        className="card"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "var(--primary)" : "var(--line)"}`,
          textAlign: "center",
          padding: 48,
          cursor: uploading ? "default" : "pointer",
        }}
      >
        {uploading ? (
          <p className="muted">Uploading and parsing…</p>
        ) : (
          <p className="muted">Drop a .pptx or .pdf here (max 25MB), or click to choose a file</p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pptx,.pdf"
          onChange={onPick}
          disabled={uploading}
          style={{ display: "none" }}
        />
      </div>
      {error && <p className="muted" style={{ color: "#b3261e", marginTop: 12 }}>{error}</p>}
    </>
  );
}
