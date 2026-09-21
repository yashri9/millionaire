# CLAUDE.md — VOXDECK

Same rules as `AGENTS.md`. Keep both files in sync when conventions change.

## Do
- Build against `specs/` (plain English). Specs beat vibes.
- Put reusable product logic in `domains/<name>/src/` with a verb-noun filename.
- Put runnable UI in `apps/web`. Put tokens/tooling in `packages/`.
- Add or extend a tiny test when changing domain logic.
- Prefer editing an existing small file over growing a god-module.

## Don't
- Don't add a catch-all `utils/` or `helpers/` bucket.
- Don't put secrets in client bundles (`NEXT_PUBLIC_*` only for public values).
- Don't gate `/d/[token]` behind login.
- Don't rebuild the marketing homepage unless a spec asks for it.
- Don't duplicate design tokens across apps.
- Don't reintroduce the old FastAPI / vanilla "Deck Agent Studio" prototype.

## Quick map
- Specs → `specs/`
- Decks domain → `domains/decks`
- Narration timing → `domains/narration`
- Auth contracts → `domains/auth`
- Web app → `apps/web`

## Verify
```bash
npm run check
```
