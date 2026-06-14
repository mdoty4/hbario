"use client";

import { useEffect } from "react";
import { useWallet } from "@/context/WalletContext";

// Public env var — Next.js inlines these at build time. We use it here only to
// avoid showing a clickable "Connect" button when the dApp itself isn't
// configured to talk to WalletConnect. End users never see the env var name
// or any setup instructions — that's a dev/deployer concern.
const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export default function WalletConnectButton() {
  const {
    connected,
    connecting,
    accountId,
    network,
    connectWallet,
    disconnectWallet,
    transferError,
    clearTransferError,
  } = useWallet();

  const missingProjectId = !PROJECT_ID || PROJECT_ID.trim() === "";

  // Dev-only console hint: if a developer is running the app without the env
  // var set, surface it in the terminal/devtools instead of the UI.
  useEffect(() => {
    if (missingProjectId && typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.error(
        "[wallet] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set — wallet connect is disabled. " +
          "See README.md for setup."
      );
    }
  }, [missingProjectId]);

  // ── Connected state ────────────────────────────────────────────────────
  if (connected && accountId) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 border border-green-200">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-sm font-mono text-green-700">{accountId}</span>
          <NetworkBadge network={network} />
        </div>
        <button
          onClick={disconnectWallet}
          className="text-sm font-medium text-gray-500 hover:text-red-600 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // ── Disabled state (dApp misconfigured — no UI noise about why) ────────
  if (missingProjectId) {
    return (
      <button
        disabled
        title="Wallet connection is currently unavailable"
        className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold shadow-sm bg-gray-100 text-gray-400 cursor-not-allowed"
      >
        <WalletIcon /> Wallet unavailable
      </button>
    );
  }

  // ── Normal disconnected state ──────────────────────────────────────────
  return (
    <div className="space-y-3">
      {transferError && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <div>
            <p className="font-semibold">Wallet connection failed</p>
            <p className="mt-0.5 text-red-700">{transferError}</p>
          </div>
          <button
            onClick={clearTransferError}
            className="text-xs font-medium text-red-600 hover:text-red-800"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      <button
        onClick={connectWallet}
        disabled={connecting}
        className={`
          inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition-colors
          ${
            connecting
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-500"
          }
        `}
      >
        {connecting ? (
          <>
            <Spinner /> Connecting...
          </>
        ) : (
          <>
            <WalletIcon /> Connect Wallet
          </>
        )}
      </button>

      <p className="text-xs text-gray-500">
        Opens the WalletConnect picker — choose <strong>HashPack</strong>,{" "}
        <strong>Blade</strong>, or any other HIP-820 wallet, then approve in
        your wallet app.
      </p>
    </div>
  );
}

function NetworkBadge({ network }: { network: "testnet" | "mainnet" }) {
  if (network === "mainnet") {
    return (
      <span className="text-xs font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
        MAINNET
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
      TESTNET
    </span>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}
