import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // Get token from cookie
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Verify token
    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { message } = body as { message: string };

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Mock workflow generation based on the user's message
    const workflowDraft = generateMockWorkflow(message);

    // Simulate some processing delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    return NextResponse.json(
      {
        message: workflowDraft.assistantMessage,
        workflow: workflowDraft.workflow,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Chat workflow error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

interface MockWorkflow {
  assistantMessage: string;
  workflow: {
    title: string;
    type: string;
    summary: string;
    recipients: { account: string; amount: number }[];
  };
}

function generateMockWorkflow(message: string): MockWorkflow {
  const lower = message.toLowerCase();

  // Detect multi-recipient split
  if (lower.includes("split") || lower.includes("each") || lower.includes("between")) {
    const amounts = message.match(/(\d[\d,]*)\s*HBAR/gi);
    const total = amounts?.[0]?.replace(/,/g, "") || "1000";
    const count = lower.includes("five") ? 5 : lower.includes("each") ? 5 : 2;

    return {
      assistantMessage: `I've created a workflow to split ${total} HBAR between ${count} recipients. Each recipient will receive ${Math.floor(parseFloat(total) / count)} HBAR. Review the draft on the right and save it when you're ready.`,
      workflow: {
        title: `Split ${total} HBAR`,
        type: "batch-transfer",
        summary: `Split ${total} HBAR between ${count} recipients`,
        recipients: Array.from({ length: count }, (_, i) => ({
          account: `0.0.${10000 + i}`,
          amount: Math.floor(parseFloat(total) / count),
        })),
      },
    };
  }

  // Detect liquidity path analysis
  if (lower.includes("liquidity") || lower.includes("path analysis")) {
    return {
      assistantMessage: "I've created a liquidity path analysis workflow from SAUCE to DOVU. This will analyze the best trading routes on Hedera. Review the draft on the right and save it when you're ready.",
      workflow: {
        title: "Liquidity Path Analysis: SAUCE → DOVU",
        type: "liquidity-analysis",
        summary: "Analyze the best liquidity path from SAUCE to DOVU on Hedera",
        recipients: [],
      },
    };
  }

  // Detect single transfer
  if (lower.includes("send") || lower.includes("pay") || lower.includes("transfer")) {
    const amountMatch = message.match(/(\d[\d,]*)\s*HBAR/i);
    const accountMatch = message.match(/0\.0\.(\d+)/);
    const amount = amountMatch?.[0]?.replace(/,/g, "") || "25";
    const account = accountMatch ? `0.0.${accountMatch[1]}` : "0.0.12345";

    return {
      assistantMessage: `I've created a workflow to send ${amount} HBAR to ${account}. Review the draft on the right and save it when you're ready.`,
      workflow: {
        title: `Send ${amount} HBAR to ${account}`,
        type: "transfer",
        summary: `Transfer ${amount} HBAR to account ${account}`,
        recipients: [{ account, amount: parseFloat(amount) }],
      },
    };
  }

  // Default generic workflow
  return {
    assistantMessage: "I've created a workflow draft based on your request. Review the draft on the right and save it when you're ready. You can refine the details before saving.",
    workflow: {
      title: "Custom Workflow",
      type: "custom",
      summary: message.slice(0, 120),
      recipients: [],
    },
  };
}
