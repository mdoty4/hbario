import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { verifyTransaction, getTransactionReceipt } from "@/lib/hedera/tools";
import type { ExpectedTransactionDetails } from "@/lib/hedera/types";
import type { WalletMode } from "@/lib/wallet/types";

function parseNetwork(value: unknown): WalletMode {
  return value === "mainnet" ? "mainnet" : "testnet";
}

/**
 * POST /api/orders/:id/verify
 *
 * Verifies an HBAR payment against an order by querying the Hedera Mirror
 * Node REST API for the order's network, then unlocks the workflow.
 *
 * Request body:
 *  - transactionId (string, required): The Hedera transaction ID to verify
 *  - payerAccount (string, optional): The payer's Hedera account ID
 *  - network (string, optional): The Hedera network. Defaults to the order's
 *    stored network.
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
    const { transactionId, payerAccount, network: bodyNetwork } = body as {
      transactionId?: string;
      payerAccount?: string;
      network?: string;
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

    // ── Payer ───────────────────────────────────────────────────────
    // The connected wallet supplied a `payerAccount` at pay time. We
    // require it so the mirror-node verification has a sender to pin
    // against. There's no server-side wallet binding anymore — the
    // mirror node and the order's recipient/amount/memo are the source
    // of truth for what "paid" means.
    if (!payerAccount || !payerAccount.trim()) {
      return NextResponse.json(
        {
          error:
            "payerAccount is required. Connect a wallet and retry the payment.",
        },
        { status: 400 }
      );
    }
    const effectivePayerAccount = payerAccount;


    // ── Check order is still pending ────────────────────────────────
    if (order.status === "paid") {
      return NextResponse.json(
        { error: "Order has already been paid" },
        { status: 409 }
      );
    }

    // ── Determine network ───────────────────────────────────────────
    // Prefer the order's stored network so the client can't trick the server
    // into looking up the wrong mirror node. Fall back to body for orders
    // created before the field existed.
    const network: WalletMode =
      (order.network as WalletMode | undefined) === "mainnet"
        ? "mainnet"
        : order.network === "testnet"
        ? "testnet"
        : parseNetwork(bodyNetwork);

    // ── Verification Checks ─────────────────────────────────────────

    // Step 1: Receipt check
    let receipt;
    try {
      receipt = await getTransactionReceipt(transactionId, network);
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
          error:
            receipt.status === "NOT_FOUND"
              ? "Transaction has not been indexed by the Hedera Mirror Node yet. Please try again in a few seconds."
              : "Transaction did not succeed",
          details: {
            transactionId,
            status: receipt.status,
            network,
          },
        },
        { status: 400 }
      );
    }

    // Step 2: Full verification (recipient, amount, memo, payer)
    const expectedDetails: ExpectedTransactionDetails = {
      recipient: order.recipientAccount,
      amountHbar: order.amountHbar,
      memo: order.memo ?? undefined,
    };

    // Always pin the expected sender to the bound wallet so a tampered
    // body can't smuggle through a transaction paid from a different
    // account.
    expectedDetails.sender = effectivePayerAccount;

    let verificationResult;
    try {
      verificationResult = await verifyTransaction(
        transactionId,
        expectedDetails,
        network
      );
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
            network,
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
          payerAccount: effectivePayerAccount,
        },
      });
    } else {
      payment = await prisma.payment.create({
        data: {
          userId: payload.userId,
          workflowId: order.workflowId,
          orderId: order.id,
          payerAccount: effectivePayerAccount,
          recipientAccount: order.recipientAccount,
          amountHbar: order.amountHbar,
          memo: order.memo,
          transactionId,
          status: "paid",
          verifiedAt: new Date(),
        },
      });
    }

    // Update workflow status.
    // All web-app orders are AI-planning orders: the LLM hasn't run yet,
    // so we only flip `paymentStatus` to "paid" here. The /api/chat/agent
    // route claims the paid order, runs the LLM, and then flips the
    // workflow to `unlocked` once it has actual content to execute.
    const updatedWorkflow = await prisma.workflow.update({
      where: { id: order.workflowId },
      data: {
        paymentStatus: "paid",
      },
    });


    // Create receipt
    const receiptData = {
      transactionId,
      network,
      status: receipt.status,
      consensusTimestamp: receipt.consensusTimestamp,
      verified: verificationResult.verified,
      verificationDetails: verificationResult.details,
    };

    const createdReceipt = await prisma.receipt.create({
      data: {
        userId: payload.userId,
        workflowId: order.workflowId,
        orderId: order.id,
        paymentId: payment.id,
        transactionId,
        amountHbar: order.amountHbar,
        payerAccount: effectivePayerAccount,
        recipientAccount: order.recipientAccount,
        memo: order.memo || "",
        workflowType: updatedWorkflow.type,
        receiptJson: JSON.stringify(receiptData, null, 2),
      },
    });

    return NextResponse.json(
      {
        message: "Payment verified successfully",
        network,
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
