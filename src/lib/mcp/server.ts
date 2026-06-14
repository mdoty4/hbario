// ──────────────────────────────────────────────────────────────────────────────
// Payments MCP Server
//
// Exposes this app as a Hedera Payments MCP server: a Streamable-HTTP MCP
// endpoint other agents (Claude Desktop, Cline, custom) can call to:
//
//   - discover what services we offer (`list_services`)
//   - request workflow generation in natural language (`request_workflow`)
//   - create a payment order for an unlocked workflow (`create_payment_order`)
//   - submit a paid HBAR transaction id for verification (`submit_payment`)
//   - fetch the receipt afterwards (`get_receipt`)
//   - independently verify a transaction id against this app's records
//     (`verify_transaction`)
//
// Payment flow follows the x402 / Hedera Payments pattern:
//   1. Agent calls `request_workflow` → returns workflow id + summary,
//      together with a "402 Payment Required" hint in the response body.
//   2. Agent calls `create_payment_order` → returns the full order envelope
//      (recipient treasury account, amount in HBAR, memo, network).
//   3. Agent's wallet signs and submits the HBAR transfer (out of band).
//   4. Agent calls `submit_payment` with the resulting tx id → we verify
//      it via Hedera Mirror Node and unlock the workflow.
//
// All write tools require a user-bound API key passed via
// `Authorization: Bearer ohp_mcp_…`. `list_services` is public.
// ──────────────────────────────────────────────────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { compileWorkflow } from "@/lib/workflow/compiler";
import { runWorkflowAgent } from "@/lib/agents/workflowAgent.v2";
import { verifyTransaction, getTransactionReceipt } from "@/lib/hedera/tools";
import type { ExpectedTransactionDetails } from "@/lib/hedera/types";
import type { WalletMode } from "@/lib/wallet/types";
import type { McpAuthInfo } from "./auth";
import {
  buildAiPlanningQuote,
  getQuoteTtlMs,
  pickAiTreasuryAccount,
} from "@/lib/ai/pricing";
import { getAiProviderConfig } from "@/lib/ai/providerConfig";

// ── Server factory ────────────────────────────────────────────────────────────

