// ──────────────────────────────────────────────────────────────────────────────
// Env validation
//
// Validates required environment variables at server startup. In production
// we hard-fail on missing values, empty placeholder secrets, or treasury
// account IDs that look like the documentation examples — we'd rather refuse
// to boot than quietly route real HBAR to 0.0.0000000.
//
// Called from src/instrumentation.ts so the failure surfaces during the
// server's startup banner, not on the first request.
// ──────────────────────────────────────────────────────────────────────────────

const PLACEHOLDER_TREASURIES = new Set(["0.0.1234567", "0.0.0000000", ""]);
const EXAMPLE_JWT_SECRETS = new Set([
  "change-this-to-a-secure-random-string-in-production",
  "open-hedera-jwt-secret-change-in-production-2024",
  "secret",
  "",
]);

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function isRealAccount(v: string | undefined): boolean {
  if (!v) return false;
  if (PLACEHOLDER_TREASURIES.has(v)) return false;
  return /^\d+\.\d+\.\d+$/.test(v);
}

export function validateEnvOrExit(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Always-required ────────────────────────────────────────────────
  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is required (PostgreSQL connection string).");
  } else if (
    isProd() &&
    !/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)
  ) {
    errors.push(
      "DATABASE_URL must be a postgres:// or postgresql:// connection string in production."
    );
  }

  const jwt = process.env.JWT_SECRET;
  if (!jwt) {
    errors.push("JWT_SECRET is required.");
  } else if (EXAMPLE_JWT_SECRETS.has(jwt)) {
    errors.push(
      "JWT_SECRET is set to a known example/placeholder value. Generate one with `openssl rand -base64 48`."
    );
  } else if (isProd() && jwt.length < 32) {
    errors.push(
      "JWT_SECRET is too short for production (need ≥32 chars). Generate one with `openssl rand -base64 48`."
    );
  }

  // ── Prod-only checks ───────────────────────────────────────────────
  if (isProd()) {
    if (!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) {
      errors.push(
        "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required in production (get one at https://cloud.reown.com)."
      );
    }

    const wfTreasury =
      isRealAccount(process.env.HEDERA_TREASURY_ACCOUNT_ID_TESTNET) ||
      isRealAccount(process.env.HEDERA_TREASURY_ACCOUNT_ID_MAINNET) ||
      isRealAccount(process.env.HEDERA_TREASURY_ACCOUNT_ID);
    if (!wfTreasury) {
      errors.push(
        "No real HEDERA_TREASURY_ACCOUNT_ID configured. Set HEDERA_TREASURY_ACCOUNT_ID_TESTNET and/or HEDERA_TREASURY_ACCOUNT_ID_MAINNET to a real Hedera account."
      );
    }

    const aiTreasury =
      isRealAccount(process.env.HEDERA_AI_TREASURY_ACCOUNT_ID_TESTNET) ||
      isRealAccount(process.env.HEDERA_AI_TREASURY_ACCOUNT_ID_MAINNET) ||
      isRealAccount(process.env.HEDERA_AI_TREASURY_ACCOUNT_ID);
    if (!aiTreasury) {
      errors.push(
        "No real HEDERA_AI_TREASURY_ACCOUNT_ID configured. Set HEDERA_AI_TREASURY_ACCOUNT_ID (or its per-network variant) to a real Hedera account."
      );
    }

    const provider = process.env.AI_PROVIDER ?? "anthropic";
    if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
      errors.push(
        "AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set."
      );
    } else if (provider === "openai" && !process.env.OPENAI_API_KEY) {
      errors.push("AI_PROVIDER=openai but OPENAI_API_KEY is not set.");
    } else if (provider === "custom" && !process.env.AI_API_KEY) {
      errors.push("AI_PROVIDER=custom but AI_API_KEY is not set.");
    }

    if (!process.env.MCP_PUBLIC_BASE_URL) {
      warnings.push(
        "MCP_PUBLIC_BASE_URL is not set — MCP discovery responses will report the request host. Set this to https://hbario.com (or your domain) for cleaner output."
      );
    }
  }

  for (const w of warnings) {
    console.warn(`[env] ${w}`);
  }

  if (errors.length > 0) {
    console.error(
      "\n[env] Refusing to start — invalid configuration:\n  • " +
        errors.join("\n  • ") +
        "\n"
    );
    if (isProd()) {
      // Hard fail in prod. In dev we let the developer keep going so
      // they can see the error message in the terminal.
      process.exit(1);
    }
  }
}
