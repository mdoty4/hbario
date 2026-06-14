// ──────────────────────────────────────────────────────────────────────────────
// Workflow Compiler Types
//
// Shared TypeScript interfaces for the workflow compiler system.
// Defines the compiler interface, compilation results, and workflow JSON schemas.
// ──────────────────────────────────────────────────────────────────────────────

// ── Supported Workflow Types ──────────────────────────────────────────────────

export type WorkflowType =
  | "single_payment"
  | "bulk_payout"
  | "liquidity_path_analysis"
  | "bulk_account_creation"
  | "compound";

/** All supported workflow type strings. */
export const SUPPORTED_WORKFLOW_TYPES: ReadonlySet<WorkflowType> = new Set([
  "single_payment",
  "bulk_payout",
  "liquidity_path_analysis",
  "bulk_account_creation",
  "compound",
]);

// ── Compiler Input ────────────────────────────────────────────────────────────

/** Raw agent draft that the compiler receives before validation. */
export interface AgentDraft {
  /** Human-readable title for the workflow. */
  title: string;
  /** The workflow type (e.g. "single_payment", "bulk_payout", "liquidity_path_analysis"). */
  type: string;
  /** The original user prompt that generated this draft. */
  prompt?: string;
  /** Summary of what the workflow does. */
  summary?: string;
  /** Free-form data extracted from the agent's response. */
  data?: Record<string, unknown>;
}

// ── Compilation Result ────────────────────────────────────────────────────────

/** Severity level for a compilation issue. */
export type IssueSeverity = "error" | "warning" | "info";

/** A single issue found during compilation. */
export interface CompilationIssue {
  /** Severity of the issue. */
  severity: IssueSeverity;
  /** Human-readable description of the issue. */
  message: string;
  /** Optional field path that the issue relates to. */
  field?: string;
}

/** The overall status of a compilation. */
export type CompilationStatus = "valid" | "incomplete" | "invalid";

/** Result of compiling an agent draft into a workflow. */
export interface CompilationResult {
  /** Whether the draft compiled successfully. */
  status: CompilationStatus;
  /** Issues found during compilation (warnings, errors, info notes). */
  issues: CompilationIssue[];
  /** The normalized, consistent workflow JSON (only present when status is "valid" or "incomplete"). */
  workflowJson?: CompiledWorkflowJson;
  /** Risk notes added by the compiler. */
  riskNotes?: string[];
}

// ── Compiler Interface ────────────────────────────────────────────────────────

/** A compiler that validates and normalizes a specific workflow type. */
export interface WorkflowCompiler {
  /** The workflow type this compiler handles. */
  readonly type: WorkflowType;

  /**
   * Compile an agent draft into a validated, normalized workflow JSON.
   *
   * @param draft - The raw agent draft to compile.
   * @returns A compilation result with status, issues, and workflow JSON.
   */
  compile(draft: AgentDraft): CompilationResult;
}

// ── Workflow JSON Schemas ─────────────────────────────────────────────────────

/** A single payment recipient in the compiled workflow JSON. */
export interface SinglePaymentRecipient {
  /** Hedera account ID of the recipient. */
  account: string;
  /** Amount to send in HBAR. */
  amountHbar: number;
  /** Amount in tinybars. */
  amountTinybars: number;
}

/** Compiled workflow JSON for a single_payment workflow. */
export interface SinglePaymentWorkflowJson {
  workflowType: "single_payment";
  version: number;
  recipient: SinglePaymentRecipient;
  sender?: string;
  memo?: string;
  riskNotes: string[];
  toolPlan?: Record<string, unknown>;
  metadata: WorkflowMetadata;
}

/** A single payout entry in a bulk payout workflow. */
export interface BulkPayoutRecipient {
  /** Hedera account ID of the recipient. */
  account: string;
  /** Amount to send in HBAR. */
  amountHbar: number;
  /** Amount in tinybars. */
  amountTinybars: number;
}

/** Compiled workflow JSON for a bulk_payout workflow. */
export interface BulkPayoutWorkflowJson {
  workflowType: "bulk_payout";
  version: number;
  recipients: BulkPayoutRecipient[];
  sender?: string;
  memo?: string;
  /** Total amount across all recipients in HBAR. */
  totalAmountHbar: number;
  /** Total amount across all recipients in tinybars. */
  totalAmountTinybars: number;
  /** Warnings about missing or duplicate recipients. */
  warnings: string[];
  riskNotes: string[];
  toolPlan?: Record<string, unknown>;
  metadata: WorkflowMetadata;
}

