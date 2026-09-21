import "server-only";

/**
 * llm.ts — pluggable LLM provider (SERVER ONLY).
 *
 * Default provider is Groq (`LLM_PROVIDER=groq`). Optional: `xai`/`grok` (xAI Grok), `anthropic`.
 * Secrets live only in server env and are never shipped to the browser (PRD §11).
 *
 * The rest of the app only calls `callLLM(system, user)`.
 */
import { serverEnv } from "@/lib/env";

export class LLMError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

function stripFences(text: string): string {
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
}

type OpenAICompatConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  label: string;
};

function openAICompatConfig(): OpenAICompatConfig | null {
  const provider = serverEnv.llmProvider;

  if (provider === "xai" || provider === "grok") {
    if (!serverEnv.xaiApiKey) return null;
    return {
      apiKey: serverEnv.xaiApiKey,
      baseUrl: serverEnv.xaiBaseUrl,
      model: serverEnv.xaiModel,
      label: "xAI Grok",
    };
  }

  if (provider === "groq") {
    if (!serverEnv.groqApiKey) return null;
    return {
      apiKey: serverEnv.groqApiKey,
      baseUrl: serverEnv.groqBaseUrl,
      model: serverEnv.groqModel,
      label: "Groq",
    };
  }

  return null;
}

export function providerStatus() {
  const provider = serverEnv.llmProvider;
  if (provider === "anthropic") {
    return {
      provider,
      model: serverEnv.anthropicModel,
      keySet: Boolean(serverEnv.anthropicApiKey),
    };
  }
  const cfg = openAICompatConfig();
  return {
    provider,
    model: cfg?.model ?? (provider === "groq" ? serverEnv.groqModel : serverEnv.xaiModel),
    keySet: Boolean(cfg),
  };
}

export type CallLLMOptions = {
  jsonMode?: boolean;
  /** Narration default is 0.35 (matches eval pipeline). */
  temperature?: number;
  /** Extra 429 retries (default 5 for OpenAI-compatible providers). */
  retries?: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callOpenAICompatible(
  cfg: OpenAICompatConfig,
  system: string,
  user: string,
  maxTokens: number,
  options?: CallLLMOptions,
  attempt = 0,
): Promise<string> {
  const temperature = options?.temperature ?? 0.35;
  const maxRetries = options?.retries ?? 5;
  const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      temperature,
      ...(options?.jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (r.status === 429 && attempt < maxRetries) {
    await sleep(8000 + attempt * 2000);
    return callOpenAICompatible(cfg, system, user, maxTokens, options, attempt + 1);
  }
  if (!r.ok) {
    throw new LLMError(
      502,
      `${cfg.label} API error ${r.status}: ${(await r.text()).slice(0, 200)}`,
    );
  }
  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new LLMError(502, "No text response from model");
  return stripFences(content);
}

export async function callLLM(
  system: string,
  user: string,
  maxTokens = 1200,
  options?: CallLLMOptions,
): Promise<string> {
  const provider = serverEnv.llmProvider;
  const temperature = options?.temperature ?? 0.35;

  if (provider === "anthropic") {
    if (!serverEnv.anthropicApiKey)
      throw new LLMError(503, "ANTHROPIC_API_KEY is not set");
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": serverEnv.anthropicApiKey,
        "anthropic-version": serverEnv.anthropicVersion,
      },
      body: JSON.stringify({
        model: serverEnv.anthropicModel,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!r.ok)
      throw new LLMError(502, `Anthropic API error ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    const block = (data.content ?? []).find((b: { type: string }) => b.type === "text");
    if (!block) throw new LLMError(502, "No text response from model");
    return stripFences(block.text);
  }

  const cfg = openAICompatConfig();
  if (!cfg) {
    const missing =
      provider === "groq"
        ? "GROQ_API_KEY is not set"
        : "XAI_API_KEY is not set (xAI Grok)";
    throw new LLMError(503, missing);
  }
  return callOpenAICompatible(cfg, system, user, maxTokens, options);
}
