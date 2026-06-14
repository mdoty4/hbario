import type {
  StepExecutor,
  StepExecutorContext,
  StepProgressItem,
  StepResult,
} from "./types";

interface MirrorTxLike {
  entity_id?: string | null;
  transaction_id?: string;
  result?: string;
}

/**
 * Convert an SDK-style transaction id (`0.0.X@SEC.NS`) to the wire format the
 * mirror node expects in URLs (`0.0.X-SEC-NS`).
 */
function normalizeTxId(txId: string): string {
  if (/^0\.\d+\.\d+-\d+-\d+$/.test(txId)) return txId;
  const m = txId.match(/^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : txId;
}

function mirrorHost(network: string): string {
  return network === "mainnet"
    ? "https://mainnet.mirrornode.hedera.com"
    : "https://testnet.mirrornode.hedera.com";
}

/**
 * Background mirror enrichment. Polls until the new account's `entity_id`
 * shows up, then mutates the corresponding item in place and re-emits
 * progress. This NEVER throws and NEVER marks the item/step failed —
 * the only "true" failure for an AccountCreate row is the wallet
 * signature itself failing. If mirror is broken, we still have a valid
 * keypair + transactionId, which is sufficient.
 *
 * We use a generous retry window (~48s) because mainnet mirror lag can
 * spike well past testnet's typical 3-5s.
 */
async function enrichWithAccountId(
  network: string,
  transactionId: string,
  onResolved: (accountId: string) => void,
): Promise<void> {
  // Use the query-string endpoint rather than the path endpoint. The path
  // endpoint returns 404 while a tx is still being indexed — which is fine
  // for our retry logic, but pollutes the browser console with red errors
  // since the network layer logs every 4xx. The query endpoint returns
  // 200 with an empty `transactions: []` array in the same situation,
  // keeping the console clean.
  const url = `${mirrorHost(network)}/api/v1/transactions?transaction.id=${normalizeTxId(transactionId)}`;
  const attempts = 24;
  const delayMs = 2000;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { transactions?: MirrorTxLike[] };
        const tx = data.transactions?.find(
          (t) => t.result === "SUCCESS" && t.entity_id,
        );
        if (tx?.entity_id) {
          onResolved(tx.entity_id);
          return;
        }
      }
    } catch {
      // ignore — mirror may be transiently unavailable
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  // Gave up. Leave the row's accountId blank — the user still has the
  // transactionId (linking to HashScan) and the keypair.
}

/**
 * Executes a `bulk_account_creation` step.
 *
 * Invariant: once `signAndExecuteTransaction` returns success for an
 * iteration, that iteration's keypair MUST appear in the items list (with
 * its txId) and MUST survive into the receipt payload. Mirror-node lookup
 * is best-effort enrichment that adds the new `accountId` later; it can
 * never invalidate or destroy the keypair.
 *
 * SECURITY:
 *   - Private keys live only in the executor's in-memory items list and in
 *     the React modal state that consumes onProgress. They are stripped
 *     from `StepResult.payload` before the workflow modal posts the
 *     receipt to the server.
 */
