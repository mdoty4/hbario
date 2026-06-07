// ──────────────────────────────────────────────────────────────────────────────
// Hedera Tool Types
//
// Shared TypeScript interfaces for all Hedera tool functions.
// No private keys, no automatic fund movement.
// ──────────────────────────────────────────────────────────────────────────────

// ── Account ───────────────────────────────────────────────────────────────────

/** A Hedera account identifier in the format `0.{shard}.{realm}@{num}` or `0.{shard}.{realm}.{num}`. */
export type AccountId = string;

/** Result of account validation. */
export interface ValidateAccountResult {
  /** Whether the account ID format is valid. */
  valid: boolean;
  /** The account ID that was checked. */
  accountId: AccountId;
  /** Human-readable error message when validation fails. */
  error?: string;
}

/** Balance information for a Hedera account. */
export interface AccountBalance {
  /** The account ID. */
  accountId: AccountId;
  /** Balance in tinybars (1 HBAR = 100,000,000 tinybars). */
  tinybars: number;
  /** Balance in human-readable HBAR. */
  hbar: number;
}

// ── Fee Estimates ─────────────────────────────────────────────────────────────

/** Parameters for a single HBAR transfer fee estimate. */
export interface TransferFeeParams {
  /** Sender account ID. */
  sender: AccountId;
  /** Recipient account ID. */
  recipient: AccountId;
  /** Amount to transfer in HBAR. */
  amount: number;
}

/** Parameters for a bulk payout fee estimate. */
export interface BulkPayoutFeeParams {
  /** Sender account ID. */
  sender: AccountId;
  /** Array of payout recipients and amounts. */
  payouts: PayoutEntry[];
}

/** A single payout entry in a bulk payout. */
export interface PayoutEntry {
  /** Recipient account ID. */
  recipient: AccountId;
  /** Amount to send in HBAR. */
  amount: number;
}

/** Result of a fee estimation. */
export interface FeeEstimate {
  /** Estimated network fee in tinybars. */
  feeTinybars: number;
  /** Estimated network fee in HBAR. */
  feeHbar: number;
  /** Whether this is a mock estimate. */
  isMock: boolean;
}

// ── Prepare Tools ─────────────────────────────────────────────────────────────

/** Parameters for preparing an HBAR transfer. */
export interface PrepareTransferParams {
  /** Sender account ID. */
  sender: AccountId;
  /** Recipient account ID. */
  recipient: AccountId;
  /** Amount to transfer in HBAR. */
  amount: number;
  /** Optional memo for the transfer. */
  memo?: string;
}

/** Parameters for preparing a bulk payout. */
export interface PrepareBulkPayoutParams {
  /** Sender account ID. */
  sender: AccountId;
  /** Array of payout recipients and amounts. */
  payouts: PayoutEntry[];
  /** Optional memo for the bulk payout. */
  memo?: string;
}

/** A structured transfer instruction returned by prepare tools. */
export interface TransferInstruction {
  /** Unique instruction ID for tracking. */
  instructionId: string;
  /** Instruction type. */
  type: "HBAR_TRANSFER";
  /** Sender account ID. */
  sender: AccountId;
  /** Recipient account ID. */
  recipient: AccountId;
  /** Amount in HBAR. */
  amount: number;
  /** Amount in tinybars. */
  amountTinybars: number;
  /** Optional memo. */
  memo?: string;
  /** Estimated fee in HBAR. */
  estimatedFeeHbar: number;
  /** Status — always `PENDING_APPROVAL` until user signs. */
  status: "PENDING_APPROVAL";
  /** Human-readable summary of the instruction. */
  summary: string;
  /** Whether this was generated in mock mode. */
  isMock: boolean;
}

/** A structured bulk payout instruction returned by prepare tools. */
export interface BulkPayoutInstruction {
  /** Unique instruction ID for tracking. */
  instructionId: string;
  /** Instruction type. */
  type: "BULK_PAYOUT";
  /** Sender account ID. */
  sender: AccountId;
  /** Individual transfer instructions. */
  transfers: TransferInstruction[];
  /** Total amount across all transfers in HBAR. */
  totalAmountHbar: number;
  /** Total estimated fees in HBAR. */
  totalEstimatedFeeHbar: number;
  /** Optional memo. */
  memo?: string;
  /** Status — always `PENDING_APPROVAL` until user signs. */
  status: "PENDING_APPROVAL";
  /** Human-readable summary of the instruction. */
  summary: string;
  /** Whether this was generated in mock mode. */
  isMock: boolean;
}

