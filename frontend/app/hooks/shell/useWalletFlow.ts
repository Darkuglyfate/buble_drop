"use client";

import { useEffect, useMemo, useState } from "react";
import { createSiweMessage } from "viem/siwe";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
} from "wagmi";
import { base } from "wagmi/chains";
import { getAddress, type Address } from "viem";
import {
  captureAnalyticsEvent,
} from "../../analytics";
import {
  classifyWalletFlowError,
  getBubbleDropWalletConnectors,
  withFlowTimeout,
} from "../../base-wallet-runtime";
import {
  clearBubbleDropFrontendSignInSession,
  createSmokeSignInSession,
  hasVerifiedAuthSession,
  loadBubbleDropFrontendSignInSession,
  signInSessionMatchesWallet,
  storeBubbleDropFrontendSignInSession,
  type BubbleDropFrontendSignInSession,
} from "../../base-sign-in";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WalletFlowStage =
  | "idle"
  | "connecting"
  | "awaiting_wallet_approval"
  | "connected"
  | "signing_in"
  | "connect_failed"
  | "sign_in_failed"
  | "timed_out";

type WalletFlowPhase = "connect" | "sign_in" | null;

export type WalletFlowState = {
  stage: WalletFlowStage;
  phase: WalletFlowPhase;
  message: string | null;
  detail?: string | null;
};

type AuthSessionNonceResponse = {
  walletAddress: string;
  chainId: number;
  nonce: string;
  statement: string;
  expiresAt: string;
};

type VerifiedAuthSessionResponse = {
  walletAddress: string;
  chainId: number;
  issuedAt: string;
  expiresAt: string;
  authSessionToken: string;
};

