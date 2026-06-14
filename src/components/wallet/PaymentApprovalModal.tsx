"use client";

import { useWallet } from "@/context/WalletContext";
import { useEffect, useRef, useState } from "react";
import type { WalletMode } from "@/lib/wallet/types";

interface PaymentApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: (transactionId: string) => void;
  workflowId: string;
  recipientAccount: string;
  amountHbar: number;
  memo: string;
}

export default function PaymentApprovalModal({
  isOpen,
  onClose,
  onVerified,
  workflowId,
  recipientAccount,
  amountHbar,
  memo,
}: PaymentApprovalModalProps) {
  const {
    connected,
    accountId,
    network,
    transferring,
    transferError,
    requestHbarTransfer,
    clearTransferError,
    setPaymentPayload,
  } = useWallet();

  const [paymentComplete, setPaymentComplete] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);

  // Sync the global payment payload whenever this modal opens.
  useEffect(() => {
    if (isOpen && accountId) {
      setPaymentPayload({
        workflowId,
        sender: accountId,
        recipient: recipientAccount,
        amount: amountHbar,
        memo,
        network,
      });
    }
  }, [
    isOpen,
    accountId,
    workflowId,
    recipientAccount,
    amountHbar,
    memo,
    network,
    setPaymentPayload,
  ]);

  // Reset transient local state when the modal closes. Done as a derived
  // effect with a ref-guard pattern so we never call setState in the body of
  // an effect when nothing actually changed (avoids React 19 lint warning).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      setPaymentComplete(false);
      setTxId(null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApprove = async () => {
    if (!connected || !accountId) return;
    const result = await requestHbarTransfer({
      recipient: recipientAccount,
      amount: amountHbar,
      memo,
    });
    if (result.success && result.transactionId) {
      setPaymentComplete(true);
      setTxId(result.transactionId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg mx-4 rounded-xl bg-white shadow-2xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Approve Payment</h2>
            <p className="text-sm text-gray-500">Workflow #{workflowId}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <CloseIcon />
          </button>
        </div>
        <div className="px-6 py-5">
          {!connected && <NotConnectedView />}
          {connected && paymentComplete && (
            <PaymentCompleteView
              txId={txId}
              network={network}
              onVerify={() => txId && onVerified(txId)}
            />
          )}
          {connected && !paymentComplete && (
            <PaymentDetailsView
              accountId={accountId!}
              recipient={recipientAccount}
              amount={amountHbar}
              memo={memo}
              network={network}
              error={transferError}
              onClearError={clearTransferError}
            />
          )}
        </div>
        {connected && !paymentComplete && (
          <div className="flex gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <button
              onClick={onClose}
              className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={transferring}
              className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${
                transferring
                  ? "bg-blue-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500"
              }`}
            >
              {transferring ? (
                <>
                  <SpinnerIcon /> Sending...
                </>
              ) : (
                "Approve Payment"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function NotConnectedView() {
  return (
    <div className="text-center py-6">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
        <LockIcon className="h-6 w-6 text-amber-600" />
      </div>
      <p className="text-gray-600">Please connect your wallet to approve this payment.</p>
    </div>
  );
}

function PaymentCompleteView({
  txId,
  network,
  onVerify,
}: {
  txId: string | null;
  network: WalletMode;
  onVerify: () => void;
}) {
  return (
    <div className="text-center py-4">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
        <CheckIcon className="h-6 w-6 text-green-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Payment Sent</h3>
      <p className="text-sm text-gray-500 mb-4">Transaction ID:</p>
      <div className="bg-gray-50 rounded-lg px-3 py-2 mb-4">
        <code className="text-sm font-mono text-gray-700 break-all">{txId}</code>
      </div>
      {txId && (
        <a
          href={`https://hashscan.io/${network}/transaction/${encodeURIComponent(txId)}`}
          target="_blank"
          rel="noreferrer"
          className="mb-3 inline-block text-xs font-medium text-blue-600 hover:text-blue-500"
        >
          View on HashScan ↗
        </a>
      )}
      <button
        onClick={onVerify}
        className="w-full rounded-md bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-500"
      >
        Verify &amp; Unlock Workflow
      </button>
    </div>
  );
}

function PaymentDetailsView({
  accountId,
  recipient,
  amount,
  memo,
  network,
  error,
  onClearError,
}: {
  accountId: string;
  recipient: string;
  amount: number;
  memo: string;
  network: WalletMode;
  error: string | null;
  onClearError: () => void;
}) {
  return (
    <div className="space-y-4">
      <div
        className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs border ${
          network === "mainnet"
            ? "bg-red-50 text-red-700 border-red-200"
            : "bg-emerald-50 text-emerald-700 border-emerald-200"
        }`}
      >
        <InfoIcon className="h-4 w-4 flex-shrink-0" />
        {network === "mainnet"
          ? "Hedera Mainnet — real HBAR will be transferred."
          : "Hedera Testnet — no real HBAR is transferred."}
      </div>
      <FieldView label="From (Your Wallet)" value={accountId} mono />
      <FieldView label="To (Recipient)" value={recipient} mono />
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <label className="text-xs font-medium text-blue-500 uppercase tracking-wide">
          Amount
        </label>
        <p className="mt-1 text-2xl font-bold text-blue-700">{amount} HBAR</p>
      </div>
      <FieldView label="Memo" value={memo} />
      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
          <AlertIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p>{error}</p>
            <button
              onClick={onClearError}
              className="mt-1 text-xs text-red-500 underline hover:text-red-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldView({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </label>
      <p className={`mt-1 text-sm text-gray-900 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
function LockIcon(props: { className?: string }) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}
function CheckIcon(props: { className?: string }) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
function InfoIcon(props: { className?: string }) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function AlertIcon(props: { className?: string }) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function SpinnerIcon() {
  return (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
