-- Add step-level metadata to Receipt so a single compound workflow can have
-- multiple receipts (one per executed step). Existing rows leave both columns
-- NULL — those are pre-multi-step receipts and are treated as "step 0".
ALTER TABLE "Receipt" ADD COLUMN "stepIndex" INTEGER;
ALTER TABLE "Receipt" ADD COLUMN "stepKind" TEXT;

CREATE INDEX "Receipt_workflowId_stepIndex_idx" ON "Receipt"("workflowId", "stepIndex");
