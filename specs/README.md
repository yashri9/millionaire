# Specs

Plain-English feature specs are the **source of truth** for what to build.

## Who writes these
Non-technical operators edit these files. Agents implement against them.

## Rules
1. One feature per file under a domain folder (`decks/`, `auth/`, `recipient/`).
2. Write in short sentences. Prefer "Given / When / Then" acceptance checks.
3. No implementation details (no React, no SQL, no file paths) unless naming a user-visible screen.
4. When behavior changes, update the spec **before** or **with** the code change.
5. Agents must not invent product behavior that contradicts an open spec.

## Template

```md
# Feature name

## Goal
One paragraph: who it's for and what success looks like.

## Screens / entry points
- Where the user starts

## Flow
1. Step
2. Step

## Acceptance
- Given … When … Then …
```

## Index
| Spec | Status |
|------|--------|
| [decks/upload-and-parse.md](./decks/upload-and-parse.md) | active |
| [decks/edit-and-narrate.md](./decks/edit-and-narrate.md) | active |
| [decks/publish-and-share.md](./decks/publish-and-share.md) | active |
| [recipient/player-and-ask.md](./recipient/player-and-ask.md) | active |
| [auth/signup-login.md](./auth/signup-login.md) | active |
