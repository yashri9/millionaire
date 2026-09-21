/**
 * Shared placeholder banner used across scaffolded pages. Each page documents
 * which PRD section it maps to and what's left to build in Phase 1.
 */
export function ScaffoldNote({
  section,
  todo,
}: {
  section: string;
  todo: string[];
}) {
  return (
    <div className="card" style={{ marginTop: 20 }}>
      <span className="todo">SCAFFOLD · {section}</span>
      <p className="muted" style={{ marginBottom: 6 }}>
        This screen is scaffolded. Phase 1 TODO:
      </p>
      <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
        {todo.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
