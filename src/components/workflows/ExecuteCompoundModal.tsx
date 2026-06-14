// ──────────────────────────────────────────────────────────────────────────────
// ExecuteCompoundModal
//
// Drives multi-step execution of an unlocked workflow. Walks the user through
// each step one at a time — one wallet popup per step — and records a
// step-level receipt on the server after each success or failure.
//
// Resumable: on open, the modal seeds step statuses from server-side
// receipts so a closed tab / refresh picks up where the user left off.
// ──────────────────────────────────────────────────────────────────────────────

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import WalletConnectButton from "@/components/wallet/WalletConnectButton";
import {
  getStepExecutor,
  supportedStepKinds,
  type StepProgress,
  type StepProgressItem,
} from "@/lib/workflow/execution";
import { describeCompoundStep } from "@/lib/workflow/clientHelpers";
import EditAmountsModal, {
  isStepEditable as isStepKindEditable,
} from "@/components/workflows/EditAmountsModal";
import {
  estimateStepCost,
  fetchWalletHbarBalance,
} from "@/lib/workflow/execution/preflight";

type StepUiStatus =
  | "pending"
  | "running"
  | "verified"
  | "failed"
  | "skipped";

interface StepState {
  status: StepUiStatus;
  transactionId?: string;
  error?: string;
  progress?: StepProgress;
}

export interface ExecuteCompoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflow: {
    id: string;
    title: string;
    summary?: string | null;
    /** Compiled steps[] from workflowJson. */
    steps: Array<Record<string, unknown>>;
    /** Total HBAR moved across all transfer-style steps. */
    totalHbar?: number | null;
  };
  /** Pre-existing step receipts (from the server) used to seed step status. */
  initialReceipts?: Array<{
    stepIndex: number | null;
    transactionId: string;
    status: "verified" | "failed";
  }>;
  /** Called after every receipt is written so the parent can refetch. */
  onStepRecorded?: () => void;
  /**
   * Called after the final step finishes (success or failure).
   *
   * IMPORTANT: this is fired when the user explicitly closes the modal, not
   * the instant the last step finishes. This matters for bulk_account_creation,
   * where the user needs time to copy/download private keys before any parent
   * re-render unmounts the modal (and discards those keys from React state).
   */
  onAllDone?: () => void;
}

