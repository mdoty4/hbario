import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/projects
 *
 * Returns all projects with their configuration overrides.
 * Null override fields (provider, apiBase, apiKey, model, maxTokens)
 * indicate the project is inheriting from the global AppConfig.
 * Public — no authentication required.
 */
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(projects, { status: 200 });
  } catch (error) {
    console.error("Get projects error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
