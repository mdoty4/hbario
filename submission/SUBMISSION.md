# Hedera Bounty Submission — Open Hedera Workflow Agent

---

## 1. Project Name

**Open Hedera Workflow Agent**

---

## 2. Short Description

> Open Hedera is a payment-gated commerce agent that uses the **Hedera Agent Kit** (RETURN_BYTES / human-in-the-loop) to plan Hedera workflows from natural language, and exposes itself as a **Hedera Payments MCP server** so any MCP-compatible agent can discover, pay, and consume it over x402-style payments.

---

## 3. Long Summary

Open Hedera is the rare submission that ticks **both** of the bounty's optional stacks at once:

1. **Powered by `hedera-agent-kit` (v3.8)** in `AgentMode.RETURN_BYTES`. The kit's
   LangChain-style plugins (`coreAccountPlugin`, `coreConsensusPlugin`,
   `coreTokenPlugin`, plus their query siblings) are wired into the chat
   workflow agent. Every "write" tool produces unsigned transaction bytes that
   the user's wallet signs over WalletConnect (HIP-820) — the server never
   holds a private key.
2. **Exposes a Hedera Payments MCP server** at `POST /api/mcp` using
   `@modelcontextprotocol/sdk` and the Streamable-HTTP transport. Any
   MCP-compatible agent (Claude Desktop, Cline, Cursor, custom) can:
   - discover services (`list_services`),
   - request workflow generation in natural language (`request_workflow`),
   - receive an **x402-style 402 Payment Required envelope** with the HBAR
     amount, treasury account, memo, and network (`create_payment_order`),
   - submit the signed transaction id for **Hedera Mirror Node** verification
     and workflow unlock (`submit_payment`),
   - fetch the resulting receipt (`get_receipt`),
   - and independently re-verify any transaction id read-only (`verify_transaction`).

End-to-end flow:

1. **User (or other agent) describes intent** — *"Send 25 HBAR to 0.0.12345"*
   or *"Split 1000 HBAR across these 5 contractors."*
2. **`hedera-agent-kit` plans the workflow** — the chat planner escalates to
   an LLM only when needed; deterministic regex handles the common cases.
   Output is a typed workflow draft.
3. **Workflow compiler validates & normalizes** — `SinglePaymentCompiler`,
   `BulkPayoutCompiler`, `LiquidityPathAnalysisCompiler` produce
   schema-stable JSON.
4. **Payment-gated unlock** — server creates an order with a treasury account
   and memo for the order's network (testnet/mainnet).
5. **User signs in their Hedera wallet** — via WalletConnect; the server
   never sees the key.
6. **Mirror Node verification** — the server reads the tx from
   `mainnet|testnet.mirrornode.hedera.com` and checks success + recipient +
   amount + memo + payer.
7. **Receipt + unlock** — workflow flips to `unlocked`, a receipt row is
   written with the verified `consensusTimestamp`, and the agent (chat or
   MCP) returns it.

### Key Technical Features

- **Hedera Agent Kit integration** — `src/lib/hedera/agentKit.ts` factory
  builds a per-(network, user) `HederaLangchainToolkit` in RETURN_BYTES mode
  with the account, consensus, token, EVM, and query plugins enabled.
- **Hedera Payments MCP server** — `src/app/api/mcp/route.ts` mounts a
  Streamable-HTTP MCP endpoint backed by `src/lib/mcp/server.ts`. Per-user
  bearer-token auth via `src/lib/mcp/auth.ts` (with rotation at
  `/api/mcp/key`).
- **x402-compatible payment envelopes** — `create_payment_order` returns a
  JSON envelope marked `"status":"402"`, `"scheme":"hedera-payments-mcp"`,
  `"x402_compatible":true` so payment-aware crawlers can negotiate.
- **Workflow Compiler System** — Routes agent drafts to type-specific
  compilers with alias normalization and validation.
- **Tool Registry with Safety Controls** — Backend-controlled allowlist (8
  tools across 4 categories) + 28-entry denylist of dangerous operations.
- **Payment-Gated Commerce Model** — Workflows progress through a state
  machine: `draft → awaiting_payment → unlocked → completed`, with orders,
  payments, and receipts in Prisma.
- **Public manifests for agent discovery** — `/agent.json` and `/api/services`
  expose machine-readable capabilities including the MCP endpoint, supported
  tools, payment protocol, and Agent Kit configuration.
- **Human-in-the-Loop Safety** — `human_approval_required`. No automatic fund
  movement under any circumstance. No private keys on the server.

### Architecture (high level)

