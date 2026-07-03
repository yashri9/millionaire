import { ScaffoldNote } from "@/components/ScaffoldNote";

/**
 * PRD §4.6 + §4.7 Script generation + editor.
 * Left: slide thumbnails. Center: slide preview + editable narration.
 * Debounced autosave (1.5s) with Saved/Saving/Save-failed indicator;
 * resume-where-you-left-off; per-slide + whole-deck regenerate (confirm).
 */
export default async function EditDeckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <h1>Edit script</h1>
      <p className="muted">Deck: {id}</p>
      <ScaffoldNote
        section="PRD §4.6–4.7"
        todo={[
          "GET /api/decks/:id → slides + latest script_version + last_viewed_slide_index (land on that slide)",
          "POST /api/decks/:id/generate-script (streams per-slide); per-slide regenerate on failure",
          "Debounced PATCH /api/decks/:id/script autosave with localStorage queue + backoff on network drop",
          "‘Regenerate all’ confirm dialog (overwrites manual edits)",
          "Publish button (disabled until verified email + every slide has narration)",
        ]}
      />
    </>
  );
}
