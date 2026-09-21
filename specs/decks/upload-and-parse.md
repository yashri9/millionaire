# Upload and parse a deck

## Goal
A sender drops a PDF and gets a narratable deck without leaving the studio. Parsing happens on-device in design-first mode.

## Screens / entry points
- Studio → New deck (`/decks/new`)

## Flow
1. Sender opens New deck.
2. Sender drops or picks a PDF (max 25MB).
3. Studio shows progress: upload → read slides → draft scripts.
4. On success, sender lands in the editor for that deck.

## Acceptance
- Given a valid PDF under 25MB, when uploaded, then slides appear in the editor with draft narration.
- Given a non-PDF file, when uploaded, then an error explains PDF-only support.
- Given a file over 25MB, when uploaded, then an error asks for a smaller export.
- Given cancel during processing, when clicked, then the drop zone returns to idle.
