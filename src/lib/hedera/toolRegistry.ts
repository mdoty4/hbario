// ──────────────────────────────────────────────────────────────────────────────
// Tool Registry
//
// Backend-controlled allowlist of tools the agent may invoke.
// Each entry defines the tool name, description, category, and argument schema.
// No private keys, no automatic fund movement.
// ──────────────────────────────────────────────────────────────────────────────

import { ToolRegistryEntry } from "./types";

/**
 * The authoritative registry of allowed tools.
 *
 * Only tools listed here can be invoked by the agent.
 * The backend controls this list — agents cannot add tools at runtime.
 */
export const TOOL_REGISTRY: ToolRegistryEntry[] = [
  // ── Read / Planning Tools ──────────────────────────────────────────────────

  {
    name: "validateAccount",
    description: "Validate a Hedera account ID format.",
    category: "read",
    args: [
      {
        name: "accountId",
        type: "string",
        required: true,
        description: "The Hedera account ID to validate (e.g. 0.0.12345).",
      },
    ],
  },
  {
    name: "getAccountBalance",
    description: "Get the HBAR balance of a Hedera account.",
    category: "read",
    args: [
      {
        name: "accountId",
        type: "string",
        required: true,
        description: "The Hedera account ID to query.",
      },
    ],
  },

  // ── Estimate Tools ─────────────────────────────────────────────────────────

  {
    name: "estimateTransferFees",
    description: "Estimate the network fee for a single HBAR transfer.",
    category: "estimate",
    args: [
      {
        name: "sender",
        type: "string",
        required: true,
        description: "Sender account ID.",
      },
      {
        name: "recipient",
        type: "string",
        required: true,
        description: "Recipient account ID.",
      },
      {
        name: "amount",
        type: "number",
        required: true,
        description: "Amount to transfer in HBAR.",
      },
    ],
  },
  {
    name: "estimateBulkPayoutFees",
    description: "Estimate the total network fee for a bulk payout.",
    category: "estimate",
    args: [
      {
        name: "sender",
        type: "string",
        required: true,
        description: "Sender account ID.",
      },
      {
        name: "payouts",
        type: "array",
        required: true,
        description: "Array of { recipient, amount } payout entries.",
      },
    ],
  },

  // ── Prepare Tools ──────────────────────────────────────────────────────────

  {
    name: "prepareHbarTransfer",
    description: "Prepare an HBAR transfer instruction for user approval. Does NOT execute.",
    category: "prepare",
    args: [
      {
        name: "sender",
        type: "string",
        required: true,
        description: "Sender account ID.",
      },
      {
        name: "recipient",
        type: "string",
        required: true,
        description: "Recipient account ID.",
      },
      {
        name: "amount",
        type: "number",
        required: true,
        description: "Amount to transfer in HBAR.",
      },
      {
        name: "memo",
        type: "string",
        required: false,
        description: "Optional memo for the transfer.",
      },
    ],
  },
  {
    name: "prepareBulkPayout",
    description: "Prepare a bulk payout instruction for user approval. Does NOT execute.",
    category: "prepare",
    args: [
      {
        name: "sender",
        type: "string",
        required: true,
        description: "Sender account ID.",
      },
      {
        name: "payouts",
        type: "array",
        required: true,
        description: "Array of { recipient, amount } payout entries.",
      },
      {
        name: "memo",
        type: "string",
        required: false,
        description: "Optional memo for the bulk payout.",
      },
    ],
  },

  // ── Verification Tools ─────────────────────────────────────────────────────

  {
    name: "verifyTransaction",
    description: "Verify a transaction against expected details.",
    category: "verify",
    args: [
      {
        name: "transactionId",
        type: "string",
        required: true,
        description: "The Hedera transaction ID to verify.",
      },
      {
        name: "expectedDetails",
        type: "object",
        required: true,
        description: "Expected transaction details to match against.",
      },
    ],
  },
  {
    name: "getTransactionReceipt",
    description: "Get the receipt for a completed transaction.",
    category: "verify",
    args: [
      {
        name: "transactionId",
        type: "string",
        required: true,
        description: "The Hedera transaction ID to look up.",
      },
    ],
  },
];

// ── Denylist ──────────────────────────────────────────────────────────────────

/**
 * Tool names that are explicitly blocked regardless of registry.
 * This provides an additional safety layer for dangerous operations.
 */
export const DANGEROUS_TOOL_DENYLIST: ReadonlySet<string> = new Set([
  "executeTransfer",
  "executeBulkPayout",
  "signTransaction",
  "submitTransaction",
  "broadcastTransaction",
  "deleteAccount",
  "freezeAccount",
  "wipeAccount",
  "transferOwnership",
  "grantAdmin",
  "revokeKey",
  "deleteRecord",
  "purgeReceipt",
  "deleteFile",
  "deleteContract",
  "deleteToken",
  "deleteTopic",
  "assessCustomFee",
  "updateNodeFee",
  "updateNetworkFee",
  "updateSystemFile",
  "updateConsensusTopic",
  "updateTokenFeeSchedule",
  "updateTokenKey",
  "updateTokenInfo",
  "updateAccountKeys",
  "updateContractBytecode",
]);

// ── Registry Accessors ────────────────────────────────────────────────────────

/**
 * Get all registered tool names (the allowlist).
 */
export function getAllowedToolNames(): ReadonlySet<string> {
  return new Set(TOOL_REGISTRY.map((entry) => entry.name));
}

/**
 * Look up a tool entry by name. Returns undefined if not found.
 */
export function getToolEntry(toolName: string): ToolRegistryEntry | undefined {
  return TOOL_REGISTRY.find((entry) => entry.name === toolName);
}

/**
 * Check whether a tool name is in the denylist.
 */
export function isDangerousTool(toolName: string): boolean {
  return DANGEROUS_TOOL_DENYLIST.has(toolName);
}

/**
 * Check whether a tool name is in the allowlist.
 */
export function isAllowedTool(toolName: string): boolean {
  return getAllowedToolNames().has(toolName);
}

/**
 * Get all registered tool entries (read-only).
 */
export function getAllTools(): ReadonlyArray<ToolRegistryEntry> {
  return Object.freeze([...TOOL_REGISTRY]);
}

/**
 * Get tools filtered by category.
 */
export function getToolsByCategory(
  category: "read" | "estimate" | "prepare" | "verify"
): ReadonlyArray<ToolRegistryEntry> {
  return Object.freeze(
    TOOL_REGISTRY.filter((entry) => entry.category === category)
  );
}
