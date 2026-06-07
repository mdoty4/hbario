import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// All workflow unlocks cost 2 HBAR for the public MVP
const WORKFLOW_UNLOCK_PRICE_HBAR = 2;

/**
 * POST /api/workflows/:id/create-order
 *
 * Creates a payment order for unlocking a workflow.
 * The order includes:
 *  - workflowId
 *  - userId
 *  - amountHbar (2 HBAR)
 *  - recipientAccount (HEDERA_TREASURY_ACCOUNT_ID)
 *  - memo (includes the order ID)
 *  - status ("pending")
 *
 * Also updates the workflow status to "awaiting_payment".
 */
export async function POST(
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
    });

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    // ── Check if an existing unpaid order already exists ────────────
    const existingOrder = await prisma.order.findFirst({
      where: {
        workflowId,
        userId: payload.userId,
        status: "pending",
      },
    });

    if (existingOrder) {
      return NextResponse.json(
        {
          error: "An unpaid order already exists for this workflow",
          order: existingOrder,
        },
        { status: 409 }
      );
    }

    // ── Build the order ─────────────────────────────────────────────
    const recipientAccount =
      process.env.HEDERA_TREASURY_ACCOUNT_ID || "0.0.1234567";

    // Create the order first so we can reference its ID in the memo
    const order = await prisma.order.create({
      data: {
        userId: payload.userId,
        workflowId,
        amountHbar: WORKFLOW_UNLOCK_PRICE_HBAR,
        recipientAccount,
        memo: null, // Will be set after creation
        status: "pending",
      },
    });

    // Update the memo to include the order ID
    const memo = `Open Hedera workflow unlock - Order ${order.id} - Workflow ${workflowId}`;

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: { memo },
    });

    // ── Update workflow status ──────────────────────────────────────
    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        status: "awaiting_payment",
        paymentStatus: "awaiting_payment",
      },
    });

    return NextResponse.json(
      {
        message: "Order created successfully",
        order: updatedOrder,
        workflow: {
          id: workflow.id,
          title: workflow.title,
          status: "awaiting_payment",
          paymentStatus: "awaiting_payment",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create order error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
