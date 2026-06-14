// ──────────────────────────────────────────────────────────────────────────────
// CompoundStepsList
//
// Renders the ordered `steps[]` of a compiled compound workflow as a readable
// numbered list of cards. Used by the workflows list (compact) and detail
// (full) pages.
// ──────────────────────────────────────────────────────────────────────────────

"use client";

import { describeCompoundStep } from "@/lib/workflow/clientHelpers";

interface CompoundStepsListProps {
  steps: Array<Record<string, unknown>>;
  /** Optional total HBAR sum to render below the list. */
  totalHbar?: number | null;
  /** Compact variant for cards/lists. */
  compact?: boolean;
  /**
   * When provided, renders an "Edit" affordance next to each step that the
   * caller deems editable. The caller decides eligibility (e.g. step kind +
   * receipt status) and is invoked with the step index on click.
   */
  onEditStep?: (stepIndex: number) => void;
  /**
   * Optional predicate that returns whether a given step (by index) is
   * currently editable. Steps where this returns false won't show an Edit
   * affordance even when `onEditStep` is provided.
   */
  isStepEditable?: (stepIndex: number) => boolean;
}

const KIND_BADGE: Record<string, string> = {
  single_payment: "bg-blue-100 text-blue-700",
  bulk_payout: "bg-purple-100 text-purple-700",
  bulk_account_creation: "bg-emerald-100 text-emerald-700",
  unknown: "bg-gray-100 text-gray-700",
};

export default function CompoundStepsList({
  steps,
  totalHbar,
  compact = false,
  onEditStep,
  isStepEditable,
}: CompoundStepsListProps) {
  if (!steps || steps.length === 0) {
    return (
      <p className="text-sm text-gray-500">No steps in this workflow.</p>
    );
  }

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <ol className={compact ? "space-y-1.5" : "space-y-2"}>
        {steps.map((step, i) => {
          const view = describeCompoundStep(step);
          const badgeClass = KIND_BADGE[view.kind] ?? KIND_BADGE.unknown;
          return (
            <li
              key={i}
              className={
                compact
                  ? "flex items-start gap-2 text-sm"
                  : "flex items-start gap-3 rounded-md border border-gray-200 bg-white p-3"
              }
            >
              <span
                className={
                  compact
                    ? "mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600"
                    : "mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600"
                }
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900 truncate">
                    {view.title}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}
                  >
                    {view.kind.replace(/_/g, " ")}
                  </span>
                </div>
                {view.subtitle && (
                  <div className="mt-0.5 text-xs text-gray-500">
                    {view.subtitle}
                  </div>
                )}
              </div>
              {!compact &&
                onEditStep &&
                (!isStepEditable || isStepEditable(i)) && (
                  <button
                    type="button"
                    onClick={() => onEditStep(i)}
                    className="ml-2 flex-shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                )}
            </li>
          );
        })}
      </ol>
      {typeof totalHbar === "number" && totalHbar > 0 && (
        <div
          className={
            compact
              ? "pt-1 text-xs text-gray-500"
              : "pt-2 text-sm text-gray-600"
          }
        >
          <span className="font-medium">Total moved across all steps:</span>{" "}
          {totalHbar} HBAR
        </div>
      )}
    </div>
  );
}
