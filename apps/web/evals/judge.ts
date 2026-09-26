/**
 * LLM judge for narration evals: prompts, response schemas and a small provider client.
 * Three separate judgments per slide, each returning JSON:
 *   faithfulness - every claim checked against the slide (1-5), plus must_not_say hits
 *   coverage     - each critical / optional must_mention item: hit or miss, with the quote
 *   style        - spoken presenter voice (1-5)
 * The judge is configured separately from the narrator (JUDGE_* env) so a model never grades itself.
 */
import { z } from "zod";

export const JUDGE_PROMPT_VERSION = "judge-v1";

// ---------- inputs ----------
export type JudgeCase = {
  rowId: string;
  narration: string;
  slideText: string; // golden visible text, line-broken
  deckTitle: string;
  mustMentionCritical: string[];
  mustMentionOptional: string[];
  mustNotSay: string[];
  imagePath?: string;
};

// ---------- schemas ----------
export const FaithfulnessSchema = z.object({
  claims: z.array(
    z.object({
      claim: z.string(),
      supported: z.enum(["yes", "partial", "no"]),
      evidence: z.string().default(""),
      tag: z.enum(["H", "N", "L", "O"]).nullable().optional(),
    }),
  ),
  mustNotSayHits: z.array(z.string()).default([]),
  score: z.number().int().min(1).max(5),
  reason: z.string().default(""),
});
export const CoverageSchema = z.object({
  critical: z.array(z.object({ item: z.number().int(), hit: z.boolean(), quote: z.string().default("") })),
  optional: z.array(z.object({ item: z.number().int(), hit: z.boolean(), quote: z.string().default("") })).default([]),
});
export const StyleSchema = z.object({
  score: z.number().int().min(1).max(5),
  issues: z.array(z.string()).default([]),
  reason: z.string().default(""),
});
export type Faithfulness = z.infer<typeof FaithfulnessSchema>;
export type Coverage = z.infer<typeof CoverageSchema>;
export type Style = z.infer<typeof StyleSchema>;

// ---------- prompts ----------
const JSON_ONLY = "Reply with a single JSON object only. No markdown, no code fences, no text before or after.";

export const FAITHFULNESS_SYSTEM = `You are a strict fact-checker for spoken narration written for one slide of a pitch deck.
Your only question: is every factual claim in the NARRATION supported by the SLIDE TEXT (or the slide image, if attached)?

How to check:
1. Split the narration into its factual claims. Presenter framing is not a claim ("Let me walk you through", "Here's why this matters", "We fix both" when the slide states the fix).
2. For each claim decide:
   - "yes": stated on the slide, or a faithful paraphrase of it.
   - "partial": mostly supported but stretched (a stronger verb, a rounded number stated as exact, a plan stated as achieved).
   - "no": not on the slide.
   Quote the supporting slide text in "evidence" (empty if none).
3. Tag every "partial" or "no" claim: "N" wrong or invented number, "H" invented fact/name/claim, "L" content that belongs to a different slide, "O" overclaim (stronger than the slide supports).
4. List any MUST NOT SAY item the narration violates, copied exactly from the list.

Score (integer):
5 = every claim "yes".
4 = one "partial" that is a harmless paraphrase stretch; no new facts or numbers.
3 = one unsupported but plausible detail, or two harmless stretches.
2 = any MUST NOT SAY hit, any unsupported number, or any unsupported name.
1 = several invented facts or numbers.
Any MUST NOT SAY hit caps the score at 2.

${JSON_ONLY}
Schema: {"claims":[{"claim":string,"supported":"yes"|"partial"|"no","evidence":string,"tag":"H"|"N"|"L"|"O"|null}],"mustNotSayHits":[string],"score":1-5,"reason":string}`;

export function faithfulnessUser(c: JudgeCase): string {
  return [
    `DECK TITLE (what the narrator was given): ${c.deckTitle}`,
    `SLIDE TEXT:\n${c.slideText}`,
    `MUST NOT SAY:\n${c.mustNotSay.map((m, i) => `${i + 1}. ${m}`).join("\n") || "(none)"}`,
    `NARRATION:\n${c.narration}`,
  ].join("\n\n");
}

export const COVERAGE_SYSTEM = `You check whether spoken narration for one slide covers required points.
For each numbered ITEM, decide whether the NARRATION states it.
- A clear paraphrase counts as a hit.
- A wrong number does NOT count ("$5M" does not cover "$3M").
- An item with several parts separated by commas or "+" needs its main point, not every word; if an item says "(plan, not achieved)" or similar, the narration must not state it as achieved.
Quote the words from the narration that cover each hit (empty for a miss).

${JSON_ONLY}
Schema: {"critical":[{"item":number,"hit":boolean,"quote":string}],"optional":[{"item":number,"hit":boolean,"quote":string}]}`;

export function coverageUser(c: JudgeCase): string {
  const list = (xs: string[]) => xs.map((x, i) => `${i + 1}. ${x}`).join("\n") || "(none)";
  return [
    `CRITICAL ITEMS:\n${list(c.mustMentionCritical)}`,
    `OPTIONAL ITEMS:\n${list(c.mustMentionOptional)}`,
    `NARRATION:\n${c.narration}`,
  ].join("\n\n");
}

