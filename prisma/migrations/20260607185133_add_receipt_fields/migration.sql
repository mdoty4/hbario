/*
  Warnings:

  - Added the required column `payerAccount` to the `Receipt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `recipientAccount` to the `Receipt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `workflowType` to the `Receipt` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Receipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "transactionId" TEXT NOT NULL,
    "amountHbar" REAL NOT NULL,
    "payerAccount" TEXT NOT NULL,
    "recipientAccount" TEXT NOT NULL,
    "memo" TEXT,
    "workflowType" TEXT NOT NULL,
    "receiptJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Receipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Receipt_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Receipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Receipt" ("amountHbar", "createdAt", "id", "orderId", "paymentId", "receiptJson", "transactionId", "userId", "workflowId") SELECT "amountHbar", "createdAt", "id", "orderId", "paymentId", "receiptJson", "transactionId", "userId", "workflowId" FROM "Receipt";
DROP TABLE "Receipt";
ALTER TABLE "new_Receipt" RENAME TO "Receipt";
CREATE INDEX "Receipt_userId_idx" ON "Receipt"("userId");
CREATE INDEX "Receipt_workflowId_idx" ON "Receipt"("workflowId");
CREATE INDEX "Receipt_orderId_idx" ON "Receipt"("orderId");
CREATE INDEX "Receipt_paymentId_idx" ON "Receipt"("paymentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
