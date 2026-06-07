import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * GET /api/workflows/:id
 *
 * Fetches a single workflow by ID along with its latest order and payment info.
 * The full workflow JSON is only returned if the workflow is paid/unlocked.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workflowId } = await params;

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

    // ── Fetch workflow ──────────────────────────────────────────────
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        orders: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            payments: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            receipts: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    // ── Check ownership ─────────────────────────────────────────────
    // Only the workflow owner can access it
    if (workflow.userId !== payload.userId) {
      return NextResponse.json(
        { error: "Forbidden: You do not have access to this workflow" },
        { status: 403 }
      );
    }

    // ── Determine if workflow is unlocked ───────────────────────────
    const isUnlocked =
      workflow.paymentStatus === "paid" || workflow.status === "unlocked";

    // Build response - hide full workflow JSON if not unlocked
    const order = workflow.orders[0] || null;
    const latestPayment = order?.payments[0] || null;
    const latestReceipt = order?.receipts[0] || null;

    const responseWorkflow = {
      id: workflow.id,
      userId: workflow.userId,
      title: workflow.title,
      type: workflow.type,
      prompt: workflow.prompt,
      summary: workflow.summary,
      workflowJson: isUnlocked ? workflow.workflowJson : null,
      status: workflow.status,
      paymentStatus: workflow.paymentStatus,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      isUnlocked,
      order: order
        ? {
            id: order.id,
            amountHbar: order.amountHbar,
            recipientAccount: order.recipientAccount,
            memo: order.memo,
            status: order.status,
            transactionId: order.transactionId,
            createdAt: order.createdAt,
            latestPayment: latestPayment
              ? {
                  id: latestPayment.id,
                  status: latestPayment.status,
                  transactionId: latestPayment.transactionId,
                  amountHbar: latestPayment.amountHbar,
                  createdAt: latestPayment.createdAt,
                }
              : null,
            latestReceipt: latestReceipt
              ? {
                  id: latestReceipt.id,
                  workflowId: latestReceipt.workflowId,
                  orderId: latestReceipt.orderId,
                  paymentId: latestReceipt.paymentId,
                  transactionId: latestReceipt.transactionId,
                  amountHbar: latestReceipt.amountHbar,
                  payerAccount: latestReceipt.payerAccount,
                  recipientAccount: latestReceipt.recipientAccount,
                  memo: latestReceipt.memo,
                  workflowType: latestReceipt.workflowType,
                  receiptJson: latestReceipt.receiptJson,
                  createdAt: latestReceipt.createdAt,
                }
              : null,
          }
        : null,
      treasuryAccount:
        process.env.HEDERA_TREASURY_ACCOUNT_ID || "0.0.1234567",
      unlockPriceHbar: 2,
    };

    return NextResponse.json({ workflow: responseWorkflow }, { status: 200 });
  } catch (error) {
    console.error("Get workflow error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