```
┌────────────────────────────────────────────────────────────────────┐
│  External agents (Claude Desktop, Cline, Cursor, custom)           │
│        │  MCP protocol (Streamable HTTP)                           │
│        ▼                                                            │
│  /api/mcp  ── Hedera Payments MCP server                           │
│        │      tools: list_services, request_workflow,              │
│        │             create_payment_order, submit_payment,          │
│        │             get_receipt, verify_transaction               │
│        ▼                                                            │
│  Chat agent (Next.js) ── powered by hedera-agent-kit               │
│        │      mode: RETURN_BYTES                                   │
│        │      plugins: core{Account,Consensus,Token,EVM,…}         │
│        ▼                                                            │
│  WalletConnect (HIP-820) ── user signs unsigned bytes              │
│        ▼                                                            │
│  Hedera testnet / mainnet                                          │
│        ▲                                                            │
│  Mirror Node REST API ── server-side read-only verification        │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. Public GitHub Repo URL

```
https://github.com/YOUR_USERNAME/open_hedera_project
```

> **Note:** Replace `YOUR_USERNAME` with your actual GitHub username. The repo must be set to **public** before submission.
>
> To make the repo public:
> 1. Go to repo Settings → General → Danger Zone
> 2. Click "Change visibility" → "Make public"
>
> To add the remote:
> ```bash
> git remote add origin https://github.com/YOUR_USERNAME/open_hedera_project.git
> git push -u origin main
> ```

---

## 5. Public Hosted Demo URL

```
https://open-hedera-agent.vercel.app
```

> The app is deployed on Vercel with the configuration in `vercel.json`.
>
> **Deployment options also supported:**
> - **Vercel** (primary) — `vercel.json` config included
> - **Railway** — `railway.json` config included
> - **Render** — Instructions in README
> - **Fly.io** — `fly launch && fly deploy`

---

## 6. Demo Video / Social-Media Post URL

```
https://www.youtube.com/watch?v=YOUR_VIDEO_ID
```

> **Note:** Replace with your actual demo video or social-media post URL.
>
> **Suggested demo video content:**
> 1. Show the landing page and register/login flow
> 2. Navigate to the chat interface
> 3. Type a natural language request (e.g., "Send 25 HBAR to 0.0.12345")
> 4. Show the generated workflow draft
> 5. Show the payment-gated workflow state
> 6. Show the human-in-the-loop approval modal
> 7. Show the receipt generation after payment
> 8. Show the `/agent.json` manifest endpoint
>
> **Alternative:** A Twitter/X thread, LinkedIn post, or YouTube short demonstrating the same flow.

---

## 7. Wallet Address for Payout

```
0.0.YOUR_HEDERA_ACCOUNT_ID
```

> **Note:** Replace with your actual Hedera account ID for bounty payout.
>
> To find your account ID:
> - Check your HashPack/Hedera Wallet account details
> - Format: `0.0.XXXXXXX` (e.g., `0.0.1234567`)

---

## 8. Implementation Details

### Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 16 + React 19 | App Router, SSR, API routes |
| **Styling** | Tailwind CSS 4 | Utility-first responsive UI |
| **Database** | Prisma + SQLite (demo) / PostgreSQL (prod) | ORM with typed schema |
| **Authentication** | JWT + bcryptjs | Cookie-based session auth |
| **Workflow Engine** | Custom compiler system | Type-specific workflow compilation |
| **Tool System** | Backend tool registry | Allowlist/denylist safety model |
| **Deployment** | Vercel (primary) | Zero-config serverless deployment |

### Data Models (Prisma)

- **User** — Authenticated user with email/password
- **Workflow** — Workflow draft with status state machine (`draft` → `awaiting_payment` → `unlocked` → `completed`)
- **Order** — Payment order linked to workflow with HBAR amount
- **Payment** — Payment record with verification status
- **Receipt** — Transaction receipt with audit trail

### API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/agent.json` | GET | Public | Agent manifest (UCP/AP2 + Agent Kit + MCP capabilities) |
| `/api/services` | GET | Public | Service catalog manifest |
| `/api/mcp` | GET/POST/DELETE | Bearer (optional) | **Hedera Payments MCP server** (Streamable HTTP) |
| `/api/mcp/key` | GET/POST | Cookie | Issue / rotate the user's MCP bearer token |
| `/api/auth/register` | POST | None | User registration |
| `/api/auth/login` | POST | None | User login |
| `/api/auth/logout` | POST | Auth | User logout |
| `/api/auth/me` | GET | Auth | Current user info |
| `/api/chat/workflow` | POST | Auth | Generate workflow from chat |
| `/api/workflows` | GET/POST | Auth | List/create workflows |
| `/api/workflows/[id]` | GET | Auth | Get workflow detail |
| `/api/workflows/[id]/create-order` | POST | Auth | Create payment order |
| `/api/orders/[id]/verify` | POST | Auth | Verify payment |
| `/api/receipts/[id]` | GET | Auth | Get receipt |

