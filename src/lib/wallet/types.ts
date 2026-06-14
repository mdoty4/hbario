// ──────────────────────────────────────────────────────────────────────────────
// Wallet Types
//
// Shared TypeScript interfaces for the wallet abstraction layer.
// Supports Hedera testnet and mainnet via WalletConnect (HashPack, Blade, etc.).
// ──────────────────────────────────────────────────────────────────────────────

/** A Hedera account identifier in the format `0.{shard}.{realm}.{num}`. */
export type AccountId = string;

/** The Hedera network the wallet is connected to. */
export type WalletMode = "testnet" | "mainnet";

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
  /** The transaction ID (e.g. `0.0.12345@1700000000.000000000`). */
  transactionId?: string;
  /** Error message when transfer fails. */
  error?: string;
  /** The network on which the transaction was submitted. */
  network: WalletMode;
}

/** The core wallet interface that all implementations must satisfy. */
export interface WalletProvider {
  /** The network the wallet operates on. */
  mode: WalletMode;

  /** Display name for the wallet provider. */
  displayName: string;

  /** Connect the wallet. Returns true if successful. */
  connect(): Promise<boolean>;

  /** Disconnect the wallet. */
  disconnect(): Promise<void>;

  /** Get the connected account ID. Returns null if not connected. */
  getAccountId(): AccountId | null;

  /** Request an HBAR transfer from the connected wallet. */
  requestHbarTransfer(params: HbarTransferParams): Promise<TransferResult>;

  /**
   * Sign and execute an arbitrary prepared Hedera SDK transaction.
   *
   * The caller is responsible for building the transaction (e.g.
   * `TransferTransaction`, `AccountCreateTransaction`); this method populates
   * node IDs / tx id via the connected wallet's signer and submits it through
   * WalletConnect.
   *
   * Used by multi-step workflow executors that need to drive transaction
   * kinds beyond simple HBAR transfers.
   */
  signAndExecuteTransaction(transaction: unknown): Promise<TransferResult>;

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
  /** The Hedera network this payment will be sent on. */
  network: WalletMode;
}

/** Result of verifying a payment transaction. */
export interface PaymentVerificationResult {
  /** Whether the payment was verified. */
  verified: boolean;
  /** The transaction ID. */
  transactionId: string;
  /** Error message when verification fails. */
  error?: string;
  /** The Hedera network the transaction was verified against. */
  network: WalletMode;
}
