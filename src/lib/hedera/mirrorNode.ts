// ──────────────────────────────────────────────────────────────────────────────
// Hedera Mirror Node Client
//
// Read-only HTTP client for the Hedera Mirror Node REST API.
// Used server-side to verify transactions and fetch receipts without any
// private keys or wallet credentials.
//
// Docs: https://docs.hedera.com/hedera/sdks-and-apis/rest-api
// ──────────────────────────────────────────────────────────────────────────────

import type { WalletMode } from "@/lib/wallet/types";

const MIRROR_NODE_HOSTS: Record<WalletMode, string> = {
  testnet: "https://testnet.mirrornode.hedera.com",
  mainnet: "https://mainnet.mirrornode.hedera.com",
};

const RETRY_ATTEMPTS = 6;
const RETRY_DELAY_MS = 1500;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MirrorTransfer {
  account: string;
  amount: number; // tinybars
}

export interface MirrorTransaction {
  transaction_id: string;
  consensus_timestamp: string;
  result: string;
  memo_base64: string | null;
  charged_tx_fee: number;
  transfers: MirrorTransfer[];
}

export interface MirrorReceiptLike {
  status: "SUCCESS" | "FAILURE" | "PENDING" | "NOT_FOUND";
  consensusTimestamp?: string;
  blockHash?: string;
  raw?: MirrorTransaction;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert an SDK-style transaction id (`0.0.X@SEC.NS`) to the wire format the
 * mirror node expects in URLs (`0.0.X-SEC-NS`).
 */
function normalizeTransactionId(txId: string): string {
  // Already in wire format?
  if (/^0\.\d+\.\d+-\d+-\d+$/.test(txId)) return txId;
  const match = txId.match(/^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return txId;
}

function decodeBase64(value: string | null | undefined): string {
  if (!value) return "";
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(value, "base64").toString("utf-8");
    }
    // Fallback for non-Node environments (shouldn't happen on the server).
    return atob(value);
  } catch {
    return "";
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Mirror Node request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch a transaction from the Hedera Mirror Node. Retries a few times because
 * mirror nodes lag ~3-5s behind consensus.
 */
export async function fetchTransaction(
  network: WalletMode,
  transactionId: string
): Promise<MirrorTransaction | null> {
  const host = MIRROR_NODE_HOSTS[network];
  const wireId = normalizeTransactionId(transactionId);
  const url = `${host}/api/v1/transactions/${wireId}`;

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    const data = (await fetchJson(url)) as {
      transactions?: MirrorTransaction[];
    } | null;

    const tx = data?.transactions?.[0];
    if (tx) return tx;

    // Not yet indexed — wait and retry.
    if (attempt < RETRY_ATTEMPTS - 1) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  return null;
}

/**
 * Fetch a normalized receipt-shape result for a transaction.
 */
export async function fetchReceipt(
  network: WalletMode,
  transactionId: string
): Promise<MirrorReceiptLike> {
  const tx = await fetchTransaction(network, transactionId);
  if (!tx) {
    return { status: "NOT_FOUND" };
  }

  const status: MirrorReceiptLike["status"] =
    tx.result === "SUCCESS" ? "SUCCESS" : "FAILURE";

  return {
    status,
    consensusTimestamp: tx.consensus_timestamp,
    raw: tx,
  };
}

export interface VerifyExpectations {
  /** Hedera account ID that signed/paid for the transaction. */
  payerAccount?: string;
  /** Hedera account ID that received the transfer. */
  recipient: string;
  /** Expected transfer amount in HBAR. */
  amountHbar: number;
  /** Expected memo (UTF-8). When omitted, memo is not checked. */
  memo?: string;
  /** How much memo / amount drift to tolerate. */
  amountToleranceTinybars?: number;
}

export interface VerifyOutcome {
  verified: boolean;
  error?: string;
  details: Record<string, string | number | boolean>;
  raw?: MirrorTransaction;
  status: MirrorReceiptLike["status"];
  consensusTimestamp?: string;
}

const TINYBARS_PER_HBAR = 100_000_000;

/**
 * Verify a transaction against expected details by reading it from the
 * mirror node. Checks status, recipient, amount, payer and (optionally) memo.
 */
export async function verifyTransactionOnMirror(
  network: WalletMode,
  transactionId: string,
  expected: VerifyExpectations
): Promise<VerifyOutcome> {
  const tx = await fetchTransaction(network, transactionId);
  if (!tx) {
    return {
      verified: false,
      error: "Transaction not found on mirror node (yet). Try again in a moment.",
      details: { transactionId, network },
      status: "NOT_FOUND",
    };
  }

  if (tx.result !== "SUCCESS") {
    return {
      verified: false,
      error: `Transaction did not succeed (result=${tx.result})`,
      details: { transactionId, network, result: tx.result },
      status: "FAILURE",
      consensusTimestamp: tx.consensus_timestamp,
      raw: tx,
    };
  }

  // Find the transfer to the recipient.
  const expectedTinybars = Math.round(expected.amountHbar * TINYBARS_PER_HBAR);
  const tolerance = expected.amountToleranceTinybars ?? 0;

  const recipientTransfer = tx.transfers.find(
    (t) => t.account === expected.recipient && t.amount > 0
  );

  if (!recipientTransfer) {
    return {
      verified: false,
      error: `No HBAR transfer to ${expected.recipient} found in transaction.`,
      details: {
        transactionId,
        network,
        recipient: expected.recipient,
        transfers: tx.transfers.length,
      },
      status: "SUCCESS",
      consensusTimestamp: tx.consensus_timestamp,
      raw: tx,
    };
  }

  if (Math.abs(recipientTransfer.amount - expectedTinybars) > tolerance) {
    return {
      verified: false,
      error: `Amount mismatch: expected ${expected.amountHbar} HBAR (${expectedTinybars} tinybars), got ${recipientTransfer.amount} tinybars to ${expected.recipient}.`,
      details: {
        transactionId,
        network,
        expectedTinybars,
        actualTinybars: recipientTransfer.amount,
      },
      status: "SUCCESS",
      consensusTimestamp: tx.consensus_timestamp,
      raw: tx,
    };
  }

  // Optional payer check — find a transfer that debits the payer account.
  if (expected.payerAccount) {
    const payerTransfer = tx.transfers.find(
      (t) => t.account === expected.payerAccount && t.amount < 0
    );
    if (!payerTransfer) {
      return {
        verified: false,
        error: `Payer account ${expected.payerAccount} did not debit any HBAR in this transaction.`,
        details: {
          transactionId,
          network,
          payerAccount: expected.payerAccount,
        },
        status: "SUCCESS",
        consensusTimestamp: tx.consensus_timestamp,
        raw: tx,
      };
    }
  }

  // Optional memo check.
  const memo = decodeBase64(tx.memo_base64);
  if (expected.memo && expected.memo.trim() !== "" && memo.trim() !== expected.memo.trim()) {
    return {
      verified: false,
      error: `Memo mismatch: expected "${expected.memo}", got "${memo}".`,
      details: {
        transactionId,
        network,
        expectedMemo: expected.memo,
        actualMemo: memo,
      },
      status: "SUCCESS",
      consensusTimestamp: tx.consensus_timestamp,
      raw: tx,
    };
  }

  return {
    verified: true,
    details: {
      transactionId,
      network,
      recipient: expected.recipient,
      amountTinybars: recipientTransfer.amount,
      amountHbar: recipientTransfer.amount / TINYBARS_PER_HBAR,
      memo,
    },
    status: "SUCCESS",
    consensusTimestamp: tx.consensus_timestamp,
    raw: tx,
  };
}
