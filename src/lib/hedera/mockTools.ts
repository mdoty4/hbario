// ──────────────────────────────────────────────────────────────────────────────
// Hedera Mock Tools
//
// Mock implementations for all Hedera tool functions.
// Used when MOCK_HEDERA=true. No real network calls are made.
// No private keys, no automatic fund movement.
// ──────────────────────────────────────────────────────────────────────────────

import {
  AccountId,
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
  hbarToTinybars,
} from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

const MOCK_FEE_PER_TRANSFER = 0.001; // HBAR per transfer
const MOCK_BALANCE = 1_000; // HBAR mock balance for any account

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Validate a Hedera account ID format. */
function isValidAccountId(accountId: string): { valid: boolean; error?: string } {
  // Accept formats: 0.{shard}.{realm}@{num} or 0.{shard}.{realm}.{num}
  const pattern = /^0\.\d+\.\d+[@.]\d+$/;
  if (!pattern.test(accountId)) {
    return { valid: false, error: `Invalid account ID format: "${accountId}". Expected format: 0.{shard}.{realm}@{num}` };
  }
  return { valid: true };
}

/** Generate a mock instruction ID. */
function generateInstructionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `mock_${timestamp}_${random}`;
}

/** Generate a mock transaction ID. */
function generateTransactionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `0.0.${timestamp}-${random}`;
}

// ── Read / Planning Tools ─────────────────────────────────────────────────────

/**
 * Validate a Hedera account ID format.
 * In mock mode, performs simple regex-based format checking.
 */
export function mockValidateAccount(accountId: AccountId): ValidateAccountResult {
  const result = isValidAccountId(accountId);
  return {
    valid: result.valid,
    accountId,
    error: result.error,
  };
}

/**
 * Get the balance of a Hedera account.
 * In mock mode, returns a hardcoded balance after validating the account.
 */
export function mockGetAccountBalance(accountId: AccountId): AccountBalance | never {
  const validation = mockValidateAccount(accountId);
  if (!validation.valid) {
    throw new Error(`Cannot get balance: ${validation.error}`);
  }
  const tinybars = hbarToTinybars(MOCK_BALANCE);
  return {
    accountId,
    tinybars,
    hbar: MOCK_BALANCE,
  };
}

/**
 * Estimate the fee for a single HBAR transfer.
 * In mock mode, returns a hardcoded fee.
 */
export function mockEstimateTransferFees(params: TransferFeeParams): FeeEstimate {
  const senderValidation = mockValidateAccount(params.sender);
  if (!senderValidation.valid) {
    throw new Error(`Invalid sender: ${senderValidation.error}`);
  }
  const recipientValidation = mockValidateAccount(params.recipient);
  if (!recipientValidation.valid) {
    throw new Error(`Invalid recipient: ${recipientValidation.error}`);
  }
  const feeTinybars = hbarToTinybars(MOCK_FEE_PER_TRANSFER);
  return {
    feeTinybars,
    feeHbar: MOCK_FEE_PER_TRANSFER,
    isMock: true,
  };
}

/**
 * Estimate the total fee for a bulk payout.
 * In mock mode, returns a hardcoded fee per transfer multiplied by the number of payouts.
 */
export function mockEstimateBulkPayoutFees(params: BulkPayoutFeeParams): FeeEstimate {
  const senderValidation = mockValidateAccount(params.sender);
  if (!senderValidation.valid) {
    throw new Error(`Invalid sender: ${senderValidation.error}`);
  }
  for (const payout of params.payouts) {
    const recipientValidation = mockValidateAccount(payout.recipient);
    if (!recipientValidation.valid) {
      throw new Error(`Invalid recipient: ${recipientValidation.error}`);
    }
  }
  const totalFee = MOCK_FEE_PER_TRANSFER * params.payouts.length;
  const feeTinybars = hbarToTinybars(totalFee);
  return {
    feeTinybars,
    feeHbar: totalFee,
    isMock: true,
  };
}

// ── Prepare Tools ─────────────────────────────────────────────────────────────

/**
 * Prepare an HBAR transfer instruction.
 * Does NOT execute the transfer. Returns a structured instruction for user approval.
 */
