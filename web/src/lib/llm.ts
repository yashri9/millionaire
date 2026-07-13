import "server-only";

/**
 * llm.ts — pluggable LLM provider (SERVER ONLY).
 *
 * Direct TypeScript port of backend/llm.py. Swap providers with the
 * LLM_PROVIDER env var (default "groq", optionally "anthropic"). The key lives
 * only in server env and is never shipped to the browser (PRD §11).
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
  }
}

function stripFences(text: string): string {
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
}

export function providerStatus() {
  const provider = serverEnv.llmProvider;
  const keySet =
    provider === "anthropic"
      ? Boolean(serverEnv.anthropicApiKey)
      : Boolean(serverEnv.groqApiKey);
  const model =
    provider === "anthropic" ? serverEnv.anthropicModel : serverEnv.groqModel;
  return { provider, model, keySet };
}

export async function callLLM(
  system: string,
  user: string,
  maxTokens = 1200,
  options?: { jsonMode?: boolean },
): Promise<string> {
  const provider = serverEnv.llmProvider;

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
        temperature: 0.6,
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

  // Default: Groq / any OpenAI-compatible chat endpoint
  if (!serverEnv.groqApiKey) throw new LLMError(503, "GROQ_API_KEY is not set");
  const r = await fetch(`${serverEnv.groqBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${serverEnv.groqApiKey}`,
    },
    body: JSON.stringify({
      model: serverEnv.groqModel,
      max_tokens: maxTokens,
      temperature: 0.6,
      ...(options?.jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok)
    throw new LLMError(502, `${provider} API error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new LLMError(502, "No text response from model");
  return stripFences(content);
}
