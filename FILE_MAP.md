# File Map — monorepo

Living index. Prefer this over hunting. Agent rules: `AGENTS.md`.

## Root
| Path | Responsibility |
|------|----------------|
| `AGENTS.md` / `CLAUDE.md` | Short agent operating rules + commands |
| `specs/` | Plain-English feature specs |
| `package.json` | npm workspaces + root scripts |
| `.cursor/rules/` | Cursor rules enforcing monorepo/spec/domain conventions |

## `apps/`
| Path | Responsibility |
|------|----------------|
| `apps/web` | Next.js VOXDECK app (`@voxdeck/web`) — only product surface |

## `packages/`
| Path | Responsibility |
|------|----------------|
| `packages/ui` | Shared design tokens (`tokens.css`) |
| `packages/tsconfig` | Shared TS configs |
| `packages/eslint-config` | Shared ESLint starter |

## `domains/`
| Path | Responsibility |
|------|----------------|
| `domains/decks` | Deck types + seed slides |
| `domains/narration` | Word timing / tokenize helpers |
| `domains/auth` | Session user contracts |

## Conventions
- Feature folders, shallow trees, no catch-all `utils/`.
- Small files named for what they do.
- Specs first; tests+lint as the merge safety net.
- No FastAPI / vanilla studio prototype — web only.