export function buildMcpServer(auth: McpAuthInfo): McpServer {
  const server = new McpServer(
    {
      name: "hbario-payments-mcp",
      version: "0.1.0",
    },
    {
      // Surface our human-facing model so agents can discover what we do.
      instructions:
        "This is the hbario Workflow Agent's Payments MCP server. " +
        "Use `list_services` to see what we offer, then `request_workflow` to " +
        "have the agent draft a Hedera workflow from a natural-language prompt. " +
        "Pay the resulting order in HBAR via your wallet, then call " +
        "`submit_payment` with the transaction id to unlock the workflow and " +
        "fetch a signed receipt. All real HBAR movement is signed by the user " +
        "wallet — this server never holds private keys.",
    }
  );

  // ── list_services (public) ──────────────────────────────────────────
  server.registerTool(
    "list_services",
    {
      title: "List Services",
      description:
        "Return the public service catalog this agent offers. Anonymous — no API key required.",
      inputSchema: {},
    },
    async () => {
      const services = [
        {
          service_id: "workflow_generation",
          name: "Hedera Workflow Generation",
          description:
            "Turn a natural-language request into a compiled Hedera workflow JSON, human summary, tool plan, and (after payment + approval) a signed receipt.",
          price: "dynamic (token-based USD→HBAR quote, ~$0.02 + inference cost)",
          currency: "HBAR",
          payment_required: true,
          supported_workflow_types: [
            "single_payment",
            "bulk_payout",
            "liquidity_path_analysis",
          ],
          safety_model: "human_approval_required",
        },
      ];
      return {
        content: [
          { type: "text", text: JSON.stringify({ services }, null, 2) },
        ],
        structuredContent: { services },
      };
    }
  );

  // ── request_workflow (authenticated) ────────────────────────────────
  server.registerTool(
    "request_workflow",
    {
      title: "Request Workflow",
      description:
        "Generate a draft Hedera workflow from a natural-language prompt. " +
        "Returns the workflow id, a summary, and a payment requirement (x402-style). " +
        "Requires an API key tied to a user with a bound wallet.",
      inputSchema: {
        prompt: z
          .string()
          .min(1)
          .describe("Natural-language description of what to do, e.g. 'Send 25 HBAR to 0.0.12345'."),
        network: z
          .enum(["testnet", "mainnet"])
          .optional()
          .describe("Hedera network the workflow targets. Defaults to testnet."),
      },
    },
    async ({ prompt, network: networkArg }) => {
      if (!auth.userId) {
        return errorResponse(
          "UNAUTHORIZED",
          "This tool requires a user-bound API key. Open the /mcp page in the app to copy yours."
        );
      }

      const network: WalletMode = networkArg ?? "testnet";
      let providerConfig;
      try {
        providerConfig = getAiProviderConfig();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "AI provider not configured.";
        return errorResponse("AI_NOT_CONFIGURED", msg);
      }
      const agentResult = await runWorkflowAgent(prompt, {
        network,
        providerConfig,
      });

      if (agentResult.intent === "none" || !agentResult.draft) {
        return errorResponse(
          "NO_INTENT_DETECTED",
          agentResult.assistantMessage ||
            "I couldn't detect a workflow intent in that prompt. Try something like 'Send 10 HBAR to 0.0.12345'."
        );
      }

      const compilation = compileWorkflow(agentResult.draft);
      if (compilation.status === "invalid") {
        return errorResponse(
          "INVALID_WORKFLOW",
          compilation.issues[0]?.message ?? "Workflow could not be compiled."
        );
      }

      // Build a real, dynamic USD→HBAR quote — same function the web app's
      // /api/chat/quote uses, so MCP and web pricing stay in lockstep.
      let quote;
      try {
        quote = await buildAiPlanningQuote({ message: prompt });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to build AI quote.";
        return errorResponse("QUOTE_FAILED", msg);
      }

      const workflow = await prisma.workflow.create({
        data: {
          userId: auth.userId,
          title: agentResult.draft.title,
          type: agentResult.draft.type,
          prompt: agentResult.draft.prompt ?? prompt,
          summary: agentResult.draft.summary ?? null,
          workflowJson: compilation.workflowJson
            ? JSON.stringify(compilation.workflowJson, null, 2)
            : null,
          status: "draft",
          paymentStatus: "unpaid",
        },
      });

      const result = {
        status: "402",
        payment_required: true,
        currency: "HBAR",
        amount_hbar: quote.quoteHbar,
        quote: {
          input_tokens: quote.inputTokens,
          max_output_tokens: quote.maxOutputTokens,
          inference_usd: quote.inferenceUsd,
          service_fee_usd: quote.serviceFeeUsd,
          total_usd: quote.totalUsd,
          hbar_usd_rate: quote.hbarUsdRate,
          hbar_price_source: quote.hbarPriceSource,
          slippage_buffer: quote.slippageBuffer,
        },
        workflow: {
          id: workflow.id,
          title: workflow.title,
          type: workflow.type,
          summary: workflow.summary,
          status: workflow.status,
          paymentStatus: workflow.paymentStatus,
        },
        next_step:
          "Call `create_payment_order` with this workflow_id to receive the full payment envelope.",
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  // ── create_payment_order (authenticated) ────────────────────────────
  server.registerTool(
    "create_payment_order",
    {
      title: "Create Payment Order",
      description:
        "Create an x402-style payment envelope for an existing draft workflow. " +
        "Returns the treasury account, amount, memo, and network the caller's wallet must pay to.",
      inputSchema: {
        workflow_id: z.string().min(1).describe("Workflow id returned by request_workflow."),
        network: z
          .enum(["testnet", "mainnet"])
          .optional()
          .describe("Hedera network — defaults to the user's bound network."),
      },
    },
    async ({ workflow_id, network }) => {
      if (!auth.userId) {
        return errorResponse("UNAUTHORIZED", "User-bound API key required.");
      }

      const workflow = await prisma.workflow.findUnique({
        where: { id: workflow_id },
      });
      if (!workflow) {
        return errorResponse("NOT_FOUND", `Workflow ${workflow_id} not found.`);
      }
      if (workflow.userId !== auth.userId) {
        return errorResponse(
          "FORBIDDEN",
          "You don't own this workflow. API keys are scoped per-user."
        );
      }

      const orderNetwork: WalletMode = network ?? "testnet";
      const recipient = pickAiTreasuryAccount(orderNetwork);
      if (!recipient) {
        return errorResponse(
          "TREASURY_NOT_CONFIGURED",
          "Server has no treasury account configured. Set HEDERA_AI_TREASURY_ACCOUNT_ID (or its per-network variant) in the server environment."
        );
      }

      // Re-use any existing pending order so a retried call doesn't create
      // duplicates.
      const existing = await prisma.order.findFirst({
        where: { workflowId: workflow_id, userId: auth.userId, status: "pending" },
      });

      let order;
      let quote;
      if (existing) {
        order = existing;
      } else {
        // Re-quote using the workflow's stored prompt so the order's price
        // reflects current token + HBAR/USD math (same as /api/chat/quote).
        try {
          quote = await buildAiPlanningQuote({
            message: workflow.prompt ?? workflow.title ?? "",
          });
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Failed to build AI quote.";
          return errorResponse("QUOTE_FAILED", msg);
        }

        const ttlMs = getQuoteTtlMs();
        order = await prisma.order.create({
          data: {
            userId: auth.userId,
            workflowId: workflow_id,
            amountHbar: quote.quoteHbar,
            recipientAccount: recipient,
            memo: null,
            status: "pending",
            network: orderNetwork,
            kind: "ai_planning",
            quoteUsd: quote.totalUsd,
            hbarUsdRate: quote.hbarUsdRate,
            expiresAt: new Date(Date.now() + ttlMs),
          },
        });
      }

      const memo =
        order.memo ??
        `hbario workflow unlock - Order ${order.id} - Workflow ${workflow.id}`;
      if (!existing) {
        order = await prisma.order.update({
          where: { id: order.id },
          data: { memo },
        });
      }

      await prisma.workflow.update({
        where: { id: workflow.id },
        data: { status: "awaiting_payment", paymentStatus: "awaiting_payment" },
      });

      const envelope = {
        status: "402",
        scheme: "hedera-payments-mcp",
        x402_compatible: true,
        order: {
          id: order.id,
          workflow_id: workflow.id,
          network: orderNetwork,
          currency: "HBAR",
          amount_hbar: order.amountHbar,
          recipient_account: recipient,
          memo: order.memo,
          quote_usd: order.quoteUsd,
          hbar_usd_rate: order.hbarUsdRate,
          expires_at: order.expiresAt?.toISOString() ?? null,
        },
        next_step:
          "Sign and submit an HBAR transfer of the exact amount to the recipient with the given memo. " +
          "Then call `submit_payment` with the resulting transaction id.",
      };

      return {
        content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
        structuredContent: envelope,
      };
    }
  );

  // ── submit_payment (authenticated) ──────────────────────────────────
  server.registerTool(
    "submit_payment",
    {
      title: "Submit Payment",
      description:
        "Submit a Hedera transaction id that paid an order. The server verifies it on the Hedera Mirror Node, unlocks the workflow, and creates a receipt.",
      inputSchema: {
        order_id: z.string().min(1),
        transaction_id: z
          .string()
          .min(1)
          .describe("Hedera transaction id, e.g. '0.0.1234@1700000000.000000000'."),
        payer_account: z
          .string()
          .optional()
          .describe("Hedera account id that paid. Defaults to the user's bound wallet."),
      },
    },
    async ({ order_id, transaction_id, payer_account }) => {
      if (!auth.userId) {
        return errorResponse("UNAUTHORIZED", "User-bound API key required.");
      }

      const order = await prisma.order.findUnique({
        where: { id: order_id },
        include: {
          workflow: true,
          payments: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
      if (!order) {
        return errorResponse("NOT_FOUND", `Order ${order_id} not found.`);
      }
      if (order.userId !== auth.userId) {
        return errorResponse("FORBIDDEN", "You don't own this order.");
      }
      if (order.status === "paid") {
        return errorResponse("ALREADY_PAID", "This order has already been verified.");
      }

      const effectivePayer = payer_account;
      if (!effectivePayer) {
        return errorResponse(
          "PAYER_REQUIRED",
          "payer_account is required so we can verify the transaction sender on the Hedera Mirror Node."
        );
      }

      const network: WalletMode =
        (order.network as WalletMode | undefined) === "mainnet"
          ? "mainnet"
          : "testnet";

      const receipt = await getTransactionReceipt(transaction_id, network);
      if (receipt.status !== "SUCCESS") {
        return errorResponse(
          "TX_NOT_SUCCEEDED",
          receipt.status === "NOT_FOUND"
            ? "Transaction has not been indexed by the Hedera Mirror Node yet. Try again in a few seconds."
            : `Transaction did not succeed (status=${receipt.status}).`
        );
      }

      const expected: ExpectedTransactionDetails = {
        recipient: order.recipientAccount,
        amountHbar: order.amountHbar,
        memo: order.memo ?? undefined,
        sender: effectivePayer,
      };

      const verification = await verifyTransaction(
        transaction_id,
        expected,
        network
      );
      if (!verification.verified) {
        return errorResponse(
          "VERIFICATION_FAILED",
          verification.error ?? "Mirror node verification failed."
        );
      }

      const updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: { status: "paid", transactionId: transaction_id },
      });

      const existingPayment = order.payments[0];
      const payment = existingPayment
        ? await prisma.payment.update({
            where: { id: existingPayment.id },
            data: {
              status: "paid",
              transactionId: transaction_id,
              verifiedAt: new Date(),
              payerAccount: effectivePayer,
            },
          })
        : await prisma.payment.create({
            data: {
              userId: auth.userId,
              workflowId: order.workflowId,
              orderId: order.id,
              payerAccount: effectivePayer,
              recipientAccount: order.recipientAccount,
              amountHbar: order.amountHbar,
              memo: order.memo,
              transactionId: transaction_id,
              status: "paid",
              verifiedAt: new Date(),
            },
          });

      const updatedWorkflow = await prisma.workflow.update({
        where: { id: order.workflowId },
        data: { status: "unlocked", paymentStatus: "paid" },
      });

      const persistedReceipt = await prisma.receipt.create({
        data: {
          userId: auth.userId,
          workflowId: order.workflowId,
          orderId: order.id,
          paymentId: payment.id,
          transactionId: transaction_id,
          amountHbar: order.amountHbar,
          payerAccount: effectivePayer,
          recipientAccount: order.recipientAccount,
          memo: order.memo || "",
          workflowType: updatedWorkflow.type,
          receiptJson: JSON.stringify(
            {
              transactionId: transaction_id,
              network,
              status: receipt.status,
              consensusTimestamp: receipt.consensusTimestamp,
              verified: true,
              verificationDetails: verification.details,
            },
            null,
            2
          ),
        },
      });

      const result = {
        unlocked: true,
        order: {
          id: updatedOrder.id,
          status: updatedOrder.status,
          transaction_id: updatedOrder.transactionId,
        },
        workflow: {
          id: updatedWorkflow.id,
          status: updatedWorkflow.status,
          payment_status: updatedWorkflow.paymentStatus,
        },
        receipt: {
          id: persistedReceipt.id,
          transaction_id: persistedReceipt.transactionId,
          amount_hbar: persistedReceipt.amountHbar,
          created_at: persistedReceipt.createdAt.toISOString(),
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  // ── get_receipt (authenticated) ─────────────────────────────────────
  server.registerTool(
    "get_receipt",
    {
      title: "Get Receipt",
      description: "Fetch a previously generated receipt by id.",
      inputSchema: {
        receipt_id: z.string().min(1),
      },
    },
    async ({ receipt_id }) => {
      if (!auth.userId) {
        return errorResponse("UNAUTHORIZED", "User-bound API key required.");
      }
      const receipt = await prisma.receipt.findUnique({
        where: { id: receipt_id },
      });
      if (!receipt) {
        return errorResponse("NOT_FOUND", `Receipt ${receipt_id} not found.`);
      }
      if (receipt.userId !== auth.userId) {
        return errorResponse("FORBIDDEN", "You don't own this receipt.");
      }
      const payload = {
        id: receipt.id,
        workflow_id: receipt.workflowId,
        order_id: receipt.orderId,
        transaction_id: receipt.transactionId,
        amount_hbar: receipt.amountHbar,
        payer_account: receipt.payerAccount,
        recipient_account: receipt.recipientAccount,
        memo: receipt.memo,
        workflow_type: receipt.workflowType,
        created_at: receipt.createdAt.toISOString(),
        receipt_json: receipt.receiptJson,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    }
  );

  // ── verify_transaction (public read) ────────────────────────────────
  // Lets *anyone* (e.g. an auditor or another agent) independently verify
  // a transaction id against this agent's expectations. No DB write.
  server.registerTool(
    "verify_transaction",
    {
      title: "Verify Transaction",
      description:
        "Independently verify a Hedera transaction id against expected recipient/amount/memo via the Hedera Mirror Node. Read-only — no API key required.",
      inputSchema: {
        transaction_id: z.string().min(1),
        network: z.enum(["testnet", "mainnet"]).default("testnet"),
        recipient: z.string().min(1),
        amount_hbar: z.number().positive(),
        memo: z.string().optional(),
        payer_account: z.string().optional(),
      },
    },
    async ({ transaction_id, network, recipient, amount_hbar, memo, payer_account }) => {
      const result = await verifyTransaction(
        transaction_id,
        {
          recipient,
          amountHbar: amount_hbar,
          memo,
          sender: payer_account,
        },
        network
      );
      const payload = {
        verified: result.verified,
        transaction_id: result.transactionId,
        network: result.network,
        details: result.details,
        error: result.error,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    }
  );

  return server;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function errorResponse(code: string, message: string) {
  const body = { error: { code, message } };
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }],
    structuredContent: body,
  };
}
