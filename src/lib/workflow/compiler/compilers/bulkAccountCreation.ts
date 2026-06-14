// ──────────────────────────────────────────────────────────────────────────────
// Bulk Account Creation Workflow Compiler
//
// Validates and normalizes `bulk_account_creation` workflow drafts.
//
// Required fields:
//   - count (1–500): number of Hedera accounts to create
//
// Optional fields:
//   - initialBalanceHbar: HBAR to fund each new account with at creation
//   - sender: payer account (typically the user's connected wallet)
//   - memo: optional memo applied to each account-create transaction
//
// Execution (handled elsewhere) is via the Hedera Agent Kit
// `coreAccountPlugin.create-account` tool in RETURN_BYTES mode: each new
// account is created as its own transaction, signed by the user's wallet.
// ──────────────────────────────────────────────────────────────────────────────

import {
  AgentDraft,
  BulkAccountCreationWorkflowJson,
  CompilationIssue,
  CompilationResult,
  WorkflowCompiler,
} from "../types";
import { hbarToTinybars } from "@/lib/hedera/types";
import {
  applyToolPlan,
  generateMetadata,
  parseHbarAmount,
  validateHederaAccount,
} from "../validators";

/** Hard cap on bulk account creation. Prevents runaway costs / wallet spam. */
const MAX_ACCOUNTS = 500;

export class BulkAccountCreationCompiler implements WorkflowCompiler {
  readonly type = "bulk_account_creation" as const;

  compile(draft: AgentDraft): CompilationResult {
    const issues: CompilationIssue[] = [];
    const data = draft.data ?? {};

    // ── Validate `count` ──────────────────────────────────────────────────
    const rawCount =
      (data.count as number | string | undefined) ??
      (data.numAccounts as number | string | undefined) ??
      (data.accountCount as number | string | undefined);

    if (rawCount === undefined || rawCount === null || rawCount === "") {
      issues.push({
        severity: "error",
        message: "`count` is required (number of accounts to create).",
        field: "count",
      });
      return { status: "invalid", issues, riskNotes: [] };
    }

    const parsedCount =
      typeof rawCount === "string" ? parseInt(rawCount.replace(/,/g, ""), 10) : rawCount;

    if (!Number.isFinite(parsedCount) || Number.isNaN(parsedCount)) {
      issues.push({
        severity: "error",
        message: `\`count\` must be a number, got "${String(rawCount)}".`,
        field: "count",
      });
      return { status: "invalid", issues, riskNotes: [] };
    }

    if (!Number.isInteger(parsedCount)) {
      issues.push({
        severity: "error",
        message: "`count` must be an integer.",
        field: "count",
      });
      return { status: "invalid", issues, riskNotes: [] };
    }

    if (parsedCount < 1) {
      issues.push({
        severity: "error",
        message: "`count` must be at least 1.",
        field: "count",
      });
      return { status: "invalid", issues, riskNotes: [] };
    }

    if (parsedCount > MAX_ACCOUNTS) {
      issues.push({
        severity: "error",
        message: `\`count\` exceeds maximum of ${MAX_ACCOUNTS}.`,
        field: "count",
      });
      return { status: "invalid", issues, riskNotes: [] };
    }

    // ── Validate optional `initialBalanceHbar` ────────────────────────────
    let initialBalanceHbar: number | undefined;
    let initialBalanceTinybars: number | undefined;
    const rawInitial =
      (data.initialBalanceHbar as number | string | undefined) ??
      (data.initialBalance as number | string | undefined) ??
      (data.fundingHbar as number | string | undefined);

    if (rawInitial !== undefined && rawInitial !== null && rawInitial !== "") {
      const amt = parseHbarAmount(rawInitial, "initialBalanceHbar");
      if ("error" in amt) {
        issues.push({
          severity: "error",
          message: amt.error,
          field: "initialBalanceHbar",
        });
        return { status: "invalid", issues, riskNotes: [] };
      }
      initialBalanceHbar = amt.hbar;
      initialBalanceTinybars = amt.tinybars;
    }

    const totalFundingHbar = initialBalanceHbar
      ? Math.round(initialBalanceHbar * parsedCount * 1_000_000) / 1_000_000
      : 0;

    // ── Validate optional `sender` ────────────────────────────────────────
    const senderRaw = typeof data.sender === "string" ? data.sender : undefined;
    let sender: string | undefined;
    if (senderRaw) {
      const s = validateHederaAccount(senderRaw);
      if (!s.valid) {
        issues.push({
          severity: "warning",
          message: s.error ?? "Invalid sender account format.",
          field: "sender",
        });
      } else {
        sender = s.normalized;
      }
    }

    const memo = typeof data.memo === "string" ? data.memo : undefined;

    // ── Risk notes ────────────────────────────────────────────────────────
    const riskNotes: string[] = [];
    riskNotes.push(
      `This workflow will create ${parsedCount} new on-chain Hedera account${
        parsedCount === 1 ? "" : "s"
      }. Each requires a signed transaction from your wallet.`,
    );
    if (parsedCount > 50) {
      riskNotes.push(
        `Creating ${parsedCount} accounts will require ${parsedCount} separate wallet signatures and may incur significant network fees.`,
      );
    }
    if (totalFundingHbar > 0) {
      riskNotes.push(
        `Each new account will be funded with ${initialBalanceHbar} HBAR for a total funding of ${totalFundingHbar} HBAR.`,
      );
    }
    if (totalFundingHbar >= 1000) {
      riskNotes.push(
        `High-value funding: total of ${totalFundingHbar} HBAR will be transferred to newly-created accounts.`,
      );
    }

    // Sanity double-check that hbarToTinybars stays consistent if no initial
    // balance was set (some unit tests rely on undefined vs 0).
    if (initialBalanceHbar !== undefined && initialBalanceTinybars === undefined) {
      initialBalanceTinybars = hbarToTinybars(initialBalanceHbar);
    }

    const workflowJson: BulkAccountCreationWorkflowJson = {
      workflowType: "bulk_account_creation",
      version: 1,
      count: parsedCount,
      initialBalanceHbar,
      initialBalanceTinybars,
      totalFundingHbar,
      sender,
      memo,
      riskNotes,
      toolPlan: applyToolPlan(
        data.toolPlan as import("@/lib/hedera/types").ToolPlan | undefined,
      ),
      metadata: generateMetadata(draft.type),
    };

    return {
      status: "valid",
      issues,
      workflowJson,
      riskNotes,
    };
  }
}
