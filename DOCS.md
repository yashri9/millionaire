# Deck Agent — Universal Docs

The single source of truth for **what this project does, how the pieces fit
together, and where every feature lives**. Read this before touching the code.

---

## 1. What is Deck Agent?

Deck Agent turns a static sales deck into an **interactive, narrated, shareable
experience**, and answers prospect questions using only the deck's own content —
handing off to a human rep when it isn't confident.

The flow in one line:

> Upload a deck → make it talk → publish a link anyone can watch and question.

Three things make it useful:

1. **Any deck in** — Upload PDF, PPTX, or PPT. Pages are rendered to images and
   their text is extracted server-side.
2. **Grounded narration + Q&A** — An LLM writes the spoken script and answers
   questions using *only* the deck text (no invented numbers or promises).
3. **Smart escalation** — When a question can't be answered from the deck, the
   agent hands off to the named rep instead of guessing.

---

## 2. Architecture at a glance

This is a small **full-stack** app (it can't be static, because rendering
PPT/PPTX and hosting a shareable link both need a server).

```
Browser (Studio)                 Backend (FastAPI, Python)              Browser (Viewer)
─────────────────                ──────────────────────────            ─────────────────
index.html / studio.js  ──POST /api/decks──►  upload → LibreOffice→PDF
  drag & drop a deck                          → PyMuPDF renders pages
  thumbnails + enlarge  ◄──pages+text+imgs──    + extracts text  (storage/)
  Generate narration    ──POST …/narrate───►  Anthropic (key server-side)
  edit script + voice
  Publish               ──POST …/publish──►   marks published, stores narration+voice
                        ◄──shareable URL───     returns /d/{id}

                                              GET /d/{id}  ──►  viewer.html / viewer.js
                                              GET /api/decks/{id}   full-screen player
                                              POST …/ask   ──►  grounded Q&A + escalation
```

Key point: **the model API key lives only in `backend/.env`** and is never
sent to the browser. All model calls are proxied through the backend via
`llm.py`, which supports **Groq (default) or Anthropic** — switchable with one
line in `.env` (see §6a).

---

## 3. File map — where everything lives

```
v0_Deck/
├── backend/
│   ├── server.py          # THE backend. All endpoints + conversion/rendering.
│   ├── llm.py             # Pluggable model provider (Groq / Anthropic). Switch via .env.
│   ├── requirements.txt   # Python deps
│   ├── .env.example       # copy to .env; holds LLM_PROVIDER, API keys, SOFFICE_PATH
│   └── storage/           # created at runtime: one folder per deck (gitignored)
│       └── decks/<id>/
│           ├── source.<ext>   # original upload
│           ├── deck.json      # metadata: pages, text, narration, voice, questions
│           ├── pages/<n>.png  # full-res rendered pages
│           └── thumbs/<n>.png # thumbnails
├── frontend/
│   ├── index.html         # Studio (rep-facing): upload → narrate → publish
│   ├── studio.js          # Studio logic
│   ├── viewer.html        # Published full-screen player (what prospects open)
│   ├── viewer.js          # Viewer logic: playback + Q&A
│   ├── styles.css         # All styling for BOTH studio and viewer
│   └── config.js          # Frontend config (API_BASE). No secrets.
├── README.md              # Quick start
├── DOCS.md                # This file
└── .gitignore
```

The backend also **serves** the frontend (studio at `/`, viewer at `/d/{id}`),
so everything is same-origin and there's no CORS to configure.

---

## 4. Backend (`backend/server.py`) — section guide

`server.py` is organized into numbered sections (search e.g. `# 3.`).

| Section | Purpose | Key functions |
|--------|---------|---------------|
| 0. Config & paths | Loads `.env`, sets storage/frontend dirs, render quality knobs (`PAGE_DPI`, `THUMB_SCALE`). | — |
| 1. Helpers | Deck JSON load/save, and **finding the LibreOffice binary**. | `find_soffice()`, `load_deck()`, `save_deck()` |
| 2. Upload pipeline | Accept a file → convert to PDF if needed → render pages + extract text → store. PPTX text-only fallback if no LibreOffice. | `create_deck()`, `convert_to_pdf()`, `render_pdf()`, `extract_pptx_text()`, `public_deck()` |
| 3. Model proxy | Two endpoints (generate narration, answer a question) that call `call_llm()` from `llm.py`. | `narrate()`, `ask()` |
| 4. Publish + fetch | Mark a deck published (save narration + chosen voice), fetch a deck, list escalated questions. | `publish()`, `get_deck()`, `get_questions()` |
| 5. Static + routes | Serves `/files/...` images, `/d/{id}` viewer, `/health`, and the studio at `/`. | `viewer_page()`, `health()` |

