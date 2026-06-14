// ──────────────────────────────────────────────────────────────────────────────
// Hedera Agent Kit Factory
//
// Builds a per-network Hedera Agent Kit instance running in RETURN_BYTES
// (human-in-the-loop) mode. In this mode, the kit produces unsigned
// transaction bytes that we hand off to the user's WalletConnect signer —
// no private keys ever live on the server.
//
// This is the single seam through which the app talks to hedera-agent-kit.
// Every other module imports tools via `getAgentKitTools()` so we can swap
// the kit version (or run it autonomously for a CLI/cron job) without
// touching call sites.
//
// Docs: https://github.com/hashgraph/hedera-agent-kit
// ──────────────────────────────────────────────────────────────────────────────

import {
  AgentMode,
  HederaLangchainToolkit,
  coreAccountPlugin,
  coreAccountQueryPlugin,
  coreConsensusPlugin,
  coreConsensusQueryPlugin,
  coreMiscQueriesPlugin,
  coreTokenPlugin,
  coreTokenQueryPlugin,
  coreTransactionQueryPlugin,
} from "hedera-agent-kit";
import type { Client as HederaClient } from "@hashgraph/sdk";
import { Client } from "@hashgraph/sdk";
import type { WalletMode } from "@/lib/wallet/types";

// ── Client cache ──────────────────────────────────────────────────────────────
// Hedera SDK Client objects are relatively expensive (gRPC channels, mirror
// node config). We keep one per network per process — Next.js dev mode hot
// reloads will throw it away, that's fine.

const clientCache = new Map<WalletMode, HederaClient>();

/**
 * Get (and lazily build) a Hedera SDK Client for the requested network.
 * The client is **unauthenticated** — there's no operator key set on it
 * because we never sign on the server in HITL mode.
 */
export function getHederaClient(network: WalletMode): HederaClient {
  const cached = clientCache.get(network);
  if (cached) return cached;
  const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  clientCache.set(network, client);
  return client;
}

// ── Toolkit factory ───────────────────────────────────────────────────────────

export interface AgentKitOptions {
  /** Hedera network — testnet or mainnet. */
  network: WalletMode;
  /**
   * The user's connected wallet account. In RETURN_BYTES mode the kit needs
   * this to set as the transaction's payer/source so the tx bytes can be
   * signed by the user's wallet downstream.
   */
  userAccountId: string;
  /**
   * Optional public key for the user's account. Most tools don't need it —
   * we leave it undefined and the kit fetches it via the mirror node when
   * required.
   */
  userPublicKey?: string;
}

/**
 * Build a Hedera Agent Kit (LangChain-style toolkit) configured for HITL /
 * return-bytes mode. The returned `toolkit` exposes:
 *
 *  - `getTools()` — array of `StructuredTool`s suitable for LangChain agents
 *  - `getHederaAgentKitAPI()` — raw API for direct method calls
 *
 * In RETURN_BYTES mode every "write" tool (transfer HBAR, mint NFT, submit
 * topic message, …) returns `{ bytes: Uint8Array }` instead of executing.
 * Hand those bytes to `signAndSubmitBytes()` on the wallet provider.
 */
export function createAgentKit(opts: AgentKitOptions): HederaLangchainToolkit {
  const client = getHederaClient(opts.network);

  return new HederaLangchainToolkit({
    client,
    configuration: {
      plugins: [
        // Read / query plugins — safe in HITL mode, results are returned
        // directly to the caller.
        coreAccountQueryPlugin,
        coreConsensusQueryPlugin,
        coreMiscQueriesPlugin,
        coreTokenQueryPlugin,
        coreTransactionQueryPlugin,
        // Write plugins — in RETURN_BYTES mode these emit unsigned bytes
        // for the user wallet to sign and submit.
        coreAccountPlugin,
        coreConsensusPlugin,
        coreTokenPlugin,
      ],
      context: {
        mode: AgentMode.RETURN_BYTES,
        accountId: opts.userAccountId,
        accountPublicKey: opts.userPublicKey,
      },
    },
  });
}

/**
 * Convenience: get a LangChain-compatible list of Hedera tools for the given
 * user/network. Cached per (network, accountId) pair so we don't re-instantiate
 * the kit on every chat message.
 */
const toolkitCache = new Map<string, HederaLangchainToolkit>();

export function getAgentKitToolkit(opts: AgentKitOptions): HederaLangchainToolkit {
  const key = `${opts.network}::${opts.userAccountId}`;
  const cached = toolkitCache.get(key);
  if (cached) return cached;
  const toolkit = createAgentKit(opts);
  toolkitCache.set(key, toolkit);
  return toolkit;
}

/**
 * Drop any cached toolkit for a user. Call this after a wallet
 * disconnect/bind change so subsequent chat messages pick up the new
 * account context.
 */
export function clearAgentKitCache(userAccountId?: string): void {
  if (!userAccountId) {
    toolkitCache.clear();
    return;
  }
  for (const key of toolkitCache.keys()) {
    if (key.endsWith(`::${userAccountId}`)) {
      toolkitCache.delete(key);
    }
  }
}
