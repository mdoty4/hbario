import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { compileWorkflow } from "@/lib/workflow/compiler";

/**
 * Build an AgentDraft from the API request body.
 * Normalizes incoming data into the format expected by the compiler.
 */
function buildDraft(body: Record<string, unknown>): Parameters<typeof compileWorkflow>[0] {
  const { title, type, prompt, summary, workflowJson, data } = body;

  // If workflowJson is already provided as a string, parse it as data
  let parsedData: Record<string, unknown> = {};
  if (typeof workflowJson === "string" && workflowJson.trim().length > 0) {
    try {
      parsedData = JSON.parse(workflowJson);
    } catch {
      // If parsing fails, treat workflowJson as raw data field
      parsedData = { rawWorkflowJson: workflowJson };
    }
  }

  // Merge with explicit data field if provided
  if (data && typeof data === "object" && !Array.isArray(data)) {
    parsedData = { ...parsedData, ...data };
  }

  return {
    title: typeof title === "string" ? title : "",
    type: typeof type === "string" ? type : "",
    prompt: typeof prompt === "string" ? prompt : undefined,
    summary: typeof summary === "string" ? summary : undefined,
    data: parsedData,
  };
}

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
    const { title, type, prompt, summary } = body as {
      title?: string;
      type?: string;
      prompt?: string;
      summary?: string;
    };

    if (!title || !type) {
      return NextResponse.json(
        { error: "Title and type are required" },
        { status: 400 }
      );
    }

    // ── Compile the draft through the workflow compiler ──────────────────

    const draft = buildDraft(body);
    const compilation = compileWorkflow(draft);

    // ── Handle invalid drafts ────────────────────────────────────────────

    if (compilation.status === "invalid") {
      return NextResponse.json(
        {
          error: "Draft compilation failed",
          issues: compilation.issues,
          status: "invalid",
        },
        { status: 422 }
      );
    }

    // ── Handle incomplete drafts ─────────────────────────────────────────

    const isIncomplete = compilation.status === "incomplete";

    // ── Serialize workflow JSON ──────────────────────────────────────────

    const serializedWorkflowJson = compilation.workflowJson
      ? JSON.stringify(compilation.workflowJson, null, 2)
      : null;

    // ── Create the workflow in the database ──────────────────────────────

    const workflow = await prisma.workflow.create({
      data: {
        userId: payload.userId,
        title,
        type,
        prompt: prompt || null,
        summary: summary || null,
        workflowJson: serializedWorkflowJson,
        status: isIncomplete ? "draft" : "draft",
        paymentStatus: "unpaid",
      },
    });

    return NextResponse.json(
      {
        message: isIncomplete
          ? "Workflow saved as incomplete draft — review and fix issues before executing."
          : "Workflow saved successfully",
        workflow,
        compilationStatus: compilation.status,
        issues: compilation.issues,
        riskNotes: compilation.riskNotes,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Save workflow error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
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

    // Fetch user's workflows
    const workflows = await prisma.workflow.findMany({
      where: { userId: payload.userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ workflows }, { status: 200 });
  } catch (error) {
    console.error("Get workflows error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
