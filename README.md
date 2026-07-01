# Deck Agent

Upload a sales deck (PDF / PPTX / PPT) → it renders every page, writes a spoken
narration grounded in your slides, and publishes a **full-screen shareable link**
that plays the walkthrough aloud and answers prospect questions — handing off to
you when it can't answer confidently.

> Full architecture, file map, and feature-by-feature guide: see **[DOCS.md](DOCS.md)**.

---

## Quick start

### 1. Install dependencies
```powershell
cd backend
py -m pip install -r requirements.txt
```

### 2. Add your API key
Copy `backend/.env.example` to `backend/.env`. It defaults to **Groq**:
```
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...
```
To use Anthropic instead, set `LLM_PROVIDER=anthropic` and fill `ANTHROPIC_API_KEY`.
That one line is the only change needed to switch providers (see DOCS.md §6a).

### 3. (Optional) Install LibreOffice for PPT/PPTX
PDF works out of the box. To render **.pptx / .ppt** pages to images, install
[LibreOffice](https://www.libreoffice.org/download/download/). If it's not in a
standard location, set `SOFFICE_PATH` in `.env`.
Without it: PPTX falls back to text-only (no page images); PPT is rejected.

### 4. Run the server
```powershell
cd backend
py -m uvicorn server:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000** → upload a deck → Generate narration → Publish.

---

## Making the link work "for anyone, any device"

`http://127.0.0.1:8000` only works on your machine. To share the published link:

- **Same network:** run with `--host 0.0.0.0` and share `http://<your-LAN-ip>:8000`.
- **Public URL (fastest):** put a tunnel in front, e.g. `cloudflared tunnel --url http://localhost:8000` or `ngrok http 8000`, and share the https URL it prints.
- **Real deployment:** host the backend on any box/VM (with LibreOffice installed for PPT/PPTX) behind HTTPS. Persist `backend/storage/`.

See DOCS.md → "Deployment & sharing" for details.

## Health check
`GET /health` reports whether the API key is set and whether LibreOffice was found.
