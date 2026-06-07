import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { verifyTransaction, getTransactionReceipt, isMockMode } from "@/lib/hedera/tools";
import type { ExpectedTransactionDetails, TransactionReceipt } from "@/lib/hedera/types";

/**
 * POST /api/orders/:id/verify
 *
 * Verifies an HBAR payment against an order and unlocks the workflow on success.
 *
 * Request body:
 *  - transactionId (string, required): The Hedera transaction ID to verify
 *  - payerAccount (string, optional): The payer's Hedera account ID
 *
 * Verification checks:
 *  1. Transaction ID exists and is not empty
 *  2. Transaction succeeded (receipt status is SUCCESS)
 *  3. Recipient account matches the treasury account on the order
 *  4. Amount matches the order amount
 *  5. Memo matches the order ID (if memo exists on the order)
 *  6. Payer account matches the connected wallet (if provided)
 *
 * On success:
 *  - Order status -> "paid"
 *  - Payment created/updated with status "paid"
 *  - Workflow paymentStatus -> "paid"
 *  - Workflow status -> "unlocked"
 *  - Receipt created
 *
 * On failure:
 *  - Order status remains "pending"
 *  - Workflow status remains "awaiting_payment"
 *  - Useful error message returned
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;

    // ── Authenticate ────────────────────────────────────────────────
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    // ── Parse request body ──────────────────────────────────────────
    const body = await request.json();
    const { transactionId, payerAccount } = body as {
      transactionId?: string;
      payerAccount?: string;
    };

    if (!transactionId || transactionId.trim() === "") {
      return NextResponse.json(
        { error: "Transaction ID is required" },
        { status: 400 }
      );
    }

    // ── Fetch order ─────────────────────────────────────────────────
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        workflow: true,
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // ── Check ownership ─────────────────────────────────────────────
    if (order.userId !== payload.userId) {
      return NextResponse.json(
        { error: "Forbidden: You do not have access to this order" },
        { status: 403 }
      );
    }

    // ── Check order is still pending ────────────────────────────────
    if (order.status === "paid") {
      return NextResponse.json(
        { error: "Order has already been paid" },
        { status: 409 }
      );
    }

    // ── Get treasury account ────────────────────────────────────────
    const treasuryAccount =
      process.env.HEDERA_TREASURY_ACCOUNT_ID || "0.0.1234567";

    // ── Verification Checks ─────────────────────────────────────────

    // Check 2: Transaction succeeded - get receipt
    let receipt: TransactionReceipt;
    try {
      receipt = getTransactionReceipt(transactionId);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to get transaction receipt";
      return NextResponse.json(
        { error: `Receipt check failed: ${errorMessage}` },
        { status: 400 }
      );
    }

    if (receipt.status !== "SUCCESS") {
      return NextResponse.json(
        {
          error: "Transaction did not succeed",
          details: {
            transactionId,
            status: receipt.status,
          },
        },
        { status: 400 }
      );
    }

    // Check 3: Recipient account matches treasury account
    if (order.recipientAccount !== treasuryAccount && !isMockMode()) {
      return NextResponse.json(
        {
          error: "Recipient account mismatch",
          details: {
            expected: treasuryAccount,
            actual: order.recipientAccount,
          },
        },
        { status: 400 }
      );
    }

    // Check 4 & 5: Amount and memo verification via Hedera tools
    const expectedDetails: ExpectedTransactionDetails = {
      recipient: order.recipientAccount,
      amountHbar: order.amountHbar,
    };

    if (payerAccount) {
      expectedDetails.sender = payerAccount;
    }

    let verificationResult;
    try {
      verificationResult = verifyTransaction(transactionId, expectedDetails);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Verification failed";
      return NextResponse.json(
        { error: `Verification error: ${errorMessage}` },
        { status: 400 }
      );
    }

    if (!verificationResult.verified) {
      return NextResponse.json(
        {
          error: "Payment verification failed",
          details: {
            transactionId,
            verificationError: verificationResult.error,
            expected: {
              recipient: order.recipientAccount,
              amountHbar: order.amountHbar,
              memo: order.memo,
            },
          },
        },
        { status: 400 }
      );
    }

    // ── All checks passed - update records ──────────────────────────

    // Update order status to paid
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "paid",
        transactionId,
      },
    });

    // Create or update payment record
    let payment = order.payments[0] || null;

    if (payment) {
      payment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "paid",
          transactionId,
          verifiedAt: new Date(),
          payerAccount: payerAccount || payment.payerAccount,
        },
      });
    } else {
      payment = await prisma.payment.create({
        data: {
          userId: payload.userId,
          workflowId: order.workflowId,
          orderId: order.id,
          payerAccount: payerAccount || "",
          recipientAccount: order.recipientAccount,
          amountHbar: order.amountHbar,
          memo: order.memo,
          transactionId,
          status: "paid",
          verifiedAt: new Date(),
        },
      });
    }

    // Update workflow: paymentStatus -> paid, status -> unlocked
    const updatedWorkflow = await prisma.workflow.update({
      where: { id: order.workflowId },
      data: {
        paymentStatus: "paid",
        status: "unlocked",
      },
    });

    // Create receipt
    const receiptData = {
      transactionId,
      status: receipt.status,
      blockHash: receipt.blockHash,
      consensusTimestamp: receipt.consensusTimestamp,
      verified: verificationResult.verified,
      verificationDetails: verificationResult.details,
      isMock: receipt.isMock,
    };

    const createdReceipt = await prisma.receipt.create({
      data: {
        userId: payload.userId,
        workflowId: order.workflowId,
        orderId: order.id,
        paymentId: payment.id,
        transactionId,
        amountHbar: order.amountHbar,
        payerAccount: payerAccount || payment.payerAccount,
        recipientAccount: order.recipientAccount,
        memo: order.memo || "",
        workflowType: updatedWorkflow.type,
        receiptJson: JSON.stringify(receiptData, null, 2),
      },
    });

    return NextResponse.json(
      {
        message: "Payment verified successfully",
        order: {
          id: updatedOrder.id,
          status: updatedOrder.status,
          transactionId: updatedOrder.transactionId,
        },
        payment: {
          id: payment.id,
          status: payment.status,
          transactionId: payment.transactionId,
          verifiedAt: payment.verifiedAt,
        },
        workflow: {
          id: updatedWorkflow.id,
          status: updatedWorkflow.status,
          paymentStatus: updatedWorkflow.paymentStatus,
        },
        receipt: {
          id: createdReceipt.id,
          transactionId: createdReceipt.transactionId,
          amountHbar: createdReceipt.amountHbar,
          createdAt: createdReceipt.createdAt,
        },
        isMock: isMockMode(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Verify payment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