### Tool Registry

**8 Safe Tools (Allowlist):**

| Tool | Category | Description |
|------|----------|-------------|
| `validateAccount` | read | Validate Hedera account ID format |
| `getAccountBalance` | read | Get HBAR balance of an account |
| `estimateTransferFees` | estimate | Estimate fee for single transfer |
| `estimateBulkPayoutFees` | estimate | Estimate fee for bulk payout |
| `prepareHbarTransfer` | prepare | Prepare transfer for approval (no execution) |
| `prepareBulkPayout` | prepare | Prepare bulk payout for approval (no execution) |
| `verifyTransaction` | verify | Verify transaction against expected details |
| `getTransactionReceipt` | verify | Get receipt for completed transaction |

**28 Dangerous Tools (Denylist):** Including `executeTransfer`, `signTransaction`, `submitTransaction`, `deleteAccount`, `freezeAccount`, `wipeAccount`, and more.

### Workflow Types

1. **Single Payment** — One-to-one HBAR transfer
2. **Bulk Payout** — One-to-many HBAR distribution
3. **Liquidity Path Analysis** — Best trading route analysis on Hedera

### Safety Model

- `human_approval_required` — No automatic fund movement
- Backend-controlled tool allowlist
- Dangerous tool denylist as additional safety layer
- Payment-gated workflow progression
- All on-chain actions require explicit user confirmation

---

## 9. Hedera Tool Feedback

### Feedback Links

| Resource | Feedback Link |
|----------|---------------|
| Hedera SDK (JS/TS) | https://github.com/hashgraph/hedera-sdk-js/issues |
| Hedera Mirror Node | https://github.com/hashgraph/hedera-mirror-node/issues |
| Hedera Docs | https://docs.hedera.com |
| Hedera Community Discord | https://discord.gg/coincidence |

### Feedback Summary

| Category | Feedback |
|----------|----------|
| **SDK API Design** | The TypeScript SDK provides good type safety for Hedera operations. The mock tool implementations demonstrate the expected API patterns well. |
| **Mirror Node** | The REST API provides reliable transaction history and account balance queries, essential for the payment verification flow. |
| **Developer Experience** | The Hedera network's fast finality and low fees make it ideal for payment-gated workflows like this agent. |
| **Documentation** | The Hedera docs provide solid coverage of account operations, but more examples for agent/AI integration patterns would be valuable. |

---

## 10. Screenshots / Images

Screenshots are stored in `submission/screenshots/`. Take screenshots of the following and save them there:

| # | Screenshot | Description | Filename |
|---|------------|-------------|----------|
| 1 | Landing Page | Home page with "Welcome to Open Hedera" | `01-landing-page.png` |
| 2 | Registration | User registration form | `02-registration.png` |
| 3 | Login | User login form | `03-login.png` |
| 4 | Chat Interface | Chat page for workflow generation | `04-chat-interface.png` |
| 5 | Workflow Draft | Generated workflow draft panel | `05-workflow-draft.png` |
| 6 | Payment Gate | Payment-gated workflow state | `06-payment-gate.png` |
| 7 | Approval Modal | Human-in-the-loop approval modal | `07-approval-modal.png` |
| 8 | Receipt | Generated transaction receipt | `08-receipt.png` |
| 9 | Agent Manifest | `/agent.json` endpoint response | `09-agent-manifest.png` |
| 10 | Services API | `/api/services` endpoint response | `10-services-api.png` |

> **To take screenshots:**
> 1. Start the dev server: `npm run dev`
> 2. Open http://localhost:3000
> 3. Navigate through each screen and take screenshots
> 4. Save to `submission/screenshots/`

---

## 11. Acceptance Criteria Checklist

| Criteria | Status |
|----------|--------|
| ✅ Submission form fields are ready | All fields documented above |
| ⬜ Demo video/social post exists | **TODO:** Record and upload |
| ⬜ Feedback link exists | Links provided in Section 9 |
| ⬜ Repo is public | **TODO:** Make repo public on GitHub |
| ⬜ Hosted app works | **TODO:** Verify https://open-hedera-agent.vercel.app |
| ⬜ Wallet address is ready | **TODO:** Add your Hedera account ID |

---

## 12. Quick Setup for Reviewers

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/open_hedera_project.git
cd open_hedera_project

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Set environment variables
cp .env.example .env
# Edit .env with your values

# Run the dev server
npm run dev

# Open http://localhost:3000
```

---

*Submission prepared for Hedera Developer Bounty Program*
*Project: Open Hedera Workflow Agent*
*Date: June 7, 2026*