### HTTP API reference
| Method & path | Body | Returns |
|---|---|---|
| `POST /api/decks` | multipart `file` | `{deck, warning}` — deck with page text + image/thumb URLs |
| `POST /api/decks/{id}/narrate` | — | `{narration: [...]}` one line per page |
| `POST /api/decks/{id}/ask` | `{question}` | `{escalate, answer, slide_ref, confidence}` |
| `POST /api/decks/{id}/publish` | `{narration, voice, rep_name, title}` | `{url, path}` shareable link |
| `GET /api/decks/{id}` | — | deck (pages, narration, voice, rep_name) |
| `GET /api/decks/{id}/questions` | — | `{rep_name, questions: [...]}` (rep inbox) |
| `GET /d/{id}` | — | the full-screen viewer HTML |
| `GET /health` | — | `{ok, llm:{provider,model,key_set}, soffice}` |

---

## 5. How deck ingestion works (the important part)

All formats are funneled into **one path: become a PDF, then render with PyMuPDF.**

1. **PDF** → used directly.
2. **PPTX / PPT** → `convert_to_pdf()` runs
   `soffice --headless --convert-to pdf` (LibreOffice) to produce a PDF.
3. `render_pdf()` opens the PDF and, per page, saves a full image
   (`pages/<n>.png`), a thumbnail (`thumbs/<n>.png`), and extracts the text.

**If LibreOffice isn't installed:**
- `.pptx` → falls back to `extract_pptx_text()` (python-pptx): text is captured
  but there are **no page images** (`rendered:false`, a warning is surfaced in
  the studio, thumbnails show a "text only" placeholder).
- `.ppt` (legacy binary) → cannot be read at all → 422 asking to install
  LibreOffice or convert to PDF/PPTX.

Scanned/image-only PDFs extract little/no text (no OCR is included), so
narration/Q&A quality depends on the deck having real text.

---

## 6a. Model provider (`backend/llm.py`) — Groq or Anthropic

All model calls go through one function, `call_llm(system, user)`. The provider
is chosen by `LLM_PROVIDER` in `backend/.env`:

```
LLM_PROVIDER=groq        # default — OpenAI-compatible Groq API
# or
LLM_PROVIDER=anthropic   # Anthropic Messages API
```

- **Groq**: uses `GROQ_API_KEY` (starts `gsk_`), `GROQ_MODEL`
  (default `llama-3.3-70b-versatile`), `GROQ_BASE_URL`. Because it's
  OpenAI-compatible, any OpenAI-style endpoint can be pointed at via
  `GROQ_BASE_URL`.
- **Anthropic**: uses `ANTHROPIC_API_KEY` (starts `sk-ant-`), `ANTHROPIC_MODEL`,
  `ANTHROPIC_VERSION`.