/** A token pair for liquidity path analysis. */
export interface TokenPair {
  /** Token symbol or ID for the source token. */
  from: string;
  /** Token symbol or ID for the destination token. */
  to: string;
}

/** Compiled workflow JSON for a liquidity_path_analysis workflow. */
export interface LiquidityPathAnalysisWorkflowJson {
  workflowType: "liquidity_path_analysis";
  version: number;
  /** Whether this workflow is analysis-only (no fund movement). */
  analysisOnly: true;
  tokenPair: TokenPair;
  riskNotes: string[];
  toolPlan?: Record<string, unknown>;
  metadata: WorkflowMetadata;
}

/** Metadata attached to every compiled workflow JSON. */
export interface WorkflowMetadata {
  /** ISO timestamp when the workflow was compiled. */
  compiledAt: string;
  /** Version of the compiler schema. */
  schemaVersion: number;
  /** Original workflow type string from the agent draft. */
  originalType: string;
}

/** Compiled workflow JSON for a bulk_account_creation workflow.
 *
 * Creates N new Hedera accounts whose admin key is the user's connected
 * wallet public key. Execution happens via the Hedera Agent Kit
 * `coreAccountPlugin.create-account` tool in RETURN_BYTES mode — each
 * created account is signed by the user's wallet, never by the server.
 */
export interface BulkAccountCreationWorkflowJson {
  workflowType: "bulk_account_creation";
  version: number;
  /** Number of accounts to create (validated 1–500). */
  count: number;
  /** Optional initial HBAR balance for each created account. */
  initialBalanceHbar?: number;
  /** Optional initial balance in tinybars (mirrors HBAR for execution). */
  initialBalanceTinybars?: number;
  /** Total HBAR funding required across all created accounts (count × initial). */
  totalFundingHbar: number;
  /** Account that pays for + funds the new accounts. */
  sender?: string;
  /** Optional memo applied to each create transaction. */
  memo?: string;
  riskNotes: string[];
  toolPlan?: Record<string, unknown>;
  metadata: WorkflowMetadata;
}

// ── Compound Workflow ─────────────────────────────────────────────────────────
//
// A compound workflow is an ordered series of single-purpose steps that share
// a single 1-HBAR unlock. The LLM agent emits these for compound natural-language
// requests like "send 10 HBAR to 0.0.X and create a new account".
//
// Each step kind maps 1:1 to an existing single-purpose workflow type so the
// validation logic can be reused. Phase-1 execution routes compound-with-one-step
// workflows to the existing per-type executors; multi-step execution is Phase 2.

/** A single payment step inside a compound workflow. */
export interface CompoundStepSinglePayment {
  kind: "single_payment";
  recipient: string;
  amountHbar: number;
  amountTinybars: number;
  memo?: string;
}

/** A bulk payout step inside a compound workflow. */
export interface CompoundStepBulkPayout {
  kind: "bulk_payout";
  recipients: BulkPayoutRecipient[];
  totalAmountHbar: number;
  totalAmountTinybars: number;
  memo?: string;
}

/** A bulk account creation step inside a compound workflow. */
export interface CompoundStepBulkAccountCreation {
  kind: "bulk_account_creation";
  count: number;
  initialBalanceHbar?: number;
  initialBalanceTinybars?: number;
  totalFundingHbar: number;
  memo?: string;
}

/** Discriminated union over all compound step kinds. */
export type CompoundStep =
  | CompoundStepSinglePayment
  | CompoundStepBulkPayout
  | CompoundStepBulkAccountCreation;

/** Compiled workflow JSON for a compound workflow. */
export interface CompoundWorkflowJson {
  workflowType: "compound";
  version: number;
  /** Ordered list of steps the user is paying to unlock + execute. */
  steps: CompoundStep[];
  /** How steps are executed. Phase 1 only supports "sequential". */
  executionMode: "sequential";
  /** If true, halt the workflow on the first failed step. Defaults to true. */
  stopOnError: boolean;
  sender?: string;
  /** Sum of HBAR across all funding steps (payouts + bulk-account funding). */
  totalHbar: number;
  riskNotes: string[];
  toolPlan?: Record<string, unknown>;
  metadata: WorkflowMetadata;
}

// ── Union Types ───────────────────────────────────────────────────────────────

/** Any compiled workflow JSON. */
export type CompiledWorkflowJson =
  | SinglePaymentWorkflowJson
  | BulkPayoutWorkflowJson
  | LiquidityPathAnalysisWorkflowJson
  | BulkAccountCreationWorkflowJson
  | CompoundWorkflowJson;
