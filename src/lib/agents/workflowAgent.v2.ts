// ──────────────────────────────────────────────────────────────────────────────
// Workflow Agent v2 — LLM-driven, compound-workflow planner.
//
// This is the single source of truth for the chat UI. The chat page no longer
// falls through to a separate "regular chat" endpoint — every user message,
// from "hello" to "send 10 HBAR to 0.0.X and create 50 accounts", is handled
// here and returns either:
//
//   1. A compound workflow draft to compile + persist (intent: "compound"),
//   2. A conversational reply with no workflow (intent: "none", reply: "..."),
//      which the chat UI shows as-is.
//
// Design rules baked into the system prompt:
//   - The agent NEVER reveals private keys, NEVER tells the user to paste
//     them, and NEVER hands the user a Hedera SDK code sample. All signing
//     happens through the connected wallet via the Hedera Agent Kit in
//     RETURN_BYTES mode.
//   - A compound workflow is ALWAYS the output for actionable Hedera intents,
//     even if it has just one step. This unifies the data shape.
//   - For conversational/non-actionable messages the agent emits a short,
//     friendly reply that mentions which workflow kinds are available.
//
// Phase 1 supports these step kinds:
//   - single_payment           (send HBAR to one recipient)
//   - bulk_payout              (send HBAR to many recipients)
//   - bulk_account_creation    (create N new Hedera accounts owned by the wallet)
// More step kinds can be added later by extending the system prompt and the
// CompoundCompiler.
// ──────────────────────────────────────────────────────────────────────────────

import type { AgentDraft } from "@/lib/workflow/compiler/types";

/**
 * AI provider configuration sourced from the `AppConfig` row in the database.
 * Same shape as the chat route uses — we accept it so the planner runs on
 * whichever provider the user picked in `/configuration`.
 */
export interface PlannerProviderConfig {
  provider: string;
  apiBase: string;
  apiKey: string;
  model: string;
  maxTokens?: number | null;
}

export type AgentIntent = "compound" | "none";

export interface AgentResult {
  intent: AgentIntent;
  /** Draft suitable for `compileWorkflow` / `POST /api/workflows`. */
  draft?: AgentDraft;
  /** Conversational reply for the chat UI. Always non-empty after run. */
  assistantMessage: string;
  /** Which path produced this result. Always "llm" now (no regex paths). */
  source?: "llm" | "fallback";
}

