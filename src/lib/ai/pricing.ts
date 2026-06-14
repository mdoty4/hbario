// ──────────────────────────────────────────────────────────────────────────────
// AI Quote Math
//
// Computes the HBAR price we charge a user for one LLM planning call.
//
//   estUsd      = inputTokens * inRate + maxOutputTokens * outRate
//   totalUsd    = estUsd + serviceFeeUsd
//   quoteHbar   = (totalUsd / hbarUsdRate) * slippageBuffer
//
// We over-quote by `AI_SLIPPAGE_BUFFER` (default 10%) so HBAR price wobble
// between quote-time and pay-time doesn't strand a user mid-flow. The
// difference becomes our margin if the price stays flat, which we consider
// acceptable for a v1 pricing model — the alternative is mid-flow re-quoting,
// which has its own UX problems.
//
// Tokenization: we do NOT bring in tiktoken / a real tokenizer. For Phase 1
// we count tokens via a coarse "4 characters per token" heuristic which the
// industry has standardized around for rough cost estimation. This is good
// enough to compute an upper-bound — the only risk is over-quoting, which is
// what we already lean into via the slippage buffer.
// ──────────────────────────────────────────────────────────────────────────────

import { getHbarUsdPrice } from "@/lib/ai/hbarPrice";
import { getAiProviderConfig } from "@/lib/ai/providerConfig";

/**
 * Coarse token estimate. ~4 chars per token is a well-known approximation for
 * GPT-class tokenizers; off by ±20% in pathological cases. We round UP so the
 * estimate biases toward "we charged enough".
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export interface QuoteBreakdown {
  /** Estimated input tokens (system prompt + user message + history). */
  inputTokens: number;
  /** Hard cap on output tokens for this call. */
  maxOutputTokens: number;
  /** Inference cost in USD before service fee. */
  inferenceUsd: number;
  /** Flat platform fee in USD. */
  serviceFeeUsd: number;
  /** Inference + service fee in USD. */
  totalUsd: number;
  /** HBAR/USD rate snapshot used for the conversion. */
  hbarUsdRate: number;
  /** Source of the HBAR price ("coingecko" or "fallback"). */
  hbarPriceSource: "coingecko" | "fallback";
  /** Slippage multiplier applied to the HBAR amount. */
  slippageBuffer: number;
  /** Final HBAR amount the user pays. */
  quoteHbar: number;
}

interface QuoteInput {
  /** The user's chat message. */
  message: string;
  /** Prior conversation lines for context (counted toward input tokens). */
  history?: string[];
}

/** Read a positive number from env, falling back when unset/invalid. */
function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Build a price quote for an AI planning call. Pure-ish: it does fetch the
 * HBAR price, but that fetch is cached so callers can use this synchronously
 * after warm-up.
 */
export async function buildAiPlanningQuote(
  input: QuoteInput
): Promise<QuoteBreakdown> {
  const cfg = getAiProviderConfig();
  const price = await getHbarUsdPrice();

  const promptText = [
    input.message,
    ...(input.history ?? []).filter((h) => h.trim().length > 0),
  ].join("\n");

  // We add a fixed system-prompt token budget so the user can't trivially
  // under-quote themselves with a one-character message. The system prompt
  // is ~1200 tokens by our rough count; leave headroom.
  const SYSTEM_PROMPT_TOKEN_BUDGET = 1500;
  const inputTokens = estimateTokens(promptText) + SYSTEM_PROMPT_TOKEN_BUDGET;

  const inferenceUsd =
    (inputTokens / 1000) * cfg.inputUsdPer1k +
    (cfg.maxOutputTokens / 1000) * cfg.outputUsdPer1k;

  const serviceFeeUsd = envNumber("AI_SERVICE_FEE_USD", 0.02);
  const slippageBuffer = envNumber("AI_SLIPPAGE_BUFFER", 1.1);
  const minQuoteHbar = envNumber("AI_MIN_QUOTE_HBAR", 0.05);
  const maxQuoteHbar = envNumber("AI_MAX_QUOTE_HBAR", 5);

  const totalUsd = inferenceUsd + serviceFeeUsd;
  const rawHbar = (totalUsd / price.usdPerHbar) * slippageBuffer;

  // Round to 4 decimals (precision plenty for HBAR) and clamp to bounds so a
  // bad price feed or runaway prompt can't quote 500 HBAR by accident.
  const clamped = Math.min(maxQuoteHbar, Math.max(minQuoteHbar, rawHbar));
  const quoteHbar = Math.round(clamped * 10_000) / 10_000;

  return {
    inputTokens,
    maxOutputTokens: cfg.maxOutputTokens,
    inferenceUsd,
    serviceFeeUsd,
    totalUsd,
    hbarUsdRate: price.usdPerHbar,
    hbarPriceSource: price.source,
    slippageBuffer,
    quoteHbar,
  };
}

/**
 * Pick the configured treasury account for AI planning orders, honoring
 * per-network overrides the same way `pickTreasuryAccount` does for
 * workflow unlock orders. We keep both schemes parallel so operators can
 * configure them the same mental way.
 */
export function pickAiTreasuryAccount(
  network: "testnet" | "mainnet"
): string {
  const perNetwork =
    network === "mainnet"
      ? process.env.HEDERA_AI_TREASURY_ACCOUNT_ID_MAINNET
      : process.env.HEDERA_AI_TREASURY_ACCOUNT_ID_TESTNET;
  return (
    perNetwork ||
    process.env.HEDERA_AI_TREASURY_ACCOUNT_ID ||
    process.env.HEDERA_TREASURY_ACCOUNT_ID ||
    ""
  );
}

/** Quote validity window. */
export function getQuoteTtlMs(): number {
  return envNumber("AI_QUOTE_TTL_MS", 80_000);
}
