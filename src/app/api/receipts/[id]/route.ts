import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * GET /api/receipts/:id
 *
 * Fetches a single receipt by ID with all related data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: receiptId } = await params;

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

    // ── Fetch receipt ───────────────────────────────────────────────
    const receipt = await prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        workflow: true,
        order: true,
        payment: true,
      },
    });

    if (!receipt) {
      return NextResponse.json(
        { error: "Receipt not found" },
        { status: 404 }
      );
    }

    // ── Check ownership ─────────────────────────────────────────────
    if (receipt.userId !== payload.userId) {
      return NextResponse.json(
        { error: "Forbidden: You do not have access to this receipt" },
        { status: 403 }
      );
    }

    // ── Build response ──────────────────────────────────────────────
    const receiptData = {
      id: receipt.id,
      workflowId: receipt.workflowId,
      orderId: receipt.orderId,
      paymentId: receipt.paymentId,
      amountHbar: receipt.amountHbar,
      payerAccount: receipt.payerAccount,
      recipientAccount: receipt.recipientAccount,
      memo: receipt.memo,
      workflowType: receipt.workflowType,
      transactionId: receipt.transactionId,
      receiptJson: receipt.receiptJson,
      createdAt: receipt.createdAt,
      workflow: {
        id: receipt.workflow.id,
        title: receipt.workflow.title,
        type: receipt.workflow.type,
        status: receipt.workflow.status,
      },
      order: {
        id: receipt.order.id,
        status: receipt.order.status,
        amountHbar: receipt.order.amountHbar,
      },
      payment: receipt.payment
        ? {
            id: receipt.payment.id,
            status: receipt.payment.status,
            verifiedAt: receipt.payment.verifiedAt,
          }
        : null,
    };

    return NextResponse.json({ receipt: receiptData }, { status: 200 });
  } catch (error) {
    console.error("Get receipt error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
