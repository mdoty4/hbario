// ──────────────────────────────────────────────────────────────────────────────
// Workflow Execution — Registry
//
// Maps compound-step `kind` strings to their executor implementations. Adding
// a new step kind is a one-line change here plus the executor file itself.
// ──────────────────────────────────────────────────────────────────────────────

import { singlePaymentExecutor } from "./singlePayment";
import { bulkPayoutExecutor } from "./bulkPayout";
import { bulkAccountCreationExecutor } from "./bulkAccountCreation";
import type { StepExecutor } from "./types";

const EXECUTORS: Record<string, StepExecutor> = {
  [singlePaymentExecutor.kind]: singlePaymentExecutor,
  [bulkPayoutExecutor.kind]: bulkPayoutExecutor,
  [bulkAccountCreationExecutor.kind]: bulkAccountCreationExecutor,
};

/** Look up the executor for a step kind, or `null` if none registered. */
export function getStepExecutor(kind: string): StepExecutor | null {
  return EXECUTORS[kind] ?? null;
}

/** Set of all registered step kinds (used by the UI to gate the play button). */
export function supportedStepKinds(): ReadonlySet<string> {
  return new Set(Object.keys(EXECUTORS));
}

export type {
  StepExecutor,
  StepExecutorContext,
  StepResult,
  StepStatus,
  StepProgress,
  StepProgressItem,
} from "./types";
