"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import ProtectedRoute from "@/components/ProtectedRoute";
import ExecuteCompoundModal from "@/components/workflows/ExecuteCompoundModal";
import CompoundStepsList from "@/components/workflows/CompoundStepsList";
import { parseWorkflowView } from "@/lib/workflow/clientHelpers";

interface WorkflowListItem {
  id: string;
  title: string;
  type: string;
  summary: string | null;
  prompt: string | null;
  status: string;
  paymentStatus: string;
  createdAt: string;
  workflowJson: string | null;
}

interface StepReceipt {
  id: string;
  stepIndex: number | null;
  stepKind: string | null;
  transactionId: string;
  status: "verified" | "failed";
  createdAt: string;
}

interface FetchedWorkflow {
  workflowJson: string | null;
  type: string;
  stepReceipts?: StepReceipt[];
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state — only one is ever open at a time.
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [executingSteps, setExecutingSteps] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [executingTotalHbar, setExecutingTotalHbar] = useState<number | null>(
    null,
  );
  const [executingReceipts, setExecutingReceipts] = useState<StepReceipt[]>([]);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Fetch workflows ───────────────────────────────────────────────────────
  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workflows");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load workflows");
      }
      const data = await res.json();
      setWorkflows(Array.isArray(data.workflows) ? data.workflows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workflows");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchWorkflows();
  }, [fetchWorkflows]);

  // Re-fetch the workflow JSON in case the list payload was trimmed, and pull
  // the step receipts in the same request.
  const fetchExecutableFor = useCallback(
    async (workflowId: string): Promise<FetchedWorkflow | null> => {
      try {
        const res = await fetch(`/api/workflows/${workflowId}`);
        if (!res.ok) return null;
        const data = await res.json();
        const wf = data.workflow;
        if (!wf) return null;
        return {
          workflowJson: wf.workflowJson ?? null,
          type: wf.type,
          stepReceipts: Array.isArray(wf.stepReceipts) ? wf.stepReceipts : [],
        };
      } catch {
        return null;
      }
    },
    [],
  );

  /** Coerce a workflow + (optional) re-fetched JSON into the steps[] array
   *  the executor needs. Single-payment workflows are wrapped as a 1-step
   *  compound so the modal handles them uniformly. */
  const buildSteps = (
    workflowJson: string | null,
    type: string,
  ): { steps: Array<Record<string, unknown>>; totalHbar: number | null } => {
    const view = parseWorkflowView(workflowJson, type);
    if (view.workflowType === "compound") {
      return { steps: view.steps, totalHbar: view.totalHbar };
    }
    if (view.singlePaymentExecution) {
      return {
        steps: [
          {
            kind: "single_payment",
            recipient: view.singlePaymentExecution.recipient,
            amountHbar: view.singlePaymentExecution.amountHbar,
            memo: view.singlePaymentExecution.memo,
          },
        ],
        totalHbar: view.totalHbar,
      };
    }
    return { steps: [], totalHbar: view.totalHbar };
  };

  // ── Play button handler ───────────────────────────────────────────────────
  const handlePlay = async (workflow: WorkflowListItem) => {
    // Try the JSON we already have first, fall back to re-fetch so we also
    // grab step receipts for resume.
    let built = buildSteps(workflow.workflowJson, workflow.type);
    let receipts: StepReceipt[] = [];
    const fetched = await fetchExecutableFor(workflow.id);
    if (fetched) {
      built = buildSteps(fetched.workflowJson, fetched.type);
      receipts = fetched.stepReceipts ?? [];
    }

    setExecutingSteps(built.steps);
    setExecutingTotalHbar(built.totalHbar);
    setExecutingReceipts(receipts);
    setExecutingId(workflow.id);
  };

  // ── After step recorded / all done → refresh list and step receipts ───────
  const handleStepRecorded = useCallback(async () => {
    if (!executingId) return;
    const fetched = await fetchExecutableFor(executingId);
    if (fetched) {
      setExecutingReceipts(fetched.stepReceipts ?? []);
    }
    fetchWorkflows();
  }, [executingId, fetchExecutableFor, fetchWorkflows]);

  // ── Delete workflow ───────────────────────────────────────────────────────
  const handleDelete = async (workflow: WorkflowListItem) => {
    const confirmed = window.confirm(
      `Delete "${workflow.title}"? This cannot be undone.`,
    );
    if (!confirmed) return;
    setDeletingId(workflow.id);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete workflow");
      }
      setWorkflows((prev) => prev.filter((w) => w.id !== workflow.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete workflow");
    } finally {
      setDeletingId(null);
    }
  };

  const executingWorkflow = useMemo(
    () => workflows.find((w) => w.id === executingId) || null,
    [workflows, executingId],
  );

  return (
    <ProtectedRoute>
      <div className="min-h-[calc(100vh-4rem)] bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                Workflows
              </h1>
              <p className="mt-2 text-gray-600">
                Workflows the agent has prepared for you. Click ▶ Play to
                execute one.
              </p>
            </div>
            <Link
              href="/chat"
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
            >
              + New via Chat
            </Link>
          </div>

          {loading && (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500 shadow-sm">
              Loading workflows…
            </div>
          )}

          {error && !loading && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && workflows.length === 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center shadow-sm">
              <p className="text-gray-500">
                No workflows yet. Head to the{" "}
                <Link
                  href="/chat"
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  chat
                </Link>{" "}
                and try{" "}
                <span className="font-mono text-gray-700">
                  &quot;Send 5 HBAR to 0.0.12345&quot;
                </span>
                .
              </p>
            </div>
          )}

          {!loading && !error && workflows.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workflows.map((wf) => (
                <WorkflowCard
                  key={wf.id}
                  workflow={wf}
                  onPlay={() => handlePlay(wf)}
                  onDelete={() => handleDelete(wf)}
                  deleting={deletingId === wf.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Multi-step execute modal */}
      {executingWorkflow && (
        <ExecuteCompoundModal
          isOpen={!!executingId}
          onClose={() => {
            setExecutingId(null);
            setExecutingSteps([]);
            setExecutingTotalHbar(null);
            setExecutingReceipts([]);
          }}
          workflow={{
            id: executingWorkflow.id,
            title: executingWorkflow.title,
            summary: executingWorkflow.summary,
            steps: executingSteps,
            totalHbar: executingTotalHbar,
          }}
          initialReceipts={executingReceipts}
          onStepRecorded={handleStepRecorded}
          onAllDone={fetchWorkflows}
        />
      )}
    </ProtectedRoute>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function WorkflowCard({
  workflow,
  onPlay,
  onDelete,
  deleting,
}: {
  workflow: WorkflowListItem;
  onPlay: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const view = parseWorkflowView(workflow.workflowJson, workflow.type);
  const isCompound = view.workflowType === "compound";
  const stepCount = view.steps.length;
  // Total wallet signatures (bulk_account_creation produces `count` signatures
  // per compiled step). When this differs from the raw step count, we surface
  // it so users aren't surprised by "1 step" requiring N HashPack approvals.
  const signatureCount = view.steps.reduce((sum, s) => {
    const obj = s as Record<string, unknown>;
    if (obj.kind === "bulk_account_creation" && typeof obj.count === "number") {
      return sum + (obj.count as number);
    }
    return sum + 1;
  }, 0);

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-lg font-semibold text-gray-900 leading-tight">
          {workflow.title}
        </h3>
        <StatusBadge status={workflow.status} />
      </div>

      <p className="text-sm text-gray-600 line-clamp-3 min-h-[3.5rem]">
        {workflow.summary || workflow.prompt || "No description provided."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
          {workflow.type}
        </span>
        {isCompound && stepCount > 0 && (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700">
            {stepCount} step{stepCount === 1 ? "" : "s"}
          </span>
        )}
        {signatureCount > stepCount && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-700">
            {signatureCount} signatures
          </span>
        )}
        <PaymentBadge paymentStatus={workflow.paymentStatus} />
      </div>

      {isCompound && stepCount > 0 && (
        <div className="mt-3 rounded-md bg-gray-50 p-2.5 border border-gray-100">
          <CompoundStepsList steps={view.steps} compact />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={onPlay}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
        >
          <PlayIcon /> Play
        </button>
        <Link
          href={`/workflows/${workflow.id}`}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          Details
        </Link>
        <button
          onClick={onDelete}
          disabled={deleting}
          aria-label="Delete workflow"
          title="Delete workflow"
          className="rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-50 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {deleting ? <span className="text-xs">…</span> : <TrashIcon />}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    awaiting_payment: "bg-amber-100 text-amber-700",
    unlocked: "bg-emerald-100 text-emerald-700",
    completed: "bg-blue-100 text-blue-700",
    cancelled: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
        map[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function PaymentBadge({ paymentStatus }: { paymentStatus: string }) {
  if (paymentStatus === "paid") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
        Paid
      </span>
    );
  }
  if (paymentStatus === "awaiting_payment") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
        Awaiting payment
      </span>
    );
  }
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
      Unpaid
    </span>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M8 3a1 1 0 00-1 1v1H4a1 1 0 100 2h1v8a2 2 0 002 2h6a2 2 0 002-2V7h1a1 1 0 100-2h-3V4a1 1 0 00-1-1H8zm1 3V4h2v2H9zM7 7h6v8H7V7z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.3 3.6a1 1 0 011.5-.86l9.4 5.4a1 1 0 010 1.72l-9.4 5.4a1 1 0 01-1.5-.86V3.6z" />
    </svg>
  );
}
