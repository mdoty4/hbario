// ──────────────────────────────────────────────────────────────────────────────
// Pre-flight balance check
//
// Before kicking off a step that the user is going to pay HBAR for (network
// fees + any initial balance on new accounts), we want to compare their
// wallet's current HBAR balance against an estimated cost. If they're short
// we surface a warning BEFORE the first wallet popup so they aren't left
// half-way through a multi-signature workflow with INSUFFICIENT_PAYER_BALANCE.
//
// Everything here runs read-only against the Hedera Mirror Node REST API.
// ──────────────────────────────────────────────────────────────────────────────

import type { WalletMode } from "@/lib/wallet/types";

// Conservative per-step network fee estimate (HBAR). Hedera's actual fees
// for these op types in late-2025 hover around:
//   - CryptoCreate:   ~0.05 USD  (~0.6–0.7 HBAR at $0.08/HBAR)
//   - CryptoTransfer: ~0.0001 USD (~0.001 HBAR)
// We pad these so the estimate is always >= worst-case so we don't
// under-warn the user.
const ACCOUNT_CREATE_FEE_HBAR = 1.0;     // conservative; mainnet fees > testnet
const SINGLE_PAYMENT_FEE_HBAR = 0.05;    // also conservative
const BULK_PAYOUT_PER_RECIPIENT_FEE = 0.02;

function mirrorHost(network: WalletMode): string {
  return network === "mainnet"
    ? "https://mainnet.mirrornode.hedera.com"
    : "https://testnet.mirrornode.hedera.com";
}

/**
 * Fetch the HBAR balance of an account from the mirror node. Returns null if
 * the account doesn't exist or the mirror is unreachable — the caller should
 * treat that as "unknown, don't block".
 */
export async function fetchWalletHbarBalance(
  network: WalletMode,
  accountId: string,
): Promise<number | null> {
  if (!/^\d+\.\d+\.\d+$/.test(accountId)) return null;
  try {
    const url = `${mirrorHost(network)}/api/v1/accounts/${accountId}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      balance?: { balance?: number };
    };
    const tinybars = data.balance?.balance;
    if (typeof tinybars !== "number") return null;
    return tinybars / 100_000_000;
  } catch {
    return null;
  }
}

export interface StepCostEstimate {
  /** Conservative HBAR estimate of what the *step* will cost the wallet. */
  estimatedHbar: number;
  /** Per-step network fee guess. */
  feeHbar: number;
  /** HBAR that actually leaves the wallet (initial balances + transfer amounts). */
  outflowHbar: number;
  /** Human-readable breakdown for tooltip/warning UI. */
  detail: string;
}

/**
 * Estimate the HBAR cost of a single compiled step. Returns 0 outflow + 0 fee
 * for kinds we don't recognize.
 */
export function estimateStepCost(step: Record<string, unknown>): StepCostEstimate {
  const kind = typeof step.kind === "string" ? step.kind : "";
  if (kind === "bulk_account_creation") {
    const count = typeof step.count === "number" ? (step.count as number) : 0;
    const initialBalanceHbar =
      typeof step.initialBalanceHbar === "number"
        ? (step.initialBalanceHbar as number)
        : 0;
    const feeHbar = count * ACCOUNT_CREATE_FEE_HBAR;
    const outflowHbar = count * initialBalanceHbar;
    return {
      estimatedHbar: feeHbar + outflowHbar,
      feeHbar,
      outflowHbar,
      detail:
        `${count} × CryptoCreate ` +
        `(≈ ${ACCOUNT_CREATE_FEE_HBAR} HBAR fee + ${initialBalanceHbar} HBAR initial balance each)`,
    };
  }
  if (kind === "single_payment") {
    const amountHbar =
      typeof step.amountHbar === "number"
        ? (step.amountHbar as number)
        : typeof step.amount === "number"
        ? (step.amount as number)
        : 0;
    return {
      estimatedHbar: SINGLE_PAYMENT_FEE_HBAR + amountHbar,
      feeHbar: SINGLE_PAYMENT_FEE_HBAR,
      outflowHbar: amountHbar,
      detail: `1 × CryptoTransfer (≈ ${SINGLE_PAYMENT_FEE_HBAR} HBAR fee + ${amountHbar} HBAR transferred)`,
    };
  }
  if (kind === "bulk_payout") {
    const total =
      typeof step.totalAmountHbar === "number"
        ? (step.totalAmountHbar as number)
        : 0;
    const recipients = Array.isArray(step.recipients)
      ? (step.recipients as unknown[]).length
      : 0;
    const feeHbar = Math.max(SINGLE_PAYMENT_FEE_HBAR, recipients * BULK_PAYOUT_PER_RECIPIENT_FEE);
    return {
      estimatedHbar: feeHbar + total,
      feeHbar,
      outflowHbar: total,
      detail: `1 × CryptoTransfer with ${recipients} recipients (≈ ${feeHbar.toFixed(2)} HBAR fee + ${total} HBAR transferred)`,
    };
  }
  return {
    estimatedHbar: 0,
    feeHbar: 0,
    outflowHbar: 0,
    detail: `Unknown step kind "${kind}" — no cost estimate available.`,
  };
}
