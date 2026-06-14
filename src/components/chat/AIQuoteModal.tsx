"use client";

// ──────────────────────────────────────────────────────────────────────────────
// AIQuoteModal
//
// Shows the user a price quote for an AI planning call and walks them through
// paying it with their connected wallet. Mirrors the structure of
// UnlockWorkflowModal but talks to /api/chat/quote → /api/orders/:id/verify
// → caller's `onPaid(orderId)` instead of unlocking a specific workflow.
//
// The actual LLM call happens AFTER this modal closes — the parent (ChatPage)
// calls /api/chat/agent with the paid orderId. Splitting it this way keeps
// the modal's job small and lets the chat page own the "generating…" UI.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import WalletConnectButton from "@/components/wallet/WalletConnectButton";

export interface AIQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The user's chat message we're going to ask the LLM to plan. */
  message: string;
  /** Recent conversation lines, for context-aware quoting. */
  history?: string[];
  /** Called after the order is paid and verified. */
  onPaid: (orderId: string) => void;
}

interface QuoteResponse {
  order: {
    id: string;
    kind: string;
    amountHbar: number;
    recipientAccount: string;
    memo: string;
    network: "testnet" | "mainnet";
    expiresAt: string;
  };
  workflowId: string;
  quote: {
    inputTokens: number;
    maxOutputTokens: number;
    inferenceUsd: number;
    serviceFeeUsd: number;
    totalUsd: number;
    hbarUsdRate: number;
    hbarPriceSource: "coingecko" | "fallback";
    slippageBuffer: number;
    quoteHbar: number;
  };
}

export default function AIQuoteModal({
  isOpen,
  onClose,
  message,
  history,
  onPaid,
}: AIQuoteModalProps) {
  const {
    connected,
    accountId,
    network,
    transferring,
    transferError,
    requestHbarTransfer,
    clearTransferError,
    disconnectWallet,
  } = useWallet();

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch a quote when the modal opens ──────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    if (quote) return;

    let cancelled = false;
    (async () => {
      setLoadingQuote(true);
      setError(null);
      try {
        const res = await fetch("/api/chat/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            history,
            network,
            payerAccount: accountId,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || "Failed to get a quote.");
          return;
        }
        setQuote(data as QuoteResponse);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to get a quote."
          );
        }
      } finally {
        if (!cancelled) setLoadingQuote(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, quote, message, history, network, accountId]);

  const handleClose = () => {
    setQuote(null);
    setError(null);
    clearTransferError();
    onClose();
  };

  const handlePay = async () => {
    if (!quote || !connected || !accountId) return;
    setError(null);

    const result = await requestHbarTransfer({
      recipient: quote.order.recipientAccount,
      amount: quote.order.amountHbar,
      memo: quote.order.memo,
    });

    if (!result.success || !result.transactionId) {
      setError(result.error || "Payment failed.");
      return;
    }

    setVerifying(true);
    try {
      const verifyRes = await fetch(`/api/orders/${quote.order.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: result.transactionId,
          payerAccount: accountId,
          network,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        setError(verifyData?.error || "Payment verification failed.");
        return;
      }
      // Hand the paid order to the parent so it can run the LLM.
      onPaid(quote.order.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Payment verification failed."
      );
    } finally {
      setVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative z-10 w-full max-w-lg mx-4 rounded-xl bg-white shadow-2xl border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              AI Planning Fee
            </h2>
            <p className="text-sm text-gray-500">
              Pay once per chat message to run the AI planner.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {loadingQuote && (
            <p className="text-sm text-gray-500 text-center">Building quote…</p>
          )}

          {quote && (
            <>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
                <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">
                  Quote
                </p>
                <p className="mt-1 text-3xl font-bold text-blue-700">
                  {quote.order.amountHbar} HBAR
                </p>
                <p className="mt-1 text-xs text-blue-700">
                  ≈ ${quote.quote.totalUsd.toFixed(4)} USD
                  {" · "}
                  HBAR rate ${quote.quote.hbarUsdRate.toFixed(4)}
                  {quote.quote.hbarPriceSource === "fallback" ? " (fallback)" : ""}
                </p>
              </div>

              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Inference (≤ {quote.quote.maxOutputTokens} output tokens)</span>
                  <span className="font-mono">${quote.quote.inferenceUsd.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Service fee</span>
                  <span className="font-mono">${quote.quote.serviceFeeUsd.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Slippage buffer</span>
                  <span className="font-mono">
                    ×{quote.quote.slippageBuffer.toFixed(2)}
                  </span>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                Your AI provider key never touches your browser. You pay a
                small HBAR fee per planning call and we run the model on the
                server. If the AI fails to produce a valid workflow you can
                retry without paying again.
              </p>

              {!connected && (
                <div className="text-center space-y-3 py-2">
                  <p className="text-sm text-gray-600">
                    Connect your wallet to pay this fee.
                  </p>
                  <div className="flex justify-center">
                    <WalletConnectButton />
                  </div>
                </div>
              )}

              {connected && accountId && (
                <>
                  <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-gray-500">Paying from</p>
                      <p className="font-mono text-gray-900 truncate">
                        {accountId}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        disconnectWallet();
                      }}
                      className="shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-800 underline"
                    >
                      Switch wallet
                    </button>
                  </div>

                  <div
                    className={`rounded-md px-3 py-2 text-xs border ${
                      network === "mainnet"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}
                  >
                    {network === "mainnet"
                      ? "Hedera Mainnet — real HBAR will be transferred."
                      : "Hedera Testnet — no real HBAR is transferred."}
                  </div>
                </>
              )}
            </>
          )}

          {(error || transferError) && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
              {error || transferError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            onClick={handleClose}
            className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handlePay}
            disabled={
              !connected ||
              !quote ||
              loadingQuote ||
              transferring ||
              verifying
            }
            className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${
              !connected || !quote || loadingQuote || transferring || verifying
                ? "bg-blue-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-500"
            }`}
          >
            {transferring
              ? "Sending…"
              : verifying
              ? "Verifying…"
              : quote
              ? `Pay ${quote.order.amountHbar} HBAR`
              : "Loading…"}
          </button>
        </div>
      </div>
    </div>
  );
}
