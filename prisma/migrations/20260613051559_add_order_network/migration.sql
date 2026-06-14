-- Add a `network` column to the Order table.
-- Existing rows default to "testnet" so older orders remain valid.
ALTER TABLE "Order" ADD COLUMN "network" TEXT NOT NULL DEFAULT 'testnet';
