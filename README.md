# hbario

> **hbario — natural-language payments on Hedera, payable by humans and AI agents alike.**

hbario turns plain-English requests like *"split 1,000 HBAR across these five
contractors"* or *"send 25 HBAR to 0.0.12345 on mainnet"* into signed,
verified Hedera workflows. A conversational planner (built on the
[**Hedera Agent Kit**](https://github.com/hashgraph/hedera-agent-kit) in
human-in-the-loop mode) drafts the transactions, your own wallet
(HashPack / Blade / Kabila via WalletConnect) signs them, and the
**Hedera Mirror Node** independently verifies every payment before a
receipt is issued. The same service is exposed as a
[**Model Context Protocol (MCP)**](https://modelcontextprotocol.io)
endpoint with x402-style pay-per-call billing, so other AI agents —
Claude Desktop, Cline, Cursor, your own — can hire hbario programmatically
and pay it in HBAR.

🌐 **Live:** [hbario.com](https://hbario.com)

---

## What hbario does

- **Plans HBAR payments from plain English.** Single payments, bulk payouts,
  bulk account creation, liquidity-path analysis, and multi-step compound
  workflows.
- **Never touches your keys.** Every transaction is signed by your wallet
  over WalletConnect (HIP-820). The server only verifies, read-only, on the
  Hedera Mirror Node.
- **Bills by call, in HBAR.** Each chat message is quoted in real time
  (token-based USD → HBAR via CoinGecko) and paid before the LLM runs.
  Workflow execution is gated behind a separate HBAR unlock fee.
- **Speaks MCP.** Your Claude Desktop, Cline, or custom agent can list,
  price, pay, and consume hbario's tools using the Model Context Protocol
  with an x402-style payment handshake.

## Two ways to use hbario

### 1. As a human in the chat UI

Visit [hbario.com](https://hbario.com), register, connect a Hedera wallet
on the `/chat` page, and tell hbario what to pay. It drafts the workflow,
your wallet signs the unlock + the actual transfers, and hbario verifies
each one on the Mirror Node before unlocking the next step.

### 2. As another agent over MCP

Open `/mcp` in hbario, copy your personal endpoint URL + API key, then
paste this into any MCP client:

```json
{
  "mcpServers": {
    "hbario": {
      "type": "http",
      "url": "https://hbario.com/api/mcp",
      "headers": {
        "Authorization": "Bearer ohp_mcp_YOUR_KEY"
      }
    }
  }
}
```

Your agent will discover six tools at `/api/mcp`:

| Tool | Purpose |
|---|---|
| `list_services` | Discover what hbario offers (public). |
| `request_workflow` | Natural-language → draft workflow + x402 payment requirement. |
| `create_payment_order` | Get the HBAR amount, treasury account, memo, network. |
| `submit_payment` | Pass the signed HBAR tx id → server verifies via Mirror Node → workflow unlocks → receipt issued. |
| `get_receipt` | Fetch a stored receipt. |
| `verify_transaction` | Independent read-only verification (public). |

Quick smoke test:

```bash
curl -N -X POST https://hbario.com/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

## Public manifests

Two read-only manifest endpoints help other agents discover hbario:

- `GET /agent.json` — app, workflows, tools, MCP capabilities, safety model.
- `GET /api/services` — service catalog (id, price, inputs, outputs).

Both are anonymous; no API key required.

## How payment verification works

When a user signs a payment (workflow unlock, or a step transfer) in their
wallet, the client posts the transaction id to
`POST /api/orders/:id/verify` (or `submit_payment` over MCP). The server
then queries the appropriate **Hedera Mirror Node REST API**
(`https://{network}.mirrornode.hedera.com`) to verify:

- the transaction succeeded,
- the recipient matches the treasury for that order's network,
- the amount matches the order amount,
- the memo matches the order memo,
- the payer matches the connected wallet (when provided).

No private keys are ever stored or transmitted by the server. Verification
is entirely read-only over HTTPS.

## Pay-per-call AI

The chat planner runs **server-side** using an Anthropic (or OpenAI) key
that lives only in `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` on the server.
Users **never** paste an API key into a form — instead, each chat message:

1. Posts to `POST /api/chat/quote` which estimates tokens, converts the
   dollar cost to HBAR using a 60s-cached CoinGecko feed, adds a flat
   service fee and slippage buffer, and creates a `pending` AI-planning
   order.
2. Opens a wallet-signed HBAR transfer to the AI treasury account.
3. Verifies the payment on the Mirror Node (`/api/orders/:id/verify`).
4. Calls `POST /api/chat/agent` with the paid `orderId`. The server
   atomically consumes the order so a retry can't double-spend, runs the
   LLM, and persists the resulting workflow.

If the LLM produces an invalid workflow the agent rolls the order back to
`paid` and the chat UI shows a "Retry (no extra charge)" button.

All AI pricing knobs are configurable via env vars — see
[`.env.example`](./.env.example).

## Deployment

hbario.com runs on [Render](https://render.com) with managed Postgres. See
[`docs/DEPLOY.md`](./docs/DEPLOY.md) for the full walkthrough.

The repo also includes a [`render.yaml`](./render.yaml) blueprint — fork
the repo, open Render → New → Blueprint, point at the fork, and fill in
secrets in the dashboard.

## Local development

```bash
# 1. Install deps
npm install

# 2. Start Postgres (or point DATABASE_URL at any Postgres)
docker compose up -d db

# 3. Set env
cp .env.example .env
# Edit .env — minimum: DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY,
# NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, HEDERA_TREASURY_ACCOUNT_ID_TESTNET,
# HEDERA_AI_TREASURY_ACCOUNT_ID

# 4. Run migrations
npx prisma migrate dev

# 5. Start the dev server
npm run dev
```

Open <http://localhost:3000>.

Need test HBAR? Use the
[Hedera testnet faucet](https://portal.hedera.com/faucet).

## License

[MIT](./LICENSE)

## Security

See [`SECURITY.md`](./SECURITY.md). For sensitive disclosures, please email
**security@hbario.com** instead of opening a public issue.
