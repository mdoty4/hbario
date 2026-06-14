// ──────────────────────────────────────────────────────────────────────────────
// POST /api/mcp
//
// The Hedera Payments MCP endpoint. Other agents speak Streamable HTTP MCP
// here and discover this app's tools (`list_services`, `request_workflow`,
// `create_payment_order`, `submit_payment`, `get_receipt`, `verify_transaction`).
//
// Stateless per request — we build a fresh server + transport for every call
// so this slots into a serverless Next.js route without any background state.
//
// Auth (optional): `Authorization: Bearer <key>` or `X-MCP-Api-Key: <key>`.
// Anonymous callers can still hit read-only tools like `list_services` and
// `verify_transaction`.
// ──────────────────────────────────────────────────────────────────────────────

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { resolveMcpAuth } from "@/lib/mcp/auth";
import { buildMcpServer } from "@/lib/mcp/server";

// Force Node.js runtime — the Hedera SDK and Prisma adapter aren't compatible
// with the Edge runtime.
export const runtime = "nodejs";
// Don't try to statically optimize this — it's a dynamic JSON-RPC endpoint.
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const auth = await resolveMcpAuth(request);
  const server = buildMcpServer(auth);
  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);
  return transport.handleRequest(request);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}

// CORS preflight — Claude Desktop and browser-based MCP clients send these.
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-MCP-Api-Key, mcp-session-id, mcp-protocol-version, Last-Event-ID",
      "Access-Control-Expose-Headers":
        "mcp-session-id, mcp-protocol-version",
    },
  });
}
