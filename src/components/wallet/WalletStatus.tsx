"use client";

import { useWallet } from "@/context/WalletContext";

export default function WalletStatus() {
  const { connected, accountId, walletMode, lastTransactionId, walletDisplayName } = useWallet();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Wallet Status</h3>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Provider</label>
          <p className="mt-1 text-sm text-gray-900">{walletDisplayName}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Mode</label>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${walletMode === "mock" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
              {walletMode === "mock" ? "Mock" : "Real"}
            </span>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Connection</label>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${connected ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
        {connected && accountId && (
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Account ID</label>
            <p className="mt-1 font-mono text-sm text-gray-900">{accountId}</p>
          </div>
        )}
        {lastTransactionId && (
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Transaction</label>
            <p className="mt-1 font-mono text-sm text-gray-900">{lastTransactionId}</p>
          </div>
        )}
      </div>
    </div>
  );
}
