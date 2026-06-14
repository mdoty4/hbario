# Security Policy

## Reporting a vulnerability

hbario moves real HBAR. If you find a vulnerability — especially anything
that could cause unintended fund movement, leak another user's data, or
bypass the Mirror Node payment verification — please **do not** open a
public GitHub issue.

Email **security@hbario.com** with:

- A description of the issue
- Steps to reproduce (or a proof-of-concept)
- The impact you believe it has
- Optional: a suggested fix

You'll get an acknowledgement within 72 hours and a status update at
least every 7 days until the issue is resolved. We don't currently
offer a paid bug bounty, but we'll credit you in the release notes if
you'd like.

## Scope

In scope:
- Anything under `hbario.com` and its subdomains
- The hbario MCP endpoint (`/api/mcp`)
- The hbario codebase in this repository

Out of scope:
- Vulnerabilities in upstream dependencies (Next.js, Prisma, Hedera SDK,
  WalletConnect, etc.) — report those to the upstream maintainers
- Social engineering, DoS, and physical attacks
- Issues that require the attacker to already control the user's wallet
  or their authenticated session

## Non-goals

hbario never stores Hedera private keys. All on-chain actions are signed
by the user's own wallet via WalletConnect (HIP-820). Reports describing
hbario "not having custody" of user keys are working as intended.
