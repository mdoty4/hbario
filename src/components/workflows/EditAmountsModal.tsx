// ──────────────────────────────────────────────────────────────────────────────
// EditAmountsModal
//
// Lets the user edit the HBAR amounts (and memo) of a single compound-workflow
// step before it executes. Supports:
//   - single_payment        → one amount, one memo
//   - bulk_payout           → editable per-recipient amounts, running total
//   - bulk_account_creation → initialBalanceHbar (per account)
//
// On Save it PATCHes /api/workflows/:id with the changed step and fires
// `onSaved()` so the parent can refetch.
// ──────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";

interface BulkRecipient {
  account: string;
  amountHbar: number;
  memo?: string;
}

export interface EditAmountsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string;
  stepIndex: number;
  step: Record<string, unknown>;
  /** Fired after the PATCH succeeds. */
  onSaved: () => void;
}

export default function EditAmountsModal({
  isOpen,
  onClose,
  workflowId,
  stepIndex,
  step,
  onSaved,
}: EditAmountsModalProps) {
  const kind = typeof step.kind === "string" ? step.kind : "";

  // ── single_payment local state ────────────────────────────────────────
  const initialAmount =
    typeof step.amountHbar === "number"
      ? (step.amountHbar as number)
      : typeof step.amount === "number"
      ? (step.amount as number)
      : 0;
  const initialMemo = typeof step.memo === "string" ? (step.memo as string) : "";
  const [amount, setAmount] = useState<string>(String(initialAmount));
  const [memo, setMemo] = useState<string>(initialMemo);

  // ── bulk_payout local state ───────────────────────────────────────────
  const initialRecipients = useMemo<BulkRecipient[]>(() => {
    const raw = Array.isArray(step.recipients)
      ? (step.recipients as Array<Record<string, unknown>>)
      : [];
    return raw.map((r) => ({
      account: typeof r.account === "string" ? r.account : "",
      amountHbar:
        typeof r.amountHbar === "number"
          ? (r.amountHbar as number)
          : typeof r.amount === "number"
          ? (r.amount as number)
          : 0,
      memo: typeof r.memo === "string" ? (r.memo as string) : undefined,
    }));
  }, [step]);
  const [recipients, setRecipients] = useState<
    Array<{ account: string; amountStr: string }>
  >(
    initialRecipients.map((r) => ({
      account: r.account,
      amountStr: String(r.amountHbar),
    })),
  );

  // ── bulk_account_creation local state ─────────────────────────────────
  const initialInitialBal =
    typeof step.initialBalanceHbar === "number"
      ? (step.initialBalanceHbar as number)
      : 0;
  const [initialBalance, setInitialBalance] = useState<string>(
    String(initialInitialBal),
  );
  const count = typeof step.count === "number" ? (step.count as number) : 0;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed each time the modal is opened on a different step.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!isOpen) return;
    setAmount(String(initialAmount));
    setMemo(initialMemo);
    setRecipients(
      initialRecipients.map((r) => ({
        account: r.account,
        amountStr: String(r.amountHbar),
      })),
    );
    setInitialBalance(String(initialInitialBal));
    setError(null);
  }, [isOpen, stepIndex]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  if (!isOpen) return null;

  const parseAmount = (s: string): number | null => {
    const cleaned = s.trim();
    if (cleaned === "") return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return n;
  };

  const total =
    kind === "bulk_payout"
      ? recipients.reduce((sum, r) => {
          const n = parseAmount(r.amountStr);
          return sum + (n && n > 0 ? n : 0);
        }, 0)
      : kind === "bulk_account_creation"
      ? (parseAmount(initialBalance) ?? 0) * count
      : parseAmount(amount) ?? 0;

  const handleSave = async () => {
    setError(null);
    const body: Record<string, unknown> = { stepIndex };

    if (kind === "single_payment") {
      const n = parseAmount(amount);
      if (n === null || n <= 0) {
        setError("Amount must be a positive number");
        return;
      }
      body.amountHbar = n;
      if (memo !== initialMemo) body.memo = memo;
    } else if (kind === "bulk_payout") {
      const out: BulkRecipient[] = [];
      for (let i = 0; i < recipients.length; i++) {
        const n = parseAmount(recipients[i].amountStr);
        if (n === null || n <= 0) {
          setError(`Row ${i + 1}: amount must be a positive number`);
          return;
        }
        out.push({ account: recipients[i].account, amountHbar: n });
      }
      body.recipients = out;
      if (memo !== initialMemo) body.memo = memo;
    } else if (kind === "bulk_account_creation") {
      const n = parseAmount(initialBalance);
      if (n === null || n < 0) {
        setError("Initial balance must be a non-negative number");
        return;
      }
      body.initialBalanceHbar = n;
      if (memo !== initialMemo) body.memo = memo;
    } else {
      setError(`Step kind "${kind}" is not editable`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to save changes");
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={saving ? undefined : onClose}
      />
      <div className="relative z-10 w-full max-w-lg mx-4 rounded-xl bg-white shadow-2xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Edit step {stepIndex + 1}
            </h2>
            <p className="text-sm text-gray-500">
              {kind.replace(/_/g, " ")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {kind === "single_payment" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Recipient
                </label>
                <p className="font-mono text-sm text-gray-900">
                  {typeof step.recipient === "string"
                    ? (step.recipient as string)
                    : "—"}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Amount (HBAR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Memo (optional)
                </label>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {kind === "bulk_payout" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Recipients ({recipients.length})
                </label>
                <div className="rounded-md border border-gray-200 divide-y divide-gray-200 max-h-64 overflow-y-auto">
                  {recipients.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-2 py-1.5 text-sm"
                    >
                      <span className="text-xs text-gray-400 w-6 flex-shrink-0">
                        #{i + 1}
                      </span>
                      <code className="font-mono text-xs text-gray-700 flex-1 truncate">
                        {r.account}
                      </code>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={r.amountStr}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRecipients((prev) => {
                            const next = [...prev];
                            next[i] = { ...next[i], amountStr: v };
                            return next;
                          });
                        }}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-500">HBAR</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-600">
                  <span className="font-medium">New total:</span>{" "}
                  {total.toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
                  HBAR
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Memo (optional)
                </label>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {kind === "bulk_account_creation" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Number of accounts
                </label>
                <p className="text-sm text-gray-900">{count}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Initial balance per account (HBAR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Total funding: {total.toLocaleString(undefined, {
                    maximumFractionDigits: 6,
                  })}{" "}
                  HBAR ({count} × {parseAmount(initialBalance) ?? 0})
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Memo (optional)
                </label>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:bg-blue-300"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function isStepEditable(step: Record<string, unknown>): boolean {
  const kind = typeof step.kind === "string" ? step.kind : "";
  return (
    kind === "single_payment" ||
    kind === "bulk_payout" ||
    kind === "bulk_account_creation"
  );
}
