"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createWalletProvider,
  getDefaultNetwork,
  getStoredNetwork,
  setStoredNetwork,
} from "@/lib/wallet/walletManager";
import type {
  HbarTransferParams,
  PaymentApprovalPayload,
  TransferResult,
  WalletConnectionStatus,
  WalletMode,
  WalletProvider,
} from "@/lib/wallet/types";
import { useAuth } from "@/context/AuthContext";

// ── Context type ──────────────────────────────────────────────────────────────
//
// The wallet is held entirely in-browser per session. There's no server-side
// "bound wallet" — the only thing that matters is which wallet is connected
// right now when the user pays. This keeps the UX dead simple: connect in the
// chat/payment modal, sign, done. When the user logs out (or switches user)
// we tear down the session so the next person starts fresh.

interface WalletContextType {
  // Connection state
  connected: boolean;
  connecting: boolean;
  connectionStatus: WalletConnectionStatus;
  accountId: string | null;
  network: WalletMode;
  walletDisplayName: string;

  // Transfer state
  lastTransactionId: string | null;
  transferring: boolean;
  transferError: string | null;

  // Actions
  connectWallet: () => Promise<boolean>;
  disconnectWallet: () => Promise<void>;
  setNetwork: (network: WalletMode) => Promise<void>;
  requestHbarTransfer: (params: HbarTransferParams) => Promise<TransferResult>;
  /** Sign + execute an arbitrary prepared Hedera SDK transaction. */
  signAndExecuteTransaction: (transaction: unknown) => Promise<TransferResult>;
  clearTransferError: () => void;

  // Payment approval payload (shared across the modal flow)
  paymentPayload: PaymentApprovalPayload | null;
  setPaymentPayload: (payload: PaymentApprovalPayload | null) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export function WalletProviderWrapper({ children }: { children: ReactNode }) {
  // Initialize from the env-driven default so the server and the first
  // client render produce identical markup (avoids hydration mismatches).
  // The persisted localStorage value is applied in an effect below, after
  // hydration.
  const [network, setNetworkState] = useState<WalletMode>(() =>
    getDefaultNetwork()
  );

  const walletRef = useRef<WalletProvider | null>(null);
  const [walletDisplayName, setWalletDisplayName] = useState<string>("Wallet");

  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<WalletConnectionStatus>("disconnected");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [paymentPayload, setPaymentPayload] =
    useState<PaymentApprovalPayload | null>(null);

  // ── Lazy wallet creation per network ──────────────────────────────────

  const getWallet = useCallback((): WalletProvider => {
    if (!walletRef.current || walletRef.current.mode !== network) {
      walletRef.current = createWalletProvider(network);
      setWalletDisplayName(walletRef.current.displayName);
    }
    return walletRef.current;
  }, [network]);

  // Apply the user's persisted network choice once on mount.
  useEffect(() => {
    const stored = getStoredNetwork();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNetworkState((current) => (stored !== current ? stored : current));
  }, []);

  useEffect(() => {
    const wallet = getWallet();
    setWalletDisplayName(wallet.displayName);
  }, [getWallet]);

  const connecting = connectionStatus === "connecting";

  // ── Disconnect ────────────────────────────────────────────────────────

  const disconnectWallet = useCallback(async (): Promise<void> => {
    const wallet = walletRef.current;
    if (wallet) {
      try {
        await wallet.disconnect();
      } catch (err) {
        console.warn("Disconnect failed:", err);
      }
    }
    walletRef.current = null;
    setConnected(false);
    setConnectionStatus("disconnected");
    setAccountId(null);
    setLastTransactionId(null);
    setTransferError(null);
    setPaymentPayload(null);
  }, []);

  // ── Connect ───────────────────────────────────────────────────────────

  const connectWallet = useCallback(async (): Promise<boolean> => {
    const wallet = getWallet();
    setConnectionStatus("connecting");
    setTransferError(null);

    try {
      const success = await wallet.connect();
      if (!success) {
        setConnectionStatus("disconnected");
        return false;
      }

      const connectedAccountId = wallet.getAccountId();
      setConnected(true);
      setConnectionStatus("connected");
      setAccountId(connectedAccountId);
      return true;
    } catch (err) {
      console.error("Wallet connection failed:", err);
      setConnectionStatus("error");
      setTransferError(
        err instanceof Error ? err.message : "Failed to connect wallet"
      );
      return false;
    }
  }, [getWallet]);

  // ── Switch network ────────────────────────────────────────────────────

  const setNetwork = useCallback(
    async (next: WalletMode): Promise<void> => {
      if (next === network) return;
      await disconnectWallet();
      walletRef.current = null;
      setNetworkState(next);
      setStoredNetwork(next);
    },
    [network, disconnectWallet]
  );

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
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transfer failed";
        setTransferError(message);
        return {
          success: false,
          error: message,
          network,
        };
      } finally {
        setTransferring(false);
      }
    },
    [getWallet, network]
  );

  const signAndExecuteTransaction = useCallback(
    async (transaction: unknown): Promise<TransferResult> => {
      const wallet = getWallet();
      setTransferring(true);
      setTransferError(null);

      try {
        const result = await wallet.signAndExecuteTransaction(transaction);
        if (result.success && result.transactionId) {
          setLastTransactionId(result.transactionId);
        } else if (result.error) {
          setTransferError(result.error);
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transaction failed";
        setTransferError(message);
        return {
          success: false,
          error: message,
          network,
        };
      } finally {
        setTransferring(false);
      }
    },
    [getWallet, network]
  );

  const clearTransferError = useCallback(() => {
    setTransferError(null);
  }, []);

  // ── Watch the logged-in user. On user change (including logout), drop
  //    the in-browser wallet session so the next user starts fresh.
  const { user } = useAuth();
  const lastUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    const previousUserId = lastUserIdRef.current;
    if (currentUserId !== previousUserId) {
      lastUserIdRef.current = currentUserId;
      disconnectWallet().catch(() => {
        /* best effort */
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Value ─────────────────────────────────────────────────────────────

  const value: WalletContextType = {
    connected,
    connecting,
    connectionStatus,
    accountId,
    network,
    walletDisplayName,
    lastTransactionId,
    transferring,
    transferError,
    connectWallet,
    disconnectWallet,
    setNetwork,
    requestHbarTransfer,
    signAndExecuteTransaction,
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
