// ──────────────────────────────────────────────────────────────────────────────
// Wallet Manager
//
// Factory that creates a network-aware Hedera wallet provider using
// WalletConnect (HashPack, Blade, and other HIP-820 compliant wallets).
// ──────────────────────────────────────────────────────────────────────────────

import type { WalletProvider, WalletMode } from "./types";
import { createHederaWallet } from "./hederaWallet";

const STORAGE_KEY = "openhedera.wallet.network";
const DEFAULT_NETWORK: WalletMode =
  (process.env.NEXT_PUBLIC_DEFAULT_NETWORK as WalletMode) === "mainnet"
    ? "mainnet"
    : "testnet";

/**
 * Read the user's last-selected network from localStorage.
 * Returns the default network when nothing is stored or we're SSR.
 */
export function getStoredNetwork(): WalletMode {
  if (typeof window === "undefined") return DEFAULT_NETWORK;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "mainnet" || stored === "testnet") return stored;
  } catch {
    // ignore (storage disabled / private mode)
  }
  return DEFAULT_NETWORK;
}

/** Persist the user's selected network. */
export function setStoredNetwork(network: WalletMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, network);
  } catch {
    // ignore
  }
}

/**
 * Create a wallet provider for the requested network.
 */
export function createWalletProvider(network: WalletMode): WalletProvider {
  return createHederaWallet(network);
}

/** Get the default network from env (used by SSR-safe fallbacks). */
export function getDefaultNetwork(): WalletMode {
  return DEFAULT_NETWORK;
}
