"use client";

import WalletConnectButton from "@/components/wallet/WalletConnectButton";
import WalletStatus from "@/components/wallet/WalletStatus";
import { useWallet } from "@/context/WalletContext";

export default function WalletPage() {
  const { connected, accountId, walletMode } = useWallet();

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-gray-50">
      <div className="flex-1 px-4 py-8">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Wallet</h1>
            <p className="mt-2 text-gray-600">
              Manage your Hedera wallet connection and view payment details.
            </p>
          </div>

          {/* Connect / Disconnect */}
          <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Connect Wallet</h2>
            <p className="text-sm text-gray-500 mb-4">
              {walletMode === "mock"
                ? "Mock wallet mode is active. No real HBAR transactions will occur."
                : "Connect your Hedera testnet wallet to manage payments."}
            </p>
            <WalletConnectButton />
          </div>

          {/* Wallet Status */}
          <div className="grid gap-6 lg:grid-cols-2">
            <WalletStatus />

            {/* Quick Actions */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                {connected && accountId ? (
                  <>
                    <div className="rounded-md bg-green-50 border border-green-200 p-4">
                      <p className="text-sm font-medium text-green-800">Wallet Connected</p>
                      <p className="mt-1 text-xs text-green-600">
                        You can now approve payments for workflow unlocks.
                      </p>
                    </div>
                    <div className="rounded-md bg-blue-50 border border-blue-200 p-4">
                      <p className="text-sm font-medium text-blue-800">Ready to Pay</p>
                      <p className="mt-1 text-xs text-blue-600">
                        Navigate to a workflow and click Execute to start the payment flow.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="rounded-md bg-gray-50 border border-gray-200 p-4">
                    <p className="text-sm font-medium text-gray-800">Wallet Required</p>
                    <p className="mt-1 text-xs text-gray-600">
                      Connect your wallet above to enable payment approvals and workflow execution.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Payment Info */}
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">How Payments Work</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600 mb-3">
                  1
                </div>
                <h4 className="text-sm font-semibold text-gray-900">Create Workflow</h4>
                <p className="mt-1 text-xs text-gray-600">
                  Use the chat to generate a workflow draft.
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600 mb-3">
                  2
                </div>
                <h4 className="text-sm font-semibold text-gray-900">Approve Payment</h4>
                <p className="mt-1 text-xs text-gray-600">
                  Review payment details and approve from your wallet.
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600 mb-3">
                  3
                </div>
                <h4 className="text-sm font-semibold text-gray-900">Unlock & Execute</h4>
                <p className="mt-1 text-xs text-gray-600">
                  Once verified, your workflow is unlocked and ready.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

