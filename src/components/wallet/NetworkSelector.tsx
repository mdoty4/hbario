"use client";

import { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import type { WalletMode } from "@/lib/wallet/types";

/**
 * Toggle between Hedera testnet and mainnet.
 *
 * Switching while connected automatically disconnects. Switching to mainnet
 * surfaces an extra confirmation banner so the user can't accidentally send
 * real HBAR.
 */
export default function NetworkSelector() {
  const { network, setNetwork, connected } = useWallet();
  const [pendingMainnet, setPendingMainnet] = useState(false);

  const handleSelect = async (next: WalletMode) => {
    if (next === network) return;
    if (next === "mainnet") {
      setPendingMainnet(true);
      return;
    }
    await setNetwork(next);
  };

  const confirmMainnet = async () => {
    setPendingMainnet(false);
    await setNetwork("mainnet");
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Hedera Network</h2>
          <p className="mt-1 text-sm text-gray-500">
            Choose which Hedera network your wallet will connect to.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Hedera network"
          className="inline-flex shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-1"
        >
          <NetworkButton
            label="Testnet"
            sublabel="Fake HBAR"
            active={network === "testnet"}
            color="emerald"
            onClick={() => handleSelect("testnet")}
          />
          <NetworkButton
            label="Mainnet"
            sublabel="Real HBAR"
            active={network === "mainnet"}
            color="red"
            onClick={() => handleSelect("mainnet")}
          />
        </div>
      </div>

      {network === "mainnet" && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <strong>Mainnet active.</strong> Real HBAR will be transferred. Double-check every
          transaction before approving in your wallet.
        </div>
      )}

      {network === "testnet" && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Testnet active. No real HBAR is transferred. Need test HBAR? Use the{" "}
          <a
            href="https://portal.hedera.com/faucet"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline hover:text-emerald-900"
          >
            Hedera faucet
          </a>
          .
        </div>
      )}

      {connected && (
        <p className="mt-3 text-xs text-gray-500">
          Switching networks will disconnect your current wallet session.
        </p>
      )}

      {pendingMainnet && (
        <MainnetConfirmModal
          onConfirm={confirmMainnet}
          onCancel={() => setPendingMainnet(false)}
        />
      )}
    </div>
  );
}

function NetworkButton({
  label,
  sublabel,
  active,
  color,
  onClick,
}: {
  label: string;
  sublabel: string;
  active: boolean;
  color: "emerald" | "red";
  onClick: () => void;
}) {
  const activeClasses =
    color === "emerald"
      ? "bg-emerald-600 text-white shadow"
      : "bg-red-600 text-white shadow";
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
        active ? activeClasses : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      <span className="block">{label}</span>
      <span
        className={`block text-[10px] font-medium uppercase tracking-wide ${
          active ? "opacity-90" : "text-gray-400"
        }`}
      >
        {sublabel}
      </span>
    </button>
  );
}

function MainnetConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-md mx-4 rounded-xl bg-white shadow-2xl border border-gray-200 p-6">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-6 w-6 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M5 19a2 2 0 01-1.732-3L10.268 4a2 2 0 013.464 0l7 12A2 2 0 0119 19H5z"
            />
          </svg>
        </div>
        <h3 className="text-center text-lg font-semibold text-gray-900">
          Switch to Hedera Mainnet?
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          Any transactions you approve will move <strong>real HBAR</strong>. Double-check the
          recipient and amount in your wallet before approving.
        </p>
        <label className="mt-4 flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-600"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span>
            I understand transactions on mainnet move real HBAR and cannot be reversed.
          </span>
        </label>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!acknowledged}
            className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold text-white shadow-sm ${
              acknowledged
                ? "bg-red-600 hover:bg-red-500"
                : "bg-red-300 cursor-not-allowed"
            }`}
          >
            Switch to Mainnet
          </button>
        </div>
      </div>
    </div>
  );
}