// ── Verification Tools ────────────────────────────────────────────────────────

/** A Hedera transaction ID. */
export type TransactionId = string;

/** Expected details to verify against a transaction. */
export interface ExpectedTransactionDetails {
  /** Expected sender account. */
  sender?: AccountId;
  /** Expected recipient account. */
  recipient?: AccountId;
  /** Expected amount in HBAR. */
  amountHbar?: number;
}

/** Result of a transaction verification. */
export interface VerificationResult {
  /** Whether the transaction matches expected details. */
  verified: boolean;
  /** The transaction ID that was checked. */
  transactionId: TransactionId;
  /** Details about what was verified. */
  details?: Record<string, string | number | boolean>;
  /** Error message when verification fails. */
  error?: string;
  /** Whether this was a mock verification. */
  isMock: boolean;
}

/** Result of a transaction receipt lookup. */
export interface TransactionReceipt {
  /** The transaction ID. */
  transactionId: TransactionId;
  /** Status of the transaction. */
  status: "SUCCESS" | "FAILURE" | "PENDING" | "NOT_FOUND";
  /** Block hash (hex) if available. */
  blockHash?: string;
  /** Consensus timestamp (ISO string). */
  consensusTimestamp?: string;
  /** Whether this was a mock receipt. */
  isMock: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert HBAR to tinybars (1 HBAR = 100,000,000 tinybars). */
export function hbarToTinybars(hbar: number): number {
  return Math.round(hbar * 100_000_000);
}

/** Convert tinybars to HBAR. */
export function tinybarsToHbar(tinybars: number): number {
  return tinybars / 100_000_000;
}

// ── Tool Registry Types ───────────────────────────────────────────────────────

/** The functional category of a tool. */
export type ToolCategory = "read" | "estimate" | "prepare" | "verify";

/** Schema for a single argument expected by a tool. */
export interface ToolArgSchema {
  /** Argument name. */
  name: string;
  /** Expected JavaScript type. */
  type: "string" | "number" | "boolean" | "object" | "array";
  /** Whether the argument is required. */
  required: boolean;
  /** Human-readable description. */
  description?: string;
}

/** A registered tool entry in the backend-controlled allowlist. */
export interface ToolRegistryEntry {
  /** Unique tool name the agent references. */
  name: string;
  /** Short description of what the tool does. */
  description: string;
  /** Functional category. */
  category: ToolCategory;
  /** Argument schema the router uses for basic validation. */
  args: ToolArgSchema[];
}

// ── Tool Plan Types ───────────────────────────────────────────────────────────

/** A single tool invocation proposed by the agent. */
export interface ProposedToolCall {
  /** Tool name from the registry. */
  name: string;
  /** Arguments to pass to the tool. */
  args?: Record<string, unknown>;
}

/** A tool plan proposed by the agent. */
export interface ToolPlan {
  /** The workflow type this plan targets. */
  workflow_type: string;
  /** Ordered list of tool names the agent wants to call. */
  required_tools: string[];
  /** Optional detailed tool call specs with arguments. */
  tool_calls?: ProposedToolCall[];
}

/** Result of validating a single tool in a plan. */
export interface ToolValidationResult {
  /** The tool name. */
  tool: string;
  /** Whether the tool was approved. */
  approved: boolean;
  /** Rejection reason when not approved. */
  reason?: string;
}

/** Result of routing an agent's tool plan through the backend router. */
export interface ToolRoutingResult {
  /** Whether the entire plan was approved. */
  approved: boolean;
  /** Per-tool validation results. */
  tools: ToolValidationResult[];
  /** The approved tool plan (only set when fully approved). */
  approved_plan?: ToolPlan;
  /** Rejection summary when the plan is not approved. */
  rejection_reasons?: string[];
}
