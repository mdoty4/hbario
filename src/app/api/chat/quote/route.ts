// ──────────────────────────────────────────────────────────────────────────────
// POST /api/chat/quote
//
// First step of the "pay-to-generate" chat flow:
//   1. (this route)      Quote a price in HBAR for the LLM planning call.
//   2. wallet pays       User signs an HBAR transfer matching the order.
//   3. /api/orders/verify  Mirror node confirms; order flips to "paid".
//   4. /api/chat/agent   Atomically consumes the paid order, runs the LLM,
//                        fills in the workflow with the generated content.
//
// The order needs a workflowId because the Prisma schema enforces it as a
// foreign key. We create a placeholder workflow at quote time with empty
// content; step 4 fills it in. If the user abandons the quote before paying,
// the placeholder is left in `draft` / `unpaid` and can be garbage-collected.
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import {
  buildAiPlanningQuote,
  getQuoteTtlMs,
  pickAiTreasuryAccount,
} from "@/lib/ai/pricing";

type Network = "testnet" | "mainnet";

function parseNetwork(value: unknown): Network {
  return value === "mainnet" ? "mainnet" : "testnet";
}

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
    const body = await request.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message : "";
    const history = Array.isArray(body?.history)
      ? (body.history as unknown[]).filter(
          (h): h is string => typeof h === "string"
        )
      : undefined;
    const payerAccount =
      typeof body?.payerAccount === "string" && body.payerAccount.trim()
        ? body.payerAccount.trim()
        : undefined;
    const network: Network = parseNetwork(body?.network);

    if (!message.trim()) {
      return NextResponse.json(
        { error: "Message is required to build a quote." },
        { status: 400 }
      );
    }

    // Wallet is connected ephemerally at chat time via WalletConnect —
    // there's no server-side binding to enforce here. `payerAccount` is
    // captured for later mirror-node verification.
    void payerAccount;

    // ── Treasury sanity check ─────────────────────────────────────────
    const recipientAccount = pickAiTreasuryAccount(network);
    if (!recipientAccount) {
      return NextResponse.json(
        {
          error:
            "AI treasury account is not configured. Set HEDERA_AI_TREASURY_ACCOUNT_ID (or the per-network variant) in the server environment.",
        },
        { status: 500 }
      );
    }

    // ── Build the quote ───────────────────────────────────────────────
    let breakdown;
    try {
      breakdown = await buildAiPlanningQuote({ message, history });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to build AI quote.";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // ── Placeholder workflow ──────────────────────────────────────────
    // We create a workflow row up-front so the Order FK is satisfied. The
    // /api/chat/agent route will overwrite `title`, `summary`, and
    // `workflowJson` when the LLM call succeeds. The user's chat prompt is
    // stored on the row so we can recover it if the consume step needs to
    // be retried.
    const ttlMs = getQuoteTtlMs();
    const expiresAt = new Date(Date.now() + ttlMs);

    const workflow = await prisma.workflow.create({
      data: {
        userId: payload.userId,
        title: "(Pending generation)",
        type: "ai_planning_pending",
        prompt: message,
        summary: null,
        workflowJson: null,
        status: "draft",
        paymentStatus: "awaiting_payment",
      },
    });

    // ── Order ─────────────────────────────────────────────────────────
    const memoSeed = `hbario AI planning fee - Workflow ${workflow.id}`;
    const order = await prisma.order.create({
      data: {
        userId: payload.userId,
        workflowId: workflow.id,
        amountHbar: breakdown.quoteHbar,
        recipientAccount,
        memo: null, // set below once we know the order ID
        status: "pending",
        network,
        kind: "ai_planning",
        quoteUsd: breakdown.totalUsd,
        hbarUsdRate: breakdown.hbarUsdRate,
        expiresAt,
      },
    });

    // The memo includes the order ID so the verifier can disambiguate when
    // a user has multiple in-flight orders.
    const memo = `${memoSeed} - Order ${order.id}`;
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: { memo },
    });

    return NextResponse.json(
      {
        order: {
          id: updatedOrder.id,
          kind: updatedOrder.kind,
          amountHbar: updatedOrder.amountHbar,
          recipientAccount: updatedOrder.recipientAccount,
          memo: updatedOrder.memo,
          network: updatedOrder.network,
          expiresAt: updatedOrder.expiresAt,
        },
        workflowId: workflow.id,
        quote: {
          inputTokens: breakdown.inputTokens,
          maxOutputTokens: breakdown.maxOutputTokens,
          inferenceUsd: breakdown.inferenceUsd,
          serviceFeeUsd: breakdown.serviceFeeUsd,
          totalUsd: breakdown.totalUsd,
          hbarUsdRate: breakdown.hbarUsdRate,
          hbarPriceSource: breakdown.hbarPriceSource,
          slippageBuffer: breakdown.slippageBuffer,
          quoteHbar: breakdown.quoteHbar,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    // Surface the real error message to the browser so the modal can show
    // something more useful than "Internal Server Error". The dev server
    // terminal still gets the full stack via console.error.
    console.error("AI quote error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

