// ──────────────────────────────────────────────────────────────────────────────
// MCP Key endpoints
//
// GET  /api/mcp/key       — return the logged-in user's existing MCP API key,
//                           creating one lazily the first time it's requested.
// POST /api/mcp/key       — rotate the key. The old one stops working
//                           immediately. Used by the "Regenerate" button on
//                           the /mcp UI.
//
// These are JSON endpoints behind the same cookie auth as the rest of the app
// — *not* the MCP protocol itself. The key returned here is what external
// agents paste into their `Authorization: Bearer …` header to call /api/mcp.
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getOrCreateApiKey } from "@/lib/mcp/auth";

function getBaseUrl(request: NextRequest): string {
  return (
    process.env.MCP_PUBLIC_BASE_URL ||
    new URL(request.url).origin
  );
}

async function authedUserId(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get("token")?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  return payload?.userId ?? null;
}

export async function GET(request: NextRequest) {
  const userId = await authedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apiKey = await getOrCreateApiKey(userId);
  return NextResponse.json({
    apiKey,
    endpoint: `${getBaseUrl(request)}/api/mcp`,
    transport: "streamable-http",
  });
}

export async function POST(request: NextRequest) {
  const userId = await authedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apiKey = await getOrCreateApiKey(userId, { force: true });
  return NextResponse.json({
    apiKey,
    endpoint: `${getBaseUrl(request)}/api/mcp`,
    transport: "streamable-http",
    rotated: true,
  });
}
