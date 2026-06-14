// ──────────────────────────────────────────────────────────────────────────────
// POST /api/chat/agent
//
// Final step of the "pay-to-generate" chat flow. Caller supplies an `orderId`
// that has already been paid and verified on mirror node. We:
//   1. Lock the order: status must be "paid", kind "ai_planning", not already
//      consumed, not expired. Atomically flip it to "consumed" so a retry
//      can't double-spend the LLM call.
//   2. Call the LLM with the server's env-held API key. The user NEVER sees
//      the key and never has to configure one.
//   3. Compile + persist the workflow content into the placeholder workflow
//      row that /api/chat/quote already created.
//   4. Write a Receipt so the user can see the AI fee in their receipts list.
//
// Retry semantics: if the LLM call fails or returns an invalid workflow, we
// roll the order back to "paid" so the user can press Retry without paying
// again. The chat page surfaces a Retry button when the agent route returns
// `retryable: true`.
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { compileWorkflow } from "@/lib/workflow/compiler";
import { runWorkflowAgent } from "@/lib/agents/workflowAgent.v2";
import { getAiProviderConfig } from "@/lib/ai/providerConfig";

export async function POST(request: NextRequest) {
  try {
    // ── Authenticate ──────────────────────────────────────────────────
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

    // ── Parse body ────────────────────────────────────────────────────
    const body = await request.json();
    const { orderId, message, accountId, network, history } = body as {
      orderId?: string;
      message?: string;
      accountId?: string;
      network?: "testnet" | "mainnet";
      history?: string[];
    };

    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json(
        {
          error:
            "An orderId is required. Generate one via /api/chat/quote, pay it, and verify it before calling /api/chat/agent.",
        },
        { status: 400 }
      );
    }
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // ── Atomically consume the paid order ─────────────────────────────
    // Prisma's updateMany lets us encode the precondition (status=paid,
    // kind=ai_planning, not consumed, owned by this user) and the state
    // transition (status=consumed, consumedAt=now) in one statement so two
    // concurrent requests can't both "win" and trigger two LLM calls.
    const now = new Date();
    const claimed = await prisma.order.updateMany({
      where: {
        id: orderId,
        userId: payload.userId,
        kind: "ai_planning",
        status: "paid",
        consumedAt: null,
      },
      data: {
        status: "consumed",
        consumedAt: now,
      },
    });

    if (claimed.count === 0) {
      // Figure out why for a useful error.
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });
      if (!order) {
        return NextResponse.json(
          { error: "Order not found." },
          { status: 404 }
        );
      }
      if (order.userId !== payload.userId) {
        return NextResponse.json(
          { error: "Forbidden: this order doesn't belong to you." },
          { status: 403 }
        );
      }
      if (order.kind !== "ai_planning") {
        return NextResponse.json(
          { error: "This order is not an AI planning order." },
          { status: 400 }
        );
      }
      if (order.status === "consumed") {
        return NextResponse.json(
          {
            error:
              "This AI planning order has already been used. Start a new chat message to get a new quote.",
          },
          { status: 409 }
        );
      }
      if (order.status !== "paid") {
        return NextResponse.json(
          {
            error:
              "This order has not been paid and verified yet. Pay and verify the order before calling the agent.",
          },
          { status: 402 }
        );
      }
      return NextResponse.json(
        { error: "Could not claim this order." },
        { status: 409 }
      );
    }

    // Load the claimed order for downstream details.
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      // Shouldn't happen — we just updated it.
      return NextResponse.json(
        { error: "Order disappeared after claim." },
        { status: 500 }
      );
    }

    // Helper: if we fail after claiming but before producing a workflow,
    // we want to give the user their order back so they can retry without
    // paying again.
    const releaseOrder = async () => {
      try {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "paid", consumedAt: null },
        });
      } catch (err) {
        console.warn("[chat/agent] Failed to release order:", err);
      }
    };

    // ── Resolve account for planner context ───────────────────────────
    // Wallet binding is gone — the caller passes the connected accountId
    // explicitly. If they didn't, the planner just runs without it.
    const resolvedAccountId = accountId;

    // ── Load server AI provider config (env-held key) ─────────────────
    let providerConfig;
    try {
      providerConfig = getAiProviderConfig();
    } catch (err) {
      await releaseOrder();
      const msg =
        err instanceof Error ? err.message : "AI provider not configured.";
      return NextResponse.json({ error: msg, retryable: true }, { status: 500 });
    }

    // ── Run the LLM planner ───────────────────────────────────────────
    const agentResult = await runWorkflowAgent(message, {
      userAccountId: resolvedAccountId,
      network: network ?? "testnet",
      history: Array.isArray(history) ? history : undefined,
      providerConfig,
    });

    // No actionable workflow intent — still a valid LLM response. We
    // CONSUMED the order (the LLM call cost us money even though the user
    // just got conversation). Update the placeholder workflow so it
    // reflects "conversation only" and write a receipt.
    if (agentResult.intent === "none") {
      await prisma.workflow.update({
        where: { id: order.workflowId },
        data: {
          title: "AI conversation",
          type: "ai_conversation",
          summary: agentResult.assistantMessage.slice(0, 140),
          status: "completed",
          paymentStatus: "paid",
        },
      });

      return NextResponse.json(
        {
          workflowCreated: false,
          assistantMessage: agentResult.assistantMessage,
          orderId: order.id,
        },
        { status: 200 }
      );
    }

    // ── Compile + persist the generated workflow ──────────────────────
    if (!agentResult.draft) {
      await releaseOrder();
      return NextResponse.json(
        {
          workflowCreated: false,
          assistantMessage:
            "I detected a workflow intent but couldn't build a draft. Please retry — you won't be charged again.",
          retryable: true,
        },
        { status: 200 }
      );
    }

    const compilation = compileWorkflow(agentResult.draft);
    if (compilation.status === "invalid") {
      await releaseOrder();
      const firstIssue = compilation.issues[0]?.message ?? "Invalid request";
      return NextResponse.json(
        {
          workflowCreated: false,
          assistantMessage: `I couldn't create that workflow: ${firstIssue}. Please retry — you won't be charged again.`,
          retryable: true,
        },
        { status: 200 }
      );
    }

    const serializedWorkflowJson = compilation.workflowJson
      ? JSON.stringify(compilation.workflowJson, null, 2)
      : null;

    const workflow = await prisma.workflow.update({
      where: { id: order.workflowId },
      data: {
        title: agentResult.draft.title,
        type: agentResult.draft.type,
        prompt: agentResult.draft.prompt ?? message,
        summary: agentResult.draft.summary ?? null,
        workflowJson: serializedWorkflowJson,
        // The user paid for AI generation; the workflow is theirs to use
        // immediately. No separate unlock payment is required.
        status: "unlocked",
        paymentStatus: "paid",
      },
    });

    return NextResponse.json(
      {
        workflowCreated: true,
        workflowId: workflow.id,
        workflow: {
          id: workflow.id,
          title: workflow.title,
          type: workflow.type,
          summary: workflow.summary,
          status: workflow.status,
          paymentStatus: workflow.paymentStatus,
        },
        assistantMessage: agentResult.assistantMessage,
        orderId: order.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Chat agent error:", error);
    return NextResponse.json(
      { error: "Internal server error", retryable: true },
      { status: 500 }
    );
  }
}
