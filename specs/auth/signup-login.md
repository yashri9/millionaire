# Signup and login

## Goal
Senders create a studio account or return to an existing one. Recipients never hit this flow.

## Screens / entry points
- Login (`/login`)
- Signup (`/signup`)

## Flow
1. Sender opens login or signup.
2. Sender submits email/password (or Google when configured).
3. On success, sender reaches the dashboard.

## Acceptance
- Given valid credentials, when submitted, then the dashboard loads.
- Given signup, when completed, then the sender can create decks.
- Given a recipient link, when opened, then auth screens are never required.