export function mockPrepareHbarTransfer(params: PrepareTransferParams): TransferInstruction {
  const senderValidation = mockValidateAccount(params.sender);
  if (!senderValidation.valid) {
    throw new Error(`Invalid sender: ${senderValidation.error}`);
  }
  const recipientValidation = mockValidateAccount(params.recipient);
  if (!recipientValidation.valid) {
    throw new Error(`Invalid recipient: ${recipientValidation.error}`);
  }
  if (params.amount <= 0) {
    throw new Error("Transfer amount must be greater than 0");
  }

  const amountTinybars = hbarToTinybars(params.amount);
  const instructionId = generateInstructionId();

  return {
    instructionId,
    type: "HBAR_TRANSFER",
    sender: params.sender,
    recipient: params.recipient,
    amount: params.amount,
    amountTinybars,
    memo: params.memo,
    estimatedFeeHbar: MOCK_FEE_PER_TRANSFER,
    status: "PENDING_APPROVAL",
    summary: `Transfer ${params.amount} HBAR from ${params.sender} to ${params.recipient}`,
    isMock: true,
  };
}

/**
 * Prepare a bulk payout instruction.
 * Does NOT execute the payout. Returns structured instructions for user approval.
 */
export function mockPrepareBulkPayout(params: PrepareBulkPayoutParams): BulkPayoutInstruction {
  const senderValidation = mockValidateAccount(params.sender);
  if (!senderValidation.valid) {
    throw new Error(`Invalid sender: ${senderValidation.error}`);
  }
  if (params.payouts.length === 0) {
    throw new Error("Bulk payout must have at least one payout entry");
  }

  const transfers: TransferInstruction[] = [];
  let totalAmount = 0;

  for (const payout of params.payouts) {
    const recipientValidation = mockValidateAccount(payout.recipient);
    if (!recipientValidation.valid) {
      throw new Error(`Invalid recipient: ${recipientValidation.error}`);
    }
    if (payout.amount <= 0) {
      throw new Error(`Payout amount for ${payout.recipient} must be greater than 0`);
    }

    totalAmount += payout.amount;
    transfers.push({
      instructionId: generateInstructionId(),
      type: "HBAR_TRANSFER",
      sender: params.sender,
      recipient: payout.recipient,
      amount: payout.amount,
      amountTinybars: hbarToTinybars(payout.amount),
      memo: params.memo,
      estimatedFeeHbar: MOCK_FEE_PER_TRANSFER,
      status: "PENDING_APPROVAL",
      summary: `Transfer ${payout.amount} HBAR to ${payout.recipient}`,
      isMock: true,
    });
  }

  const totalFee = MOCK_FEE_PER_TRANSFER * params.payouts.length;

  return {
    instructionId: generateInstructionId(),
    type: "BULK_PAYOUT",
    sender: params.sender,
    transfers,
    totalAmountHbar: totalAmount,
    totalEstimatedFeeHbar: totalFee,
    memo: params.memo,
    status: "PENDING_APPROVAL",
    summary: `Bulk payout of ${totalAmount} HBAR to ${params.payouts.length} recipients`,
    isMock: true,
  };
}

// ── Verification Tools ────────────────────────────────────────────────────────

/**
 * Verify a transaction against expected details.
 * In mock mode, accepts any valid mock transaction ID and matches expected details.
 */
export function mockVerifyTransaction(
  transactionId: TransactionId,
  expectedDetails: ExpectedTransactionDetails
): VerificationResult {
  // In mock mode, we accept any non-empty transaction ID
  if (!transactionId || transactionId.trim() === "") {
    return {
      verified: false,
      transactionId,
      error: "Transaction ID cannot be empty",
      isMock: true,
    };
  }

  // Mock verification: always succeeds if a transaction ID is provided
  const details: Record<string, string | number | boolean> = {
    mockMode: true,
  };

  if (expectedDetails.sender) details.sender = expectedDetails.sender;
  if (expectedDetails.recipient) details.recipient = expectedDetails.recipient;
  if (expectedDetails.amountHbar !== undefined) details.amountHbar = expectedDetails.amountHbar;

  return {
    verified: true,
    transactionId,
    details,
    isMock: true,
  };
}

/**
 * Get a transaction receipt.
 * In mock mode, returns a mock receipt with SUCCESS status for any valid transaction ID.
 */
export function mockGetTransactionReceipt(transactionId: TransactionId): TransactionReceipt {
  if (!transactionId || transactionId.trim() === "") {
    return {
      transactionId,
      status: "NOT_FOUND",
      isMock: true,
    };
  }

  return {
    transactionId,
    status: "SUCCESS",
    blockHash: `0x${Math.random().toString(16).slice(2, 66)}`,
    consensusTimestamp: new Date().toISOString(),
    isMock: true,
  };
}
