// ──────────────────────────────────────────────────────────────────────────────
// Workflow Compiler Validators
//
// Validation utilities used by all workflow compilers.
// Handles Hedera account format, HBAR amounts, duplicate detection, and risk notes.
// ──────────────────────────────────────────────────────────────────────────────

import { hbarToTinybars } from "@/lib/hedera/types";
import { ToolPlan } from "@/lib/hedera/types";
import { WorkflowMetadata } from "./types";

// ── Hedera Account Validation ─────────────────────────────────────────────────

/**
 * Validate a Hedera account ID format.
 * Accepts formats: 0.{shard}.{realm}@{num} or 0.{shard}.{realm}.{num}
 *
 * @param accountId - The account ID to validate.
 * @returns Object with valid flag and optional error message.
 */
export function validateHederaAccount(
  accountId: string
): { valid: boolean; error?: string; normalized?: string } {
  if (!accountId || typeof accountId !== "string") {
    return { valid: false, error: "Account ID must be a non-empty string." };
  }

  const trimmed = accountId.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Account ID cannot be empty." };
  }

  // Accept formats: 0.{shard}.{realm}@{num} or 0.{shard}.{realm}.{num}
  const pattern = /^0\.\d+\.\d+[@.]\d+$/;
  if (!pattern.test(trimmed)) {
    return {
      valid: false,
      error: `Invalid Hedera account format: "${trimmed}". Expected format: 0.{shard}.{realm}.{num} or 0.{shard}.{realm}@{num}.`,
    };
  }

  // Normalize: always use dot notation
  const normalized = trimmed.replace("@", ".");
  return { valid: true, normalized };
}

// ── HBAR Amount Parsing ───────────────────────────────────────────────────────

/**
 * Parse and validate an HBAR amount from various input formats.
 *
 * @param value - The raw amount value (number, string, or numeric string).
 * @param fieldName - The field name for error messages.
 * @returns Parsed amount in HBAR and tinybars, or an error.
 */
export function parseHbarAmount(
  value: unknown,
  fieldName: string = "amount"
): { hbar: number; tinybars: number } | { error: string } {
  if (value === undefined || value === null) {
    return { error: `${fieldName} is required but was not provided.` };
  }

  // Handle numeric strings (e.g. "100", "1,000.50")
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) {
      return { error: `${fieldName} "${value}" is not a valid number.` };
    }
    value = parsed;
  }

  if (typeof value !== "number") {
    return { error: `${fieldName} must be a number or numeric string.` };
  }

  if (isNaN(value)) {
    return { error: `${fieldName} is NaN.` };
  }

  if (!isFinite(value)) {
    return { error: `${fieldName} must be a finite number.` };
  }

  if (value <= 0) {
    return { error: `${fieldName} must be greater than 0.` };
  }

  // Cap at a reasonable maximum to prevent overflow
  const MAX_HBAR = 1_000_000_000;
  if (value > MAX_HBAR) {
    return { error: `${fieldName} exceeds maximum allowed value of ${MAX_HBAR} HBAR.` };
  }

  return {
    hbar: Math.round(value * 1_000_000) / 1_000_000, // 6 decimal places
    tinybars: hbarToTinybars(value),
  };
}

// ── Recipient List Validation ─────────────────────────────────────────────────

/**
 * Validate a list of recipients, checking for:
 * - Valid account formats
 * - Valid amounts
 * - Duplicate accounts
 * - Missing accounts
 *
 * @param recipients - Array of recipient entries.
 * @returns Validated recipients with warnings and errors.
 */
