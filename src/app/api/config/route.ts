import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/config
 *
 * Returns the global application configuration.
 * On first run (no record exists), creates a default config record.
 * Public — no authentication required.
 */
export async function GET() {
  try {
    const config = await prisma.appConfig.findUnique({
      where: { id: "global" },
    });

    if (!config) {
      // First run — create a default configuration record
      const defaultConfig = await prisma.appConfig.create({
        data: {
          id: "global",
          provider: "custom",
          apiBase: "",
          apiKey: "",
          model: "",
        },
      });
      return NextResponse.json(defaultConfig);
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error("Get config error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/config
 *
 * Upserts the global application configuration.
 * Accepts JSON body with config fields (provider, apiBase, apiKey, model, maxTokens).
 * Never echoes apiKey back to the client for security.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const config = await prisma.appConfig.upsert({
      where: { id: "global" },
      create: { id: "global", ...body },
      update: body,
    });

    // Destructure to exclude apiKey from the response
    const { apiKey, ...safeConfig } = config;
    void apiKey; // apiKey intentionally excluded from response for security

    return NextResponse.json(
      { message: "Configuration saved successfully", config: safeConfig },
      { status: 200 }
    );
  } catch (error) {
    console.error("Save config error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
