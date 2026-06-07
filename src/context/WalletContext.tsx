"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  createWalletProvider,
  getCurrentWalletMode,
} from "@/lib/wallet/walletManager";
import type {
  WalletProvider,
  WalletConnectionStatus,
  WalletMode,
  HbarTransferParams,
  TransferResult,
  PaymentApprovalPayload,
} from "@/lib/wallet/types";

// ── Context Type ──────────────────────────────────────────────────────────────

interface WalletContextType {
  // Connection state
  connected: boolean;
  connecting: boolean;
  connectionStatus: WalletConnectionStatus;
  accountId: string | null;
  walletMode: WalletMode;
  walletDisplayName: string;

  // Transfer state
  lastTransactionId: string | null;
  transferring: boolean;
  transferError: string | null;

  // Actions
  connectWallet: () => Promise<boolean>;
  disconnectWallet: () => void;
  requestHbarTransfer: (params: HbarTransferParams) => Promise<TransferResult>;
  clearTransferError: () => void;

  // Payment approval
  paymentPayload: PaymentApprovalPayload | null;
  setPaymentPayload: (payload: PaymentApprovalPayload | null) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export function WalletProviderWrapper({ children }: { children: ReactNode }) {
  const walletRef = useRef<WalletProvider | null>(null);

  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<WalletConnectionStatus>("disconnected");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [paymentPayload, setPaymentPayload] = useState<PaymentApprovalPayload | null>(null);

  // Initialize wallet provider once
  const getWallet = useCallback((): WalletProvider => {
    if (!walletRef.current) {
      walletRef.current = createWalletProvider();
    }
    return walletRef.current;
  }, []);

  const walletMode: WalletMode = getCurrentWalletMode();
  const walletDisplayName = walletRef.current?.displayName ?? "Wallet";

  const connecting = connectionStatus === "connecting";

  // ── Connect ───────────────────────────────────────────────────────────

  const connectWallet = useCallback(async (): Promise<boolean> => {
    const wallet = getWallet();
    setConnectionStatus("connecting");
    setTransferError(null);

    try {
      const success = await wallet.connect();
      if (success) {
        setConnected(true);
        setConnectionStatus("connected");
        const id = wallet.getAccountId();
        setAccountId(id);
        return true;
      } else {
        setConnectionStatus("error");
        return false;
      }
    } catch (error) {
      console.error("Wallet connection failed:", error);
      setConnectionStatus("error");
      return false;
    }
  }, [getWallet]);

  // ── Disconnect ────────────────────────────────────────────────────────

  const disconnectWallet = useCallback(() => {
    const wallet = getWallet();
    wallet.disconnect();
    setConnected(false);
    setConnectionStatus("disconnected");
    setAccountId(null);
    setLastTransactionId(null);
    setTransferError(null);
    setPaymentPayload(null);
  }, [getWallet]);

  // ── Transfer ──────────────────────────────────────────────────────────

  const requestHbarTransfer = useCallback(
    async (params: HbarTransferParams): Promise<TransferResult> => {
      const wallet = getWallet();
      setTransferring(true);
      setTransferError(null);

      try {
        const result = await wallet.requestHbarTransfer(params);

        if (result.success && result.transactionId) {
          setLastTransactionId(result.transactionId);
        } else if (result.error) {
          setTransferError(result.error);
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Transfer failed";
        setTransferError(errorMessage);
        return {
          success: false,
          error: errorMessage,
          isMock: wallet.mode === "mock",
        };
      } finally {
        setTransferring(false);
      }
    },
    [getWallet]
  );

  // ── Clear Error ───────────────────────────────────────────────────────

  const clearTransferError = useCallback(() => {
    setTransferError(null);
  }, []);

  // ── Value ─────────────────────────────────────────────────────────────

  const value: WalletContextType = {
    connected,
    connecting,
    connectionStatus,
    accountId,
    walletMode,
    walletDisplayName,
    lastTransactionId,
    transferring,
    transferError,
    connectWallet,
    disconnectWallet,
    requestHbarTransfer,
    clearTransferError,
    paymentPayload,
    setPaymentPayload,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