export interface RunAgentOptions {
  /**
   * The connected wallet account (`0.0.X`). Required for workflow creation
   * because steps need to know the payer. If absent, the agent will still
   * answer conversational messages but will refuse workflow creation.
   */
  userAccountId?: string;
  /** Network the user is on. */
  network?: "testnet" | "mainnet";
  /**
   * Prior user messages in the conversation (most recent last). The agent
   * uses these for multi-turn context (e.g. follow-up clarifications).
   */
  history?: string[];
  /** User-configured AI provider. Required for the agent to run. */
  providerConfig?: PlannerProviderConfig;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the LLM-driven workflow agent against a user message.
 *
 * Always returns a usable `assistantMessage`. If no AI provider is configured,
 * returns a `none`/`fallback` result so the chat UI can render the standing
 * "configure your AI provider" notice.
 */
export async function runWorkflowAgent(
  message: string,
  opts: RunAgentOptions = {},
): Promise<AgentResult> {
  const provider = opts.providerConfig;
  const hasProvider = !!provider && !!provider.apiKey && provider.apiKey.trim() !== "";

  if (!hasProvider) {
    return {
      intent: "none",
      assistantMessage:
        "I can't respond right now — the AI provider isn't configured on the server.",
      source: "fallback",
    };
  }

  try {
    const planned = await runLlmPlanner(message, {
      userAccountId: opts.userAccountId,
      network: opts.network ?? "testnet",
      history: opts.history,
      providerConfig: provider!,
    });
    if (planned) {
      return { ...planned, source: "llm" };
    }
  } catch (err) {
    console.warn("[workflowAgent.v2] LLM planner failed:", err);
  }

  // Last-resort safety net so the chat is never stuck.
  return {
    intent: "none",
    assistantMessage:
      "I had trouble processing that request. Could you rephrase it? I can help create Hedera workflows like sending HBAR, bulk payouts, and creating new accounts.",
    source: "fallback",
  };
}

// ── LLM planner ───────────────────────────────────────────────────────────────

interface LlmPlannerOptions {
  userAccountId?: string;
  network: "testnet" | "mainnet";
  history?: string[];
  providerConfig: PlannerProviderConfig;
}

/** Step shape the LLM is asked to emit. Matches CompoundCompiler input. */
interface LlmStep {
  kind: "single_payment" | "bulk_payout" | "bulk_account_creation";
  // single_payment
  recipient?: string;
  amount?: number;
  // bulk_payout
  payouts?: Array<{ recipient: string; amount: number }>;
  // bulk_account_creation
  count?: number;
  initialBalanceHbar?: number;
  // shared
  memo?: string;
}

interface LlmPlanJson {
  intent: "compound" | "none";
  title?: string;
  summary?: string;
  reply?: string;
  steps?: LlmStep[];
}

const SYSTEM_PROMPT = `You are the planning brain for the hbario Workflow Agent — a
hosted Hedera commerce agent that exposes paid workflows. Every actionable
Hedera operation is turned into a workflow the user unlocks with a small
HBAR service fee, then executes by signing transactions with their
connected wallet. Do NOT mention specific HBAR fee amounts in your replies —
the UI shows the exact price on the Workflows page where the unlock button
lives.

YOUR JOB
- Read the user's message and the prior conversation.
- If it expresses an actionable Hedera intent we support, emit ONE compound
  workflow plan with an ordered "steps" array.
- If it is just conversation (greeting, question, small talk), emit
  {"intent":"none","reply": "<short helpful markdown reply>"} and do NOT
  invent a workflow.

SUPPORTED STEP KINDS (Phase 1)
- "single_payment"           — send a fixed HBAR amount to ONE Hedera account
  fields: { "recipient": "0.0.X", "amount": number_in_HBAR, "memo"?: string }

- "bulk_payout"              — send HBAR to MANY accounts in one workflow
  fields: { "payouts": [{ "recipient": "0.0.X", "amount": number }, ...], "memo"?: string }

- "bulk_account_creation"    — create N (1–500) new Hedera accounts owned by
                              the user's wallet, optionally pre-funded
  fields: { "count": int, "initialBalanceHbar"?: number, "memo"?: string }

If the user asks for a single payment, you may still wrap it in a compound
plan with a single-element "steps" array — always emit "intent":"compound"
for actionable Hedera requests.

If the user asks for compound things ("send 10 HBAR to A and create 5
accounts"), put each as a separate step in order.

HARD SAFETY RULES — VIOLATING THESE IS A BUG
- NEVER ask the user for or mention their private key, mnemonic, seed phrase,
  or passphrase. The connected wallet signs everything via WalletConnect.
- NEVER produce a Hedera SDK code sample (no @hashgraph/sdk imports, no
  PrivateKey.fromString*, no TransferTransaction code, no Python/JS tutorial).
  Your output is JSON only.
- NEVER tell the user to "use the Hedera Portal", "use HashPack", or any
  other alternative. They are using THIS app, which handles everything.
- NEVER produce a generic IT/dev-ops tutorial (no "Step 1: Plan, Step 2:
  Implementation" markdown lists). The user is not coding; they are
  asking this agent to do it.
- NEVER ask "what platform are you on" or "which SDK do you prefer". This
  is Hedera, in this app, period.
- If the request needs more info (missing amount, missing recipient, count
  out of range), return {"intent":"none","reply":"..."} asking ONE clear
  follow-up question.

HEDERA ACCOUNT FORMAT
- "0.0.12345" or "0.0.0.12345" — both have leading "0.0." and end with the
  account number. Treat them as opaque identifiers; do not validate
  formatting in your reply.

CONVERSATIONAL REPLIES (intent: "none")
- Keep them short (1–3 sentences).
- If asked "what can you do", list the supported intents in plain English
  with a one-line example each — but DO NOT show code.

OUTPUT SHAPE
Return ONE JSON object (no markdown fences, no prose around it) matching:
{
  "intent": "compound" | "none",
  "title"?: string,           // short human title for the workflow
  "summary"?: string,         // one-line plain-English summary
  "reply"?: string,           // markdown chat reply (always present for "none")
  "steps"?: [                 // required when intent="compound"
    {
      "kind": "single_payment" | "bulk_payout" | "bulk_account_creation",
      "recipient"?: string,
      "amount"?: number,
      "payouts"?: [{ "recipient": string, "amount": number }],
      "count"?: number,
      "initialBalanceHbar"?: number,
      "memo"?: string
    }
  ]
}`;

async function runLlmPlanner(
  message: string,
  opts: LlmPlannerOptions,
): Promise<AgentResult | null> {
  const historyLines = opts.history
    ?.filter((m) => m.trim())
    .map((m, i) => `  [${i + 1}] User: ${m}`)
    .join("\n");

  const contextSection = historyLines
    ? `Recent conversation history (earliest to most recent):\n${historyLines}\n\n`
    : "";

  const userPrompt =
    `User account: ${opts.userAccountId ?? "(no wallet connected)"}\n` +
    `Network: ${opts.network}\n\n` +
    contextSection +
    `Current user message:\n"""${message}"""`;

  const cfg = opts.providerConfig;
  let raw: string | null;
  if (cfg.provider === "anthropic") {
    raw = await callAnthropicCompatible(SYSTEM_PROMPT, userPrompt, cfg);
  } else {
    raw = await callOpenAICompatible(SYSTEM_PROMPT, userPrompt, cfg);
  }
  if (!raw) return null;

  const plan = safeParsePlan(raw);

  // Defensive: an LLM that ignores instructions and returns plain prose →
  // treat as a conversational reply.
  if (!plan) {
    return {
      intent: "none",
      assistantMessage: raw.trim().slice(0, 1500),
    };
  }

  if (plan.intent === "none") {
    return {
      intent: "none",
      assistantMessage:
        plan.reply?.trim() ||
        "I'm not sure how to help with that. Try: \"send 5 HBAR to 0.0.12345\", \"send 1 HBAR to 0.0.A and 0.0.B\", or \"create 10 accounts\".",
    };
  }

  // ── Map plan → AgentDraft (compound) ─────────────────────────────────
  if (plan.intent !== "compound") {
    return {
      intent: "none",
      assistantMessage:
        plan.reply ?? "I couldn't classify that request. Please rephrase.",
    };
  }

  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  if (steps.length === 0) {
    return {
      intent: "none",
      assistantMessage:
        plan.reply ??
        "I see what you're trying to do but I need a bit more detail to build the workflow.",
    };
  }

  const draftSteps = steps.map((s) => normalizeStepForDraft(s));

  // Build a default human-friendly title/summary if the LLM omitted them.
  const fallbackTitle = describeSteps(draftSteps);
  const title = plan.title?.trim() || fallbackTitle;
  const summary =
    plan.summary?.trim() ||
    `${draftSteps.length} step${draftSteps.length === 1 ? "" : "s"}: ${fallbackTitle}.`;

  const draft: AgentDraft = {
    title,
    type: "compound",
    prompt: message,
    summary,
    data: {
      steps: draftSteps,
      executionMode: "sequential",
      stopOnError: true,
      ...(opts.userAccountId ? { sender: opts.userAccountId } : {}),
    },
  };

  const replyMessage =
    plan.reply?.trim() ||
    `✅ I've drafted a workflow with **${draftSteps.length} step${draftSteps.length === 1 ? "" : "s"}**: ${fallbackTitle}.\n\nReview and run it on the **Workflows** page.`;

  return {
    intent: "compound",
    draft,
    assistantMessage: replyMessage,
  };
}

/**
 * Coerce LLM-emitted step objects into the shape the CompoundCompiler accepts.
 * We keep this permissive — the compiler will reject malformed data with a
 * useful error, which the API route surfaces to the user.
 */
function normalizeStepForDraft(s: LlmStep): Record<string, unknown> {
  switch (s.kind) {
    case "single_payment":
      return {
        kind: "single_payment",
        recipient: s.recipient,
        amount: s.amount,
        ...(s.memo ? { memo: s.memo } : {}),
      };
    case "bulk_payout":
      return {
        kind: "bulk_payout",
        payouts: s.payouts ?? [],
        ...(s.memo ? { memo: s.memo } : {}),
      };
    case "bulk_account_creation":
      return {
        kind: "bulk_account_creation",
        count: s.count,
        ...(s.initialBalanceHbar !== undefined
          ? { initialBalanceHbar: s.initialBalanceHbar }
          : {}),
        ...(s.memo ? { memo: s.memo } : {}),
      };
    default:
      return { kind: (s as { kind?: string }).kind ?? "unknown" };
  }
}

/** Render a one-line human summary of a step list (used for titles). */
function describeSteps(steps: Array<Record<string, unknown>>): string {
  return steps
    .map((s) => {
      const kind = s.kind as string;
      if (kind === "single_payment") {
        return `send ${s.amount} HBAR to ${s.recipient}`;
      }
      if (kind === "bulk_payout") {
        const payouts = (s.payouts as Array<{ amount?: number }>) ?? [];
        const total = payouts.reduce((sum, p) => sum + (p.amount ?? 0), 0);
        return `bulk payout of ${total} HBAR to ${payouts.length} recipients`;
      }
      if (kind === "bulk_account_creation") {
        return `create ${s.count} Hedera account${(s.count as number) === 1 ? "" : "s"}`;
      }
      return kind;
    })
    .join(", then ");
}

// ── Provider adapters ────────────────────────────────────────────────────────
// Same lightweight raw-fetch adapters as before — no SDKs pulled in. The
// OpenAI-compatible adapter covers OpenAI, X.AI (Grok), and the "custom"
// option in our provider registry.

async function callOpenAICompatible(
  system: string,
  user: string,
  cfg: PlannerProviderConfig,
): Promise<string | null> {
  const base = cfg.apiBase.replace(/\/$/, "");
  const url = `${base}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
      ...(cfg.maxTokens ? { max_tokens: cfg.maxTokens } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${cfg.provider} ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? null;
}

async function callAnthropicCompatible(
  system: string,
  user: string,
  cfg: PlannerProviderConfig,
): Promise<string | null> {
  const base = cfg.apiBase.replace(/\/$/, "");
  const url = base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: cfg.maxTokens ?? 1024,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const block = data.content?.find((c) => c.type === "text");
  return block?.text ?? null;
}

function safeParsePlan(raw: string): LlmPlanJson | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(stripped) as LlmPlanJson;
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as LlmPlanJson;
    } catch {
      return null;
    }
  }
}
