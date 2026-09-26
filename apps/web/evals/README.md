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

## Grade with rules

```bash
npm run eval:rules                    # grade the latest run
npm run eval:rules -- --run <runId>   # a specific run
npm run eval:rules -- --golden        # self-check: grade the golden scripts (should pass)
npm run eval:rules -- --fail-on-hard  # exit 1 if any slide fails (CI)
npm run eval:test                     # unit tests for the rules
```

Writes `grades-rules.jsonl` (every rule result per slide) and `rules-summary.json` (pass rate, violations by tag, by rule, deck, slide type, difficulty) into the run folder.

| Rule | Hard? | Fails when |
|---|---|---|
| `pipeline` | yes | error, empty output, or the extractive fallback instead of the model |
| `length` | yes | outside 15-40 words (warns above the pipeline's 34-word cap) |
| `duration` | yes | outside 8-15 s. Skipped until runs record real TTS duration |
| `numbers` | yes | `[N]` a number on no slide, or `[L]` a number from another slide. Rounding within 15% or axis/"Week N" labels only warn |
| `banned_phrases` | yes | meta narration: "as you can see", "this slide", "the chart shows", "please review" |
| `placeholders` | yes | template text read aloud: "X target customers", "your Uncle", URLs |
| `formatting` | yes | markdown, bullets, citation brackets, line breaks, emoji |
| `banned_terms` | yes | a literal string from the row's `bannedTerms` (taken from `must_not_say`) |
| `name_leak` | warn | a capitalised name that is only on another slide of the deck |
| `repetition` | warn | the same 6+ word sentence on two slides in one deck run |

Grounding uses the golden visible slide text, not the OCR text a run used, so an OCR misread that ends up as a wrong number still counts as wrong. A slide passes the rules layer if no hard rule fails. The LLM judge is the next layer and handles what rules can't: paraphrased coverage, unsupported claims, tone.

The grader parses numbers by value ("six hundred twenty-five thousand" = 625,000, "1.3M" = 1,300,000, "100X" = 100). The app's `number-check.ts` misreads some of these: "six hundred twenty-five thousand" becomes 25,000, and "1.3 million" can't match the 1,300,000 it means. It also strips "Week N" labels from the source, so narration that says "by week ten" fails the production gate.

## Grade with the LLM judge

```bash
npm run eval:judge                    # latest run; only slides that passed the hard rules
npm run eval:judge -- --all           # every slide
npm run eval:judge -- --with-image    # also show the judge the slide image (Anthropic judge)
npm run eval:judge -- --golden        # judge the golden scripts (should score ~5)
npm run eval:judge -- --no-cache      # force fresh judgments
```

The judge makes three calls per slide, all at temperature 0, all returning JSON (validated with zod, one retry on bad JSON):

- **Faithfulness (1-5):** splits the narration into claims and marks each yes / partial / no, with the slide evidence and a tag ([N] number, [H] invented, [L] other slide, [O] overclaim). It also lists any `must_not_say` it violates.
- **Coverage:** hit or miss for each critical and optional `must_mention` item, quoting the narration.
- **Style (1-5):** spoken presenter voice. It never sees the golden script, so it can't reward copying one wording.

**Judge model.** The judge is configured separately from the narrator so a model never grades itself: `JUDGE_PROVIDER` (anthropic | groq | xai | openai), `JUDGE_MODEL`, `JUDGE_API_KEY`, `JUDGE_BASE_URL`. It defaults to Anthropic when `ANTHROPIC_API_KEY` is set, and warns if the judge model equals the narrator model.

**Cache.** Judgments are cached in `.cache/judge`, keyed by prompt version, judge model and inputs, so re-scoring an unchanged narration is free. Bump `JUDGE_PROMPT_VERSION` in `judge.ts` whenever you edit a judge prompt.

Writes `grades-judge.jsonl` and `judge-summary.json`.

## Score, baseline and gate

```bash
npm run eval:score                    # verdicts + report for the latest run
npm run eval:score -- --set-baseline  # save this run's scorecard as evals/baseline.json (commit it)
npm run eval:score -- --gate          # exit 1 if worse than the baseline (CI)
npm run eval:all                      # run -> rules -> judge -> score
```

Verdict per slide:

- **PASS:** no hard rule failed, faithfulness ≥ 4, 100% critical coverage, and no `must_not_say` hit.
- **FAIL:** any of those missed, with the reasons listed.
- **INCOMPLETE:** not judged yet.
- **ERROR:** the judge errored.

Writes `scorecard.json` and a readable `report.md` into the run folder. The report has headline metrics (with deltas vs baseline), pass rate by slide type and difficulty, regressions and fixes per row, the gate result, and every failing slide with its narration and reasons.

The gate (`GATE` in `score.ts`) fails when:

- the pass rate drops more than 2 points,
- average faithfulness drops more than 0.1,
- [N] or [H] violations increase,
- any output is a fallback,
- or any slide is incomplete or errored.

The baseline is only compared when it uses the same dataset version.

## Workflow

1. Change a prompt, model or pipeline step.
2. `npm run eval:all` (or the four steps separately, with flags), then read `report.md` in the new run folder.
3. If it's better, `npm run eval:score -- --set-baseline` and commit `evals/baseline.json` with the change.
