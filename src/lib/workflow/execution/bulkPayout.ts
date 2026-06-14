import type { StepExecutor, StepExecutorContext, StepResult } from "./types";

/**
 * Executes a `bulk_payout` step as a single atomic `TransferTransaction` with
 * N positive transfer legs and one negated leg from the payer. The whole
 * payout settles in one consensus event — one wallet prompt, one tx id,
 * no partial-failure ambiguity.
 */
export const bulkPayoutExecutor: StepExecutor = {
  kind: "bulk_payout",
  async execute(step, ctx: StepExecutorContext): Promise<StepResult> {
    const recipients = Array.isArray(step.recipients)
      ? (step.recipients as Array<Record<string, unknown>>)
      : [];
    const memo = typeof step.memo === "string" ? step.memo : undefined;

    if (recipients.length === 0) {
      return {
        status: "failed",
        error: "bulk_payout step has no recipients",
      };
    }

    // Validate every leg up-front so we never half-build a transaction.
    const legs: Array<{ account: string; amountHbar: number }> = [];
    for (const r of recipients) {
      const account = typeof r.account === "string" ? r.account : "";
      const amount =
        typeof r.amountHbar === "number"
          ? r.amountHbar
          : typeof r.amount === "number"
          ? (r.amount as number)
          : NaN;
      if (!account || !Number.isFinite(amount) || amount <= 0) {
        return {
          status: "failed",
          error: `Invalid bulk_payout recipient (account="${account}", amount=${amount})`,
        };
      }
      legs.push({ account, amountHbar: amount });
    }

    try {
      const sdk = await import("@hiero-ledger/sdk");
      const payer = sdk.AccountId.fromString(ctx.payerAccount);

      const tx = new sdk.TransferTransaction();
      let totalHbar = 0;
      for (const leg of legs) {
        const amount = sdk.Hbar.from(leg.amountHbar, sdk.HbarUnit.Hbar);
        tx.addHbarTransfer(sdk.AccountId.fromString(leg.account), amount);
        totalHbar += leg.amountHbar;
      }
      // Single negated leg for the payer covering the entire sum.
      tx.addHbarTransfer(
        payer,
        sdk.Hbar.from(totalHbar, sdk.HbarUnit.Hbar).negated(),
      );
      if (memo) tx.setTransactionMemo(memo);

      const result = await ctx.signAndExecuteTransaction(tx);
      if (!result.success || !result.transactionId) {
        return {
          status: "failed",
          error: result.error || "Wallet did not return a transaction id",
        };
      }
      return {
        status: "verified",
        transactionId: result.transactionId,
        payload: { recipientCount: legs.length, totalHbar },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: "failed", error: message };
    }
  },
};
