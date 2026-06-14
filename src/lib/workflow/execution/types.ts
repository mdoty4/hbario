// ──────────────────────────────────────────────────────────────────────────────
// Workflow Execution Types
//
// Shared types for the multi-step workflow executor. Each step in a compound
// workflow runs through a `StepExecutor` that turns the compiled step data
// into one or more wallet-signed transactions and returns a uniform result.
// ──────────────────────────────────────────────────────────────────────────────

import type { WalletMode } from "@/lib/wallet/types";

/** Status of a single step within a compound workflow execution. */
export type StepStatus =
  | "pending"            // not started
  | "awaiting_wallet"    // wallet popup open / user reviewing
  | "submitted"          // tx submitted, awaiting mirror node indexing
  | "verifying"          // mirror node verification in progress
  | "verified"           // mirror node confirmed SUCCESS
  | "failed"             // submission, verification, or wallet error
  | "skipped";           // stopOnError tripped earlier, this step was not attempted

/** Outcome of running a single step. */
export interface StepResult {
  /** Final terminal status — never `pending`/`awaiting_wallet`/`verifying`/`submitted`. */
  status: "verified" | "failed" | "skipped";
  /** Primary tx id (for steps that produce more than one — e.g. bulk account creation —
   *  this is the *first* tx; secondary ids live in `subTransactionIds`). */
  transactionId?: string;
  /** Additional tx ids when a step issues multiple transactions. */
  subTransactionIds?: string[];
  /** Human-readable error when the step failed. */
  error?: string;
  /** Arbitrary structured payload to record in the receipt (e.g. created account ids). */
  payload?: Record<string, unknown>;
}

/**
 * Progress notifications emitted by an executor as it works. The UI subscribes
 * to render incremental state ("Account 3 of 10 signed…"). Optional — executors
 * may run silently.
 */
/**
 * Per-sub-item result reported by executors that produce multiple discrete
 * outputs (e.g. bulk account creation, where each iteration creates one new
 * account with its own keypair). The executor pushes a growing list of these
 * through `onProgress` so the UI can render live results as work proceeds.
 *
 * SECURITY NOTE: `privateKey` lives only in browser memory. It is never sent
 * to our server (executors must redact it from `StepResult.payload`) and is
 * cleared from React state when the execution modal closes.
 */
export interface StepProgressItem {
  /** Stable index within the step (0-based). */
  index: number;
  /** Status of this sub-item. */
  status: "pending" | "awaiting_wallet" | "done" | "failed";
  /** Newly created Hedera account ID, once known from the mirror node. */
  accountId?: string;
  /** Public key (DER-encoded hex) for the new account. */
  publicKey?: string;
  /** Private key (DER-encoded hex). Browser-only; never persisted. */
  privateKey?: string;
  /** Transaction ID that created this account. */
  transactionId?: string;
  /** Free-form error when `status === "failed"`. */
  error?: string;
}

export interface StepProgress {
  /** 0-based index of the sub-action within the step (e.g. tx 3 of 10). */
  subIndex?: number;
  /** Total sub-actions in this step, when known. */
  subTotal?: number;
  /** Free-form message ("Awaiting wallet signature for account 3 of 10"). */
  message?: string;
  /** Running list of per-sub-item results (e.g. created accounts). */
  items?: StepProgressItem[];
}

/** Context handed to every executor. */
export interface StepExecutorContext {
  /** Connected wallet account ID (sender / payer). */
  payerAccount: string;
  /** Hedera network the workflow is executing on. */
  network: WalletMode;
  /** Sign + execute a prepared SDK transaction through the connected wallet. */
  signAndExecuteTransaction: (
    transaction: unknown,
  ) => Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
  }>;
  /** Request a simple HBAR transfer (preferred for single_payment / bulk_payout). */
  requestHbarTransfer: (params: {
    recipient: string;
    amount: number;
    memo?: string;
  }) => Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
  }>;
  /** Optional progress sink. */
  onProgress?: (progress: StepProgress) => void;
}

/** An executor knows how to run one kind of compound step. */
export interface StepExecutor {
  /** The step `kind` this executor handles. */
  readonly kind: string;
  /** Run the step. Implementations must never throw — return `failed` instead. */
  execute(
    step: Record<string, unknown>,
    ctx: StepExecutorContext,
  ): Promise<StepResult>;
}
