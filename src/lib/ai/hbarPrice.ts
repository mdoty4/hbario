// ──────────────────────────────────────────────────────────────────────────────
// HBAR / USD Price Feed
//
// Tiny in-memory cached fetcher that asks CoinGecko's free API for the current
// HBAR price in USD. Used by the quoting layer so we can charge the right
// amount of HBAR for a USD-denominated AI inference cost.
//
// Why CoinGecko: no API key required for the simple/price endpoint, generous
// rate limits, well-known reliability. We cache aggressively (60s) and fall
// back to a configurable `HBAR_USD_FALLBACK` env var so a CoinGecko outage
// never takes the chat down — at worst quotes drift slightly until the next
// fetch succeeds.
// ──────────────────────────────────────────────────────────────────────────────

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=usd";

const CACHE_TTL_MS = 60_000;

interface CachedPrice {
  usdPerHbar: number;
  fetchedAt: number;
  source: "coingecko" | "fallback";
}

let cache: CachedPrice | null = null;
let inflight: Promise<CachedPrice> | null = null;

/**
 * Read the configured fallback price from env. Returns null when unset or
 * malformed so callers can decide whether to fail hard or surface an error.
 */
function readFallback(): number | null {
  const raw = process.env.HBAR_USD_FALLBACK;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchFromCoinGecko(): Promise<number | null> {
  try {
    const res = await fetch(COINGECKO_URL, {
      // Don't let Next.js cache this at the framework layer — we manage our
      // own short-lived cache above so we control invalidation.
      cache: "no-store",
      // Reasonable timeout so a slow CoinGecko doesn't stall the user's quote.
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      "hedera-hashgraph"?: { usd?: number };
    };
    const usd = data?.["hedera-hashgraph"]?.usd;
    return typeof usd === "number" && usd > 0 ? usd : null;
  } catch {
    return null;
  }
}

/**
 * Returns the current HBAR price in USD, cached for 60 seconds. Uses
 * `HBAR_USD_FALLBACK` env var if CoinGecko fails. Throws only if neither
 * source has a usable price — that's a config error worth surfacing.
 */
export async function getHbarUsdPrice(): Promise<CachedPrice> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache;
  }

  // Coalesce concurrent callers so we never hammer CoinGecko while a fetch
  // is in flight.
  if (inflight) return inflight;

  inflight = (async () => {
    const fresh = await fetchFromCoinGecko();
    if (fresh !== null) {
      cache = { usdPerHbar: fresh, fetchedAt: Date.now(), source: "coingecko" };
      return cache;
    }

    const fallback = readFallback();
    if (fallback !== null) {
      console.warn(
        "[hbarPrice] CoinGecko unreachable — using HBAR_USD_FALLBACK=" +
          fallback
      );
      cache = {
        usdPerHbar: fallback,
        fetchedAt: Date.now(),
        source: "fallback",
      };
      return cache;
    }

    throw new Error(
      "Could not determine HBAR price. CoinGecko request failed and HBAR_USD_FALLBACK is not set."
    );
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Test-only helper. Reset the in-memory cache. Not used in production. */
export function __resetHbarPriceCacheForTests() {
  cache = null;
  inflight = null;
}
