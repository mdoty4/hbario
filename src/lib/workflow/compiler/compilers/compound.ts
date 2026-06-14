// ──────────────────────────────────────────────────────────────────────────────
// Compound Workflow Compiler
//
// Validates and normalizes `compound` workflow drafts. A compound workflow is
// an ordered list of single-purpose steps (single_payment, bulk_payout,
// bulk_account_creation, …) sharing a single 1-HBAR unlock fee.
//
// Each step is validated by the same primitives the standalone compilers
// use (`validators.ts`), so behaviour is consistent. Phase-1 execution routes
// compound-with-one-step workflows to the existing per-type executor;
// multi-step execution is Phase 2.
//
// Expected `draft.data` shape (as emitted by the LLM planner):
//   {
//     steps: [
//       { kind: "single_payment",       recipient, amount, memo? },
//       { kind: "bulk_payout",          payouts: [{recipient, amount}, ...], memo? },
//       { kind: "bulk_account_creation", count, initialBalanceHbar?, memo? },
//     ],
//     executionMode?: "sequential",   // default
//     stopOnError?: boolean,          // default true
//     sender?: string,
//   }
// ──────────────────────────────────────────────────────────────────────────────

import {
  AgentDraft,
  CompilationIssue,
  CompilationResult,
  CompoundStep,
  CompoundWorkflowJson,
  WorkflowCompiler,
} from "../types";
import { hbarToTinybars } from "@/lib/hedera/types";
import {
  applyToolPlan,
  generateMetadata,
  parseHbarAmount,
  validateHederaAccount,
  validateRecipients,
} from "../validators";

const MAX_STEPS = 25;
const MAX_BULK_ACCOUNTS_PER_STEP = 500;

interface RawStep {
  kind?: unknown;
  // single_payment
  recipient?: unknown;
  amount?: unknown;
  amountHbar?: unknown;
  // bulk_payout
  payouts?: unknown;
  recipients?: unknown;
  // bulk_account_creation
  count?: unknown;
  initialBalanceHbar?: unknown;
  initialBalance?: unknown;
  // shared
  memo?: unknown;
}

export class CompoundCompiler implements WorkflowCompiler {
  readonly type = "compound" as const;

