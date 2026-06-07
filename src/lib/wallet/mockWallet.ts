// ──────────────────────────────────────────────────────────────────────────────
// Mock Wallet Implementation
//
// Simulates a Hedera wallet for public demo/testing.
// No real network calls are made. All operations are simulated.
// ──────────────────────────────────────────────────────────────────────────────

import type {
  AccountId,
  HbarTransferParams,
  TransferResult,
  WalletProvider,
} from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

const MOCK_ACCOUNT_ID = "0.0.9999999";
const MOCK_BALANCE_HBAR = 100;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a mock transaction ID. */
function generateMockTransactionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `0.0.${timestamp}-${random}`;
}

/** Validate a Hedera account ID format. */
function isValidAccountId(accountId: string): boolean {
  const pattern = /^0\.\d+\.\d+$/;
  return pattern.test(accountId);
}

// ── Mock Wallet Implementation ────────────────────────────────────────────────

/**
 * Mock wallet provider for demo and testing.
 * Simulates wallet connection, account retrieval, and HBAR transfers.
 */
export class MockWallet implements WalletProvider {
  mode = "mock" as const;
  displayName = "Mock Wallet (Demo)";

  private connected: boolean = false;
  private accountId: AccountId | null = null;
  private lastTransactionId: string | null = null;

  /**
   * Connect the mock wallet.
   * Simulates a connection delay and returns a mock account.
   */
  async connect(): Promise<boolean> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    this.connected = true;
    this.accountId = MOCK_ACCOUNT_ID;
    return true;
  }

  /** Disconnect the mock wallet. */
  disconnect(): void {
    this.connected = false;
    this.accountId = null;
    this.lastTransactionId = null;
  }

  /** Get the connected account ID. */
  getAccountId(): AccountId | null {
    return this.accountId;
  }

  /**
   * Request an HBAR transfer.
   * Simulates a transfer and returns a mock transaction ID.
   */
  async requestHbarTransfer(params: HbarTransferParams): Promise<TransferResult> {
    if (!this.connected || !this.accountId) {
      return {
        success: false,
        error: "Wallet is not connected",
        isMock: true,
      };
    }

    // Validate recipient
    if (!isValidAccountId(params.recipient)) {
      return {
        success: false,
        error: `Invalid recipient account ID: "${params.recipient}". Expected format: 0.{shard}.{realm}.{num}`,
        isMock: true,
      };
    }

    // Validate amount
    if (params.amount <= 0) {
      return {
        success: false,
        error: "Transfer amount must be greater than 0",
        isMock: true,
      };
    }

    // Validate balance (mock)
    if (params.amount > MOCK_BALANCE_HBAR) {
      return {
        success: false,
        error: `Insufficient balance. Mock balance: ${MOCK_BALANCE_HBAR} HBAR`,
        isMock: true,
      };
    }

    // Simulate transfer delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Generate mock transaction ID
    const transactionId = generateMockTransactionId();
    this.lastTransactionId = transactionId;

    return {
      success: true,
      transactionId,
      isMock: true,
    };
  }

  /** Get the last transaction ID. */
  getLastTransactionId(): string | null {
    return this.lastTransactionId;
  }

  /** Check if the wallet is connected. */
  isConnected(): boolean {
    return this.connected;
  }
}

/** Create a new mock wallet instance. */
export function createMockWallet(): WalletProvider {
  return new MockWallet();
}
