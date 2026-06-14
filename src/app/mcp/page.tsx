"use client";

// ──────────────────────────────────────────────────────────────────────────────
// MCP Settings Page
//
// This is the human-facing surface for the Payments MCP server we expose.
// It shows the user *their* MCP endpoint URL + a personal API key, plus a
// ready-to-paste Claude Desktop config snippet. Tap "Regenerate" to rotate
// the key.
//
// The actual MCP server lives at /api/mcp; this page just helps the user
// hand its credentials to an external agent.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";

interface KeyResponse {
  apiKey: string;
  endpoint: string;
  transport: string;
}

export default function MCPPage() {
  return (
    <ProtectedRoute>
      <McpPageInner />
    </ProtectedRoute>
  );
}

function McpPageInner() {
  const [data, setData] = useState<KeyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealKey, setRevealKey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/mcp/key", { credentials: "include" });
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as KeyResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function rotate() {
    setRotating(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp/key", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as KeyResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRotating(false);
    }
  }

  const claudeConfig = data
    ? JSON.stringify(
        {
          mcpServers: {
            "hbario-payments": {
              type: "http",
              url: data.endpoint,
              headers: {
                Authorization: `Bearer ${data.apiKey}`,
              },
            },
          },
        },
        null,
        2
      )
    : "";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          hbario Payments MCP Server
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          This page exposes <em>your</em> personal endpoint to the Payments MCP
          server built into this app. Paste these credentials into any
          MCP-compatible agent (Claude Desktop, Cline, Cursor, custom) to let
          it draft, pay, and verify Hedera workflows on your behalf via the
          Hedera Payments protocol. All real HBAR movement is signed by your
          wallet — this server never holds private keys.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !data ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : data ? (
        <div className="space-y-6">
          <EndpointCard endpoint={data.endpoint} />
          <CredentialCard
            label="Transport"
            value={data.transport}
          />
          <CredentialCard
            label="API Key"
            value={revealKey ? data.apiKey : "•".repeat(data.apiKey.length)}
            mono
            secret
            reveal={revealKey}
            onToggleReveal={() => setRevealKey((v) => !v)}
            onRegenerate={rotate}
            regenerating={rotating}
          />

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">
              Claude Desktop / Cline / Cursor — `mcp.json`
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Drop this into your MCP client's configuration. The agent will
              discover tools like <code>list_services</code>,{" "}
              <code>request_workflow</code>, <code>create_payment_order</code>,{" "}
              <code>submit_payment</code>, <code>get_receipt</code>, and{" "}
              <code>verify_transaction</code>.
            </p>
            <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-gray-900 px-3 py-2 text-xs text-gray-100">
              <code>{claudeConfig}</code>
            </pre>
            <button
              onClick={() => navigator.clipboard.writeText(claudeConfig)}
              className="mt-3 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Copy
            </button>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">
              Quick test (curl)
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Initialize an MCP session and list available tools:
            </p>
            <pre className="mt-3 max-h-60 overflow-auto rounded-md bg-gray-900 px-3 py-2 text-xs text-gray-100">
              <code>{curlExample(data.endpoint, data.apiKey)}</code>
            </pre>
          </section>
        </div>
      ) : null}
    </div>
  );
}

// Special-case the endpoint card so we can show a "local dev fallback"
// hint when the user is browsing from localhost but the configured public
// URL is something else (e.g. hbario.com). Remote agents like Claude
// Desktop running on another machine can't reach a localhost endpoint, so
// the primary copy value is always the externally-reachable one.
function EndpointCard({ endpoint }: { endpoint: string }) {
  const [localHint, setLocalHint] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const here = `${window.location.origin}/api/mcp`;
    // Only surface the hint if the page is being viewed locally AND the
    // configured public endpoint isn't already pointing here — otherwise
    // it's redundant.
    if (
      window.location.hostname === "localhost" &&
      !endpoint.startsWith(window.location.origin)
    ) {
      setLocalHint(here);
    }
  }, [endpoint]);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">MCP Endpoint</h2>
        <button
          onClick={() => navigator.clipboard.writeText(endpoint)}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          Copy
        </button>
      </div>
      <p className="mt-2 break-all rounded-md bg-gray-50 px-3 py-2 text-sm font-mono text-gray-800">
        {endpoint}
      </p>
      {localHint && (
        <p className="mt-2 text-[11px] text-gray-500">
          You&apos;re viewing this page locally. Remote MCP clients should
          use the URL above; an agent running on this same machine can also
          hit{" "}
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(localHint)}
            className="font-mono text-blue-600 hover:text-blue-500 underline"
            title="Click to copy"
          >
            {localHint}
          </button>
          .
        </p>
      )}
    </section>
  );
}

function CredentialCard(props: {
  label: string;
  value: string;
  mono?: boolean;
  secret?: boolean;
  reveal?: boolean;
  onToggleReveal?: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  const { label, value, mono, secret, reveal, onToggleReveal, onRegenerate, regenerating } = props;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">{label}</h2>
        <div className="flex gap-2">
          {secret && (
            <button
              onClick={onToggleReveal}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              {reveal ? "Hide" : "Reveal"}
            </button>
          )}
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={regenerating}
              className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-50"
            >
              {regenerating ? "Rotating…" : "Regenerate"}
            </button>
          )}
          <button
            onClick={() => navigator.clipboard.writeText(value)}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Copy
          </button>
        </div>
      </div>
      <p
        className={`mt-2 break-all rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-800 ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </p>
    </section>
  );
}

function curlExample(endpoint: string, apiKey: string): string {
  return [
    `curl -N -X POST '${endpoint}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -H 'Accept: application/json, text/event-stream' \\`,
    `  -H 'Authorization: Bearer ${apiKey}' \\`,
    `  -d '${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "curl", version: "1.0" },
      },
    })}'`,
  ].join("\n");
}