export function validateRecipients(
  recipients: unknown[]
): {
  valid: boolean;
  entries: { account: string; hbar: number; tinybars: number }[];
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  const entries: { account: string; hbar: number; tinybars: number }[] = [];
  const seenAccounts = new Set<string>();

  if (!Array.isArray(recipients)) {
    return {
      valid: false,
      entries: [],
      warnings: [],
      errors: ["Recipients must be an array."],
    };
  }

  if (recipients.length === 0) {
    return {
      valid: false,
      entries: [],
      warnings: [],
      errors: ["Recipients list cannot be empty."],
    };
  }

  for (let i = 0; i < recipients.length; i++) {
    const entry = recipients[i];

    if (!entry || typeof entry !== "object") {
      errors.push(`Recipient at index ${i} is not a valid object.`);
      continue;
    }

    const obj = entry as Record<string, unknown>;

    // Validate account
    const accountRaw = obj.account ?? obj.recipient ?? obj.accountId;
    if (!accountRaw || typeof accountRaw !== "string") {
      errors.push(`Recipient at index ${i} is missing a valid account.`);
      continue;
    }

    const accountResult = validateHederaAccount(accountRaw);
    if (!accountResult.valid) {
      errors.push(accountResult.error ?? `Invalid account at index ${i}.`);
      continue;
    }

    const normalizedAccount = accountResult.normalized!;

    // Check for duplicates
    if (seenAccounts.has(normalizedAccount)) {
      warnings.push(
        `Duplicate recipient detected: ${normalizedAccount} appears more than once.`
      );
    }
    seenAccounts.add(normalizedAccount);

    // Validate amount
    const amountRaw = obj.amount ?? obj.amountHbar ?? obj.amountTinybars;
    const amountResult = parseHbarAmount(amountRaw, `Recipient ${i} amount`);
    if ("error" in amountResult) {
      errors.push(amountResult.error);
      continue;
    }

    entries.push({
      account: normalizedAccount,
      hbar: amountResult.hbar,
      tinybars: amountResult.tinybars,
    });
  }

  return {
    valid: entries.length > 0 && errors.length === 0,
    entries,
    warnings,
    errors,
  };
}

// ── Duplicate Detection ───────────────────────────────────────────────────────

/**
 * Detect duplicate accounts in a list of strings.
 *
 * @param accounts - Array of account IDs to check.
 * @returns Set of duplicate account IDs.
 */
export function findDuplicateAccounts(accounts: string[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const account of accounts) {
    if (seen.has(account)) {
      duplicates.add(account);
    }
    seen.add(account);
  }

  return duplicates;
}

// ── Risk Notes ────────────────────────────────────────────────────────────────

/**
 * Generate risk notes based on workflow data.
 *
 * @param type - The workflow type.
 * @param totalHbar - Total HBAR amount involved.
 * @param recipientCount - Number of unique recipients.
 * @param hasDuplicates - Whether duplicate recipients were detected.
 * @returns Array of risk note strings.
 */
export function generateRiskNotes(
  type: string,
  totalHbar: number,
  recipientCount: number,
  hasDuplicates: boolean
): string[] {
  const notes: string[] = [];

  // High-value transfer warning
  if (totalHbar >= 1000) {
    notes.push(
      `High-value transfer: ${totalHbar} HBAR exceeds 1,000 HBAR threshold.`
    );
  }

  // Bulk payout warning
  if (recipientCount > 10) {
    notes.push(
      `Large recipient list: ${recipientCount} recipients may incur significant network fees.`
    );
  }

  // Duplicate recipient warning
  if (hasDuplicates) {
    notes.push(
      "Duplicate recipients detected. Verify that duplicate entries are intentional."
    );
  }

  // Analysis-only note for liquidity workflows
  if (type === "liquidity_path_analysis") {
    notes.push(
      "This is an analysis-only workflow. No funds will be moved."
    );
  }

  return notes;
}

// ── Tool Plan Application ─────────────────────────────────────────────────────

/**
 * Apply an approved tool plan to the workflow JSON.
 * Normalizes the tool plan into a storable format.
 *
 * @param toolPlan - The approved tool plan to apply.
 * @returns Normalized tool plan object suitable for workflow JSON.
 */
export function applyToolPlan(
  toolPlan: ToolPlan | undefined
): Record<string, unknown> | undefined {
  if (!toolPlan) {
    return undefined;
  }

  return {
    workflowType: toolPlan.workflow_type,
    requiredTools: toolPlan.required_tools,
    toolCalls: toolPlan.tool_calls?.map((call) => ({
      name: call.name,
      args: call.args,
    })),
  };
}

// ── Metadata Generation ───────────────────────────────────────────────────────

/**
 * Generate standard metadata for a compiled workflow.
 *
 * @param originalType - The original workflow type string from the agent draft.
 * @returns The metadata object.
 */
export function generateMetadata(originalType: string): WorkflowMetadata {
  return {
    compiledAt: new Date().toISOString(),
    schemaVersion: 1,
    originalType,
  };
}
