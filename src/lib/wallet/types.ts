// ──────────────────────────────────────────────────────────────────────────────
// Wallet Types
//
// Shared TypeScript interfaces for the wallet abstraction layer.
// Supports both real Hedera testnet wallet and mock wallet mode.
// ──────────────────────────────────────────────────────────────────────────────

/** A Hedera account identifier in the format `0.{shard}.{realm}.{num}`. */
export type AccountId = string;

/** The wallet mode: real Hedera testnet or mock. */
export type WalletMode = "real" | "mock";

/** Connection status of the wallet. */
export type WalletConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/** Parameters for requesting an HBAR transfer. */
export interface HbarTransferParams {
  /** Recipient account ID. */
  recipient: AccountId;
  /** Amount to transfer in HBAR. */
  amount: number;
  /** Optional memo for the transfer. */
  memo?: string;
}

/** Result of a wallet transfer operation. */
export interface TransferResult {
  /** Whether the transfer was initiated successfully. */
  success: boolean;
  /** The transaction ID (real or mock). */
  transactionId?: string;
  /** Error message when transfer fails. */
  error?: string;
  /** Whether this was a mock transfer. */
  isMock: boolean;
}

/** The core wallet interface that all implementations must satisfy. */
export interface WalletProvider {
  /** The wallet mode. */
  mode: WalletMode;

  /** Display name for the wallet provider. */
  displayName: string;

  /** Connect the wallet. Returns true if successful. */
  connect(): Promise<boolean>;

  /** Disconnect the wallet. */
  disconnect(): void;

  /** Get the connected account ID. Returns null if not connected. */
  getAccountId(): AccountId | null;

  /** Request an HBAR transfer from the connected wallet. */
  requestHbarTransfer(params: HbarTransferParams): Promise<TransferResult>;

  /** Get the last transaction ID from the most recent transfer. */
  getLastTransactionId(): string | null;

  /** Check if the wallet is currently connected. */
  isConnected(): boolean;
}

/** Payload for the payment approval UI. */
export interface PaymentApprovalPayload {
  /** The order/workflow being paid for. */
  workflowId: string;
  /** Sender account ID (connected wallet). */
  sender: AccountId;
  /** Recipient account ID. */
  recipient: AccountId;
  /** Amount to transfer in HBAR. */
  amount: number;
  /** Memo for the transfer. */
  memo: string;
  /** Whether this is mock mode. */
  isMock: boolean;
}

/** Result of verifying a payment transaction. */
export interface PaymentVerificationResult {
  /** Whether the payment was verified. */
  verified: boolean;
  /** The transaction ID. */
  transactionId: string;
  /** Error message when verification fails. */
  error?: string;
  /** Whether this was a mock verification. */
  isMock: boolean;
}
