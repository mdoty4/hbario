// ──────────────────────────────────────────────────────────────────────────────
// Client-side helpers for parsing compiled workflow JSON in the UI.
//
// Used by the Workflows list/detail pages to decide what to render and how to
// route the ▶ Play button. Pure functions, no React, no server code.
// ──────────────────────────────────────────────────────────────────────────────

export interface SinglePaymentExecution {
  recipient: string;
  amountHbar: number;
  memo?: string;
}

/** Lightweight parsed view of a compiled workflow JSON for UI consumption. */
export interface ParsedWorkflowView {
  /** The discriminator from the compiled JSON ("compound" | "single_payment" | …). */
  workflowType: string;
  /** Step rows for compound workflows. Empty for non-compound types. */
  steps: Array<Record<string, unknown>>;
  /** Sum of HBAR across all steps (for compound) or the recipient amount (single). */
  totalHbar: number | null;
  /** Sender, if known. */
  sender?: string;
  /** If executable via the single-payment runner, the extracted details. */
  singlePaymentExecution: SinglePaymentExecution | null;
  /** Raw parsed JSON object. */
  raw: Record<string, unknown> | null;
}

const EMPTY_VIEW: ParsedWorkflowView = {
  workflowType: "unknown",
  steps: [],
  totalHbar: null,
  singlePaymentExecution: null,
  raw: null,
};

/**
 * Parse a `workflow.workflowJson` string into a UI-friendly view.
 *
 * Returns a stable shape even if the input is malformed/null so callers don't
 * need null-checking everywhere.
 */
export function parseWorkflowView(
  workflowJson: string | null | undefined,
  fallbackType?: string,
): ParsedWorkflowView {
  if (!workflowJson) return { ...EMPTY_VIEW, workflowType: fallbackType ?? "unknown" };

  let raw: unknown;
  try {
    raw = JSON.parse(workflowJson);
  } catch {
    return { ...EMPTY_VIEW, workflowType: fallbackType ?? "unknown" };
  }

  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_VIEW, workflowType: fallbackType ?? "unknown" };
  }

  const obj = raw as Record<string, unknown>;
  const workflowType =
    (typeof obj.workflowType === "string" && obj.workflowType) ||
    fallbackType ||
    "unknown";
  const sender = typeof obj.sender === "string" ? obj.sender : undefined;

  // ── compound ──────────────────────────────────────────────────────────
  if (workflowType === "compound") {
    const steps = Array.isArray(obj.steps)
      ? (obj.steps as Array<Record<string, unknown>>)
      : [];
    const totalHbar =
      typeof obj.totalHbar === "number" ? (obj.totalHbar as number) : null;

    // Phase-1: if there's exactly one step and it's single_payment, route it
    // through the existing single-payment executor.
    let singlePaymentExecution: SinglePaymentExecution | null = null;
    if (steps.length === 1 && steps[0]?.kind === "single_payment") {
      const step = steps[0];
      const recipient = step.recipient;
      const amountHbar = step.amountHbar ?? step.amount;
      const memo = step.memo;
      if (typeof recipient === "string" && typeof amountHbar === "number") {
        singlePaymentExecution = {
          recipient,
          amountHbar,
          memo: typeof memo === "string" ? memo : undefined,
        };
      }
    }

    return {
      workflowType,
      steps,
      totalHbar,
      sender,
      singlePaymentExecution,
      raw: obj,
    };
  }

  // ── single_payment (legacy / direct) ─────────────────────────────────
  if (workflowType === "single_payment" || fallbackType === "single_payment" || fallbackType === "transfer") {
    const recipientObj = obj.recipient as Record<string, unknown> | undefined;
    const recipient = recipientObj?.account;
    const amountHbar = recipientObj?.amountHbar;
    const memo = obj.memo;
    let exec: SinglePaymentExecution | null = null;
    if (typeof recipient === "string" && typeof amountHbar === "number") {
      exec = {
        recipient,
        amountHbar,
        memo: typeof memo === "string" ? memo : undefined,
      };
    }
    return {
      workflowType,
      steps: [],
      totalHbar: typeof amountHbar === "number" ? amountHbar : null,
      sender,
      singlePaymentExecution: exec,
      raw: obj,
    };
  }

  // ── bulk_payout / bulk_account_creation / liquidity_path_analysis ─────
  // No single-payment routing; UI will show plan but Play is gated to Phase 2.
  return {
    workflowType,
    steps: [],
    totalHbar:
      typeof obj.totalAmountHbar === "number"
        ? (obj.totalAmountHbar as number)
        : typeof obj.totalFundingHbar === "number"
        ? (obj.totalFundingHbar as number)
        : null,
    sender,
    singlePaymentExecution: null,
    raw: obj,
  };
}

/** Render-ready description of a compound step. */
export interface CompoundStepView {
  kind: string;
  /** Short title ("Send 10 HBAR to 0.0.X"). */
  title: string;
  /** Optional subtitle (memo, recipient count, funding). */
  subtitle?: string;
}

/** Turn a raw compound `steps[]` entry into a human-readable row. */
export function describeCompoundStep(
  step: Record<string, unknown>,
): CompoundStepView {
  const kind = String(step.kind ?? "unknown");

  if (kind === "single_payment") {
    const amount = step.amountHbar ?? step.amount;
    const recipient = step.recipient;
    return {
      kind,
      title: `Send ${amount} HBAR to ${recipient}`,
      subtitle:
        typeof step.memo === "string" && step.memo
          ? `Memo: ${step.memo}`
          : undefined,
    };
  }

  if (kind === "bulk_payout") {
    const recipients = Array.isArray(step.recipients)
      ? (step.recipients as Array<Record<string, unknown>>)
      : [];
    const total =
      typeof step.totalAmountHbar === "number"
        ? (step.totalAmountHbar as number)
        : recipients.reduce(
            (s, r) =>
              s + (typeof r.amountHbar === "number" ? (r.amountHbar as number) : 0),
            0,
          );
    return {
      kind,
      title: `Bulk payout of ${total} HBAR to ${recipients.length} recipient${
        recipients.length === 1 ? "" : "s"
      }`,
      subtitle:
        typeof step.memo === "string" && step.memo
          ? `Memo: ${step.memo}`
          : undefined,
    };
  }

  if (kind === "bulk_account_creation") {
    const count = step.count;
    const initial = step.initialBalanceHbar;
    const fundingNote =
      typeof initial === "number" && initial > 0
        ? `, each pre-funded with ${initial} HBAR`
        : "";
    return {
      kind,
      title: `Create ${count} Hedera account${count === 1 ? "" : "s"}${fundingNote}`,
      subtitle:
        typeof step.memo === "string" && step.memo
          ? `Memo: ${step.memo}`
          : undefined,
    };
  }

  return { kind, title: `Unknown step: ${kind}` };
}