export const STYLE_SYSTEM = `You rate how well a line of narration works when spoken aloud by a founder presenting one slide.
Judge delivery only, not factual accuracy.

5 = sounds like a confident person talking: first person, natural sentences, one clear point, numbers said the way people say them.
4 = good, with one small awkward phrase.
3 = understandable but reads like bullets strung together, or stiff.
2 = reads the slide aloud, meta narration ("this slide shows", "as you can see", "please review"), or hype the content doesn't earn.
1 = not usable as narration.
Do not reward matching any particular wording.

${JSON_ONLY}
Schema: {"score":1-5,"issues":[string],"reason":string}`;

export const styleUser = (c: JudgeCase) => `NARRATION:\n${c.narration}`;

// ---------- client ----------
export type JudgeConfig = {
  provider: "anthropic" | "openai-compatible";
  label: string;
  model: string;
  apiKey: string;
  baseUrl: string;
};

/** Reads JUDGE_* env; defaults to Anthropic when ANTHROPIC_API_KEY is set, else OpenAI-compatible (Groq). */
export function judgeConfigFromEnv(env: Record<string, string | undefined> = process.env): JudgeConfig | null {
  const provider = (env.JUDGE_PROVIDER ?? (env.ANTHROPIC_API_KEY ? "anthropic" : "groq")).toLowerCase();
  if (provider === "anthropic") {
    const apiKey = env.JUDGE_API_KEY ?? env.ANTHROPIC_API_KEY ?? "";
    if (!apiKey) return null;
    return {
      provider: "anthropic",
      label: "anthropic",
      model: env.JUDGE_MODEL ?? env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
      apiKey,
      baseUrl: env.JUDGE_BASE_URL ?? "https://api.anthropic.com/v1",
    };
  }
  const defaults: Record<string, { key?: string; base: string; model?: string }> = {
    groq: { key: env.GROQ_API_KEY, base: "https://api.groq.com/openai/v1", model: env.GROQ_MODEL },
    xai: { key: env.XAI_API_KEY ?? env.GROK_API_KEY, base: "https://api.x.ai/v1", model: env.XAI_MODEL },
    openai: { key: env.OPENAI_API_KEY, base: "https://api.openai.com/v1" },
  };
  const d = defaults[provider] ?? { base: "" };
  const apiKey = env.JUDGE_API_KEY ?? d.key ?? "";
  const model = env.JUDGE_MODEL ?? d.model ?? "";
  const baseUrl = env.JUDGE_BASE_URL ?? d.base;
  if (!apiKey || !model || !baseUrl) return null;
  return { provider: "openai-compatible", label: provider, model, apiKey, baseUrl };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Running totals of judge API usage (cache hits cost nothing and are not counted). */
export const judgeUsage = { calls: 0, inputTokens: 0, outputTokens: 0, ms: 0 };

export async function callJudge(
  cfg: JudgeConfig,
  system: string,
  user: string,
  image?: { base64: string; mediaType: string },
  attempt = 0,
): Promise<string> {
  let res: Response;
  const t0 = Date.now();
  if (cfg.provider === "anthropic") {
    const content: unknown[] = [];
    if (image) content.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } });
    content.push({ type: "text", text: user });
    res = await fetch(`${cfg.baseUrl}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: cfg.model, max_tokens: 1500, temperature: 0, system, messages: [{ role: "user", content }] }),
    });
  } else {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1500,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await sleep(2000 * 2 ** attempt);
    return callJudge(cfg, system, user, image, attempt + 1);
  }
  if (!res.ok) throw new Error(`judge ${cfg.label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number };
  };
  judgeUsage.calls++;
  judgeUsage.ms += Date.now() - t0;
  judgeUsage.inputTokens += data.usage?.input_tokens ?? data.usage?.prompt_tokens ?? 0;
  judgeUsage.outputTokens += data.usage?.output_tokens ?? data.usage?.completion_tokens ?? 0;
  const text =
    cfg.provider === "anthropic"
      ? data.content?.find((b) => b.type === "text")?.text
      : data.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error(`judge ${cfg.label}: no text in response`);
  return text;
}

/** Pull the JSON object out of a reply (tolerates fences or stray text) and validate it. */
export function parseJudgeReply<T>(raw: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`no JSON object in judge reply: ${cleaned.slice(0, 120)}`);
  return schema.parse(JSON.parse(cleaned.slice(start, end + 1)));
}

// ---------- scoring helpers ----------
export function coveragePct(cov: Coverage, expected: number, kind: "critical" | "optional"): number | null {
  if (expected === 0) return null;
  const hits = new Set(cov[kind].filter((x) => x.hit).map((x) => x.item)).size;
  return Math.round((Math.min(hits, expected) / expected) * 100);
}

export const PASS_RULE = { minFaithfulness: 4, criticalCoveragePct: 100 };

export function judgePasses(f: Faithfulness, criticalPct: number | null): boolean {
  return (
    f.score >= PASS_RULE.minFaithfulness &&
    f.mustNotSayHits.length === 0 &&
    (criticalPct === null || criticalPct >= PASS_RULE.criticalCoveragePct)
  );
}
