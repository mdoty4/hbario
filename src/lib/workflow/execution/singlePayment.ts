import type { StepExecutor, StepExecutorContext, StepResult } from "./types";

/** Executes a `single_payment` compound step via a single HBAR transfer. */
export const singlePaymentExecutor: StepExecutor = {
  kind: "single_payment",
  async execute(step, ctx: StepExecutorContext): Promise<StepResult> {
    const recipient = typeof step.recipient === "string" ? step.recipient : "";
    const amount =
      typeof step.amountHbar === "number"
        ? step.amountHbar
        : typeof step.amount === "number"
        ? step.amount
        : NaN;
    const memo = typeof step.memo === "string" ? step.memo : undefined;

    if (!recipient || !Number.isFinite(amount) || amount <= 0) {
      return {
        status: "failed",
        error: `Invalid single_payment step (recipient="${recipient}", amount=${amount})`,
      };
    }

    const result = await ctx.requestHbarTransfer({ recipient, amount, memo });
    if (!result.success || !result.transactionId) {
      return {
        status: "failed",
        error: result.error || "Wallet did not return a transaction id",
      };
    }
    return {
      status: "verified",
      transactionId: result.transactionId,
    };
  },
};
