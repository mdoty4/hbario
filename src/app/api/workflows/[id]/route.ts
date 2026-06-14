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
        receipts: true,
      },
    });

    // Sort receipts in JS to avoid Prisma 7 / sqlite-adapter quirks when
    // ordering by a nullable Int column combined with other fields.
    if (workflow) {
      workflow.receipts.sort((a, b) => {
        const ai = a.stepIndex ?? -1;
        const bi = b.stepIndex ?? -1;
        if (ai !== bi) return ai - bi;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
    }

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
      stepReceipts: workflow.receipts
        .filter((r) => r.stepIndex !== null)
        .map((r) => {
          let status: "verified" | "failed" = "verified";
          try {
            const j = r.receiptJson ? JSON.parse(r.receiptJson) : null;
            if (j && j.status === "failed") status = "failed";
          } catch {
            // treat as verified
          }
          return {
            id: r.id,
            stepIndex: r.stepIndex,
            stepKind: r.stepKind,
            transactionId: r.transactionId,
            status,
            createdAt: r.createdAt,
          };
        }),
      treasuryAccount:
        process.env.HEDERA_TREASURY_ACCOUNT_ID || "0.0.1234567",
      unlockPriceHbar: 1,
    };

    return NextResponse.json({ workflow: responseWorkflow }, { status: 200 });
  } catch (error) {
    console.error("Get workflow error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        ...(process.env.NODE_ENV !== "production" && {
          detail: (error as Error)?.message,
        }),
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/workflows/:id
 *
 * Edits the amounts of an as-yet-unexecuted step inside the compiled
 * `workflowJson` of a paid/unlocked workflow. Used by the UI to let users
 * tweak HBAR amounts on `single_payment` and `bulk_payout` steps (and the
 * `initialBalanceHbar` of `bulk_account_creation`) right before sending.
 *
 * Body:
 *   {
 *     stepIndex: number,
 *     // For single_payment:
 *     amountHbar?: number,
 *     memo?: string,
 *     // For bulk_payout:
 *     recipients?: Array<{ account: string, amountHbar: number, memo?: string }>,
 *     // For bulk_account_creation:
 *     initialBalanceHbar?: number,
 *   }
 *
 * Refuses edits to steps that already have a `verified` step-receipt.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workflowId } = await params;

    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const stepIndex =
      typeof body.stepIndex === "number" ? (body.stepIndex as number) : -1;
    if (!Number.isInteger(stepIndex) || stepIndex < 0) {
      return NextResponse.json(
        { error: "stepIndex (non-negative integer) is required" },
        { status: 400 }
      );
    }

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { receipts: true },
    });
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }
    if (workflow.userId !== payload.userId) {
      return NextResponse.json(
        { error: "Forbidden: You do not have access to this workflow" },
        { status: 403 }
      );
    }
    if (
      workflow.paymentStatus !== "paid" &&
      workflow.status !== "unlocked"
    ) {
      return NextResponse.json(
        { error: "Workflow must be unlocked before editing" },
        { status: 400 }
      );
    }

    // ── Refuse if this step already has a verified receipt ─────────────
    const stepReceipts = workflow.receipts.filter(
      (r) => r.stepIndex === stepIndex
    );
    const alreadyVerified = stepReceipts.some((r) => {
      try {
        const j = r.receiptJson ? JSON.parse(r.receiptJson) : null;
        return !j || j.status !== "failed";
      } catch {
        return true;
      }
    });
    if (alreadyVerified) {
      return NextResponse.json(
        { error: "This step has already executed and cannot be edited." },
        { status: 409 }
      );
    }

    // ── Parse & mutate workflowJson ────────────────────────────────────
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(workflow.workflowJson || "{}");
    } catch {
      return NextResponse.json(
        { error: "Workflow JSON is corrupt" },
        { status: 500 }
      );
    }

    // Normalize to a steps[] array regardless of whether this is a compound
    // workflow or a legacy single-payment shape. For non-compound shapes we
    // only support editing stepIndex=0.
    const isCompound = parsed.workflowType === "compound";
    let steps: Array<Record<string, unknown>>;
    if (isCompound) {
      if (!Array.isArray(parsed.steps)) {
        return NextResponse.json(
          { error: "Workflow has no steps to edit" },
          { status: 400 }
        );
      }
      steps = parsed.steps as Array<Record<string, unknown>>;
    } else {
      return NextResponse.json(
        { error: "Only compound workflows are editable" },
        { status: 400 }
      );
    }

    if (stepIndex >= steps.length) {
      return NextResponse.json(
        { error: `stepIndex ${stepIndex} out of range (${steps.length} steps)` },
        { status: 400 }
      );
    }

    const step = { ...steps[stepIndex] };
    const kind = step.kind;

    const isPositiveNumber = (n: unknown): n is number =>
      typeof n === "number" && Number.isFinite(n) && n > 0;

    if (kind === "single_payment") {
      if (body.amountHbar !== undefined) {
        if (!isPositiveNumber(body.amountHbar)) {
          return NextResponse.json(
            { error: "amountHbar must be a positive number" },
            { status: 400 }
          );
        }
        step.amountHbar = body.amountHbar;
        // keep tinybars in sync (avoid stale value)
        step.amountTinybars = Math.round(
          (body.amountHbar as number) * 100_000_000
        );
      }
      if (typeof body.memo === "string") {
        step.memo = body.memo;
      }
    } else if (kind === "bulk_payout") {
      if (body.recipients !== undefined) {
        if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
          return NextResponse.json(
            { error: "recipients must be a non-empty array" },
            { status: 400 }
          );
        }
        const existing = Array.isArray(step.recipients)
          ? (step.recipients as Array<Record<string, unknown>>)
          : [];
        if (body.recipients.length !== existing.length) {
          return NextResponse.json(
            { error: "Recipient count cannot be changed" },
            { status: 400 }
          );
        }
        const next: Array<Record<string, unknown>> = [];
        let total = 0;
        for (let i = 0; i < body.recipients.length; i++) {
          const r = body.recipients[i] as Record<string, unknown>;
          const account =
            typeof r.account === "string" ? r.account : existing[i]?.account;
          const amountHbar = r.amountHbar;
          if (!account || typeof account !== "string") {
            return NextResponse.json(
              { error: `recipients[${i}].account is invalid` },
              { status: 400 }
            );
          }
          if (!isPositiveNumber(amountHbar)) {
            return NextResponse.json(
              { error: `recipients[${i}].amountHbar must be a positive number` },
              { status: 400 }
            );
          }
          total += amountHbar as number;
          next.push({
            account,
            amountHbar,
            amountTinybars: Math.round((amountHbar as number) * 100_000_000),
          });
        }
        step.recipients = next;
        step.totalAmountHbar = Math.round(total * 1_000_000) / 1_000_000;
        step.totalAmountTinybars = Math.round(total * 100_000_000);
      }
      if (typeof body.memo === "string") {
        step.memo = body.memo;
      }
    } else if (kind === "bulk_account_creation") {
      if (body.initialBalanceHbar !== undefined) {
        const v = body.initialBalanceHbar;
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
          return NextResponse.json(
            { error: "initialBalanceHbar must be a non-negative number" },
            { status: 400 }
          );
        }
        step.initialBalanceHbar = v;
        step.initialBalanceTinybars = Math.round(v * 100_000_000);
        const count = typeof step.count === "number" ? (step.count as number) : 0;
        step.totalFundingHbar =
          Math.round(v * count * 1_000_000) / 1_000_000;
      }
      if (typeof body.memo === "string") {
        step.memo = body.memo;
      }
    } else {
      return NextResponse.json(
        { error: `Step kind "${String(kind)}" is not editable` },
        { status: 400 }
      );
    }

    steps[stepIndex] = step;

    // Recompute compound-level totalHbar across all steps.
    let totalHbar = 0;
    for (const s of steps) {
      if (s.kind === "single_payment" && typeof s.amountHbar === "number") {
        totalHbar += s.amountHbar as number;
      } else if (
        s.kind === "bulk_payout" &&
        typeof s.totalAmountHbar === "number"
      ) {
        totalHbar += s.totalAmountHbar as number;
      } else if (
        s.kind === "bulk_account_creation" &&
        typeof s.totalFundingHbar === "number"
      ) {
        totalHbar += s.totalFundingHbar as number;
      }
    }
    parsed.steps = steps;
    parsed.totalHbar = Math.round(totalHbar * 1_000_000) / 1_000_000;

    const updated = await prisma.workflow.update({
      where: { id: workflowId },
      data: { workflowJson: JSON.stringify(parsed) },
    });

    return NextResponse.json(
      {
        ok: true,
        workflow: {
          id: updated.id,
          workflowJson: updated.workflowJson,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Patch workflow error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workflows/:id
 *
 * Permanently deletes a workflow along with its related orders, payments,
 * and receipts. Only the workflow owner may delete it.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workflowId } = await params;

    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, userId: true },
    });

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    if (workflow.userId !== payload.userId) {
      return NextResponse.json(
        { error: "Forbidden: You do not have access to this workflow" },
        { status: 403 }
      );
    }

    // Delete children first to satisfy foreign-key constraints, then the
    // workflow itself. Wrapped in a transaction so a partial failure rolls
    // back cleanly.
    await prisma.$transaction([
      prisma.receipt.deleteMany({ where: { workflowId } }),
      prisma.payment.deleteMany({ where: { workflowId } }),
      prisma.order.deleteMany({ where: { workflowId } }),
      prisma.workflow.delete({ where: { id: workflowId } }),
    ]);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Delete workflow error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
