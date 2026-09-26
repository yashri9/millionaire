# Narration evals

This folder measures how good Voxdeck's slide narrations are, catches regressions before they ship, and grows the test set from real usage.

```
golden dataset → runner → rules grader → LLM judge → scorer → report / history / gate
        ↑                                                    │
        └──── production feedback (harvest) ← calibration ←──┘
```

| File | What it does |
|---|---|
| `golden/narration-vN.json` | The dataset: slides, reference scripts, rubrics, dev/holdout split. Tools use the highest N. |
| `run-narration.ts` | Generates narration with the app's real code and saves it. |
| `rules.ts`, `grade-rules.ts` | Deterministic checks (free, instant). |
| `judge.ts`, `grade-judge.ts` | LLM judge: faithfulness, coverage, style. |
| `score.ts` | Verdict per slide, run metrics, report, history, baseline, gate. |
| `calibrate.ts` | Checks the judge against human scores. |
| `dataset.ts` | Validate, stats, harvest production feedback, cut new versions. |
| `baseline.json` | The scorecard new runs are compared and gated against (commit it). |
| `history.jsonl`, `HISTORY.md` | One row per scored run (commit them). |
| `calibration/` | Blind sheets and the judge-vs-human agreement per judge model and prompt version (commit it). |
| `runs/`, `.cache/` | Per-run outputs and API caches (gitignored). |

## Quick start

```bash
cd apps/web                    # uses the same .env.local as the app
npm run eval:all               # run -> rules -> judge -> score, then open the run's report.md
npm run eval:score -- --set-baseline   # when you're happy with a run; commit evals/baseline.json
```

**Keys:**

- The narrator uses the app's own `LLM_PROVIDER` and key.
- The judge uses `ANTHROPIC_API_KEY` by default. Or set `JUDGE_PROVIDER` + `JUDGE_MODEL` + `JUDGE_API_KEY`; never the narrator's model.
- For cost in dollars, set prices in USD per 1M tokens: `EVAL_NARRATOR_PRICE_IN/OUT`, `EVAL_JUDGE_PRICE_IN/OUT`.

## 1. Runner: `npm run eval:run`

Calls the **same `generateNarrationForDeck()`** in `src/lib/prompts.ts` the app calls, with the app's prompt, model, temperature, number check, retry and fallbacks. It passes the deck title (upload filename) and `deckPurpose: "pitch"`, like production. Whole decks run in order, so previous-slide context matches production.

| Flag | Meaning |
|---|---|
| `--path cloud` (default) / `device` | How slide text becomes the function's input. `cloud` mirrors the default Studio upload (first line = title, rest = bullets). `device` mirrors the device draft (`structureSlideContent`). |
| `--mode text` (default) / `e2e` | `text` feeds the golden `slideLines` (known-correct text: failures are the narration step). `e2e` runs Cloud Vision on the slide images first (needs `GOOGLE_VISION_API_KEY`, cached). |
| `--split dev` (default) / `holdout` / `all` | Which rows are saved. The whole deck is always generated for context. |
| `--repeats N` | Samples per slide, to see variance. |
| `--deck`, `--rows` | Subsets (`--rows` loses neighbour context). |
| `--label` | What you changed; shown in the report and history. |
| `--require-llm` | Exit 1 if any slide used the fallback. |

**Output** goes to `runs/<runId>/`:

- `run.json`: versions, git SHA, dataset hash, token totals.
- `outputs.jsonl`: per slide: text used, structure, narration, method, words, estimated duration. Also the narrator's LLM calls, tokens and time, observed from the app's own API calls, so number-check retries show up.
- `outputs.csv`

**Check `fallbackOutputs`.** When the key is missing, or the model fails the number check twice, the app silently ships its extractive fallback. Those aren't model narrations.

## 2. Rules: `npm run eval:rules`

