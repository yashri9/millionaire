# Narration evals

The golden dataset lives in `golden/narration-v2.json`, and the runner is `run-narration.ts`. The runner only generates and records narrations. Scoring (rules, LLM judge, human review) reads its output and is built separately.

## Run

```bash
# from apps/web, with the same .env.local the app uses (LLM_PROVIDER + key)
npm run eval:run                                   # text mode, all decks, 1 repeat
npm run eval:run -- --deck meesho --repeats 3      # one deck, 3 samples per slide
npm run eval:run -- --mode e2e                     # Cloud Vision on the slide images
npm run eval:run -- --rows uber-10,meesho-06       # specific rows (loses neighbour context)
npm run eval:run -- --label "prompt v7" --require-llm
```

| Flag | Meaning |
|---|---|
| `--mode text` | Feeds the golden `slideLines` (known-correct visible text). Any failure is the narration step's fault. Default. |
| `--mode e2e` | Runs Cloud Vision on the slide image plus the PDF text layer, then `pickSlideText`, as `deckProcessor.ts` does. Failures can be OCR or narration. Needs `GOOGLE_VISION_API_KEY`. Results are cached in `.cache/vision/`, so repeat runs don't spend Vision quota. |
| `--repeats N` | Runs every deck N times, to see how much outputs vary at temperature 0.35. |
| `--require-llm` | Exits 1 if any slide came from the extractive fallback instead of the model. Use this in CI. |
| `--label` | Free text saved in `run.json`, e.g. what you changed. |

## What it calls

Narration comes from the **same `generateNarrationForDeck()`** in `src/lib/prompts.ts` that the app calls. It isn't a copy, so it uses the app's prompt, provider, model, temperature, number check, retry and fallbacks. Like production, it passes the deck title (the upload filename) and `deckPurpose: "pitch"`. The golden `deckContext` is only for graders.

How slide text is turned into the function's input depends on `--path`:

| `--path` | Mirrors | Slide structure |
|---|---|---|
| `cloud` (default) | Default Studio upload: `deckProcessor` → `linesToSlide` → `studio-api` → `/api/script/generate` | first line = title, rest = bullets; labeled facts filled by the route; no chart flag |
| `device` | Device draft: `pdf-parse.ts` → `structureSlideContent` | title/body/chart detection from `structureSlideContent` |

Decks run in slide order, so previous-slide context matches production.

Known differences from production input: e2e mode OCRs the pre-rendered `page-*.jpg` files instead of rendering the PDF, and the text layer comes from `_text.json` (flat) rather than pdf.js per-page lines.

## Output: `runs/<runId>/` (gitignored)

- `run.json`: provider, model, git SHA, dirty flag, dataset version, mode, counts.
- `outputs.jsonl`: one record per slide per repeat. Includes the text the pipeline used, how it was structured (title, body lines, facts, chart flag), the narration, `generationMethod`, `isModelOutput`, word count and estimated duration.
- `outputs.csv`: `row_id, repeat, model_script, ...`, ready to paste into the sheet's `model_script` column.

**Always check `fallbackOutputs` in `run.json`.** If the key is missing, or the model's answer fails the number check twice, the app silently uses its extractive fallback. Those rows are not model narrations and should not be scored as if they were.

## Known limits

- Duration is estimated at 150 wpm. TTS isn't in the loop yet.
- Token cost isn't recorded, because `callLLM` doesn't return usage.
- Only one deck latency is recorded per repeat, not per-slide latency, because the app generates two slides at a time.