export default function ExecuteCompoundModal({
  isOpen,
  onClose,
  workflow,
  initialReceipts,
  onStepRecorded,
  onAllDone,
}: ExecuteCompoundModalProps) {
  const {
    connected,
    accountId,
    network,
    requestHbarTransfer,
    signAndExecuteTransaction,
  } = useWallet();

  const steps = workflow.steps;
  const supportedKinds = useMemo(() => supportedStepKinds(), []);
  const allSupported = useMemo(
    () =>
      steps.every((s) =>
        supportedKinds.has(typeof s.kind === "string" ? s.kind : ""),
      ),
    [steps, supportedKinds],
  );

  const [stepStates, setStepStates] = useState<StepState[]>(() =>
    steps.map(() => ({ status: "pending" as StepUiStatus })),
  );
  const [running, setRunning] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [overallError, setOverallError] = useState<string | null>(null);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  /**
   * Preflight balance warning state. When set, the user has triggered a
   * step whose estimated cost exceeds their on-chain HBAR balance. We
   * surface a warning + an explicit "proceed anyway" button so they
   * can override (e.g. if their wallet has just received HBAR that the
   * mirror node hasn't indexed yet).
   */
  const [preflightWarning, setPreflightWarning] = useState<{
    stepIndex: number;
    requiredHbar: number;
    balanceHbar: number;
    detail: string;
  } | null>(null);

  // ── Seed from prior receipts whenever the modal opens ──────────────────
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStepStates((prev) => {
      const next = steps.map((_, i) => prev[i] ?? { status: "pending" as StepUiStatus });
      for (const r of initialReceipts ?? []) {
        if (r.stepIndex == null) continue;
        if (r.stepIndex < 0 || r.stepIndex >= next.length) continue;
        next[r.stepIndex] = {
          status: r.status,
          transactionId: r.transactionId || undefined,
        };
      }
      return next;
    });
    // Find the first non-verified step to point the user at next.
    const firstOpen = steps.findIndex((_, i) => {
      const seeded = (initialReceipts ?? []).find((r) => r.stepIndex === i);
      return !seeded || seeded.status !== "verified";
    });
    setActiveIndex(firstOpen === -1 ? steps.length : firstOpen);
    setOverallError(null);
    // Reset terminal-state tracking each time the modal is opened so
    // re-opening after a previous run doesn't immediately fire onAllDone.
    finishedRef.current = false;
    onAllDoneFiredRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Tracks whether the user has reached a terminal state (all verified or
  // failed). We use a ref so that onAllDone is fired exactly once, on the
  // explicit close — never automatically when the last step finishes — so
  // bulk_account_creation key bundles aren't wiped by a parent refetch.
  const finishedRef = useRef(false);
  const onAllDoneFiredRef = useRef(false);

  const handleClose = useCallback(() => {
    // We allow closing even while running so the user is never trapped if
    // the wallet bridge hangs. We just confirm so they don't lose an
    // in-flight signature by accident.
    if (running) {
      const ok = window.confirm(
        "A wallet signature is in progress. Closing now will abandon it — " +
          "any transactions you've already approved on-chain remain valid. Continue?",
      );
      if (!ok) return;
    }
    if (finishedRef.current && !onAllDoneFiredRef.current) {
      onAllDoneFiredRef.current = true;
      onAllDone?.();
    }
    onClose();
  }, [running, onAllDone, onClose]);

  const updateStep = useCallback(
    (index: number, patch: Partial<StepState>) => {
      setStepStates((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...patch };
        return next;
      });
    },
    [],
  );

  const recordReceipt = useCallback(
    async (
      stepIndex: number,
      body: Record<string, unknown>,
    ): Promise<boolean> => {
      try {
        const res = await fetch(
          `/api/workflows/${workflow.id}/steps/${stepIndex}/receipt`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.warn("Step receipt error:", data);
          return false;
        }
        return true;
      } catch (err) {
        console.warn("Step receipt fetch failed:", err);
        return false;
      } finally {
        onStepRecorded?.();
      }
    },
    [workflow.id, onStepRecorded],
  );

  const runStep = useCallback(
    async (index: number): Promise<"verified" | "failed"> => {
      const step = steps[index];
      const kind = typeof step.kind === "string" ? step.kind : "";
      const executor = getStepExecutor(kind);
      if (!executor) {
        updateStep(index, {
          status: "failed",
          error: `No executor registered for step kind "${kind}"`,
        });
        return "failed";
      }
      if (!accountId) {
        updateStep(index, {
          status: "failed",
          error: "Wallet is not connected",
        });
        return "failed";
      }

      updateStep(index, { status: "running", error: undefined, progress: undefined });
      setActiveIndex(index);

      const result = await executor.execute(step, {
        payerAccount: accountId,
        network,
        requestHbarTransfer,
        signAndExecuteTransaction,
        onProgress: (progress) => updateStep(index, { progress }),
      });

      if (result.status === "verified" && result.transactionId) {
        // IMPORTANT: do NOT clear `progress` here. For bulk_account_creation,
        // `progress.items` is the ONLY in-memory store of the freshly minted
        // public/private keys — clearing it would unmount BulkAccountResultsPanel
        // and the user would lose their one chance to copy/download keys. We
        // only drop the transient "Awaiting wallet for account N of M…" message.
        setStepStates((prev) => {
          const next = [...prev];
          const prior = next[index] ?? { status: "pending" as StepUiStatus };
          next[index] = {
            ...prior,
            status: "verified",
            transactionId: result.transactionId,
            error: undefined,
            progress: prior.progress
              ? { ...prior.progress, message: undefined }
              : undefined,
          };
          return next;
        });
        // Server-side mirror verification + Receipt write.
        const expectedRecipient =
          typeof step.recipient === "string" ? step.recipient : undefined;
        const expectedAmountHbar =
          typeof step.amountHbar === "number"
            ? (step.amountHbar as number)
            : typeof step.amount === "number"
            ? (step.amount as number)
            : undefined;
        const expectedMemo =
          typeof step.memo === "string" ? (step.memo as string) : undefined;
        await recordReceipt(index, {
          status: "verified",
          transactionId: result.transactionId,
          payerAccount: accountId,
          network,
          stepKind: kind,
          expectedRecipient: kind === "single_payment" ? expectedRecipient : undefined,
          expectedAmountHbar:
            kind === "single_payment" ? expectedAmountHbar : undefined,
          expectedMemo,
          payload: result.payload,
        });
        return "verified";
      }

      // Same reasoning as the verified branch: preserve `progress.items` so
      // partial-success bulk_account_creation keeps the keys for any sub-tx
      // that DID succeed visible to the user.
      setStepStates((prev) => {
        const next = [...prev];
        const prior = next[index] ?? { status: "pending" as StepUiStatus };
        next[index] = {
          ...prior,
          status: "failed",
          error: result.error || "Step failed",
          progress: prior.progress
            ? { ...prior.progress, message: undefined }
            : undefined,
        };
        return next;
      });
      await recordReceipt(index, {
        status: "failed",
        error: result.error || "Step failed",
        transactionId: result.transactionId,
        payerAccount: accountId,
        network,
        stepKind: kind,
        payload: result.payload,
      });
      return "failed";
    },
    [
      steps,
      accountId,
      network,
      requestHbarTransfer,
      signAndExecuteTransaction,
      updateStep,
      recordReceipt,
    ],
  );

  // ── Pre-flight balance check ──────────────────────────────────────────
  // For steps that the user pays HBAR for (network fees + initial balance
  // on bulk_account_creation, the transfer amount on transfer-style steps)
  // we estimate the cost and compare against the wallet's mirror-node
  // balance. Returns true if execution should proceed, false if we surfaced
  // a warning the user must explicitly bypass.
  const preflightOk = useCallback(
    async (stepIndex: number): Promise<boolean> => {
      if (!accountId) return true;
      const step = steps[stepIndex];
      const cost = estimateStepCost(step);
      if (cost.estimatedHbar <= 0) return true;
      const balance = await fetchWalletHbarBalance(network, accountId);
      // If we can't read the balance (mirror lag, fresh account, network
      // hiccup) we don't block — we'd rather let the chain reject the tx
      // than refuse to run on a transient mirror failure.
      if (balance == null) return true;
      if (balance >= cost.estimatedHbar) return true;
      setPreflightWarning({
        stepIndex,
        requiredHbar: cost.estimatedHbar,
        balanceHbar: balance,
        detail: cost.detail,
      });
      return false;
    },
    [accountId, network, steps],
  );

  // ── Run one step ───────────────────────────────────────────────────────
  const handleRunNext = useCallback(async (overridePreflight = false) => {
    if (running) return;
    if (!connected || !accountId) return;
    if (activeIndex >= steps.length) return;

    if (!overridePreflight) {
      const ok = await preflightOk(activeIndex);
      if (!ok) return;
    }
    setPreflightWarning(null);

    setRunning(true);
    setOverallError(null);
    try {
      const outcome = await runStep(activeIndex);
      if (outcome === "failed") {
        // stopOnError = true: mark remaining steps as skipped (UI only — no
        // server receipts are written so the user can resume after fixing
        // the underlying issue).
        setStepStates((prev) => {
          const next = [...prev];
          for (let i = activeIndex + 1; i < next.length; i++) {
            if (next[i].status === "pending") {
              next[i] = { status: "skipped" };
            }
          }
          return next;
        });
        setOverallError(
          "A step failed. Fix the issue and re-open this modal to retry from the failed step.",
        );
        setActiveIndex(steps.length);
        // Mark terminal — onAllDone fires when the user explicitly closes,
        // NOT here. This is essential for bulk_account_creation: a parent
        // refetch triggered by onAllDone re-renders the workflow list and
        // can unmount this modal, taking the in-memory private keys with it.
        finishedRef.current = true;
        return;
      }
      const nextIndex = activeIndex + 1;
      setActiveIndex(nextIndex);
      if (nextIndex >= steps.length) {
        finishedRef.current = true;
      }
    } finally {
      setRunning(false);
    }
  }, [running, connected, accountId, activeIndex, steps.length, runStep, preflightOk]);

  if (!isOpen) return null;

  const allVerified =
    stepStates.length > 0 && stepStates.every((s) => s.status === "verified");
  const hasFailure = stepStates.some((s) => s.status === "failed");

  // True if any step has surfaced key bundles that the user must save before
  // closing — used to make the close button more emphatic and to gate an
  // unsaved-keys confirmation prompt.
  const hasKeyBundles = stepStates.some((s) =>
    s.progress?.items?.some((it) => !!it.privateKey),
  );

  // Total wallet signatures the user will be asked for across all steps.
  // Each compiled step normally maps to one signature, but
  // `bulk_account_creation` produces `count` signatures.
  const totalSignatures = steps.reduce((sum, s) => {
    if (s.kind === "bulk_account_creation" && typeof s.count === "number") {
      return sum + (s.count as number);
    }
    return sum + 1;
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={hasKeyBundles ? undefined : handleClose}
      />
      <div className="relative z-10 w-full max-w-xl mx-4 rounded-xl bg-white shadow-2xl border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {allVerified
                ? "Workflow complete"
                : hasFailure
                ? "Workflow stopped"
                : "Execute workflow"}
            </h2>
            <p className="text-sm text-gray-500">
              {workflow.title}
              {totalSignatures > steps.length && (
                <>
                  {" · "}
                  <span className="font-medium text-gray-700">
                    {totalSignatures} wallet signatures
                  </span>
                </>
              )}
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
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {!allSupported && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 border border-amber-200">
              One or more steps in this workflow use a kind that isn&apos;t
              executable yet. Steps using a registered kind will still run; the
              others will be skipped.
            </div>
          )}

          <NetworkNotice network={network} />

          {running && (
            <div className="rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-900 border border-amber-200 flex items-start gap-2">
              <svg
                className="h-4 w-4 flex-shrink-0 mt-0.5 animate-pulse"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v3.5a.75.75 0 00.22.53l2.5 2.5a.75.75 0 101.06-1.06l-2.28-2.28V6.75z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <div className="font-medium">Waiting on your wallet</div>
                <div className="text-xs mt-0.5">
                  Click the <strong>HashPack</strong> extension icon in your
                  browser toolbar to review and approve the pending
                  transaction. Wallet popups don&apos;t always auto-open.
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {steps.map((step, i) => {
              const view = describeCompoundStep(step);
              const state = stepStates[i] ?? { status: "pending" };
              const kindSupported = supportedKinds.has(view.kind);
              const editable =
                isStepKindEditable(step) &&
                state.status === "pending" &&
                !running;
              return (
                <StepRow
                  key={i}
                  index={i}
                  title={view.title}
                  subtitle={view.subtitle}
                  kind={view.kind}
                  state={state}
                  kindSupported={kindSupported}
                  isActive={i === activeIndex && !running}
                  network={network}
                  onEdit={editable ? () => setEditingStepIndex(i) : undefined}
                />
              );
            })}
          </div>

          {typeof workflow.totalHbar === "number" && workflow.totalHbar > 0 && (
            <div className="pt-1 text-xs text-gray-500">
              <span className="font-medium">Total moved across all steps:</span>{" "}
              {workflow.totalHbar} HBAR
            </div>
          )}

          {preflightWarning && preflightWarning.stepIndex === activeIndex && (
            <div className="rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-900 border border-amber-300">
              <div className="font-medium">Balance may be too low for this step</div>
              <div className="text-xs mt-1">
                Your wallet has{" "}
                <strong>{preflightWarning.balanceHbar.toFixed(4)} HBAR</strong>,
                but this step is estimated to need ~
                <strong>{preflightWarning.requiredHbar.toFixed(4)} HBAR</strong>{" "}
                ({preflightWarning.detail}).
              </div>
              <div className="text-xs mt-1 text-amber-800">
                If you proceed and run out of HBAR mid-step, the workflow will
                stop and you&apos;ll lose the network fees on any partial
                progress. Fund the wallet first if you can.
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPreflightWarning(null)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleRunNext(true)}
                  className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-500"
                >
                  Proceed anyway
                </button>
              </div>
            </div>
          )}

          {overallError && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
              {overallError}
            </div>
          )}

          {!connected && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 border border-amber-200 flex items-center justify-between gap-3">
              <span>Connect your wallet to run this workflow.</span>
              <WalletConnectButton />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            onClick={handleClose}
            className={
              hasKeyBundles && (allVerified || hasFailure)
                ? "flex-1 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
                : "flex-1 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            }
          >
            {hasKeyBundles && (allVerified || hasFailure)
              ? "I've saved my keys — Close"
              : allVerified || hasFailure
              ? "Close"
              : running
              ? "Cancel & close"
              : "Cancel"}
          </button>
          {!allVerified && !hasFailure && (
            <button
              onClick={() => handleRunNext()}
              disabled={
                !connected ||
                running ||
                activeIndex >= steps.length ||
                !supportedKinds.has(
                  typeof steps[activeIndex]?.kind === "string"
                    ? (steps[activeIndex]?.kind as string)
                    : "",
                )
              }
              className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${
                running
                  ? "bg-blue-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
              }`}
            >
              {(() => {
                if (running) return "Awaiting wallet…";
                const active = steps[activeIndex];
                const activeIsBulk =
                  active?.kind === "bulk_account_creation" &&
                  typeof active?.count === "number";
                if (activeIsBulk) {
                  const n = active!.count as number;
                  return activeIndex === 0
                    ? `Start — sign ${n} transactions`
                    : `Approve step ${activeIndex + 1} (${n} signatures)`;
                }
                return activeIndex === 0
                  ? `Start (step 1 of ${steps.length})`
                  : `Approve step ${activeIndex + 1} of ${steps.length}`;
              })()}
            </button>
          )}
        </div>
      </div>

      {editingStepIndex !== null && steps[editingStepIndex] && (
        <EditAmountsModal
          isOpen
          onClose={() => setEditingStepIndex(null)}
          workflowId={workflow.id}
          stepIndex={editingStepIndex}
          step={steps[editingStepIndex]}
          onSaved={() => {
            // Trigger parent refetch — its updated workflowJson flows back
            // into this modal as new `steps` props.
            onStepRecorded?.();
          }}
        />
      )}
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function StepRow({
  index,
  title,
  subtitle,
  kind,
  state,
  kindSupported,
  isActive,
  network,
  onEdit,
}: {
  index: number;
  title: string;
  subtitle?: string;
  kind: string;
  state: StepState;
  kindSupported: boolean;
  isActive: boolean;
  network: "testnet" | "mainnet";
  onEdit?: () => void;
}) {
  const tone =
    state.status === "verified"
      ? "border-emerald-200 bg-emerald-50"
      : state.status === "failed"
      ? "border-red-200 bg-red-50"
      : state.status === "running"
      ? "border-blue-300 bg-blue-50"
      : state.status === "skipped"
      ? "border-gray-200 bg-gray-50 opacity-60"
      : isActive
      ? "border-blue-200 bg-white"
      : "border-gray-200 bg-white";

  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-start gap-3">
        <StatusBadge index={index} state={state} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900 truncate">{title}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
              {kind.replace(/_/g, " ")}
            </span>
            {!kindSupported && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                not executable
              </span>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="ml-auto rounded-md border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-50"
              >
                Edit amount
              </button>
            )}
          </div>
          {subtitle && (
            <div className="mt-0.5 text-xs text-gray-500">{subtitle}</div>
          )}
          {state.progress?.message && (
            <div className="mt-1 text-xs text-blue-700">
              {state.progress.message}
            </div>
          )}
          {state.error && (
            <div className="mt-1 text-xs text-red-700">{state.error}</div>
          )}
          {state.transactionId && (
            <div className="mt-1">
              <a
                href={`https://hashscan.io/${network}/transaction/${encodeURIComponent(state.transactionId)}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-medium text-blue-600 hover:text-blue-500"
              >
                View on HashScan ↗
              </a>
            </div>
          )}

          {kind === "bulk_account_creation" && (
            <BulkAccountResultsPanel
              items={state.progress?.items}
              network={network}
              stepStatus={state.status}
              isActive={isActive}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Bulk account creation: live results + key delivery ──────────────────────
//
// Renders the running list of accounts being created, with a per-row
// "Reveal" toggle for the private key, plus end-of-step actions to copy
// the full bundle as JSON or download a CSV.
//
// SECURITY: private keys are kept ONLY in this component's state (via the
// `items` array that flowed in from the executor's `onProgress` callbacks).
// They are never POSTed anywhere; they disappear when the modal closes.
function BulkAccountResultsPanel({
  items,
  network,
  stepStatus,
  isActive,
}: {
  items: StepProgressItem[] | undefined;
  network: "testnet" | "mainnet";
  stepStatus: StepUiStatus;
  isActive: boolean;
}) {
  const [revealAll, setRevealAll] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState(false);

  // No items yet — show an upfront warning so the user knows what's coming.
  if (!items || items.length === 0) {
    if (stepStatus === "pending" && isActive) {
      return (
        <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <strong>Heads up:</strong> this step will request one wallet
          signature per account. Each new account gets a freshly generated
          keypair — public/private keys will appear here as accounts are
          created, and you&apos;ll be able to download them at the end.
        </div>
      );
    }
    return null;
  }

  // "done" = the wallet sign succeeded AND we have a keypair to surface.
  // The accountId may still be enriching from mirror — don't require it.
  const doneItems = items.filter((it) => it.status === "done");
  const failedItems = items.filter((it) => it.status === "failed");
  const allDone = stepStatus === "verified";
  const hasFailures = failedItems.length > 0;

  const toggleRow = (idx: number) =>
    setRevealed((prev) => ({ ...prev, [idx]: !prev[idx] }));

  const bundle = doneItems.map((it) => ({
    accountId: it.accountId,
    publicKey: it.publicKey,
    privateKey: it.privateKey,
    transactionId: it.transactionId,
  }));

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleDownloadCsv = () => {
    const header = "accountId,publicKey,privateKey,transactionId";
    const rows = bundle.map(
      (b) =>
        `${b.accountId ?? ""},${b.publicKey ?? ""},${b.privateKey ?? ""},${b.transactionId ?? ""}`,
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hedera-accounts-${network}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-2 space-y-2">
      <div
        className={`rounded-md border bg-white ${
          hasFailures ? "border-red-200" : "border-gray-200"
        }`}
      >
        <div
          className={`px-2 py-1.5 border-b text-[11px] font-medium flex items-center justify-between ${
            hasFailures
              ? "border-red-100 bg-red-50 text-red-800"
              : "border-gray-100 text-gray-600"
          }`}
        >
          <span>
            {hasFailures
              ? `${doneItems.length} of ${items.length} succeeded · ${failedItems.length} failed`
              : `Accounts (${doneItems.length} of ${items.length})`}
          </span>
          {doneItems.length > 0 && (
            <button
              type="button"
              onClick={() => setRevealAll((v) => !v)}
              className="text-blue-600 hover:text-blue-500 font-medium"
            >
              {revealAll ? "Hide all keys" : "Reveal all keys"}
            </button>
          )}
        </div>
        <ul className="divide-y divide-gray-100">
          {items.map((it) => {
            const isRevealed = revealAll || !!revealed[it.index];
            return (
              <li key={it.index} className="px-2 py-1.5 text-[11px] text-gray-700">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-gray-500">
                      #{it.index + 1}
                    </span>{" "}
                    {it.status === "done" && it.accountId ? (
                      <a
                        href={`https://hashscan.io/${network}/account/${it.accountId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-blue-600 hover:text-blue-500"
                      >
                        {it.accountId}
                      </a>
                    ) : it.status === "done" && it.transactionId ? (
                      <>
                        <a
                          href={`https://hashscan.io/${network}/transaction/${encodeURIComponent(it.transactionId)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-blue-600 hover:text-blue-500"
                        >
                          tx ↗
                        </a>{" "}
                        <span className="text-gray-500">
                          · resolving account id…
                        </span>
                      </>
                    ) : it.status === "failed" ? (
                      <span className="text-red-600">
                        failed{it.error ? `: ${it.error}` : ""}
                      </span>
                    ) : it.status === "awaiting_wallet" ? (
                      <span className="text-blue-700">awaiting wallet…</span>
                    ) : (
                      <span className="text-gray-400">pending</span>
                    )}
                  </div>
                  {it.privateKey && (
                    <button
                      type="button"
                      onClick={() => toggleRow(it.index)}
                      className="text-[10px] text-blue-600 hover:text-blue-500 font-medium flex-shrink-0"
                    >
                      {isRevealed ? "Hide key" : "Reveal key"}
                    </button>
                  )}
                </div>
                {isRevealed && it.publicKey && (
                  <div className="mt-1 space-y-0.5 font-mono break-all text-[10px]">
                    <div>
                      <span className="text-gray-400">pub: </span>
                      <span className="text-gray-700">{it.publicKey}</span>
                    </div>
                    {it.privateKey && (
                      <div>
                        <span className="text-gray-400">priv: </span>
                        <span className="text-red-700">{it.privateKey}</span>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {allDone && doneItems.length > 0 && (
        <>
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
            <strong>Save these keys now.</strong> They are shown only once and
            are not stored on our server. If you lose them, you will
            permanently lose access to these accounts.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopyJson}
              className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
            >
              {copied ? "Copied ✓" : "Copy JSON"}
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
            >
              Download CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({
  index,
  state,
}: {
  index: number;
  state: StepState;
}) {
  if (state.status === "verified") {
    return (
      <span className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  if (state.status === "failed") {
    return (
      <span className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white text-xs font-semibold">
        !
      </span>
    );
  }
  if (state.status === "running") {
    return (
      <span className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </span>
    );
  }
  if (state.status === "skipped") {
    return (
      <span className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-500 text-xs font-semibold">
        –
      </span>
    );
  }
  return (
    <span className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
      {index + 1}
    </span>
  );
}

function NetworkNotice({ network }: { network: "testnet" | "mainnet" }) {
  if (network === "mainnet") {
    return (
      <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 border border-red-200">
        Hedera Mainnet — real HBAR will be transferred.
      </div>
    );
  }
  return (
    <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700 border border-emerald-200">
      Hedera Testnet — no real HBAR is transferred.
    </div>
  );
}
