#!/bin/bash
# scripts/mcp-call.sh
# Helper to make MCP JSON-RPC calls against http://localhost:3000/api/mcp
# Usage: ./mcp-call.sh <method> <params-json> [api-key]
#
# Streamable-HTTP MCP returns Server-Sent Events; we strip the "data: " prefix.
set -euo pipefail

METHOD="$1"
PARAMS="${2:-{\}}"
KEY="${3:-}"
ENDPOINT="http://localhost:3000/api/mcp"

ID=$RANDOM

AUTH=()
if [ -n "$KEY" ]; then
  AUTH=(-H "Authorization: Bearer $KEY")
fi

BODY=$(jq -n --arg m "$METHOD" --argjson p "$PARAMS" --argjson id "$ID" \
  '{jsonrpc:"2.0", id:$id, method:$m, params:$p}')

# Use a session id header — required for tools/* calls after initialize.
SESSION_HEADER=()
if [ -n "${MCP_SESSION_ID:-}" ]; then
  SESSION_HEADER=(-H "mcp-session-id: $MCP_SESSION_ID")
fi

curl -sS -D /tmp/mcp-headers.txt -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-protocol-version: 2025-06-18" \
  "${AUTH[@]}" \
  "${SESSION_HEADER[@]}" \
  --data "$BODY" \
  | sed -n 's/^data: //p' \
  | tail -n 1
