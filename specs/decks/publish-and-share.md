# Publish and share a deck

## Goal
Sender ships a shareable link after a short pre-flight checklist.

## Screens / entry points
- Publish (`/decks/[id]/publish`)

## Flow
1. Sender reviews pre-flight checks and resolves warnings.
2. Sender chooses access (anyone / email / password), tracking, and expiry.
3. Sender publishes; progress shows stitching → link minting.
4. Sender copies the link or opens as recipient.

## Acceptance
- Given open warnings, when publish is pressed, then publish stays blocked until resolved.
- Given a clean checklist, when publish completes, then a live link can be copied.
- Given a published deck, when opened as recipient, then the player loads without login.
