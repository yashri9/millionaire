# Deck analytics

## Goal
The person who shared the deck can see where viewers stay, where they leave, and what they ask.

## Screens / entry points
- Analytics (`/decks/[id]/analytics`), linked from the dashboard and the publish page.

## Layout
1. Breadcrumb (Decks / deck title / Analytics), "Deck performance" eyebrow, title, one-line subtitle, and a "Share deck" button that goes to the publish page.
2. Scope line: numbers cover every shared link the deck has had, and refresh every 15 seconds.
3. Four stat cards: Opens, Completed, Completion rate, Questions asked.
4. Slide engagement: one row per slide with its views as a bar sized against the most-viewed slide. The slide with the largest drop from the slide before it is marked in orange.
5. Question log: each question with its answer, the slide it came from, whether it was answered from the deck or escalated, and when it was asked.

## Acceptance
- Given no opens, when the page loads, then every stat reads 0, completion rate reads "—", and both panels show an empty state.
- Given opens, when slide views fall between two slides, then only the slide with the largest drop is marked.
- Given views never fall between slides, then no slide is marked.
- Given the page is open, when 15 seconds pass, then the numbers refresh without a reload.
- Given the analytics can't be loaded, then an error with a retry action is shown.
