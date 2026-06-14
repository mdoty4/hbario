"use client";

// ──────────────────────────────────────────────────────────────────────────────
// Chat Page — Pay-to-Generate UX
//
// User types a message → we open AIQuoteModal which quotes a price and walks
// them through paying the AI planning fee in HBAR. After the order is paid
// and verified, we call /api/chat/agent with the orderId. The server then
// atomically consumes the order and runs the LLM with its own API key — the
// user never has to bring their own AI provider key.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";

import ProtectedRoute from "@/components/ProtectedRoute";
import ChatInput from "@/components/chat/ChatInput";
import ChatMessage from "@/components/chat/ChatMessage";
import TypingIndicator from "@/components/chat/TypingIndicator";
import AIQuoteModal from "@/components/chat/AIQuoteModal";
import { useWallet } from "@/context/WalletContext";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The message the user is asking the agent to plan. Held outside of
  // `messages` until payment so we can show the modal first.
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);

  // Once an order is paid, we cache it so a failed LLM call can be retried
  // without paying again (the server preserves the order in `paid` state
  // when it returns `retryable: true`).
  const [retryableOrderId, setRetryableOrderId] = useState<string | null>(null);

  const { network, accountId } = useWallet();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [messages, generating]);

  // ── Submit a new chat message ─────────────────────────────────────────
  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || generating || quoteModalOpen) return;
    setError(null);

    // Optimistically render the user's message so the chat feels live while
    // they walk through the payment modal.
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setPendingMessage(trimmed);
    setQuoteModalOpen(true);
  };

  // ── Modal closed without paying ───────────────────────────────────────
  const handleQuoteClose = () => {
    setQuoteModalOpen(false);
    setPendingMessage(null);
    // Drop the optimistic user bubble — the user canceled.
    setMessages((prev) => {
      if (prev.length === 0 || prev[prev.length - 1].role !== "user") return prev;
      return prev.slice(0, -1);
    });
  };

  // ── Order paid → run the agent ────────────────────────────────────────
  const handleOrderPaid = (orderId: string) => {
    setQuoteModalOpen(false);
    runAgent(orderId, pendingMessage ?? "");
  };

  // ── Retry on a still-paid order (no new payment) ──────────────────────
  const handleRetry = () => {
    if (!retryableOrderId || !pendingMessage) return;
    setError(null);
    runAgent(retryableOrderId, pendingMessage);
  };

  const runAgent = async (orderId: string, message: string) => {
    setGenerating(true);
    setError(null);
    setRetryableOrderId(null);

    try {
      const userHistory = messages
        .filter((m) => m.role === "user")
        .map((m) => m.content);

      const res = await fetch("/api/chat/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          message,
          accountId: accountId ?? undefined,
          network,
          history: userHistory,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data?.retryable) {
          setRetryableOrderId(orderId);
        }
        throw new Error(data?.error || `Agent error (${res.status})`);
      }

      const replyText =
        typeof data.assistantMessage === "string" &&
        data.assistantMessage.trim().length > 0
          ? data.assistantMessage
          : "I didn't get a response. Please try again.";

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: replyText },
      ]);

      if (data?.retryable) {
        // Soft failure from the agent — e.g. compiler rejected the LLM's
        // plan. Keep the order alive so the user can press Retry.
        setRetryableOrderId(orderId);
      } else {
        setRetryableOrderId(null);
        setPendingMessage(null);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setError(message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex h-[calc(100vh-4rem)] flex-col bg-white">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.length === 0 && (
              <div className="flex h-[60vh] items-center justify-center">
                <div className="text-center max-w-md">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-6 w-6 text-emerald-700"
                    >
                      <path
                        fillRule="evenodd"
                        d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.455 7.89l.813-2.846A.75.75 0 0 1 9 4.5Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <p className="text-xl font-medium text-gray-800">
                    How can I help you today?
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    Each message uses our AI to plan a Hedera workflow.
                    You&apos;ll pay a small HBAR fee per request — no AI
                    provider key required.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-6">
              {messages.map((m, i) => (
                <ChatMessage key={i} role={m.role} content={m.content} />
              ))}
              {error && (
                <div className="flex justify-start">
                  <div className="max-w-[70%] rounded-lg px-4 py-2 bg-red-50 text-red-600 border border-red-200">
                    <p className="text-sm">{error}</p>
                    {retryableOrderId && (
                      <button
                        onClick={handleRetry}
                        disabled={generating}
                        className="mt-2 text-xs font-semibold text-red-700 underline hover:text-red-900 disabled:opacity-50"
                      >
                        Retry (no extra charge)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {generating && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t border-gray-100 bg-gradient-to-b from-white via-white to-gray-50 px-4 py-4">
          <ChatInput
            onSend={sendMessage}
            disabled={generating || quoteModalOpen}
          />
        </div>
      </div>

      <AIQuoteModal
        isOpen={quoteModalOpen}
        onClose={handleQuoteClose}
        message={pendingMessage ?? ""}
        history={messages.filter((m) => m.role === "user").map((m) => m.content)}
        onPaid={handleOrderPaid}
      />
    </ProtectedRoute>
  );
}
