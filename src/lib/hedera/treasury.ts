// ──────────────────────────────────────────────────────────────────────────────
// Treasury account resolution
//
// Centralizes how we pick the Hedera account ID that receives workflow-unlock
// payments. There are two related env vars:
//
//   - HEDERA_TREASURY_ACCOUNT_ID_TESTNET / _MAINNET (per-network, preferred)
//   - HEDERA_TREASURY_ACCOUNT_ID                    (legacy fallback)
//
// In production we refuse to silently fall back to a placeholder; a missing
// treasury account is a configuration bug and must be loud.
// ──────────────────────────────────────────────────────────────────────────────

import type { WalletMode } from "@/lib/wallet/types";

const PLACEHOLDER_ACCOUNTS = new Set(["0.0.1234567", "0.0.0000000"]);

function isRealAccount(value: string | undefined): value is string {
  if (!value) return false;
  if (PLACEHOLDER_ACCOUNTS.has(value)) return false;
  return /^\d+\.\d+\.\d+$/.test(value);
}

/**
 * Returns the workflow-unlock treasury account for the given network, or null
 * if none is configured. In production this should never return null —
 * callers are expected to surface that as a 5xx with a clear message.
 */
export function resolveTreasuryAccount(network: WalletMode = "testnet"): string | null {
  const perNetwork =
    network === "mainnet"
      ? process.env.HEDERA_TREASURY_ACCOUNT_ID_MAINNET
      : process.env.HEDERA_TREASURY_ACCOUNT_ID_TESTNET;
  if (isRealAccount(perNetwork)) return perNetwork;

  const legacy = process.env.HEDERA_TREASURY_ACCOUNT_ID;
  if (isRealAccount(legacy)) return legacy;

  if (process.env.NODE_ENV === "production") {
    // Loud in prod logs; callers convert to a 5xx with a friendly error.
    console.error(
      "[treasury] No real HEDERA_TREASURY_ACCOUNT_ID configured for network=" +
        network +
        ". Set HEDERA_TREASURY_ACCOUNT_ID_" +
        network.toUpperCase() +
        "."
    );
  }
  return null;
}
