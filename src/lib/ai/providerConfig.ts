// ──────────────────────────────────────────────────────────────────────────────
// Server-side AI Provider Configuration
//
// Single source of truth for which LLM the app uses. The key NEVER leaves
// the server — there is no `/api/config` echo path for it. Operators set
// it via env vars and we read it from here.
//
// We support OpenAI by default and an OpenAI-compatible "custom" base URL
// for anyone who wants to point at a self-hosted gateway. Anthropic is also
// supported by setting AI_PROVIDER=anthropic.
// ──────────────────────────────────────────────────────────────────────────────

import type { PlannerProviderConfig } from "@/lib/agents/workflowAgent.v2";

export interface AiProviderConfig extends PlannerProviderConfig {
  /** Per-1K token input price in USD. Used by the quoting layer. */
  inputUsdPer1k: number;
  /** Per-1K token output price in USD. Used by the quoting layer. */
  outputUsdPer1k: number;
  /** Hard cap on the model's response so cost is bounded. */
  maxOutputTokens: number;
}

/**
 * Parse a positive number from env. Returns the fallback if unset or invalid.
 */
function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envString(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim().length > 0 ? raw : fallback;
}

/**
 * Returns the active AI provider config. Throws when the API key for the
 * selected provider is missing — without it the chat agent can't run, so
 * we want a loud, early failure at request time rather than a confusing
 * 401 from upstream.
 */
export function getAiProviderConfig(): AiProviderConfig {
  const provider = envString("AI_PROVIDER", "openai").toLowerCase();

  let apiKey: string;
  let apiBase: string;
  let model: string;

  if (provider === "anthropic") {
    apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    apiBase = envString("AI_API_BASE", "https://api.anthropic.com/v1");
    model = envString("AI_MODEL", "claude-sonnet-4-5");
  } else if (provider === "openai") {

    apiKey = process.env.OPENAI_API_KEY ?? "";
    apiBase = envString("AI_API_BASE", "https://api.openai.com/v1");
    model = envString("AI_MODEL", "gpt-4o-mini");
  } else {
    // "custom" / OpenAI-compatible proxy
    apiKey =
      process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
    apiBase = envString("AI_API_BASE", "https://api.openai.com/v1");
    model = envString("AI_MODEL", "gpt-4o-mini");
  }

  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      `Server AI provider is not configured. Set ${
        provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"
      } in the server environment.`
    );
  }

  const maxOutputTokens = envNumber("AI_MAX_OUTPUT_TOKENS", 2048);

  return {
    provider,
    apiBase,
    apiKey,
    model,
    // Pass the same cap down to the planner so the LLM call is bounded.
    maxTokens: maxOutputTokens,
    inputUsdPer1k: envNumber("AI_INPUT_USD_PER_1K", 0.00015),
    outputUsdPer1k: envNumber("AI_OUTPUT_USD_PER_1K", 0.0006),
    maxOutputTokens,
  };
}
