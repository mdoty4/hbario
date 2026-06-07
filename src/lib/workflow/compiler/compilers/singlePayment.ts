// ──────────────────────────────────────────────────────────────────────────────
// Single Payment Workflow Compiler
//
// Validates and normalizes single_payment workflow drafts.
// Ensures recipient and amount are present and valid.
// ──────────────────────────────────────────────────────────────────────────────

import {
  AgentDraft,
  CompilationResult,
  CompilationIssue,
  SinglePaymentWorkflowJson,
  WorkflowCompiler,
} from "../types";
import {
  validateHederaAccount,
  parseHbarAmount,
  generateRiskNotes,
  applyToolPlan,
  generateMetadata,
} from "../validators";

/**
 * Compiler for single_payment workflows.
 * Validates recipient account and amount, produces consistent workflow JSON.
 */
export class SinglePaymentCompiler implements WorkflowCompiler {
  readonly type = "single_payment" as const;

  compile(draft: AgentDraft): CompilationResult {
    const issues: CompilationIssue[] = [];
    const data = draft.data ?? {};

    // ── Validate required fields ──────────────────────────────────────────

    // Extract recipient account (support multiple field names)
    const rawAccount =
      (data.recipient as string) ??
      (data.account as string) ??
      (data.recipientAccount as string) ??
      (data.to as string);

    const accountResult = validateHederaAccount(rawAccount ?? "");
    if (!accountResult.valid) {
      issues.push({
        severity: "error",
        message: accountResult.error ?? "Invalid recipient account.",
        field: "recipient",
      });
      return {
        status: "invalid",
        issues,
        riskNotes: [],
      };
    }

    const normalizedAccount = accountResult.normalized!;

    // Extract and validate amount
    const rawAmount =
      (data.amount as number | string) ??
      (data.amountHbar as number | string) ??
      (data.value as number | string);

    const amountResult = parseHbarAmount(rawAmount, "amount");
    if ("error" in amountResult) {
      issues.push({
        severity: "error",
        message: amountResult.error,
        field: "amount",
      });
      return {
        status: "invalid",
        issues,
        riskNotes: [],
      };
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

    // ── Build workflow JSON ───────────────────────────────────────────────

    const riskNotes = generateRiskNotes(
      "single_payment",
      amountResult.hbar,
      1,
      false
    );

    const toolPlan = applyToolPlan(
      data.toolPlan as import("@/lib/hedera/types").ToolPlan | undefined
    );

    const workflowJson: SinglePaymentWorkflowJson = {
      workflowType: "single_payment",
      version: 1,
      recipient: {
        account: normalizedAccount,
        amountHbar: amountResult.hbar,
        amountTinybars: amountResult.tinybars,
      },
      sender,
      memo,
      riskNotes,
      toolPlan,
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
