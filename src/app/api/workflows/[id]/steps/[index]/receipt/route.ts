// ──────────────────────────────────────────────────────────────────────────────
// POST /api/workflows/[id]/steps/[index]/receipt
//
// Records a step-level receipt after the client has signed + submitted a step
// transaction in their wallet. We verify the tx on the Hedera mirror node,
// write a Receipt row tagged with `stepIndex`/`stepKind`, and flip the
// Workflow to `completed` once every step has a verified receipt.
//
// The unlock Order is reused across all steps — there is one paid order per
// workflow, and every step's Receipt points back to it.
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { fetchReceipt, verifyTransactionOnMirror } from "@/lib/hedera/mirrorNode";
import type { WalletMode } from "@/lib/wallet/types";

interface RouteParams {
  params: Promise<{ id: string; index: string }>;
}

interface StepReceiptBody {
  transactionId?: string;
  payerAccount?: string;
  network?: string;
  status?: "verified" | "failed";
  stepKind?: string;
  /** Free-form payload (e.g. createdAccounts) saved into receiptJson. */
  payload?: Record<string, unknown>;
  /** Recipient/amount the step intended to move, when applicable. Used for
   *  mirror-node verification on transfer-style steps. */
  expectedRecipient?: string;
  expectedAmountHbar?: number;
  expectedMemo?: string;
  /** Pre-recorded error message when the client reports a `failed` step. */
  error?: string;
}