To switch providers you change **only** `.env` and restart — no code changes.
`GET /health` reports the active `{provider, model, key_set}`. `llm.py`
normalizes both response shapes and strips stray ```` ``` ```` code fences so
the JSON-parsing in `narrate`/`ask` works regardless of provider.

## 6. How the AI grounding works

Two prompts, both in `server.py`:

1. **Narration** (`narrate`): sends each page's text and asks for a JSON array of
   one spoken line per slide, in order, in a plain confident rep voice. Length
   must match the page count or it errors.

2. **Q&A** (`ask`): embeds the full deck text and requires strict JSON:
   ```json
   { "escalate": boolean, "answer": "string", "slide_ref": number|null, "confidence": 0..1 }
   ```
   - **Answered from deck** → `escalate:false`, cites the source slide.
   - **Not in the deck** (custom pricing, contracts, security detail, unstated
     timelines) → `escalate:true`, warm hand-off line naming the rep.
   - If the model returns unparseable output, the backend **auto-escalates** —
     it never fabricates an answer. Every question is logged to `deck.json`
     under `questions` (the rep inbox).

---

## 7. Frontend

### Studio — `frontend/index.html` + `studio.js`
Rep-facing, three visual steps driven by show/hide:
1. **Upload** — dropzone / file picker → `POST /api/decks`.
2. **Review pages** — thumbnail grid; **click any page to enlarge** (lightbox
   with ← → keys). Uses the rendered `image`/`thumb` URLs.
3. **Script & publish** — `Generate narration` fills an editable textarea under
   each page; pick a **browser voice + speed** (with live preview); `Publish`
   returns a shareable link with copy/open.

`studio.js` sections: 1 upload · 2 grid + 2b lightbox · 3 narration · 4 voice ·
5 publish.

### Viewer — `frontend/viewer.html` + `viewer.js`
The published experience at `/d/{id}`:
- Reads the deck id from the URL, fetches the deck.
- Full-screen page image (or text slide if no image), narration caption, and a
  **Play** that speaks each slide with the rep's saved voice and auto-advances.
- Side panel to **ask the deck questions** (grounded, with escalation styling).

### Voice note (browser TTS)
Voices come from the browser's `speechSynthesis`. The studio saves the chosen
voice **name + rate**; the viewer tries to match that voice on the prospect's
machine and falls back to the default if it isn't available (voices are
OS/browser-specific). For a guaranteed-identical voice everywhere you'd
pre-render audio with a TTS API — see §9.

---

## 8. Element ID → feature reference

**Studio (`index.html`)**
- `dropzone` / `fileInput` — upload · `uploadProgress` / `uploadErr` — status
- `pageGrid` — page thumbnails · `page-thumb` — click target for enlarge
- `lightbox` / `lbImg` / `lbPrev` / `lbNext` — enlarge overlay
- `genBtn` — generate narration · narration `textarea`s per page
- `voiceSelect` / `voiceRate` / `previewVoiceBtn` — voice controls
- `publishBtn` → `shareCard` / `shareLink` / `copyLinkBtn` / `openLinkBtn`
- `repName` — name used in hand-off messages

**Viewer (`viewer.html`)**
- `vStage` / `vSlideHost` — the slide · `vCaption` — narration text
- `vSpeakDot` / `vSpeakLabel` — speaking indicator · `vDots` / `vCounter` — progress
- `vPrev` / `vPlay` / `vNext` — controls
- `vTranscript` / `vSuggest` / `vInput` / `vAsk` — Q&A panel

---

## 9. Known limitations & next steps

- **LibreOffice dependency** for PPT/PPTX rendering. PDF needs nothing extra.
- **Browser TTS voice varies** per viewer device. Upgrade path: pre-generate
  audio files from a TTS API at publish time and play those in the viewer.
- **Auth-free links:** anyone with a `/d/{id}` link can view. Add tokens/expiry
  if you need access control.
- **Storage is the filesystem** (`backend/storage/`). Fine for one box; use
  object storage (S3) + a DB for scale. Nothing is deleted automatically.
- **Rep inbox is pull-based** (`GET …/questions`); there's no live push yet.
  A `rep.html` that polls this endpoint would recreate the original live console.
- **No OCR** for scanned/image PDFs.

---

## 10. Deployment & sharing

The published link is only as reachable as the server hosting it.

- **Local only:** `--host 127.0.0.1` → works on your machine only.
- **Same LAN:** `py -m uvicorn server:app --host 0.0.0.0 --port 8000`, share
  `http://<your-ip>:8000/d/{id}`.
- **Public, fastest:** front it with a tunnel —
  `cloudflared tunnel --url http://localhost:8000` or `ngrok http 8000` — and
  share the https URL. `publish()` builds the link from the incoming request
  host, so tunneled/deployed hosts produce correct absolute links.
- **Real deploy:** any VM/container with Python + LibreOffice, behind HTTPS,
  with `backend/storage/` on a persistent volume and `ANTHROPIC_API_KEY` set.

---

## 11. Quick "how do I…" cheatsheet

| I want to… | Do this |
|---|---|
| Switch Groq ↔ Anthropic | Change `LLM_PROVIDER` in `backend/.env`, restart. |
| Change the model | `GROQ_MODEL` or `ANTHROPIC_MODEL` in `backend/.env`. |
| Use another OpenAI-compatible API | Set `GROQ_BASE_URL` + `GROQ_API_KEY` + `GROQ_MODEL`. |
| Point at a non-standard LibreOffice | Set `SOFFICE_PATH` in `.env`. |
| Improve render quality / thumb size | `PAGE_DPI` / `THUMB_SCALE` in `server.py` §0. |
| Change narration voice/rules | Edit the `system` prompt in `narrate()` (§3). |
| Change when it escalates | Edit the `system` prompt rules in `ask()` (§3). |
| Restyle colors | CSS variables in `:root` at the top of `frontend/styles.css`. |
| Change suggested questions (viewer) | `buildSuggestions()` in `viewer.js`. |
| Host the frontend separately | Set `API_BASE` in `frontend/config.js`. |
| See what escalated | `GET /api/decks/{id}/questions`. |