  compile(draft: AgentDraft): CompilationResult {
    const issues: CompilationIssue[] = [];
    const data = draft.data ?? {};

    // ── Pull steps array ──────────────────────────────────────────────────
    const rawSteps = data.steps as unknown;
    if (!Array.isArray(rawSteps)) {
      issues.push({
        severity: "error",
        message: "`steps` is required and must be an array.",
        field: "steps",
      });
      return { status: "invalid", issues, riskNotes: [] };
    }

    if (rawSteps.length === 0) {
      issues.push({
        severity: "error",
        message: "Compound workflow must have at least one step.",
        field: "steps",
      });
      return { status: "invalid", issues, riskNotes: [] };
    }

    if (rawSteps.length > MAX_STEPS) {
      issues.push({
        severity: "error",
        message: `Compound workflow has ${rawSteps.length} steps; max allowed is ${MAX_STEPS}.`,
        field: "steps",
      });
      return { status: "invalid", issues, riskNotes: [] };
    }

    // ── Validate each step ────────────────────────────────────────────────
    const steps: CompoundStep[] = [];
    let totalHbar = 0;
    const riskNotes: string[] = [];

    for (let i = 0; i < rawSteps.length; i++) {
      const raw = rawSteps[i] as RawStep;
      const fieldPath = `steps[${i}]`;

      if (!raw || typeof raw !== "object") {
        issues.push({
          severity: "error",
          message: `Step ${i} is not a valid object.`,
          field: fieldPath,
        });
        return { status: "invalid", issues, riskNotes: [] };
      }

      const kind = raw.kind;

      // ── single_payment step ────────────────────────────────────────────
      if (kind === "single_payment") {
        const account = validateHederaAccount(String(raw.recipient ?? ""));
        if (!account.valid) {
          issues.push({
            severity: "error",
            message: account.error ?? "Invalid recipient account.",
            field: `${fieldPath}.recipient`,
          });
          return { status: "invalid", issues, riskNotes: [] };
        }

        const amt = parseHbarAmount(
          raw.amount ?? raw.amountHbar,
          `${fieldPath}.amount`,
        );
        if ("error" in amt) {
          issues.push({
            severity: "error",
            message: amt.error,
            field: `${fieldPath}.amount`,
          });
          return { status: "invalid", issues, riskNotes: [] };
        }

        steps.push({
          kind: "single_payment",
          recipient: account.normalized!,
          amountHbar: amt.hbar,
          amountTinybars: amt.tinybars,
          memo: typeof raw.memo === "string" ? raw.memo : undefined,
        });
        totalHbar += amt.hbar;
        continue;
      }

      // ── bulk_payout step ───────────────────────────────────────────────
      if (kind === "bulk_payout") {
        const payoutsRaw = (raw.payouts ?? raw.recipients) as unknown[];
        // Re-shape "{recipient, amount}" into "{account, amount}" so
        // validateRecipients() accepts it.
        const normalized = Array.isArray(payoutsRaw)
          ? payoutsRaw.map((p) => {
              const obj = p as Record<string, unknown>;
              return {
                account: obj.account ?? obj.recipient ?? obj.accountId,
                amount: obj.amount ?? obj.amountHbar,
              };
            })
          : [];
        const v = validateRecipients(normalized);
        if (!v.valid) {
          for (const e of v.errors) {
            issues.push({
              severity: "error",
              message: e,
              field: `${fieldPath}.payouts`,
            });
          }
          return { status: "invalid", issues, riskNotes: [] };
        }

        const stepRecipients = v.entries.map((e) => ({
          account: e.account,
          amountHbar: e.hbar,
          amountTinybars: e.tinybars,
        }));
        const totalAmountHbar = stepRecipients.reduce(
          (s, r) => s + r.amountHbar,
          0,
        );
        const totalAmountTinybars = stepRecipients.reduce(
          (s, r) => s + r.amountTinybars,
          0,
        );

        steps.push({
          kind: "bulk_payout",
          recipients: stepRecipients,
          totalAmountHbar,
          totalAmountTinybars,
          memo: typeof raw.memo === "string" ? raw.memo : undefined,
        });
        totalHbar += totalAmountHbar;
        continue;
      }

      // ── bulk_account_creation step ─────────────────────────────────────
      if (kind === "bulk_account_creation") {
        const rawCount = raw.count as number | string | undefined;
        if (rawCount === undefined || rawCount === null || rawCount === "") {
          issues.push({
            severity: "error",
            message: "`count` is required for bulk_account_creation step.",
            field: `${fieldPath}.count`,
          });
          return { status: "invalid", issues, riskNotes: [] };
        }

        const count =
          typeof rawCount === "string"
            ? parseInt(rawCount.replace(/,/g, ""), 10)
            : rawCount;

        if (
          !Number.isFinite(count) ||
          !Number.isInteger(count) ||
          count < 1 ||
          count > MAX_BULK_ACCOUNTS_PER_STEP
        ) {
          issues.push({
            severity: "error",
            message: `\`count\` must be an integer between 1 and ${MAX_BULK_ACCOUNTS_PER_STEP}.`,
            field: `${fieldPath}.count`,
          });
          return { status: "invalid", issues, riskNotes: [] };
        }

        let initialBalanceHbar: number | undefined;
        let initialBalanceTinybars: number | undefined;
        const rawInitial = raw.initialBalanceHbar ?? raw.initialBalance;
        if (
          rawInitial !== undefined &&
          rawInitial !== null &&
          rawInitial !== ""
        ) {
          const amt = parseHbarAmount(rawInitial, "initialBalanceHbar");
          if ("error" in amt) {
            issues.push({
              severity: "error",
              message: amt.error,
              field: `${fieldPath}.initialBalanceHbar`,
            });
            return { status: "invalid", issues, riskNotes: [] };
          }
          initialBalanceHbar = amt.hbar;
          initialBalanceTinybars = amt.tinybars;
        }

        const totalFundingHbar = initialBalanceHbar
          ? Math.round(initialBalanceHbar * count * 1_000_000) / 1_000_000
          : 0;

        steps.push({
          kind: "bulk_account_creation",
          count,
          initialBalanceHbar,
          initialBalanceTinybars,
          totalFundingHbar,
          memo: typeof raw.memo === "string" ? raw.memo : undefined,
        });
        totalHbar += totalFundingHbar;

        // Make sure tinybars match when only hbar was supplied
        if (
          initialBalanceHbar !== undefined &&
          initialBalanceTinybars === undefined
        ) {
          // (already set above; this is a future-proof guard)
          hbarToTinybars(initialBalanceHbar);
        }
        continue;
      }

      // ── Unknown kind ───────────────────────────────────────────────────
      issues.push({
        severity: "error",
        message: `Unsupported step kind: "${String(kind)}". Supported: single_payment, bulk_payout, bulk_account_creation.`,
        field: `${fieldPath}.kind`,
      });
      return { status: "invalid", issues, riskNotes: [] };
    }

    // ── Optional sender ───────────────────────────────────────────────────
    const senderRaw = typeof data.sender === "string" ? data.sender : undefined;
    let sender: string | undefined;
    if (senderRaw) {
      const s = validateHederaAccount(senderRaw);
      if (s.valid) sender = s.normalized;
      else
        issues.push({
          severity: "warning",
          message: s.error ?? "Invalid sender account format.",
          field: "sender",
        });
    }

    // ── Execution policy ──────────────────────────────────────────────────
    const stopOnError =
      typeof data.stopOnError === "boolean" ? data.stopOnError : true;

    // ── Risk notes ────────────────────────────────────────────────────────
    riskNotes.push(
      `This compound workflow contains ${steps.length} step${steps.length === 1 ? "" : "s"} and requires a separate wallet signature for each on-chain action.`,
    );
    if (totalHbar >= 1000) {
      riskNotes.push(
        `High-value workflow: total of ${totalHbar} HBAR moves across all steps.`,
      );
    }
    if (steps.length >= 5) {
      riskNotes.push(
        `Long workflow (${steps.length} steps) may take several minutes to fully execute.`,
      );
    }
    if (!stopOnError) {
      riskNotes.push(
        "Continue-on-error is enabled: failed steps will be recorded but the workflow will continue.",
      );
    }

    const workflowJson: CompoundWorkflowJson = {
      workflowType: "compound",
      version: 1,
      steps,
      executionMode: "sequential",
      stopOnError,
      sender,
      totalHbar: Math.round(totalHbar * 1_000_000) / 1_000_000,
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
