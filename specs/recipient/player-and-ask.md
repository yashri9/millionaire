# Recipient player and ask

## Goal
Anyone with the link watches the narrated deck and can ask grounded questions — no login.

## Screens / entry points
- Public player (`/d/[token]`)

## Flow
1. Recipient opens the share link.
2. Stage shows slides, captions, and transport controls.
3. Recipient asks a question via chips or free text.
4. Agent answers from the deck or escalates to the sender when unsure.

## Acceptance
- Given a valid token, when opened, then the player loads without asking for an account.
- Given a question, when asked, then an answer or hand-off message appears.
- Given an invalid/revoked token, when opened, then the recipient sees a clear failure — not a login wall.
