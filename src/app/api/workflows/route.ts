import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// NOTE: Manual workflow creation via POST has been removed. The web app
// only creates workflows through the AI chat flow (`/api/chat/quote` +
// `/api/chat/agent`), which charges once for AI generation and produces
// an already-unlocked workflow. External agents create workflows through
// the MCP server (`request_workflow`). This file only exposes GET now.

export async function GET(request: NextRequest) {
  try {
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
