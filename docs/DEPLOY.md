# Deploying hbario

hbario.com runs on [Render](https://render.com) using:

- A **Web Service** running Next.js
- A managed **Postgres** database (same region, internal networking)
- The custom domain `hbario.com` with a Let's Encrypt cert that Render
  issues automatically

The repo's [`render.yaml`](../render.yaml) declares both. The steps below
take you from a fork of the repo to a live deploy on your own domain.

---

## 1. Pre-flight on Hedera

You need three Hedera account IDs that you control on **mainnet**:

1. **Workflow-unlock treasury** — receives the 1 HBAR unlock fee per
   workflow. Set as `HEDERA_TREASURY_ACCOUNT_ID_MAINNET`.
2. **AI-planning treasury** — receives per-chat HBAR payments. Set as
   `HEDERA_AI_TREASURY_ACCOUNT_ID`. Can be the same account as #1 but
   keeping them separate makes accounting easier.
3. **Testnet equivalents** — at least
   `HEDERA_TREASURY_ACCOUNT_ID_TESTNET`. You can create one for free in
   the [Hedera testnet portal](https://portal.hedera.com).

Also get:

- A WalletConnect (Reown) project ID from
  [cloud.reown.com](https://cloud.reown.com). Set as
  `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
- An Anthropic API key from <https://console.anthropic.com>. Set as
  `ANTHROPIC_API_KEY`.

## 2. Push to GitHub

```bash
git remote add origin git@github.com:<you>/hbario.git
git branch -M main
git push -u origin main
```

The repo can be public — there are no secrets committed.

## 3. Create the Render Blueprint

1. Sign in to [Render](https://dashboard.render.com).
2. **New → Blueprint** → select the GitHub repo → choose `main`.
3. Render reads `render.yaml`, shows you the planned resources (one
   Postgres + one Web Service), and prompts for the `sync: false` env
   vars. Fill in:
   - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
   - `HEDERA_TREASURY_ACCOUNT_ID_TESTNET`
   - `HEDERA_TREASURY_ACCOUNT_ID_MAINNET`
   - `HEDERA_AI_TREASURY_ACCOUNT_ID`
   - `ANTHROPIC_API_KEY`
4. **Apply**. Render provisions Postgres first, then builds and starts
   the web service. The build command runs `prisma generate && next build`;
   the start command runs `prisma migrate deploy && next start`, so the
   schema is applied on first boot.

Watch the deploy logs. Once the health check at `/agent.json` returns
`200`, the service is live at `https://hbario.onrender.com` (or whatever
name you picked).

## 4. Wire up `hbario.com`

In Render → your web service → **Settings → Custom Domains**:

1. Click **Add Custom Domain**, enter `hbario.com`. Render shows you the
   DNS record you need to create.
2. Add another for `www.hbario.com`.
3. At your DNS provider (Namecheap, Cloudflare, etc.):
   - `hbario.com` → ALIAS / ANAME / flattened CNAME → the value Render
     gave you (looks like `<service>.onrender.com`). If your DNS
     provider only does CNAME at apex, use Render's IPv4 address shown
     in the dashboard.
   - `www.hbario.com` → CNAME → `<service>.onrender.com`.
4. Wait for DNS to propagate (usually <5 min). Render auto-issues a
   Let's Encrypt cert and starts serving over HTTPS.

Once `https://hbario.com` resolves, you're done.

## 5. Smoke checks

```bash
# Manifests should return JSON
curl -fsS https://hbario.com/agent.json | jq .app.name        # → "hbario"
curl -fsS https://hbario.com/api/services | jq '.services[0]' # → workflow_generation

# MCP handshake should succeed
curl -N -X POST https://hbario.com/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

# Security headers should be set
curl -sI https://hbario.com/ | grep -iE 'strict-transport|x-frame|content-type-options'
```

Then go through the human flow: register → connect wallet → chat → pay
quote → unlock workflow → execute.

## 6. Going to production-grade

The blueprint defaults to Render's **starter** plans for both the web
service and the database. For real traffic:

- Bump the web service to **standard** (4× the RAM, no cold starts).
- Bump Postgres to **basic** or higher (the starter free plan expires
  after 90 days, and has aggressive connection limits).
- Optionally enable **Render Disks** + automated backups on Postgres.
- Add a **Cloudflare** (or similar) layer in front of Render for DDoS
  protection and edge caching of `/agent.json` and `/api/services`.

## Rolling back

Render keeps every deploy. Web service → **Manual Deploy → Roll Back to
this Deploy** rolls the web tier back instantly. Postgres rollbacks
require restoring from a backup, so always test migrations against a
local Postgres (`docker compose up -d db && npx prisma migrate dev`)
before pushing to `main`.
