// ──────────────────────────────────────────────────────────────────────────────
// Hedera Wallet (WalletConnect)
//
// Real Hedera wallet implementation backed by WalletConnect (HIP-820).
// Works with any compliant wallet — HashPack, Blade, Kabila, etc.
//
// This module is browser-only. It dynamically imports the wallet-connect SDK
// inside `connect()` so the bundle does not crash during SSR or in
// environments without `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
// ──────────────────────────────────────────────────────────────────────────────

import type {
  AccountId,
  HbarTransferParams,
  TransferResult,
  WalletMode,
  WalletProvider,
} from "./types";

// ── App metadata ──────────────────────────────────────────────────────────────

const APP_METADATA = {
  name: "hbario",
  description: "hbario — agentic payments on Hedera",
  url:
    typeof window !== "undefined"
      ? window.location.origin
      : "https://hbario.com",
  icons: ["https://avatars.githubusercontent.com/u/31002956"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Validate a Hedera account ID like `0.0.12345`. */
function isValidAccountId(accountId: string): boolean {
  return /^0\.\d+\.\d+$/.test(accountId);
}

function networkLabel(mode: WalletMode): string {
  return mode === "mainnet" ? "Hedera Mainnet" : "Hedera Testnet";
}

// ── Implementation ────────────────────────────────────────────────────────────

class HederaWallet implements WalletProvider {
  readonly mode: WalletMode;
  readonly displayName: string;

  private connector: unknown = null;
  private accountId: AccountId | null = null;
  private lastTransactionId: string | null = null;

  constructor(network: WalletMode) {
    this.mode = network;
    this.displayName = `WalletConnect (${networkLabel(network)})`;
  }

  // ── Lazy connector init ───────────────────────────────────────────────

  private async getConnector(): Promise<{
    connector: ConnectorLike;
    LedgerId: LedgerIdLike;
  }> {
    // Dynamic imports so this never runs at SSR / build time and the
    // pulled-in browser-only deps stay out of server bundles.
    const wc = await import("@hashgraph/hedera-wallet-connect");
    const sdk = await import("@hiero-ledger/sdk");

    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
    if (!projectId) {
      throw new Error(
        "WalletConnect project ID is missing. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID " +
          "in your .env (get one at https://cloud.reown.com)."
      );
    }

    if (!this.connector) {
      const network =
        this.mode === "mainnet" ? sdk.LedgerId.MAINNET : sdk.LedgerId.TESTNET;
      // DAppConnector(metadata, network, projectId, methods?, events?, chains?)
      this.connector = new wc.DAppConnector(
        APP_METADATA,
        network,
        projectId,
        undefined,
        undefined,
        [this.mode === "mainnet" ? "hedera:mainnet" : "hedera:testnet"]
      );
      await (this.connector as ConnectorLike).init({ logger: "error" });
    }

    return {
      connector: this.connector as ConnectorLike,
      LedgerId: sdk.LedgerId as unknown as LedgerIdLike,
    };
  }

  // ── Connect ───────────────────────────────────────────────────────────

  async connect(): Promise<boolean> {
    const { connector } = await this.getConnector();

    // If a previous session is still active, reuse it.
    const existing = connector.signers?.[0];
    if (existing) {
      this.accountId = existing.getAccountId().toString();
      return true;
    }

    try {
      await connector.openModal();
    } catch (err) {
      // User dismissed the modal or rejected.
      console.warn("Wallet connect cancelled:", err);
      return false;
    }

    const signer = connector.signers?.[0];
    if (!signer) return false;

    this.accountId = signer.getAccountId().toString();
    return true;
  }

  // ── Disconnect ────────────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    // 1) Drop the active WalletConnect session(s) on the relay.
    if (this.connector) {
      try {
        await (this.connector as ConnectorLike).disconnectAll();
      } catch (err) {
        // disconnectAll throws if there are no active sessions/pairings —
        // that's fine, treat it as already-disconnected.
        console.warn("Wallet disconnect error:", err);
      }
    }

    // 2) Null the in-memory connector so the next `connect()` rebuilds a
    //    fresh DAppConnector. Without this, the SDK happily reuses a
    //    stale signer from the previous user's pairing.
    this.connector = null;
    this.accountId = null;
    this.lastTransactionId = null;

    // 3) Aggressively wipe WalletConnect persistence from the browser.
    //    This is what stops the previous user's HashPack account from
    //    silently "reconnecting" when a new app user logs in on the same
    //    browser.
    if (typeof window === "undefined") return;

    try {
      const KEY_PATTERNS = [/^wc@2:/, /^WALLETCONNECT/, /^WCM_/, /^wagmi/];
      const toRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && KEY_PATTERNS.some((re) => re.test(key))) {
          toRemove.push(key);
        }
      }
      toRemove.forEach((k) => {
        try {
          window.localStorage.removeItem(k);
        } catch {
          /* ignore */
        }
      });
    } catch {
      // Storage may be unavailable (private mode, etc.) — ignore.
    }

    try {
      // WalletConnect's IndexedDB persistence — best-effort delete. The
      // delete request resolves asynchronously; we don't await so a
      // hanging request can't block logout.
      if (typeof indexedDB !== "undefined") {
        indexedDB.deleteDatabase("WALLET_CONNECT_V2_INDEXED_DB");
      }
    } catch {
      // ignore
    }
  }


  // ── Read helpers ──────────────────────────────────────────────────────

  getAccountId(): AccountId | null {
    return this.accountId;
  }

  getLastTransactionId(): string | null {
    return this.lastTransactionId;
  }

  isConnected(): boolean {
    return this.accountId !== null;
  }

  // ── Transfer ──────────────────────────────────────────────────────────

  async requestHbarTransfer(
    params: HbarTransferParams
  ): Promise<TransferResult> {
    if (!this.accountId) {
      return {
        success: false,
        error: "Wallet is not connected",
        network: this.mode,
      };
    }

    if (!isValidAccountId(params.recipient)) {
      return {
        success: false,
        error: `Invalid recipient account ID: "${params.recipient}". Expected format: 0.{shard}.{realm}.{num}`,
        network: this.mode,
      };
    }

    if (params.amount <= 0) {
      return {
        success: false,
        error: "Transfer amount must be greater than 0",
        network: this.mode,
      };
    }

    try {
      const sdk = await import("@hiero-ledger/sdk");

      const senderAccount = sdk.AccountId.fromString(this.accountId);
      const recipientAccount = sdk.AccountId.fromString(params.recipient);
      const amountHbar = sdk.Hbar.from(params.amount, sdk.HbarUnit.Hbar);

      const transferTx = new sdk.TransferTransaction()
        .addHbarTransfer(senderAccount, amountHbar.negated())
        .addHbarTransfer(recipientAccount, amountHbar);

      if (params.memo) {
        transferTx.setTransactionMemo(params.memo);
      }

      return await this.submitTransaction(transferTx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: message || "Transfer failed",
        network: this.mode,
      };
    }
  }

  // ── Generic sign + execute ────────────────────────────────────────────

  async signAndExecuteTransaction(transaction: unknown): Promise<TransferResult> {
    if (!this.accountId) {
      return {
        success: false,
        error: "Wallet is not connected",
        network: this.mode,
      };
    }
    try {
      return await this.submitTransaction(transaction);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: message || "Transaction failed",
        network: this.mode,
      };
    }
  }

  // ── Shared submit pipeline ────────────────────────────────────────────
  //
  // Populate node IDs / tx id via the DAppSigner (local op), then submit
  // through the WalletConnect JSON-RPC method directly. We deliberately
  // avoid `executeWithSigner` because the SDK's post-execute `getByKey`
  // receipt query is not implemented by the WC bridge.
  private async submitTransaction(tx: unknown): Promise<TransferResult> {
    const wc = await import("@hashgraph/hedera-wallet-connect");
    const { connector } = await this.getConnector();
    const signer = connector.signers?.[0];

    if (!signer) {
      return {
        success: false,
        error: "No active wallet signer. Please reconnect your wallet.",
        network: this.mode,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdkSigner = signer as any;
    const populated = await sdkSigner.populateTransaction(tx);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dapp = connector as any;
    const signerAccountId =
      this.mode === "mainnet"
        ? `hedera:mainnet:${this.accountId}`
        : `hedera:testnet:${this.accountId}`;

    const result = await dapp.signAndExecuteTransaction({
      signerAccountId,
      transactionList: wc.transactionToBase64String(populated),
    });

    const txId =
      typeof result?.transactionId === "string"
        ? result.transactionId
        : typeof result?.result?.transactionId === "string"
        ? result.result.transactionId
        : "";

    if (!txId) {
      return {
        success: false,
        error: "Wallet returned no transaction ID",
        network: this.mode,
      };
    }

    // ── Defensive: payer prefix must match the connected account ─────
    const payerFromTxId = txId.split("@")[0] ?? "";
    if (payerFromTxId && payerFromTxId !== this.accountId) {
      return {
        success: false,
        error:
          `Wallet signed with ${payerFromTxId} but this dApp expected ${this.accountId}. ` +
          "Your wallet session is stale — please click Disconnect, then Connect Wallet again to refresh the pairing.",
        network: this.mode,
      };
    }

    this.lastTransactionId = txId;
    return {
      success: true,
      transactionId: txId,
      network: this.mode,
    };
  }
}

// ── Loose structural types so we don't pull SDK types into this file ──────────

type LedgerIdLike = {
  MAINNET: unknown;
  TESTNET: unknown;
};

interface SignerLike {
  getAccountId(): { toString(): string };
}

interface ConnectorLike {
  init(opts?: { logger?: string }): Promise<void>;
  openModal(): Promise<unknown>;
  disconnectAll(): Promise<void>;
  signers?: SignerLike[];
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createHederaWallet(network: WalletMode): WalletProvider {
  return new HederaWallet(network);
}
