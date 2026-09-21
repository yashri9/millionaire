# AGENTS.md — VOXDECK

Commands over essays. Update this file whenever a convention changes.

## Layout
```
apps/web     Next.js product surface (only app)
packages/    shared tooling + UI tokens (no product rules)
domains/     product logic by domain (decks, narration, auth)
specs/       plain-English feature specs (source of truth)
```

## Commands
```bash
npm install
npm run dev                 # Next app → http://localhost:3010
npm run typecheck
npm run test
npm run check               # typecheck + lint + test
```

## Spec-driven work
1. Read `specs/` for the feature before coding.
2. If behavior is unclear, update the spec first (short Given/When/Then).
3. Do not invent product behavior that contradicts an active spec.
4. Homepage marketing is out of scope unless a spec says otherwise.

## Code arrangement
- Feature folders, shallow trees. Prefer `domains/decks/src/types.ts` over dump folders.
- No giant catch-all `utils/`. Name files for what they do (`word-timing.ts`, not `helpers.ts`).
- Keep files small. Split when a file mixes unrelated jobs.
- Shared UI tokens live in `packages/ui`. Domain rules live in `domains/*`. Apps wire UI + IO.

## Safety net
- Every domain package should ship at least one small `*.test.ts`.
- Prefer `npm run check` before claiming done.
- Lint/typecheck failures block “done”; do not disable rules to greenwash.

## Surfaces
| App | Path | Role |
|-----|------|------|
| `@voxdeck/web` | `apps/web` | Next.js studio + recipient (the product) |
