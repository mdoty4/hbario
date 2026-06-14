import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * PUT /api/projects/:id
 *
 * Updates a single project's configuration overrides.
 * Accepts JSON body with partial/nullable override fields:
 *   - name (String)
 *   - provider (String | null)
 *   - apiBase (String | null)
 *   - apiKey (String | null)
 *   - model (String | null)
 *   - maxTokens (Int | null)
 *
 * Explicit null values clear overrides (project inherits from AppConfig).
 * Never echoes apiKey back to the client for security.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // ── Validate project exists ─────────────────────────────────────
    const existing = await prisma.project.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // ── Parse request body ──────────────────────────────────────────
    const body = await request.json();

    // ── Update overrides ────────────────────────────────────────────
    // body contains partial/nullable override fields
    const updated = await prisma.project.update({
      where: { id },
      data: body,
    });

    // Destructure to exclude apiKey from the response for security
    const { apiKey, ...safeProject } = updated;
    void apiKey; // apiKey intentionally excluded from response for security

    return NextResponse.json(
      { message: "Project updated successfully", project: safeProject },
      { status: 200 }
    );
  } catch (error) {
    console.error("Update project error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