| Rule | Hard? | Fails when |
|---|---|---|
| `pipeline` | yes | error, empty, or fallback instead of the model |
| `length` | yes | outside 15-40 words (warns above the pipeline's 34-word cap) |
| `duration` | yes | outside 8-15 s. Skipped until runs record real TTS duration |
| `numbers` | yes | `[N]` a number on no slide, or `[L]` a number from another slide. Rounding within 15% and axis/"Week N" labels only warn |
| `banned_phrases` | yes | "as you can see", "this slide", "the chart shows", "please review" |
| `placeholders` | yes | template text read aloud ("X target customers", "your Uncle", URLs) |
| `formatting` | yes | markdown, bullets, citation brackets, line breaks, emoji |
| `banned_terms` | yes | a literal string from the row's `bannedTerms` |
| `name_leak` | warn | a name that's only on another slide of the deck |
| `repetition` | warn | the same 6+ word sentence on two slides in one deck |

Grounding uses the golden visible slide text, so an OCR misread that becomes a wrong number still counts. Numbers are parsed by value: "six hundred twenty-five thousand" = 625,000, "1.3M" = 1,300,000, "100X" = 100.

Flags: `--run <id>`, `--golden` (grade the reference scripts; must pass), `--fail-on-hard`.

## 3. LLM judge: `npm run eval:judge`

Three temperature-0 calls per slide, JSON validated with zod:

- **Faithfulness (1-5):** each claim marked yes / partial / no, with the slide evidence and a tag ([N] number, [H] invented, [L] other slide, [O] overclaim), plus any `must_not_say` hits.
- **Coverage:** hit or miss per critical and optional item, with the quote.
- **Style (1-5):** spoken presenter voice. It never sees the golden, so it can't reward copying one wording.

By default the judge only scores slides that passed the hard rules (`--all` for every slide). `--with-image` attaches the slide image (Anthropic). Results are cached by prompt version + judge model + inputs; `--no-cache` forces fresh judgments. Bump `JUDGE_PROMPT_VERSION` in `judge.ts` whenever you edit a judge prompt.

## 4-6. Scorer, report, history, gate: `npm run eval:score`

**Verdict per slide.** PASS only if no hard rule failed, faithfulness ≥ 4, critical coverage is 100%, and there are zero violations. Otherwise it's FAIL with the reasons listed (or INCOMPLETE / ERROR).

**Per run:**

- pass rate
- average faithfulness, style and full-critical-coverage
- violations by tag, overall and **per slide type**
- pass rate by slide type, difficulty and deck
- average length and duration (estimated at 150 wpm until TTS is measured)
- latency: LLM ms per slide (avg, p95), deck time, slides needing a retry
- tokens and cost for the narrator and the judge
- fallbacks

**Report** (`runs/<runId>/report.md`): every metric as "previous → now" (e.g. `Faithfulness 4.1 → 4.4`, `[L] 2 → 5` on chart slides), plus:

- the baseline value
- regressions and fixes per row, vs the previous run and vs the baseline
- the gate result
- every failing slide with its narration and reasons

It only compares runs on the same dataset version and split, and warns if the dataset was edited in place.

**Results store:** `runs/<runId>/scorecard.json` per run, and `history.jsonl` + `HISTORY.md` with one row per scored run (run ID, label, dataset@hash, split, narrator model, git SHA, headline metrics, cost, gate).

**Gate** (`GATE` in `score.ts`, `--gate` exits 1). A change may ship only if:

- faithfulness does not drop vs baseline,
- pass rate drops no more than 2 points,
- [H] and [N] violations are 0,
- no output is a fallback,
- every slide was judged.

Optionally (`requireCalibratedJudge`), the judge must also have ≥ 85% agreement with humans.

**CI:** `.github/workflows/narration-evals.yml`.

- Every PR touching narration code or evals runs the unit tests, dataset validation and the golden self-check.
- If the `GROQ_API_KEY` and `ANTHROPIC_API_KEY` repository secrets exist, it also runs the live eval on the dev split, gates against the committed `baseline.json`, and posts the report to the job summary.
- Model names and prices come from repository variables (`GROQ_MODEL`, `JUDGE_MODEL`, `EVAL_*_PRICE_*`).

## 7. Calibration and feedback loop

**Judge calibration:** `npm run eval:calibrate`.

1. `export --n 40` writes a blind CSV to `calibration/`: slide, rubric and narration, with no judge scores. Samples are balanced between judge-pass and judge-fail. Use `--run` more than once to pool runs; aim for 30-50 outputs.
2. A human fills `human_faithfulness_1_5`, `human_critical_all_hit` and `human_pass` (y/n).
3. `compare --sheet <file>` reports pass/fail agreement, Cohen's kappa, faithfulness exact and ±1 agreement, whether the judge is too lenient or too strict, and every disagreement. It saves `calibration/<judgeModel>__<promptVersion>.json`, which the report shows and the gate can require.

Redo this whenever the judge model or `JUDGE_PROMPT_VERSION` changes.

**Held-out set:** about 20% of rows (stratified by difficulty, fixed by hash) are `split: "holdout"`. Tune prompts on dev only. Run `--split holdout` just before shipping, to confirm the gain isn't overfitting. Note: v2's holdout rows were all seen while building the dataset. The holdout is only truly unseen for future prompt work.

**Dataset versioning:** `npm run eval:dataset`.

- `validate`: structure, split share, images, and every golden passes its own rules (CI runs this).
- `stats`: rows by split, deck, difficulty and slide type.
- `harvest --from feedback.jsonl`: turns production feedback into candidate rows in `golden/candidates.jsonl`. It skips trivial edits (>90% similar) and duplicates, and keeps the AI's original as `failedNarration`. Each event is one JSON line: `{deckTitle, slideNo, slideText, aiNarration, finalNarration, action: edit|regenerate|shorten|punch|report, note, createdAt}`.
- `new-version`: after a human fills a candidate's rubric and sets `reviewStatus: "reviewed"`, this copies the current dataset, adds the reviewed candidates and writes `narration-v(N+1).json`. It only writes if validation passes. Every tool then uses the new version. Set a fresh baseline, since scores don't compare across versions.

**What the product needs for the feedback loop.** Today `/api/decks/[id]/script` overwrites the unpublished draft in `script_versions`, so the AI's original narration is lost once a user edits it, and regenerations aren't recorded. To feed `harvest`, record one event whenever a user:

- edits a generated line (AI text → saved text),
- regenerates, shortens or punches a line (`/api/script/rewrite`),
- or reports one.

Store it with the slide's text, then export those events as JSONL. A small `narration_feedback` table, or keeping the AI's original text alongside the edited text in the narration JSON, is enough.

## Known limits

- Duration is an estimate until TTS runs inside the loop.
- In e2e mode the runner OCRs the pre-rendered `page-*.jpg` files, and uses `_text.json` as the flat text layer, rather than rendering the PDF.
- Cost needs prices in env; tokens are always recorded.
- The app's `number-check.ts` misreads some numbers. "six hundred twenty-five thousand" becomes 25,000; "1.3 million" doesn't match 1,300,000; hyphenated "five-million-dollar" isn't parsed at all; "Week N" labels are stripped from the source. In mock runs this made the app reject correct narration on chart slides and ship its "[Draft] …" fallback, and let a wrong "$5M" through.
