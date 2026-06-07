// ──────────────────────────────────────────────────────────────────────────────
// Wallet Manager
//
// Factory that creates the appropriate wallet provider based on configuration.
// Supports switching between mock and real Hedera testnet wallets.
// ──────────────────────────────────────────────────────────────────────────────

import type { WalletProvider, WalletMode } from "./types";
import { createMockWallet } from "./mockWallet";

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * Determine the wallet mode from environment.
 * In production, set MOCK_HEDERA=false and configure real wallet credentials.
 */
function getWalletMode(): WalletMode {
  // On the client side, we read from window; on server side, from process.env
  if (typeof window !== "undefined") {
    const envMode = (window as any).__HEDERA_WALLET_MODE__;
    if (envMode === "real") return "real";
    return "mock";
  }
  return process.env.MOCK_HEDERA === "true" ? "mock" : "real";
}

// ── Real Wallet Placeholder ───────────────────────────────────────────────────

/**
 * Real Hedera testnet wallet provider.
 * 
 * This is a placeholder that throws errors until the real Hedera SDK
 * integration is implemented. To enable real wallet mode:
 * 
 * 1. Install @hashgraph/sdk
 * 2. Implement the real wallet methods using the SDK
 * 3. Set MOCK_HEDERA=false in production
 */
class RealHederaWallet implements WalletProvider {
  mode = "real" as const;
  displayName = "Hedera Testnet Wallet";

  private connected: boolean = false;

  async connect(): Promise<boolean> {
    throw new Error(
      "Real Hedera wallet integration is not yet implemented. " +
      "Install @hashgraph/sdk and implement wallet connection. " +
      "Use mock mode (MOCK_HEDERA=true) for development."
    );
  }

  disconnect(): void {
    this.connected = false;
  }

  getAccountId(): string | null {
    throw new Error("Real Hedera wallet integration is not yet implemented.");
  }

  async requestHbarTransfer(_params: { recipient: string; amount: number; memo?: string }): Promise<{ success: boolean; transactionId?: string; error?: string; isMock: boolean }> {
    throw new Error("Real Hedera wallet integration is not yet implemented.");
  }

  getLastTransactionId(): string | null {
    return null;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a wallet provider based on the current configuration.
 * 
 * @param mode - Override the detected mode (optional).
 * @returns A wallet provider instance.
 */
export function createWalletProvider(mode?: WalletMode): WalletProvider {
  const walletMode = mode ?? getWalletMode();

  if (walletMode === "mock") {
    return createMockWallet();
  }

  return new RealHederaWallet();
}

/**
 * Get the current wallet mode.
 */
export function getCurrentWalletMode(): WalletMode {
  return getWalletMode();
}
