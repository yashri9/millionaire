# VOXDECK (monorepo)

Upload a deck → narrate it → publish a shareable link that talks and answers questions.

> Agents: start at **[AGENTS.md](AGENTS.md)** and **[specs/](specs/)**.

## Layout

```
apps/web      Next.js studio + recipient (the product)
packages/     Shared tokens + tooling (@voxdeck/ui, tsconfig, eslint-config)
domains/      Product logic (@voxdeck/decks, narration, auth)
specs/        Plain-English feature specs (non-technical source of truth)
```

## Quick start

```powershell
npm install
npm run dev
# http://localhost:3010
```

Open http://localhost:3010/dashboard for the studio.

## Checks

```powershell
npm run typecheck
npm run test
npm run check
```

## Spec-driven development

Edit `specs/**/*.md` first. Agents implement against those files — see `specs/README.md`.
