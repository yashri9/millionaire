import { ScaffoldNote } from "@/components/ScaffoldNote";

/**
 * PRD §4.5 New deck — upload. Accepts .pptx/.pdf, max 25MB, async parse job,
 * parsed-preview confirmation BEFORE script generation.
 */
export default function NewDeckPage() {
  return (
    <>
      <h1>New deck</h1>
      <div
        className="card"
        style={{
          border: "2px dashed var(--line)",
          textAlign: "center",
          padding: 48,
        }}
      >
        <p className="muted">Drop a .pptx or .pdf here (max 25MB)</p>
        <input type="file" accept=".pptx,.pdf" />
      </div>
      <ScaffoldNote
        section="PRD §4.5"
        todo={[
          "Client-side reject unsupported type / >25MB before upload",
          "POST /api/decks → store file, enqueue parse job, show ‘Parsing…’ progress",
          "Poll GET /api/decks/:id; on success show parsed preview + ‘Looks good, generate script’",
          "No-text slides → per-slide manual entry; parse crash → Upload failed + retry",
        ]}
      />
    </>
  );
}