type BackendFailureDetails = {
  userMessage: string;
  detail: string | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONNECT_TIMEOUT_MS = 25_000;
const SIGN_IN_TIMEOUT_MS = 45_000;

const IDLE_WALLET_FLOW_STATE: WalletFlowState = {
  stage: "idle",
  phase: null,
  message: null,
  detail: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSmokeWalletOverride():
  | {
      address: string;
      chainId: number;
    }
  | null {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_SMOKE_TEST_MODE !== "1" ||
    typeof window === "undefined"
  ) {
    return null;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const address = searchParams.get("smokeWalletAddress")?.trim().toLowerCase();
  if (!address) {
    return null;
  }

  const chainIdValue = searchParams.get("smokeChainId");
  const parsedChainId = chainIdValue ? Number(chainIdValue) : base.id;
  return {
    address,
    chainId: Number.isFinite(parsedChainId) ? parsedChainId : base.id,
  };
}

async function getBackendFailureDetails(
  response: Response,
  fallbackMessage: string,
): Promise<BackendFailureDetails> {
  let rawMessage = "";

  try {
    const responseText = await response.text();
    if (responseText) {
      try {
        const parsed = JSON.parse(responseText) as { message?: unknown };
        rawMessage =
          typeof parsed.message === "string" ? parsed.message.trim() : responseText.trim();
      } catch {
        rawMessage = responseText.trim();
      }
    }
  } catch {
    rawMessage = "";
  }

  if (
    response.status === 503 &&
    rawMessage === "BubbleDrop live data is unavailable right now."
  ) {
    return {
      userMessage: "BubbleDrop sign-in is temporarily unavailable right now.",
      detail:
        "Diagnostic: the frontend backend-proxy returned 503 because this deployment does not have a backend origin configured.",
    };
  }

  if (rawMessage) {
    return {
      userMessage: fallbackMessage,
      detail: `Diagnostic: backend returned ${response.status} ${rawMessage}`,
    };
  }

  return {
    userMessage: fallbackMessage,
    detail: `Diagnostic: backend returned HTTP ${response.status}.`,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

type UseWalletFlowOptions = {
  backendUrl: string;
};

export function useWalletFlow({ backendUrl }: UseWalletFlowOptions) {
  const [smokeWalletOverride, setSmokeWalletOverride] = useState<{
    address: string;
    chainId: number;
  } | null>(null);
  // Initialize synchronously from sessionStorage so the very first render
  // already knows the user is signed in. Otherwise the shell briefly shows
  // the "Sign in with Base" button while wagmi is still rehydrating.
  const [signInSession, setSignInSession] = useState<
    BubbleDropFrontendSignInSession | null
  >(() => loadBubbleDropFrontendSignInSession());
  const [walletFlowState, setWalletFlowState] =
    useState<WalletFlowState>(IDLE_WALLET_FLOW_STATE);
  const [isSigningInWithBase, setIsSigningInWithBase] = useState(false);

  const { address, chainId, isConnected, status: accountStatus } = useAccount();
  const { connectAsync, connectors, isPending: isWalletConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();

  // ---- derived ----
  const connectedWalletAddress =
    smokeWalletOverride?.address ?? address?.trim().toLowerCase() ?? null;
  const effectiveIsConnected = smokeWalletOverride ? true : isConnected;
  const effectiveChainId = smokeWalletOverride?.chainId ?? chainId;
  const isConnectedToBase =
    effectiveIsConnected && effectiveChainId === base.id;

  // While wagmi is still rehydrating its connection (e.g. on a fresh page
  // mount after navigation), connectedWalletAddress is null. Don't drop
  // the user back to "Sign in with Base" in that window — trust the
  // stored session if it exists. Once accountStatus settles to
  // 'connected', we re-evaluate against the real wallet address.
  const isWalletStillRehydrating =
    accountStatus === "reconnecting" || accountStatus === "connecting";
  const isSignedInWithBase = isWalletStillRehydrating && hasVerifiedAuthSession(signInSession)
    ? true
    : signInSessionMatchesWallet(
        signInSession,
        connectedWalletAddress,
        effectiveChainId,
      );
  const authenticatedSessionToken =
    isSignedInWithBase && hasVerifiedAuthSession(signInSession)
      ? signInSession?.authSessionToken ?? null
      : null;

  const {
    preferredConnector,
    coinbaseInjectedConnector,
    baseAccountConnector,
    coinbaseWalletConnector,
  } = useMemo(() => getBubbleDropWalletConnectors(connectors), [connectors]);
  const preferredConnectorUsesInjectedBase =
    preferredConnector?.id === coinbaseInjectedConnector?.id;
  const preferredConnectorUsesCoinbaseWallet =
    preferredConnector?.id === coinbaseWalletConnector?.id;
  const preferredConnectorUsesBaseAccount =
    preferredConnector?.id === baseAccountConnector?.id;
  const fallbackWalletConnector =
    [coinbaseWalletConnector, baseAccountConnector].find(
      (connector) => connector && connector.id !== preferredConnector?.id,
    ) ?? null;
  const fallbackConnectorUsesCoinbaseWallet =
    fallbackWalletConnector?.id === coinbaseWalletConnector?.id;

  const isWalletFlowBusy =
    isWalletConnectPending ||
    isSigningInWithBase ||
    walletFlowState.stage === "connecting" ||
    walletFlowState.stage === "awaiting_wallet_approval" ||
    walletFlowState.stage === "signing_in";
  const showConnectRecovery =
    !effectiveIsConnected &&
    (walletFlowState.stage === "connect_failed" ||
      (walletFlowState.stage === "timed_out" &&
        walletFlowState.phase === "connect"));
  const showSignInRecovery =
    effectiveIsConnected &&
    isConnectedToBase &&
    !isSignedInWithBase &&
    (walletFlowState.stage === "sign_in_failed" ||
      (walletFlowState.stage === "timed_out" &&
        walletFlowState.phase === "sign_in"));

  // ---- effects ----

  useEffect(() => {
    setSmokeWalletOverride(getSmokeWalletOverride());
  }, []);

  useEffect(() => {
    if (
      smokeWalletOverride &&
      connectedWalletAddress &&
      effectiveChainId === base.id
    ) {
      setSignInSession(
        createSmokeSignInSession(connectedWalletAddress, effectiveChainId),
      );
      return;
    }

    if (!connectedWalletAddress || !effectiveChainId) {
      // While wagmi is still rehydrating its connection state on page mount
      // or navigation, accountStatus is "connecting" or "reconnecting".
      // Don't nuke the stored session in that window — wait for a definitive
      // "disconnected" before clearing, otherwise the user is forced to
      // sign in again every time they navigate back to the home screen.
      if (accountStatus === "disconnected") {
        clearBubbleDropFrontendSignInSession();
        setSignInSession(null);
      }
      return;
    }

    const storedSession = loadBubbleDropFrontendSignInSession();
    if (
      signInSessionMatchesWallet(
        storedSession,
        connectedWalletAddress,
        effectiveChainId,
      )
    ) {
      setSignInSession(storedSession);
      return;
    }

    clearBubbleDropFrontendSignInSession();
    setSignInSession(null);
  }, [connectedWalletAddress, effectiveChainId, smokeWalletOverride, accountStatus]);

  useEffect(() => {
    if (!effectiveIsConnected) {
      setWalletFlowState((currentState) =>
        currentState.stage === "connect_failed" ||
        currentState.stage === "timed_out"
          ? currentState
          : IDLE_WALLET_FLOW_STATE,
      );
      return;
    }

    if (
      isSignedInWithBase &&
      (walletFlowState.stage === "signing_in" ||
        (walletFlowState.stage === "awaiting_wallet_approval" &&
          walletFlowState.phase === "sign_in"))
    ) {
      setWalletFlowState({
        stage: "connected",
        phase: "sign_in",
        message: "Wallet confirmed. You're signed in.",
        detail: null,
      });
    }
  }, [effectiveIsConnected, isSignedInWithBase, walletFlowState.phase, walletFlowState.stage]);

  // ---- handlers ----

  const connectWalletWithConnector = async (
    connector: NonNullable<typeof preferredConnector>,
    messages: {
      connecting: string;
      awaitingApproval: string;
      success: string;
      failed: string;
      timedOut: string;
    },
  ) => {
    setWalletFlowState({
      stage: "connecting",
      phase: "connect",
      message: messages.connecting,
      detail: null,
    });

    try {
      const connectPromise = connectAsync({ connector });
      setWalletFlowState({
        stage: "awaiting_wallet_approval",
        phase: "connect",
        message: messages.awaitingApproval,
        detail: null,
      });
      await withFlowTimeout(connectPromise, CONNECT_TIMEOUT_MS, "connect");
      setWalletFlowState({
        stage: "connected",
        phase: "connect",
        message: messages.success,
        detail: null,
      });
    } catch (error) {
      const classifiedError = classifyWalletFlowError(error);
      if (classifiedError.kind === "timeout") {
        setWalletFlowState({
          stage: "timed_out",
          phase: "connect",
          message: messages.timedOut,
          detail: "Diagnostic: wallet connection did not resolve before the local timeout window expired.",
        });
        return;
      }

      setWalletFlowState({
        stage: "connect_failed",
        phase: "connect",
        message:
          classifiedError.kind === "rejected"
            ? "Connection was cancelled. You can retry when you're ready."
            : messages.failed,
        detail:
          classifiedError.kind === "rejected"
            ? "Diagnostic: wallet connection request was rejected or closed by the wallet runtime."
            : `Diagnostic: ${classifiedError.message}`,
      });
    }
  };

  const onConnectWallet = async () => {
    if (!preferredConnector) {
      setWalletFlowState({
        stage: "connect_failed",
        phase: "connect",
        message: "BubbleDrop could not open a Base wallet connection right now.",
        detail: "Diagnostic: no compatible Base or Coinbase wallet connector is available in this runtime.",
      });
      return;
    }

    if (preferredConnectorUsesCoinbaseWallet) {
      await connectWalletWithConnector(preferredConnector, {
        connecting: "Opening Coinbase Wallet...",
        awaitingApproval: "Approve the Coinbase Wallet connection request to continue.",
        success: "Wallet connected. Switch to Base if needed, then sign in.",
        failed: "Coinbase Wallet did not complete.",
        timedOut: "Coinbase Wallet took too long. Please retry.",
      });
      return;
    }

    if (preferredConnectorUsesBaseAccount) {
      await connectWalletWithConnector(preferredConnector, {
        connecting: "Opening Base connection...",
        awaitingApproval: "Approve the Base connection request to continue.",
        success: "Wallet connected. Continue with Sign in with Base.",
        failed: "BubbleDrop could not complete the Base connection right now.",
        timedOut: "Base connection took too long. Please retry.",
      });
      return;
    }

    await connectWalletWithConnector(preferredConnector, {
      connecting: preferredConnectorUsesInjectedBase
        ? "Checking for the in-app Base wallet..."
        : "Opening your Base wallet...",
      awaitingApproval: preferredConnectorUsesInjectedBase
        ? "Approve the in-app wallet prompt to continue."
        : "Approve the wallet connection request to continue.",
      success: "Wallet connected. Continue with Sign in with Base.",
      failed: preferredConnectorUsesInjectedBase
        ? "BubbleDrop could not complete the in-app Base connection. Stay in Base App and try again."
        : "BubbleDrop could not connect this wallet right now.",
      timedOut: preferredConnectorUsesInjectedBase
        ? "The in-app wallet prompt took too long. Stay in Base App and try again."
        : "Wallet connection took too long. Please retry.",
    });
  };

  const onConnectCoinbaseWallet = async () => {
    if (!fallbackWalletConnector) {
      return;
    }

    if (fallbackConnectorUsesCoinbaseWallet) {
      await connectWalletWithConnector(fallbackWalletConnector, {
        connecting: "Opening Coinbase Wallet fallback...",
        awaitingApproval: "Approve the Coinbase Wallet connection request to continue.",
        success: "Wallet connected. Switch to Base if needed, then sign in.",
        failed: "Coinbase Wallet fallback did not complete.",
        timedOut: "Coinbase Wallet fallback took too long. Please retry.",
      });
      return;
    }

    await connectWalletWithConnector(fallbackWalletConnector, {
      connecting: "Opening alternate Base connection...",
      awaitingApproval: "Approve the alternate Base connection request to continue.",
      success: "Wallet connected. Switch to Base if needed, then sign in.",
      failed: "Alternate Base connection did not complete.",
      timedOut: "Alternate Base connection took too long. Please retry.",
    });
  };

  const onSwitchToBase = async (setActionMessage: (msg: string | null) => void) => {
    setActionMessage("Switching to Base...");
    try {
      await switchChainAsync({ chainId: base.id });
      setActionMessage("Connected wallet is now on Base.");
    } catch {
      setActionMessage("We couldn't switch that wallet to Base.");
    }
  };

  const onClearBaseSignIn = (setActionMessage: (msg: string | null) => void) => {
    clearBubbleDropFrontendSignInSession();
    setSignInSession(null);
    setWalletFlowState(IDLE_WALLET_FLOW_STATE);
    setActionMessage("This browser session is signed out.");
  };

  const onSignInWithBase = async (setActionMessage: (msg: string | null) => void) => {
    if (!connectedWalletAddress) {
      setActionMessage("Connect your Base wallet first.");
      return;
    }
    if (!isConnectedToBase || !effectiveChainId) {
      setActionMessage("Switch to Base before signing in.");
      return;
    }

    setIsSigningInWithBase(true);
    setWalletFlowState({
      stage: "signing_in",
      phase: "sign_in",
      message: "Preparing secure sign-in...",
        detail: null,
    });

    try {
      const nonceResponse = await withFlowTimeout(
        fetch(`${backendUrl}/auth/session/nonce`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: connectedWalletAddress,
            chainId: effectiveChainId,
          }),
        }),
        SIGN_IN_TIMEOUT_MS,
        "sign_in",
      );
      if (!nonceResponse.ok) {
        const failureDetails = await getBackendFailureDetails(
          nonceResponse,
          "Sign in could not start right now.",
        );
        setWalletFlowState({
          stage: "sign_in_failed",
          phase: "sign_in",
          message: failureDetails.userMessage,
          detail: failureDetails.detail,
        });
        return;
      }

      const noncePayload =
        (await nonceResponse.json()) as AuthSessionNonceResponse;
      const issuedAt = new Date();
      // Convert to EIP-55 checksum format — Base Smart Wallet strictly
      // validates the address case in the SIWE message and rejects the
      // lowercase form returned by the backend normaliser.
      const checksummedAddress = getAddress(noncePayload.walletAddress);
      const message = createSiweMessage({
        address: checksummedAddress,
        chainId: noncePayload.chainId,
        domain: window.location.host,
        nonce: noncePayload.nonce,
        statement: noncePayload.statement,
        uri: window.location.origin,
        version: "1",
        issuedAt,
      });
      setWalletFlowState({
        stage: "awaiting_wallet_approval",
        phase: "sign_in",
        message: "Approve the Base signature to finish sign-in.",
        detail: null,
      });
      const signature = await withFlowTimeout(
        signMessageAsync({ message }),
        SIGN_IN_TIMEOUT_MS,
        "sign_in",
      );
      setWalletFlowState({
        stage: "signing_in",
        phase: "sign_in",
        message: "Finishing secure sign-in...",
        detail: null,
      });
      const verifyResponse = await withFlowTimeout(
        fetch(`${backendUrl}/auth/session/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            signature,
          }),
        }),
        SIGN_IN_TIMEOUT_MS,
        "sign_in",
      );
      if (!verifyResponse.ok) {
        const failureDetails = await getBackendFailureDetails(
          verifyResponse,
          "That signature could not be verified. Please try again.",
        );
        setWalletFlowState({
          stage: "sign_in_failed",
          phase: "sign_in",
          message: failureDetails.userMessage,
          detail: failureDetails.detail,
        });
        return;
      }
      const verifiedSession =
        (await verifyResponse.json()) as VerifiedAuthSessionResponse;

      const session: BubbleDropFrontendSignInSession = {
        address: verifiedSession.walletAddress,
        chainId: verifiedSession.chainId,
        issuedAt: verifiedSession.issuedAt,
        expiresAt: verifiedSession.expiresAt,
        statement: noncePayload.statement,
        message,
        signature,
        authSessionToken: verifiedSession.authSessionToken,
        mode: "siwe",
      };
      storeBubbleDropFrontendSignInSession(session);
      setSignInSession(session);
      captureAnalyticsEvent("bubbledrop_frontend_base_sign_in_completed", {
        wallet_address: verifiedSession.walletAddress,
        chain_id: verifiedSession.chainId,
      });
      setWalletFlowState({
        stage: "connected",
        phase: "sign_in",
        message: "Wallet confirmed. You're signed in.",
        detail: null,
      });
    } catch (error) {
      const classifiedError = classifyWalletFlowError(error);
      if (classifiedError.kind === "timeout") {
        setWalletFlowState({
          stage: "timed_out",
          phase: "sign_in",
          message: "The signature request took too long. Please retry in Base App.",
          detail:
            "Diagnostic: the sign-in flow did not complete before the local timeout window expired.",
        });
        return;
      }

      setWalletFlowState({
        stage: "sign_in_failed",
        phase: "sign_in",
        message:
          classifiedError.kind === "rejected"
            ? "The signature request was cancelled. You can retry when you're ready."
            : "The signature request did not complete.",
        detail:
          classifiedError.kind === "rejected"
            ? "Diagnostic: the wallet rejected or closed the signature prompt."
            : `Diagnostic: ${classifiedError.message}`,
      });
    } finally {
      setIsSigningInWithBase(false);
    }
  };

  const onDisconnectWallet = () => {
    setWalletFlowState(IDLE_WALLET_FLOW_STATE);
    disconnect();
  };

  return {
    connectedWalletAddress,
    effectiveIsConnected,
    effectiveChainId,
    isConnectedToBase,
    isSignedInWithBase,
    authenticatedSessionToken,
    walletFlowState,
    signInSession,
    isSigningInWithBase,
    isWalletFlowBusy,
    showConnectRecovery,
    showSignInRecovery,
    preferredConnectorUsesCoinbaseWallet,
    preferredConnectorUsesBaseAccount,
    fallbackWalletConnector,
    fallbackConnectorUsesCoinbaseWallet,
    onConnectWallet,
    onConnectCoinbaseWallet,
    onSwitchToBase,
    onSignInWithBase,
    onClearBaseSignIn,
    onDisconnectWallet,
  };
}
