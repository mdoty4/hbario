// ──────────────────────────────────────────────────────────────────────────────
// Hedera Tools
//
// Public API for all Hedera tool functions.
// Delegates to mock implementations when MOCK_HEDERA=true.
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
import * as mockTools from "./mockTools";

// ── Configuration ─────────────────────────────────────────────────────────────

const MOCK_MODE = process.env.MOCK_HEDERA === "true";

// ── Read / Planning Tools ─────────────────────────────────────────────────────

/**
 * Validate a Hedera account ID format.
 */
export function validateAccount(accountId: string): ValidateAccountResult {
  if (MOCK_MODE) {
    return mockTools.mockValidateAccount(accountId);
  }
  throw new Error("validateAccount: real Hedera integration not yet implemented");
}

/**
 * Get the balance of a Hedera account.
 */
export function getAccountBalance(accountId: string): AccountBalance {
  if (MOCK_MODE) {
    return mockTools.mockGetAccountBalance(accountId);
  }
  throw new Error("getAccountBalance: real Hedera integration not yet implemented");
}

/**
 * Estimate the fee for a single HBAR transfer.
 */
export function estimateTransferFees(params: TransferFeeParams): FeeEstimate {
  if (MOCK_MODE) {
    return mockTools.mockEstimateTransferFees(params);
  }
  throw new Error("estimateTransferFees: real Hedera integration not yet implemented");
}

/**
 * Estimate the total fee for a bulk payout.
 */
export function estimateBulkPayoutFees(params: BulkPayoutFeeParams): FeeEstimate {
  if (MOCK_MODE) {
    return mockTools.mockEstimateBulkPayoutFees(params);
  }
  throw new Error("estimateBulkPayoutFees: real Hedera integration not yet implemented");
}

// ── Prepare Tools ─────────────────────────────────────────────────────────────

/**
 * Prepare an HBAR transfer instruction.
 * Does NOT execute the transfer. Returns a structured instruction for user approval.
 */
export function prepareHbarTransfer(params: PrepareTransferParams): TransferInstruction {
  if (MOCK_MODE) {
    return mockTools.mockPrepareHbarTransfer(params);
  }
  throw new Error("prepareHbarTransfer: real Hedera integration not yet implemented");
}

/**
 * Prepare a bulk payout instruction.
 * Does NOT execute the payout. Returns structured instructions for user approval.
 */
export function prepareBulkPayout(params: PrepareBulkPayoutParams): BulkPayoutInstruction {
  if (MOCK_MODE) {
    return mockTools.mockPrepareBulkPayout(params);
  }
  throw new Error("prepareBulkPayout: real Hedera integration not yet implemented");
}

// ── Verification Tools ────────────────────────────────────────────────────────

/**
 * Verify a transaction against expected details.
 */
export function verifyTransaction(
  transactionId: TransactionId,
  expectedDetails: ExpectedTransactionDetails
): VerificationResult {
  if (MOCK_MODE) {
    return mockTools.mockVerifyTransaction(transactionId, expectedDetails);
  }
  throw new Error("verifyTransaction: real Hedera integration not yet implemented");
}

/**
 * Get a transaction receipt.
 */
export function getTransactionReceipt(transactionId: TransactionId): TransactionReceipt {
  if (MOCK_MODE) {
    return mockTools.mockGetTransactionReceipt(transactionId);
  }
  throw new Error("getTransactionReceipt: real Hedera integration not yet implemented");
}

// ── Mode Check ────────────────────────────────────────────────────────────────

/**
 * Check whether the tools are running in mock mode.
 */
export function isMockMode(): boolean {
  return MOCK_MODE;
}