function parseNetwork(value: unknown, fallback: WalletMode): WalletMode {
  if (value === "mainnet") return "mainnet";
  if (value === "testnet") return "testnet";
  return fallback;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: workflowId, index: rawIndex } = await params;
    const stepIndex = parseInt(rawIndex, 10);
    if (!Number.isInteger(stepIndex) || stepIndex < 0) {
      return NextResponse.json(
        { error: "Invalid step index" },
        { status: 400 },
      );
    }

    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as StepReceiptBody;
    const {
      transactionId,
      payerAccount,
      status,
      stepKind,
      payload: stepPayload,
      expectedRecipient,
      expectedAmountHbar,
      expectedMemo,
      error: clientError,
    } = body;

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        orders: { orderBy: { createdAt: "desc" }, take: 1 },
        receipts: true,
      },
    });
    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }
    if (workflow.userId !== payload.userId) {
      return NextResponse.json(
        { error: "Forbidden: You do not have access to this workflow" },
        { status: 403 },
      );
    }
    if (workflow.paymentStatus !== "paid") {
      return NextResponse.json(
        { error: "Workflow has not been unlocked" },
        { status: 409 },
      );
    }
    const order = workflow.orders[0];
    if (!order) {
      return NextResponse.json(
        { error: "No order found for workflow" },
        { status: 409 },
      );
    }

    // Idempotency — never write a second receipt for the same step.
    const existing = workflow.receipts.find(
      (r) => (r.stepIndex ?? 0) === stepIndex,
    );
    if (existing) {
      return NextResponse.json(
        {
          message: "Step already recorded",
          receipt: serializeReceipt(existing),
        },
        { status: 200 },
      );
    }

    const network: WalletMode = parseNetwork(
      body.network,
      (order.network as WalletMode | undefined) === "mainnet"
        ? "mainnet"
        : "testnet",
    );

    // ── Failed step ───────────────────────────────────────────────────
    // Client-reported failure (wallet rejected, sub-tx threw, etc.). We still
    // record it so the UI can show the step status across reloads, but we
    // don't hit the mirror node — there's no tx id (or it never made it on
    // chain). The workflow stays in `unlocked` so the user can retry.
    if (status === "failed") {
      const receipt = await prisma.receipt.create({
        data: {
          userId: payload.userId,
          workflowId,
          orderId: order.id,
          paymentId: null,
          transactionId: transactionId ?? "",
          amountHbar: expectedAmountHbar ?? 0,
          payerAccount: payerAccount ?? "",
          recipientAccount: expectedRecipient ?? "",
          memo: expectedMemo ?? "",
          workflowType: workflow.type,
          stepIndex,
          stepKind: stepKind ?? null,
          receiptJson: JSON.stringify(
            {
              status: "failed",
              network,
              error: clientError ?? "Step failed",
              payload: stepPayload ?? null,
            },
            null,
            2,
          ),
        },
      });
      return NextResponse.json(
        { receipt: serializeReceipt(receipt) },
        { status: 200 },
      );
    }

    // ── Verified step ─────────────────────────────────────────────────
    if (!transactionId || !transactionId.trim()) {
      return NextResponse.json(
        { error: "transactionId is required" },
        { status: 400 },
      );
    }
    if (!payerAccount || !payerAccount.trim()) {
      return NextResponse.json(
        { error: "payerAccount is required" },
        { status: 400 },
      );
    }

    // First make sure consensus says SUCCESS. We do this for every step kind.
    const mirrorReceipt = await fetchReceipt(network, transactionId);
    if (mirrorReceipt.status === "NOT_FOUND") {
      return NextResponse.json(
        {
          error:
            "Transaction has not been indexed by the Hedera Mirror Node yet. Please try again in a few seconds.",
        },
        { status: 400 },
      );
    }
    if (mirrorReceipt.status !== "SUCCESS") {
      return NextResponse.json(
        {
          error: `Transaction did not succeed (status=${mirrorReceipt.status})`,
        },
        { status: 400 },
      );
    }

    // For transfer-style steps the client tells us the expected recipient +
    // amount so we can pin those checks. For account-creation we just need
    // SUCCESS — there is no transfer leg to verify.
    let amountForReceipt = expectedAmountHbar ?? 0;
    let recipientForReceipt = expectedRecipient ?? "";
    if (expectedRecipient && typeof expectedAmountHbar === "number") {
      const v = await verifyTransactionOnMirror(network, transactionId, {
        payerAccount,
        recipient: expectedRecipient,
        amountHbar: expectedAmountHbar,
        memo: expectedMemo,
      });
      if (!v.verified) {
        return NextResponse.json(
          { error: v.error || "Transfer verification failed" },
          { status: 400 },
        );
      }
      amountForReceipt = expectedAmountHbar;
      recipientForReceipt = expectedRecipient;
    }

    const receipt = await prisma.receipt.create({
      data: {
        userId: payload.userId,
        workflowId,
        orderId: order.id,
        paymentId: null,
        transactionId,
        amountHbar: amountForReceipt,
        payerAccount,
        recipientAccount: recipientForReceipt,
        memo: expectedMemo ?? "",
        workflowType: workflow.type,
        stepIndex,
        stepKind: stepKind ?? null,
        receiptJson: JSON.stringify(
          {
            status: "verified",
            network,
            consensusTimestamp: mirrorReceipt.consensusTimestamp,
            payload: stepPayload ?? null,
          },
          null,
          2,
        ),
      },
    });

    // ── Flip workflow to `completed` when every step has a verified receipt ─
    let totalSteps = 1; // default for legacy single-step workflows
    try {
      const parsed = workflow.workflowJson
        ? (JSON.parse(workflow.workflowJson) as {
            workflowType?: string;
            steps?: unknown[];
          })
        : null;
      if (
        parsed?.workflowType === "compound" &&
        Array.isArray(parsed.steps)
      ) {
        totalSteps = parsed.steps.length;
      }
    } catch {
      // ignore — fall back to single-step assumption
    }

    const allReceipts = await prisma.receipt.findMany({
      where: { workflowId },
      select: { stepIndex: true, receiptJson: true },
    });
    const verifiedSteps = new Set<number>();
    for (const r of allReceipts) {
      // A receipt is considered verified for completion purposes unless its
      // receiptJson explicitly says `status: "failed"`.
      let failed = false;
      try {
        const j = r.receiptJson ? JSON.parse(r.receiptJson) : null;
        if (j && j.status === "failed") failed = true;
      } catch {
        // treat as verified
      }
      if (!failed) verifiedSteps.add(r.stepIndex ?? 0);
    }

    const allDone = Array.from({ length: totalSteps }).every((_, i) =>
      verifiedSteps.has(i),
    );

    let updatedWorkflowStatus = workflow.status as string;
    if (allDone) {
      const updated = await prisma.workflow.update({
        where: { id: workflowId },
        data: { status: "completed" },
      });
      updatedWorkflowStatus = updated.status;
    }

    return NextResponse.json(
      {
        receipt: serializeReceipt(receipt),
        workflow: {
          id: workflowId,
          status: updatedWorkflowStatus,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Step receipt error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function serializeReceipt(receipt: {
  id: string;
  transactionId: string;
  amountHbar: number;
  payerAccount: string;
  recipientAccount: string;
  memo: string | null;
  stepIndex: number | null;
  stepKind: string | null;
  receiptJson: string | null;
  createdAt: Date;
}) {
  return {
    id: receipt.id,
    transactionId: receipt.transactionId,
    amountHbar: receipt.amountHbar,
    payerAccount: receipt.payerAccount,
    recipientAccount: receipt.recipientAccount,
    memo: receipt.memo,
    stepIndex: receipt.stepIndex,
    stepKind: receipt.stepKind,
    receiptJson: receipt.receiptJson,
    createdAt: receipt.createdAt,
  };
}
