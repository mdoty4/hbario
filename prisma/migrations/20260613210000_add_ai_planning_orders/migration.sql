-- Adds fields to Order so it can represent both legacy workflow_unlock orders
-- and the new ai_planning orders (paying for an LLM call that generates a
-- workflow). The defaults preserve behavior for existing rows.
ALTER TABLE "Order" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'workflow_unlock';
ALTER TABLE "Order" ADD COLUMN "quoteUsd" REAL;
ALTER TABLE "Order" ADD COLUMN "hbarUsdRate" REAL;
ALTER TABLE "Order" ADD COLUMN "consumedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "expiresAt" DATETIME;
