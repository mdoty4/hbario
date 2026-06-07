// ──────────────────────────────────────────────────────────────────────────────
// Bulk Payout Workflow Compiler
//
// Validates and normalizes bulk_payout workflow drafts.
// Calculates totals, detects duplicate recipients, warns on missing data.
// ──────────────────────────────────────────────────────────────────────────────

import {
  AgentDraft,
  CompilationResult,
  CompilationIssue,
  BulkPayoutWorkflowJson,
  WorkflowCompiler,
} from "../types";
import {
  validateHederaAccount,
  validateRecipients,
  findDuplicateAccounts,
  generateRiskNotes,
  applyToolPlan,
  generateMetadata,
} from "../validators";

/**
 * Compiler for bulk_payout workflows.
 * Validates recipient list, calculates totals, detects duplicates,
 * and warns about missing recipients.
 */
export class BulkPayoutCompiler implements WorkflowCompiler {
  readonly type = "bulk_payout" as const;

  compile(draft: AgentDraft): CompilationResult {
    const issues: CompilationIssue[] = [];
    const data = draft.data ?? {};

    // ── Extract recipients ────────────────────────────────────────────────

    const rawRecipients =
      (data.recipients as unknown[]) ??
      (data.payouts as unknown[]) ??
      (data.entries as unknown[]);

    if (!rawRecipients || !Array.isArray(rawRecipients) || rawRecipients.length === 0) {
      // Missing recipients — mark as incomplete with a warning
      issues.push({
        severity: "warning",
        message: "No recipients provided. This bulk payout workflow has no payout entries.",
        field: "recipients",
      });

      // Build a minimal incomplete workflow JSON
      const workflowJson: BulkPayoutWorkflowJson = {
        workflowType: "bulk_payout",
        version: 1,
        recipients: [],
        totalAmountHbar: 0,
        totalAmountTinybars: 0,
        warnings: ["Missing recipient list — workflow is incomplete."],
        riskNotes: [],
        metadata: generateMetadata(draft.type),
      };

      return {
        status: "incomplete",
        issues,
        workflowJson,
        riskNotes: [],
      };
    }

    // ── Validate recipients ───────────────────────────────────────────────

    const result = validateRecipients(rawRecipients);

    // Add errors as issues
    for (const error of result.errors) {
      issues.push({
        severity: "error",
        message: error,
        field: "recipients",
      });
    }

    // Add warnings as issues
    for (const warning of result.warnings) {
      issues.push({
        severity: "warning",
        message: warning,
        field: "recipients",
      });
    }

    // If no valid entries, return invalid
    if (result.entries.length === 0) {
      return {
        status: "invalid",
        issues,
        riskNotes: [],
      };
    }

    // ── Calculate totals ──────────────────────────────────────────────────

    let totalHbar = 0;
    let totalTinybars = 0;

    for (const entry of result.entries) {
      totalHbar += entry.hbar;
      totalTinybars += entry.tinybars;
    }

    // Round total to 6 decimal places
    totalHbar = Math.round(totalHbar * 1_000_000) / 1_000_000;

    // ── Detect duplicates ─────────────────────────────────────────────────

    const accountList = result.entries.map((e) => e.account);
    const duplicates = findDuplicateAccounts(accountList);
    const hasDuplicates = duplicates.size > 0;

    if (hasDuplicates) {
      for (const dup of duplicates) {
        issues.push({
          severity: "warning",
          message: `Duplicate recipient: ${dup} appears more than once in the payout list.`,
          field: "recipients",
        });
      }
    }

    // ── Extract optional fields ───────────────────────────────────────────

    const sender = typeof data.sender === "string" ? data.sender : undefined;
    const memo = typeof data.memo === "string" ? data.memo : undefined;

    // Validate sender if provided
    if (sender) {
      const senderResult = validateHederaAccount(sender);
      if (!senderResult.valid) {
        issues.push({
          severity: "warning",
          message: senderResult.error ?? "Invalid sender account format.",
          field: "sender",
        });
      }
    }

    // ── Build warnings array ──────────────────────────────────────────────

    const warnings: string[] = [];

    // Check for recipients with missing amounts (skipped entries)
    const skippedCount = rawRecipients.length - result.entries.length;
    if (skippedCount > 0) {
      warnings.push(
        `${skippedCount} recipient(s) were skipped due to validation errors.`
      );
    }

    if (hasDuplicates) {
      warnings.push(
        `${duplicates.size} duplicate recipient(s) detected.`
      );
    }

    // ── Build workflow JSON ───────────────────────────────────────────────

    const riskNotes = generateRiskNotes(
      "bulk_payout",
      totalHbar,
      result.entries.length,
      hasDuplicates
    );

    const toolPlan = applyToolPlan(
      data.toolPlan as import("@/lib/hedera/types").ToolPlan | undefined
    );

    const workflowJson: BulkPayoutWorkflowJson = {
      workflowType: "bulk_payout",
      version: 1,
      recipients: result.entries.map((entry) => ({
        account: entry.account,
        amountHbar: entry.hbar,
        amountTinybars: entry.tinybars,
      })),
      sender,
      memo,
      totalAmountHbar: totalHbar,
      totalAmountTinybars: totalTinybars,
      warnings,
      riskNotes,
      toolPlan,
      metadata: generateMetadata(draft.type),
    };

    // If there are errors, mark as incomplete but still provide the JSON
    if (result.errors.length > 0) {
      return {
        status: "incomplete",
        issues,
        workflowJson,
        riskNotes,
      };
    }

    return {
      status: "valid",
      issues,
      workflowJson,
      riskNotes,
    };
  }
}
