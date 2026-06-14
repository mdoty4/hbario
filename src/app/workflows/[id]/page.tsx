"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";

import ProtectedRoute from "@/components/ProtectedRoute";
import ExecuteCompoundModal from "@/components/workflows/ExecuteCompoundModal";
import CompoundStepsList from "@/components/workflows/CompoundStepsList";
import EditAmountsModal, {
  isStepEditable,
} from "@/components/workflows/EditAmountsModal";
import { parseWorkflowView } from "@/lib/workflow/clientHelpers";

interface StepReceipt {
  id: string;
  stepIndex: number | null;
  stepKind: string | null;
  transactionId: string;
  status: "verified" | "failed";
  createdAt: string;
}

interface WorkflowDetail {
  id: string;
  title: string;
  type: string;
  prompt: string | null;
  summary: string | null;
  status: string;
  paymentStatus: string;
  workflowJson: string | null;
  createdAt: string;
  isUnlocked: boolean;
  stepReceipts?: StepReceipt[];
}

interface WorkflowPageProps {
  params: Promise<{ id: string }>;
}

export default function WorkflowPage({ params }: WorkflowPageProps) {
  const { id } = use(params);
  const router = useRouter();

  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [executing, setExecuting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);

  const fetchWorkflow = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load workflow");
      }
      const data = await res.json();
      setWorkflow(data.workflow);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workflow");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchWorkflow();
  }, [fetchWorkflow]);

  // Build the steps[] array the executor needs. Non-compound workflows (legacy
  // single_payment) are wrapped into a synthetic 1-step compound so the
  // executor handles them uniformly — one code path for everything.
  const view = workflow
    ? parseWorkflowView(workflow.workflowJson, workflow.type)
    : null;

  const executableSteps: Array<Record<string, unknown>> = (() => {
    if (!view) return [];
    if (view.workflowType === "compound") return view.steps;
    if (view.singlePaymentExecution) {
      return [
        {
          kind: "single_payment",
          recipient: view.singlePaymentExecution.recipient,
          amountHbar: view.singlePaymentExecution.amountHbar,
          memo: view.singlePaymentExecution.memo,
        },
      ];
    }
    return [];
  })();

  const handlePlay = () => {
    if (!workflow) return;
    setExecuting(true);
  };

  const handleStepRecorded = () => {
    fetchWorkflow();
  };

  const handleReset = async () => {
    if (!workflow) return;
    const hasReceipts =
      (workflow.stepReceipts?.length ?? 0) > 0;
    if (!hasReceipts) return;
    const confirmed = window.confirm(
      "Reset execution progress? This clears the per-step receipts so you " +
        "can re-run the workflow from the beginning. Already-broadcast " +
        "on-chain transactions are NOT undone.",
    );
    if (!confirmed) return;
    setResetting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/reset`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to reset workflow");
      }
      await fetchWorkflow();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset workflow");
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async () => {
    if (!workflow) return;
    const confirmed = window.confirm(
      `Delete "${workflow.title}"? This cannot be undone.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete workflow");
      }
      router.push("/workflows");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete workflow");
      setDeleting(false);
    }
  };

  const isCompound = view?.workflowType === "compound";

  // Step is "executed" (and therefore not editable) iff it has a verified
  // receipt. Failed-only attempts remain editable so the user can fix and retry.
  const executedStepIndices = new Set<number>(
    (workflow?.stepReceipts ?? [])
      .filter((r) => r.status === "verified" && r.stepIndex != null)
      .map((r) => r.stepIndex as number),
  );

  const canEditStep = (i: number): boolean => {
    if (!view || view.workflowType !== "compound") return false;
    const step = view.steps[i];
    if (!step) return false;
    if (!isStepEditable(step)) return false;
    if (executedStepIndices.has(i)) return false;
    return true;
  };

  return (
    <ProtectedRoute>
      <div className="min-h-[calc(100vh-4rem)] bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <Link
              href="/workflows"
              className="text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              &larr; Back to Workflows
            </Link>
          </div>

          {loading && (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500 shadow-sm">
              Loading workflow…
            </div>
          )}

          {error && !loading && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {workflow && view && !loading && (
            <>
              <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                  {workflow.title}
                </h1>
                <p className="mt-2 text-gray-600">
                  {workflow.summary || "No description provided."}
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-5">
                <Row label="Type" value={workflow.type} />
                <Row label="Status" value={workflow.status.replace(/_/g, " ")} />
                <Row
                  label="Payment"
                  value={
                    workflow.paymentStatus === "paid"
                      ? "Paid"
                      : workflow.paymentStatus === "awaiting_payment"
                      ? "Awaiting payment"
                      : "Unpaid"
                  }
                />
                {workflow.prompt && (
                  <Row label="Original prompt" value={workflow.prompt} />
                )}

                {isCompound && view.steps.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">
                      Workflow plan
                    </h3>
                    <CompoundStepsList
                      steps={view.steps}
                      totalHbar={view.totalHbar ?? undefined}
                      onEditStep={
                        workflow.isUnlocked
                          ? (i) => setEditingStepIndex(i)
                          : undefined
                      }
                      isStepEditable={canEditStep}
                    />
                  </div>
                )}

                {workflow.stepReceipts && workflow.stepReceipts.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">
                      Step receipts
                    </h3>
                    <ul className="space-y-1.5">
                      {workflow.stepReceipts.map((r) => (
                        <li
                          key={r.id}
                          className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${
                            r.status === "verified"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-red-200 bg-red-50 text-red-700"
                          }`}
                        >
                          <span>
                            Step {(r.stepIndex ?? 0) + 1}
                            {r.stepKind ? ` · ${r.stepKind.replace(/_/g, " ")}` : ""}
                            {" · "}
                            {r.status}
                          </span>
                          {r.transactionId && (
                            <code className="ml-3 truncate font-mono text-[10px] text-gray-600">
                              {r.transactionId}
                            </code>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {workflow.workflowJson && (
                  <div>
                    <button
                      onClick={() => setShowRawJson((s) => !s)}
                      className="text-xs font-medium text-gray-500 hover:text-gray-700 underline"
                    >
                      {showRawJson ? "Hide" : "Show"} raw compiled JSON
                    </button>
                    {showRawJson && (
                      <pre className="mt-2 overflow-x-auto rounded-md bg-gray-50 p-3 text-xs font-mono text-gray-800 border border-gray-200">
                        {workflow.workflowJson}
                      </pre>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handlePlay}
                    disabled={executableSteps.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
                  >
                    <PlayIcon /> Play
                  </button>
                  <Link
                    href="/workflows"
                    className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    Back
                  </Link>
                  {(workflow.stepReceipts?.length ?? 0) > 0 && (
                    <button
                      onClick={handleReset}
                      disabled={resetting}
                      title="Clear step receipts so you can re-run the workflow"
                      className="rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resetting ? "Resetting…" : "Reset progress"}
                    </button>
                  )}
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="ml-auto rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {workflow && view && (
        <ExecuteCompoundModal
          isOpen={executing}
          onClose={() => setExecuting(false)}
          workflow={{
            id: workflow.id,
            title: workflow.title,
            summary: workflow.summary,
            steps: executableSteps,
            totalHbar: view.totalHbar,
          }}
          initialReceipts={workflow.stepReceipts}
          onStepRecorded={handleStepRecorded}
          onAllDone={fetchWorkflow}
        />
      )}

      {workflow && view && editingStepIndex !== null && view.steps[editingStepIndex] && (
        <EditAmountsModal
          isOpen
          onClose={() => setEditingStepIndex(null)}
          workflowId={workflow.id}
          stepIndex={editingStepIndex}
          step={view.steps[editingStepIndex]}
          onSaved={fetchWorkflow}
        />
      )}
    </ProtectedRoute>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-500">{label}</h3>
      <p className="mt-1 text-gray-900 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.3 3.6a1 1 0 011.5-.86l9.4 5.4a1 1 0 010 1.72l-9.4 5.4a1 1 0 01-1.5-.86V3.6z" />
    </svg>
  );
}
