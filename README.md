# Open Hedera Agent

A payment-gated commerce agent for Hedera, built on **two open Hashgraph stacks at once**:

- **🤖 [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit)** powers the conversational planner. It runs in
  `RETURN_BYTES` (human-in-the-loop) mode so every on-chain action is signed by the
  user's wallet — never the server.
- **🔌 Hedera Payments MCP** server exposes this agent's workflow-generation
  service as a Model Context Protocol endpoint. Any MCP-compatible agent
  (Claude Desktop, Cline, Cursor, custom) can discover, pay, and consume it
  with an x402-style payment handshake.

The chat UI accepts natural-language requests (e.g. *"Send 25 HBAR to 0.0.123.456"*
or *"Split 1000 HBAR across these 5 contractors"*), produces structured workflow
JSON, gates execution behind an HBAR payment, and verifies that payment against
the **Hedera Mirror Node** before unlocking the workflow.

## Live Demo

🌐 **[Open Hedera Agent](https://open-hedera-agent.vercel.app)** — Public demo hosted on Vercel

## Two ways to use this agent

### 1. As a human in the chat UI

Open `/chat`, log in, connect a wallet, and tell the agent what to do. The
agent (powered by [`hedera-agent-kit`](https://github.com/hashgraph/hedera-agent-kit))
drafts a workflow, you sign the unlock payment in HashPack/Blade/Kabila, and the
agent verifies it on the Hedera Mirror Node before unlocking.

### 2. As another agent over MCP

Open `/mcp` to copy your personal endpoint URL + API key, then paste this into
any MCP client (`claude_desktop_config.json`, Cline `mcpServers`, etc.):

```json
{
  "mcpServers": {
    "open-hedera-payments": {
      "type": "http",
      "url": "https://your-deployment.example.com/api/mcp",
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
| `list_services` | Discover what this agent offers (public). |
| `request_workflow` | Natural-language → draft workflow + x402 payment requirement. |
| `create_payment_order` | Get the HBAR amount, treasury account, memo, network. |
| `submit_payment` | Pass the signed HBAR tx id → server verifies via Mirror Node → workflow unlocks → receipt issued. |
| `get_receipt` | Fetch a stored receipt. |
| `verify_transaction` | Independent read-only verification (public). |

Quick smoke test:

```bash
curl -N -X POST https://your-deployment/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```


## Deployment

### Quick Deploy to Vercel

1. Fork this repository
2. Import to [Vercel](https://vercel.com/new)
3. Set environment variables:
   ```
   DATABASE_URL=file:./dev.db
   JWT_SECRET=your-secret-key
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-reown-project-id
   NEXT_PUBLIC_DEFAULT_NETWORK=testnet
   HEDERA_TREASURY_ACCOUNT_ID_TESTNET=0.0.1234567
   HEDERA_TREASURY_ACCOUNT_ID_MAINNET=0.0.0000000
   HEDERA_AI_TREASURY_ACCOUNT_ID=0.0.1234567
   OPENAI_API_KEY=sk-...
   ```
4. Deploy


## Pay-per-Call AI

The chat planner runs **server-side** using an OpenAI (or Anthropic) key that
lives only in `OPENAI_API_KEY` on the server. Users **never** paste an API
key into a form — instead, each chat message:

1. Posts to `POST /api/chat/quote` which:
   - estimates input/output tokens for the message,
   - converts the dollar cost to HBAR using a 60s-cached CoinGecko feed,
   - adds a flat service fee (`AI_SERVICE_FEE_USD`) and a small slippage
     buffer (`AI_SLIPPAGE_BUFFER`),
   - creates a `pending` `Order(kind=ai_planning)` and returns the price.
2. Opens a wallet-signed HBAR transfer to `HEDERA_AI_TREASURY_ACCOUNT_ID`.
3. Verifies the payment on the Mirror Node (`/api/orders/:id/verify`).
4. Calls `POST /api/chat/agent` with the paid `orderId`. The server
   atomically consumes the order (`status: paid → consumed`) so a retry
   can't double-spend it, runs the LLM with its own key, and persists the
   resulting workflow.

If the LLM produces an invalid workflow the agent rolls the order back to
`paid` and the chat UI shows a "Retry (no extra charge)" button.

All AI pricing knobs are configurable via env vars — see `.env.example`.

## Hedera Wallet Setup


Open Hedera connects to user wallets via **WalletConnect (HIP-820)**, which
works with HashPack, Blade, Kabila, and any other compliant Hedera wallet —
on both testnet and mainnet.

1. Create a free WalletConnect / Reown project at
   [cloud.reown.com](https://cloud.reown.com) and copy its Project ID.
2. Put it in `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
3. Set `NEXT_PUBLIC_DEFAULT_NETWORK` to either `testnet` or `mainnet`. Users
   can switch at runtime from the `/wallet` page.
4. Set `HEDERA_TREASURY_ACCOUNT_ID_TESTNET` (and `_MAINNET`) to the accounts
   that should receive workflow-unlock payments on each network. The
   server picks the right treasury based on the order's network.

Need test HBAR? Use the [Hedera testnet faucet](https://portal.hedera.com/faucet).

### How payment verification works

When a user signs a workflow-unlock payment in their wallet, the client posts
the transaction ID to `POST /api/orders/:id/verify`. The server then queries
the appropriate **Hedera Mirror Node REST API**
(`https://{network}.mirrornode.hedera.com`) to verify:

- the transaction succeeded,
- the recipient matches the treasury for that order's network,
- the amount matches the order amount,
- the memo matches the order memo,
- the payer matches the connected wallet (when provided).

No private keys are ever stored or transmitted by the server. Verification is
entirely read-only over HTTPS.

### Deploy with Vercel CLI

```bash
npm i -g vercel
vercel login
./deploy.sh          # Preview deployment
./deploy.sh --prod   # Production deployment
```

### Deploy to Railway

1. Push code to GitHub
2. Connect repo to [Railway](https://railway.app)
3. Add environment variables
4. Railway auto-detects the `railway.json` config

### Deploy to Render

1. Push code to GitHub
2. Create a new Web Service on [Render](https://render.com)
3. Set build command: `npm ci && npx prisma generate && npm run build`
4. Set start command: `npx prisma migrate deploy && npm start`

### Deploy to Fly.io

```bash
fly launch
fly deploy
```

## UCP / AP2-Inspired Manifest Endpoints

This project exposes two public, machine-readable manifest endpoints inspired by the [UCP (Universal Consumer Protocol)](https://ucp.sh) and [AP2 (Agent-to-Agent Protocol)](https://github.com/a16z/ap2) specifications. These allow other agents or clients to discover what this agent does and how to interact with it programmatically.

### `GET /agent.json`

Returns a static JSON manifest describing the agent itself:

- **App name & version** — identifies the agent
- **Description** — what the agent does
- **Hosted URL** — where the agent is running
- **Supported workflow types** — `single_payment`, `bulk_payout`, `liquidity_path_analysis`
- **Supported tools** — the full tool registry (read, estimate, prepare, verify)
- **Payment currency** — `HBAR`
- **Safety model** — `human_approval_required` (no automatic fund movement)
- **API endpoints** — map of all available routes

```bash
curl https://your-deployment.example.com/agent.json
```

### `GET /api/services`

Returns a JSON manifest of the services this agent provides:

- **service_id** — unique identifier (`workflow_generation`)
- **name** — human-readable service name
- **price** — cost per invocation (`2 HBAR`)
- **currency** — payment currency (`HBAR`)
- **inputs** — what the service accepts (`natural_language_request`)
- **outputs** — what the service produces (`workflow_json`, `human_summary`, `tool_plan`, `receipt`)
- **payment_required** — whether payment is needed before execution

```bash
curl https://your-deployment.example.com/api/services
```

Both endpoints are **public** — no authentication is required.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
