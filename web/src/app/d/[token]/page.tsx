import { getPublishedDeckByToken, createSession } from "@/lib/recipient";
import { createServiceClient } from "@/lib/supabase/server";
import { Player } from "./Player";

/**
 * PRD §4.12 Recipient runtime (PUBLIC — no login, token in URL only).
 * Invalid/revoked/expired token -> clean branded "link not active" page,
 * NEVER a raw 404 or stack trace (this is the one screen a prospect sees).
 */
export default async function RecipientPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getPublishedDeckByToken(token);

  if (!result.ok) {
    if (result.reason === "unconfigured") {
      return (
        <main className="wrap">
          <h1>Recipient runtime</h1>
          <p className="muted">
            Dev mode: add Supabase env + publish a deck to view a real shared link
            here. Structure and the Q&A route are already wired.
          </p>
        </main>
      );
    }
    return (
      <main className="wrap" style={{ textAlign: "center", paddingTop: 80 }}>
        <h1>This link isn&apos;t active</h1>
        <p className="muted">
          The person who shared this may have revoked or replaced it. Reach out
          to them for an updated link.
        </p>
      </main>
    );
  }

  // One session per page view (PRD §4.10 opens/completion tracking).
  const sessionId = await createSession(result.deck.shareId);
  if (sessionId) {
    await createServiceClient().from("events").insert({ session_id: sessionId, type: "opened" });
  }

  return <Player deck={result.deck} sessionId={sessionId} />;
}
