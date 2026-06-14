"use client";

import { useState } from "react";

type TransportType = "stdio" | "sse" | "http";

interface MCPSettingsProps {
  onSave?: (config: MCPConfig) => void;
}

interface MCPConfig {
  enabled: boolean;
  serverUrl: string;
  transport: TransportType;
  apiKey: string;
  timeout: string;
  headers: string;
}

export default function MCPSettings({ onSave }: MCPSettingsProps) {
  const [enabled, setEnabled] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [transport, setTransport] = useState<TransportType>("http");
  const [apiKey, setApiKey] = useState("");
  const [timeout, setTimeout] = useState("30");
  const [headers, setHeaders] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleTestConnection = async () => {
    if (!serverUrl) {
      setError("Please enter a server URL to test the connection.");
      return;
    }
    setTesting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/mcp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl, transport, apiKey }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuccess(data.message || "Connection successful!");
      } else {
        const data = await res.json();
        throw new Error(data.error || "Connection failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to test connection");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const config: MCPConfig = {
      enabled,
      serverUrl,
      transport,
      apiKey,
      timeout,
      headers,
    };

    try {
      const res = await fetch("/api/mcp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save configuration");
      }

      setSuccess("MCP settings saved successfully.");
      onSave?.(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const inputClasses =
    "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed";

  const selectClasses =
    "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed";

  const transportOptions: { value: TransportType; label: string; description: string }[] = [
    { value: "stdio", label: "stdio", description: "Standard input/output (local processes)" },
    { value: "sse", label: "SSE", description: "Server-Sent Events (real-time streaming)" },
    { value: "http", label: "HTTP", description: "HTTP JSON-RPC (remote servers)" },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        MCP Server Configuration
      </h2>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 p-3">
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      <div className="space-y-4">
        {/* Enable Toggle */}
        <div className="flex items-center justify-between rounded-md border border-gray-200 p-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Enable MCP Server</p>
            <p className="text-xs text-gray-500 mt-1">
              Connect to a Model Context Protocol server for tool execution.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              enabled ? "bg-blue-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Transport Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Transport Type
          </label>
          <select
            value={transport}
            onChange={(e) => setTransport(e.target.value as TransportType)}
            disabled={!enabled}
            className={selectClasses}
          >
            {transportOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} — {opt.description}
              </option>
            ))}
          </select>
        </div>

        {/* Server URL */}
        <div>
          <label
            htmlFor="mcp-server-url"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Server URL
          </label>
          <input
            id="mcp-server-url"
            type="url"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            disabled={!enabled}
            placeholder="https://mcp-server.example.com"
            className={inputClasses}
          />
          <p className="mt-1 text-xs text-gray-500">
            The URL of your MCP server endpoint.
          </p>
        </div>

        {/* API Key */}
        <div>
          <label
            htmlFor="mcp-api-key"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            API Key
          </label>
          <input
            id="mcp-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={!enabled}
            placeholder="mcp-..."
            className={inputClasses}
          />
          <p className="mt-1 text-xs text-gray-500">
            Authentication key for the MCP server. Stored securely.
          </p>
        </div>

        {/* Timeout */}
        <div>
          <label
            htmlFor="mcp-timeout"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Request Timeout (seconds)
          </label>
          <input
            id="mcp-timeout"
            type="number"
            min="1"
            max="300"
            value={timeout}
            onChange={(e) => setTimeout(e.target.value)}
            disabled={!enabled}
            className={inputClasses}
          />
          <p className="mt-1 text-xs text-gray-500">
            Maximum time to wait for MCP server responses.
          </p>
        </div>

        {/* Custom Headers */}
        <div>
          <label
            htmlFor="mcp-headers"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Custom Headers (JSON)
          </label>
          <textarea
            id="mcp-headers"
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
            disabled={!enabled}
            rows={3}
            placeholder='{"X-Custom-Header": "value"}'
            className={`${inputClasses} resize-y font-mono`}
          />
          <p className="mt-1 text-xs text-gray-500">
            Additional headers to send with MCP requests (valid JSON).
          </p>
        </div>

        {/* Actions */}
        <div className="config-actions">
          <button
            onClick={handleTestConnection}
            disabled={testing || !enabled}
            className="config-actions-secondary"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !enabled}
            className="config-actions-primary"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
