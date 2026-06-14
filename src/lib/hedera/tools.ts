// ──────────────────────────────────────────────────────────────────────────────
// Hedera Tools
//
// Public API for all Hedera tool functions.
//
// Verification helpers (`verifyTransaction`, `getTransactionReceipt`) hit the
// Hedera Mirror Node REST API and are network-aware. The other tools
// (validation, fee estimates, prepare-only instructions) are pure helpers
// that don't talk to the network — they are intentionally still here so the
// agent's tool registry keeps working.
//
// No private keys, no automatic fund movement.
// ──────────────────────────────────────────────────────────────────────────────

import {
  AccountBalance,
  BulkPayoutFeeParams,
  BulkPayoutInstruction,
  ExpectedTransactionDetails,
  FeeEstimate,
  PrepareBulkPayoutParams,
  PrepareTransferParams,
  TransactionId,
  TransactionReceipt,
  TransferFeeParams,
  TransferInstruction,
  ValidateAccountResult,
  VerificationResult,
} from "./types";
import * as helpers from "./mockTools";
import type { WalletMode } from "@/lib/wallet/types";
import {
  fetchReceipt,
  verifyTransactionOnMirror,
} from "./mirrorNode";

// ── Read / Planning Tools (pure, no network) ──────────────────────────────────

export function validateAccount(accountId: string): ValidateAccountResult {
  return helpers.mockValidateAccount(accountId);
}

export function getAccountBalance(accountId: string): AccountBalance {
  return helpers.mockGetAccountBalance(accountId);
}

export function estimateTransferFees(params: TransferFeeParams): FeeEstimate {
  return helpers.mockEstimateTransferFees(params);
}

export function estimateBulkPayoutFees(params: BulkPayoutFeeParams): FeeEstimate {
  return helpers.mockEstimateBulkPayoutFees(params);
}

// ── Prepare Tools (pure, no network) ──────────────────────────────────────────

export function prepareHbarTransfer(params: PrepareTransferParams): TransferInstruction {
  return helpers.mockPrepareHbarTransfer(params);
}

export function prepareBulkPayout(params: PrepareBulkPayoutParams): BulkPayoutInstruction {
  return helpers.mockPrepareBulkPayout(params);
}

// ── Verification Tools (hit the Mirror Node) ─────────────────────────────────

/**
 * Verify a transaction against expected details using the Hedera Mirror Node.
 */
export async function verifyTransaction(
  transactionId: TransactionId,
  expectedDetails: ExpectedTransactionDetails,
  network: WalletMode
): Promise<VerificationResult> {
  if (!expectedDetails.recipient) {
    return {
      verified: false,
      transactionId,
      error: "Expected recipient is required for verification.",
      network,
    };
  }
  if (typeof expectedDetails.amountHbar !== "number") {
    return {
      verified: false,
      transactionId,
      error: "Expected amountHbar is required for verification.",
      network,
    };
  }

  const outcome = await verifyTransactionOnMirror(network, transactionId, {
    payerAccount: expectedDetails.sender,
    recipient: expectedDetails.recipient,
    amountHbar: expectedDetails.amountHbar,
    memo: expectedDetails.memo,
  });

  return {
    verified: outcome.verified,
    transactionId,
    details: outcome.details,
    error: outcome.error,
    network,
  };
}

/**
 * Get a transaction receipt from the Hedera Mirror Node.
 */
export async function getTransactionReceipt(
  transactionId: TransactionId,
  network: WalletMode
): Promise<TransactionReceipt> {
  const receipt = await fetchReceipt(network, transactionId);
  return {
    transactionId,
    status: receipt.status,
    consensusTimestamp: receipt.consensusTimestamp,
    network,
  };
}
