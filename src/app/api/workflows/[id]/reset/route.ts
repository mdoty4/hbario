// ──────────────────────────────────────────────────────────────────────────────
// POST /api/workflows/:id/reset
//
// Resets a workflow's execution progress by deleting all of its step-level
// receipts (the per-step rows recorded with `stepIndex != null`). The
// workflow's compiled JSON, unlock payment, and order-level receipt are
// left untouched — only the per-step run state is cleared so the user can
// re-execute from the beginning.
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function POST(
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
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }
    if (workflow.userId !== payload.userId) {
      return NextResponse.json(
        { error: "Forbidden: You do not have access to this workflow" },
        { status: 403 }
      );
    }

    // Only clear per-step receipts; keep the unlock-payment / order-level
    // receipt (those have stepIndex == null) so the workflow stays unlocked.
    const deleted = await prisma.receipt.deleteMany({
      where: { workflowId, stepIndex: { not: null } },
    });

    return NextResponse.json(
      { ok: true, clearedReceipts: deleted.count },
      { status: 200 }
    );
  } catch (error) {
    console.error("Reset workflow error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