export const bulkAccountCreationExecutor: StepExecutor = {
  kind: "bulk_account_creation",
  async execute(step, ctx: StepExecutorContext): Promise<StepResult> {
    const count = typeof step.count === "number" ? step.count : 0;
    const initialBalanceHbar =
      typeof step.initialBalanceHbar === "number"
        ? (step.initialBalanceHbar as number)
        : 0;
    const memo = typeof step.memo === "string" ? step.memo : undefined;

    if (!Number.isInteger(count) || count < 1) {
      return {
        status: "failed",
        error: `Invalid bulk_account_creation count: ${count}`,
      };
    }

    try {
      const sdk = await import("@hiero-ledger/sdk");

      const txIds: string[] = [];
      const items: StepProgressItem[] = Array.from({ length: count }, (_, i) => ({
        index: i,
        status: "pending" as const,
      }));

      const emit = (message?: string) => {
        ctx.onProgress?.({
          subIndex: items.findIndex(
            (it) => it.status !== "done" && it.status !== "failed",
          ),
          subTotal: count,
          message,
          // Deep-ish clone so consumers don't mutate our internal array.
          items: items.map((it) => ({ ...it })),
        });
      };

      // Track background mirror tasks so the executor can choose whether to
      // await them or not. We DO await at the end, but only briefly — the
      // step's "done" status is independent of mirror enrichment.
      const mirrorTasks: Promise<void>[] = [];

      for (let i = 0; i < count; i++) {
        // 1. Generate fresh keypair client-side. Kept in locals until tx
        //    succeeds so we don't surface "key revealable" before any
        //    on-chain action has been broadcast.
        const newKey = sdk.PrivateKey.generateED25519();
        const newPub = newKey.publicKey;
        const publicKeyDer = newPub.toStringDer();
        const privateKeyDer = newKey.toStringDer();

        items[i] = { ...items[i], status: "awaiting_wallet" };
        emit(`Awaiting wallet signature for account ${i + 1} of ${count}…`);

        // 2. Build + ask wallet to sign + execute AccountCreate.
        const tx = new sdk.AccountCreateTransaction().setKeyWithoutAlias(newPub);
        if (initialBalanceHbar > 0) {
          tx.setInitialBalance(sdk.Hbar.from(initialBalanceHbar, sdk.HbarUnit.Hbar));
        }
        if (memo) tx.setAccountMemo(memo);

        const result = await ctx.signAndExecuteTransaction(tx);

        if (!result.success || !result.transactionId) {
          // The ONLY thing that can mark a row failed: the wallet itself
          // refusing or erroring. The account does not exist on-chain, so
          // the locally-generated keypair is discarded.
          items[i] = {
            ...items[i],
            status: "failed",
            error: result.error || "Wallet rejected or failed",
          };
          emit(`Account ${i + 1} of ${count} failed`);
          // Continue to the next iteration rather than aborting — the
          // user may still want to create the remaining accounts. (If
          // they hit "Reject" they can also just close the modal; that
          // path is handled by the UI cancel.)
          continue;
        }

        // 3. Tx is on-chain. THIS is the moment the keypair becomes the
        //    user's — surface it immediately. We mark the row "done" even
        //    before mirror resolves the accountId; the row will gain
        //    `accountId` later via the background enrichment task.
        txIds.push(result.transactionId);
        items[i] = {
          ...items[i],
          status: "done",
          transactionId: result.transactionId,
          publicKey: publicKeyDer,
          privateKey: privateKeyDer,
        };
        emit(`Account ${i + 1} of ${count} created — resolving account id…`);

        // 4. Kick off background mirror lookup. Capture `i` so the
        //    closure mutates the right row.
        const rowIndex = i;
        const task = enrichWithAccountId(ctx.network, result.transactionId, (accountId) => {
          items[rowIndex] = { ...items[rowIndex], accountId };
          emit();
        });
        mirrorTasks.push(task);
      }

      // Give background mirror tasks a moment to settle before returning.
      // We don't NEED to wait — the UI will keep updating via onProgress
      // — but doing so means the server-side receipt payload usually
      // includes the resolved accountIds. Capped so a totally broken
      // mirror can't stall the workflow.
      await Promise.race([
        Promise.allSettled(mirrorTasks),
        new Promise<void>((r) => setTimeout(r, 8000)),
      ]);

      // Step status reflects on-chain success, NOT mirror status. ANY sub-tx
      // failure marks the step `failed` — partial success is not success. The
      // successful keypairs are still surfaced in payload.accounts so the user
      // can save the ones that did go through.
      const successCount = items.filter((it) => it.status === "done").length;
      const failedItems = items.filter((it) => it.status === "failed");
      const overallStatus: "verified" | "failed" =
        failedItems.length === 0 && successCount === count ? "verified" : "failed";

      let errorSummary: string | undefined;
      if (overallStatus === "failed") {
        if (successCount === 0) {
          errorSummary = `All ${count} account creations failed${
            failedItems[0]?.error ? `: ${failedItems[0].error}` : ""
          }`;
        } else {
          const firstErr = failedItems[0]?.error ?? "unknown error";
          errorSummary = `${successCount} of ${count} accounts created — last failure: ${firstErr}`;
        }
      }

      // Redact privkeys from the server-bound payload. The UI keeps its
      // own copy via the onProgress stream.
      return {
        status: overallStatus,
        transactionId: txIds[0],
        subTransactionIds: txIds.slice(1),
        error: errorSummary,
        payload: {
          createdCount: successCount,
          requested: count,
          accounts: items.map((it) => ({
            accountId: it.accountId,
            publicKey: it.publicKey,
            transactionId: it.transactionId,
            status: it.status,
            error: it.error,
          })),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: "failed", error: message };
    }
  },
};
