import Link from "next/link";
import { ScaffoldNote } from "@/components/ScaffoldNote";

/**
 * PRD §4.4 Dashboard. Grid of the sender's decks with status badges + quick
 * stats; empty state; sort/filter; "Upload failed" retry affordance.
 */
export default function DashboardPage() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center" }}>
        <h1 style={{ flex: 1 }}>Your decks</h1>
        <Link className="btn" href="/decks/new">
          New Deck
        </Link>
      </div>
      <ScaffoldNote
        section="PRD §4.4"
        todo={[
          "Fetch decks via GET /api/decks (owner-scoped) and render cards (thumbnail, status, last edited, stats)",
          "Empty state when zero decks",
          "Sort by last edited (default) / status; ‘Upload failed’ badge + retry",
        ]}
      />
    </>
  );
}
