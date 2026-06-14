// ──────────────────────────────────────────────────────────────────────────────
// MCP Auth
//
// Per-user API key auth for the Payments MCP server. External agents
// (Claude Desktop, Cline, custom) call our MCP endpoint over HTTPS and pass
// `Authorization: Bearer <key>`. We look up the user by key and pin all
// subsequent tool calls in that session to that user's identity.
//
// Anonymous requests are allowed for read-only tools like `list_services`.
// ──────────────────────────────────────────────────────────────────────────────

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export interface McpAuthInfo {
  /** Internal user id. `undefined` for anonymous (read-only) calls. */
  userId?: string;
  /** Email is handy for logging. */
  email?: string;
  /** The raw API key the caller presented (so tools can echo it back if needed). */
  apiKey?: string;
}

/**
 * Extract `Authorization: Bearer <key>` (or `X-MCP-Api-Key: <key>`) from a
 * Request and resolve it to a user. Returns an empty auth info object for
 * anonymous calls.
 */
export async function resolveMcpAuth(request: Request): Promise<McpAuthInfo> {
  const apiKey = extractApiKey(request);
  if (!apiKey) return {};

  const user = await prisma.user.findUnique({
    where: { mcpApiKey: apiKey },
  });
  if (!user) return {};

  return {
    userId: user.id,
    email: user.email,
    apiKey,
  };
}

function extractApiKey(request: Request): string | null {
  const headers = request.headers;
  const auth = headers.get("authorization") || headers.get("Authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(\S+)$/i);
    if (m) return m[1];
  }
  return (
    headers.get("x-mcp-api-key") ||
    headers.get("X-MCP-Api-Key") ||
    null
  );
}

/**
 * Generate a fresh API key for a user and persist it. Idempotent: if the
 * user already has a key, returns the existing one — callers should pass
 * `force: true` to rotate.
 */
export async function getOrCreateApiKey(
  userId: string,
  opts: { force?: boolean } = {}
): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { mcpApiKey: true },
  });
  if (existing?.mcpApiKey && !opts.force) {
    return existing.mcpApiKey;
  }
  const key = generateApiKey();
  await prisma.user.update({
    where: { id: userId },
    data: { mcpApiKey: key },
  });
  return key;
}

/**
 * Generate a random, URL-safe API key prefixed so we can spot it in logs.
 */
export function generateApiKey(): string {
  const bytes = randomBytes(24);
  return `ohp_mcp_${bytes.toString("base64url")}`;
}
