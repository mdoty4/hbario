# Open Hedera Agent

A public demo agent for generating, compiling, and executing Hedera Hashgraph workflows. Built with Next.js, this agent accepts natural language requests, produces structured workflow JSON, and enforces human-in-the-loop approval before any on-chain action.

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
