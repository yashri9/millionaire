/**
 * env.ts — centralized environment access.
 *
 * Split into `publicEnv` (safe for the browser, only NEXT_PUBLIC_*) and
 * `serverEnv` (secrets — MUST only be imported from server code: route
 * handlers, server components, server actions). Importing `serverEnv` from a
 * client component will leak secrets into the browser bundle — never do it.
 */

const PRODUCTION_APP_URL = "https://voxdeck.vercel.app";
const LOCAL_APP_URL = "http://localhost:3010";

export const publicEnv = {
  appUrl:
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.NODE_ENV === "production" ? PRODUCTION_APP_URL : LOCAL_APP_URL),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

/** Absolute URL for email confirmation and OAuth callbacks. Never localhost in production. */
export function authRedirectUrl(path: string): string {
  const base = publicEnv.appUrl.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

/** Server-only secrets. Do NOT import this from a "use client" file. */
export const serverEnv = {
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  decksBucket: process.env.SUPABASE_DECKS_BUCKET ?? "decks",

  /** Default: Groq. Also: "xai"/"grok" for xAI Grok, or "anthropic". */
  llmProvider: (process.env.LLM_PROVIDER ?? "groq").toLowerCase(),
  xaiApiKey: process.env.XAI_API_KEY ?? process.env.GROK_API_KEY ?? "",
  xaiModel: process.env.XAI_MODEL ?? process.env.GROK_MODEL ?? "grok-4.6",
  xaiBaseUrl: process.env.XAI_BASE_URL ?? process.env.GROK_BASE_URL ?? "https://api.x.ai/v1",
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  groqModel: process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b",
  groqBaseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
  anthropicVersion: process.env.ANTHROPIC_VERSION ?? "2023-06-01",

  emailProvider: (process.env.EMAIL_PROVIDER ?? "dev").toLowerCase(),
  emailFrom: process.env.EMAIL_FROM ?? "Deck Agent <notify@example.com>",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  postmarkToken: process.env.POSTMARK_SERVER_TOKEN ?? "",

  askRateLimitPerSession: Number(process.env.ASK_RATE_LIMIT_PER_SESSION ?? "20"),

  /** Override if LibreOffice isn't found on PATH (mirrors backend/server.py's SOFFICE_PATH). */
  sofficePath: process.env.SOFFICE_PATH ?? "",
};

/** True when Supabase env is present; used to run in "stub/dev mode" otherwise. */
export const isSupabaseConfigured = () =>
  Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
