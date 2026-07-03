import { ScaffoldNote } from "@/components/ScaffoldNote";

/**
 * PRD §4.10 Deck analytics. Opens, unique sessions, completion rate, per-slide
 * drop-off, question log (answered vs escalated). Polls every 15s; empty state.
 */
export default async function DeckAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <h1>Analytics</h1>
      <p className="muted">Deck: {id}</p>
      <ScaffoldNote
        section="PRD §4.10"
        todo={[
          "GET /api/decks/:id/analytics (sessions/events/questions summary)",
          "Totals + per-slide drop-off chart + full question log",
          "Poll every 15s while tab open; empty state when no activity",
        ]}
      />
    </>
  );
}
