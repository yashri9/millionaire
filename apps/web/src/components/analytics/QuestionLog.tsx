import { PanelCard, PanelEmpty } from "./PanelCard";
import type { DeckQuestion } from "./analytics-types";

function askedAgo(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function QuestionLog({ questions }: { questions: DeckQuestion[] }) {
  const n = questions.length;
  return (
    <PanelCard
      title="Question log"
      subtitle="What viewers asked during playback"
      badge={`${n} ${n === 1 ? "question" : "questions"}`}
    >
      {n === 0 ? (
        <PanelEmpty
          icon={<ChatIcon />}
          title="No questions yet"
          body="Viewer questions will appear here with the answer and slide they came from."
        />
      ) : (
        <ul className="-my-4 max-h-[28rem] divide-y divide-border overflow-y-auto pr-1">
          {questions.map((q, i) => (
            <li key={`${q.created_at}-${i}`} className="py-4">
              <p className="font-semibold leading-snug">{q.text}</p>
              {q.answer_text ? (
                <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{q.answer_text}</p>
              ) : null}
              <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold ${
                    q.escalated ? "bg-[#d4764a]/12 text-[#b4581f]" : "bg-[#176bff]/10 text-[#176bff]"
                  }`}
                >
                  {q.escalated ? "Escalated" : "Answered from deck"}
                </span>
                {q.slide_ref != null ? <span>Slide {q.slide_ref}</span> : null}
                <span aria-hidden>·</span>
                <time dateTime={q.created_at} title={new Date(q.created_at).toLocaleString()}>
                  {askedAgo(q.created_at)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h7A2.5 2.5 0 0 1 16 5.5v5a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3H6.5A2.5 2.5 0 0 1 4 10.5z" />
    </svg>
  );
}
