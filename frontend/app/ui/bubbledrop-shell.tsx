"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { createSiweMessage } from "viem/siwe";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
} from "wagmi";
import { base } from "wagmi/chains";
import {
  captureAnalyticsEvent,
  identifyAnalyticsUser,
} from "../analytics";
import {
  clearBubbleDropFrontendSignInSession,
  createAuthenticatedJsonHeaders,
  createSmokeSignInSession,
  hasVerifiedAuthSession,
  loadBubbleDropFrontendSignInSession,
  signInSessionMatchesWallet,
  storeBubbleDropFrontendSignInSession,
  type BubbleDropFrontendSignInSession,
} from "../base-sign-in";
import {
  BUBBLEDROP_API_BASE,
  useBubbleDropRuntime,
  withBubbleDropContext,
} from "../bubbledrop-runtime";
import {
  type BackendProfileSummary,
  fetchBackendProfileSummary,
} from "./backend-profile-summary";

type ProfileBootstrapResponse = {
  profileId: string;
  walletAddress: string;
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

type DailyCheckInResponse = {
  checkInDate: string;
};

type StarterAvatar = {
  id: string;
  key: string;
  label: string;
};

type OnboardingCompletionResponse = {
  profileId: string;
  nickname: string;
  avatarId: string;
  onboardingXpGranted: number;
  totalXp: number;
};

type OnboardingCard = {
  id: string;
  title: string;
  question: string;
  options: [string, string];
  correctIndex: 0 | 1;
  wrongExplanation: string;
};

type QualificationStatus =
  | "locked"
  | "in_progress"
  | "qualified"
  | "paused"
  | "restored";

const QUALIFICATION_BADGE_COPY: Record<
  QualificationStatus,
  {
    label: string;
    className: string;
  }
> = {
  locked: {
    label: "Locked",
    className: "bg-[#eef2fb] text-[#5d6f93]",
  },
  in_progress: {
    label: "In progress",
    className:
      "bg-gradient-to-r from-[#dff2ff] to-[#e7e3ff] text-[#39588d]",
  },
  paused: {
    label: "Paused",
    className: "bg-[#f2ecff] text-[#6a5d93]",
  },
  restored: {
    label: "Restored",
    className:
      "bg-gradient-to-r from-[#fff0b0] to-[#ffd8ef] text-[#6e4f1f] shadow-[0_0_16px_rgba(255,212,135,0.45)]",
  },
  qualified: {
    label: "Qualified",
    className:
      "bg-gradient-to-r from-[#ffe38f] to-[#ffb5e7] text-[#6b3f00] shadow-[0_0_20px_rgba(255,208,128,0.65)]",
  },
};

const ONBOARDING_CARDS: OnboardingCard[] = [
  {
    id: "daily-checkin",
    title: "Daily rhythm",
    question: "What keeps rare reward access active in BubbleDrop?",
    options: ["Daily Base check-in", "Opening the app only"],
    correctIndex: 0,
    wrongExplanation:
      "Rare reward access is tied to daily Base check-ins, not passive app opens.",
  },
  {
    id: "active-play",
    title: "Active session",
    question: "When is XP earned in bubble sessions?",
    options: ["Only during active play", "While idle in the app"],
    correctIndex: 0,
    wrongExplanation:
      "XP is active-play based. Idle presence must not grant session XP.",
  },
  {
    id: "qualified-overlay",
    title: "Status logic",
    question: "How does Qualified Status work with Rank Frame?",
    options: ["It overlays Rank Frame", "It replaces Rank Frame"],
    correctIndex: 0,
    wrongExplanation:
      "Qualified is a live overlay. Rank Frame remains long-term profile status.",
  },
];

function getSmokeWalletOverride():
  | {
      address: string;
      chainId: number;
    }
  | null {
  if (
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

async function fetchStarterAvatars(backendUrl: string): Promise<StarterAvatar[]> {
  const response = await fetch(`${backendUrl}/profile/starter-avatars`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as StarterAvatar[];
}

export function BubbleDropShell() {
  const backendUrl = BUBBLEDROP_API_BASE;
  const runtimeContext = useBubbleDropRuntime();
  const [smokeWalletOverride, setSmokeWalletOverride] = useState<{
    address: string;
    chainId: number;
  } | null>(null);
  const [profileId, setProfileId] = useState<string | null>(
    runtimeContext.profileId,
  );
  const [bootstrappedWalletAddress, setBootstrappedWalletAddress] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [starterAvatars, setStarterAvatars] = useState<StarterAvatar[]>([]);
  const [selectedStarterAvatarId, setSelectedStarterAvatarId] = useState<string | null>(null);
  const [isLoadingStarterAvatars, setIsLoadingStarterAvatars] = useState(false);
  const [isResolvingFirstEntry, setIsResolvingFirstEntry] = useState(true);
  const [isFirstEntry, setIsFirstEntry] = useState(true);
  const [profileSummary, setProfileSummary] = useState<BackendProfileSummary | null>(null);
  const [signInSession, setSignInSession] =
    useState<BubbleDropFrontendSignInSession | null>(null);
  const [isSigningInWithBase, setIsSigningInWithBase] = useState(false);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showWrongExplanation, setShowWrongExplanation] = useState(false);
  const [onboardingSessionCompleted, setOnboardingSessionCompleted] = useState(false);
  const { address, chainId, isConnected } = useAccount();
  const { connectAsync, connectors, isPending: isWalletConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();

  const currentCard = ONBOARDING_CARDS[cardIndex];
  const connectedWalletAddress =
    smokeWalletOverride?.address ?? address?.trim().toLowerCase() ?? null;
  const activeWalletAddress =
    connectedWalletAddress ?? (bootstrappedWalletAddress.trim() || null);
  const effectiveIsConnected = smokeWalletOverride ? true : isConnected;
  const effectiveChainId = smokeWalletOverride?.chainId ?? chainId;
  const isConnectedToBase =
    effectiveIsConnected && effectiveChainId === base.id;
  const baseWalletConnector =
    connectors.find((connector) => connector.id === "baseAccount") ?? null;
  const coinbaseWalletConnector =
    connectors.find((connector) => connector.name === "Coinbase Wallet") ??
    connectors.find((connector) => connector.id === "coinbaseWalletSDK") ??
    connectors[0] ??
    null;
  const onboardingVisible = useMemo(() => {
    return !isResolvingFirstEntry && isFirstEntry && !onboardingSessionCompleted;
  }, [isResolvingFirstEntry, isFirstEntry, onboardingSessionCompleted]);
  const onboardingCompletionVisible = useMemo(() => {
    return !isResolvingFirstEntry && isFirstEntry && onboardingSessionCompleted;
  }, [isResolvingFirstEntry, isFirstEntry, onboardingSessionCompleted]);
  const isSignedInWithBase = signInSessionMatchesWallet(
    signInSession,
    connectedWalletAddress,
    effectiveChainId,
  );
  const authenticatedSessionToken =
    isSignedInWithBase && hasVerifiedAuthSession(signInSession)
      ? signInSession?.authSessionToken ?? null
      : null;

  const qualificationStatus = profileSummary?.qualificationState.status;
  const isRareRewardAccessActive = profileSummary?.rareRewardAccess.active ?? false;
  const qualificationLabel = qualificationStatus
    ? qualificationStatus.replaceAll("_", " ")
    : "backend pending";
  const qualificationBadge = qualificationStatus
    ? QUALIFICATION_BADGE_COPY[qualificationStatus]
    : {
        label: "Pending",
        className: "bg-[#eef2fb] text-[#5d6f93]",
      };

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
      clearBubbleDropFrontendSignInSession();
      setSignInSession(null);
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
  }, [connectedWalletAddress, effectiveChainId, smokeWalletOverride]);

  const loadStarterAvatarOptions = async () => {
    if (!backendUrl) {
      return [];
    }

    setIsLoadingStarterAvatars(true);
    try {
      const avatars = await fetchStarterAvatars(backendUrl);
      setStarterAvatars(avatars);
      setSelectedStarterAvatarId((currentValue) => currentValue ?? avatars[0]?.id ?? null);
      return avatars;
    } finally {
      setIsLoadingStarterAvatars(false);
    }
  };

  const refreshProfileSummary = async (targetProfileId: string) => {
    const summary = await fetchBackendProfileSummary(backendUrl, targetProfileId);
    if (!summary) {
      setActionMessage("Live BubbleDrop data is unavailable right now.");
      return null;
    }

    const needsOnboarding = summary.onboardingState.needsOnboarding;
    setProfileSummary(summary);
    setProfileId(summary.profileIdentity.profileId);
    setIsFirstEntry(needsOnboarding);
    setBootstrappedWalletAddress(summary.profileIdentity.walletAddress);
    setNicknameInput(summary.profileIdentity.nickname ?? "");
    runtimeContext.setAppContext({
      profileId: summary.profileIdentity.profileId,
      walletAddress: summary.profileIdentity.walletAddress,
    });
    identifyAnalyticsUser(summary.profileIdentity.profileId, {
      wallet_address: summary.profileIdentity.walletAddress,
    });
    if (needsOnboarding) {
      await loadStarterAvatarOptions();
    }
    return summary;
  };

  useEffect(() => {
    captureAnalyticsEvent("bubbledrop_app_started", {
      backend_proxy_enabled: true,
      has_profile_context: !!runtimeContext.profileId,
    });
  }, [runtimeContext.profileId]);

  useEffect(() => {
    setProfileId(runtimeContext.profileId);
  }, [runtimeContext.profileId]);

  useEffect(() => {
    const resolveFirstEntry = async () => {
      const resolvedProfileId = runtimeContext.profileId;
      setProfileId(resolvedProfileId);

      if (!resolvedProfileId) {
        setIsFirstEntry(false);
        setIsResolvingFirstEntry(false);
        return;
      }

      try {
        const summary = await refreshProfileSummary(resolvedProfileId);
        if (!summary) {
          setIsFirstEntry(false);
        }
      } catch {
        setIsFirstEntry(false);
      } finally {
        setIsResolvingFirstEntry(false);
      }
    };

    void resolveFirstEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeContext.profileId]);

  const bootstrapProfileForWallet = async (
    walletAddress: string,
    {
      silent = false,
      source = "manual",
    }: { silent?: boolean; source?: "manual" | "auto" } = {},
  ) => {
    const normalizedWalletAddress = walletAddress.trim().toLowerCase();
    if (!normalizedWalletAddress) {
      if (!silent) {
        setActionMessage("Connect your Base wallet to continue.");
      }
      return;
    }
    if (!authenticatedSessionToken) {
      if (!silent) {
        setActionMessage("Sign in with Base to unlock your BubbleDrop profile.");
      }
      return;
    }

    setIsSubmittingAction(true);
    if (!silent) {
      setActionMessage(null);
    }
    try {
      const response = await fetch(`${backendUrl}/profile/connect-wallet`, {
        method: "POST",
        headers: createAuthenticatedJsonHeaders(authenticatedSessionToken),
        body: JSON.stringify({ walletAddress: normalizedWalletAddress }),
      });

      if (!response.ok) {
        if (!silent) {
          setActionMessage("Profile bootstrap failed.");
        }
        return;
      }

      const payload = (await response.json()) as ProfileBootstrapResponse;
      setProfileId(payload.profileId);
      setBootstrappedWalletAddress(payload.walletAddress);
      runtimeContext.setAppContext({
        profileId: payload.profileId,
        walletAddress: payload.walletAddress,
      });
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("profileId", payload.profileId);
        url.searchParams.set("walletAddress", payload.walletAddress);
        window.history.replaceState(null, "", url.toString());
      }
      await refreshProfileSummary(payload.profileId);
      identifyAnalyticsUser(payload.profileId, {
        wallet_address: payload.walletAddress,
      });
      captureAnalyticsEvent("bubbledrop_profile_bootstrap_completed", {
        profile_id: payload.profileId,
        wallet_address: payload.walletAddress,
        source,
      });
      if (!silent) {
        setActionMessage("BubbleDrop profile is ready.");
      }
    } catch {
      if (!silent) {
        setActionMessage("We couldn't finish setting up your profile. Please try again.");
      }
    } finally {
      setIsSubmittingAction(false);
    }
  };

  useEffect(() => {
    if (
      !backendUrl ||
      profileId ||
      !connectedWalletAddress ||
      !isConnectedToBase ||
      !authenticatedSessionToken ||
      isSubmittingAction
    ) {
      return;
    }

    const normalizedBootstrappedWalletAddress =
      bootstrappedWalletAddress.trim().toLowerCase();
    if (
      profileId &&
      normalizedBootstrappedWalletAddress === connectedWalletAddress
    ) {
      return;
    }

    void bootstrapProfileForWallet(connectedWalletAddress, {
      silent: true,
      source: "auto",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    backendUrl,
    bootstrappedWalletAddress,
    connectedWalletAddress,
    authenticatedSessionToken,
    isConnectedToBase,
    isSubmittingAction,
    profileId,
  ]);

  const onBootstrapProfile = async () => {
    if (!connectedWalletAddress) {
      setActionMessage("Connect your Base wallet to continue.");
      return;
    }
    if (!isConnectedToBase) {
      setActionMessage("Switch to Base and try again.");
      return;
    }
    if (!authenticatedSessionToken) {
      setActionMessage("Sign in with Base to unlock your BubbleDrop profile.");
      return;
    }

    await bootstrapProfileForWallet(connectedWalletAddress);
  };

  const onConnectWallet = async () => {
    if (!baseWalletConnector) {
      setActionMessage("In-app Base wallet is unavailable right now.");
      return;
    }

    setActionMessage("Opening the in-app Base wallet...");
    try {
      await connectAsync({ connector: baseWalletConnector });
      setActionMessage("Base wallet connected. Sign in to confirm ownership.");
    } catch {
      setActionMessage(
        "We couldn't connect inside Base App. Stay in the app and try again.",
      );
    }
  };

  const onConnectCoinbaseWallet = async () => {
    if (!coinbaseWalletConnector) {
      return;
    }

    setActionMessage("Opening Coinbase Wallet...");
    try {
      await connectAsync({ connector: coinbaseWalletConnector });
      setActionMessage("Wallet connected. Switch to Base if needed, then sign in.");
    } catch {
      setActionMessage("Coinbase Wallet connection did not complete.");
    }
  };

  const onSwitchToBase = async () => {
    setActionMessage("Switching to Base...");
    try {
      await switchChainAsync({ chainId: base.id });
      setActionMessage("Connected wallet is now on Base.");
    } catch {
      setActionMessage("We couldn't switch that wallet to Base.");
    }
  };

  const onClearBaseSignIn = () => {
    clearBubbleDropFrontendSignInSession();
    setSignInSession(null);
    setActionMessage("This browser session is signed out.");
  };

  const onSignInWithBase = async () => {
    if (!connectedWalletAddress) {
      setActionMessage("Connect your Base wallet first.");
      return;
    }
    if (!isConnectedToBase || !effectiveChainId) {
      setActionMessage("Switch to Base before signing in.");
      return;
    }

    setIsSigningInWithBase(true);
    setActionMessage("Waiting for your Base signature...");

    try {
      const nonceResponse = await fetch(`${backendUrl}/auth/session/nonce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: connectedWalletAddress,
          chainId: effectiveChainId,
        }),
      });
      if (!nonceResponse.ok) {
        setActionMessage("Sign in could not start right now.");
        return;
      }

      const noncePayload =
        (await nonceResponse.json()) as AuthSessionNonceResponse;
      const issuedAt = new Date();
      const message = createSiweMessage({
        address: noncePayload.walletAddress as Address,
        chainId: noncePayload.chainId,
        domain: window.location.host,
        nonce: noncePayload.nonce,
        statement: noncePayload.statement,
        uri: window.location.origin,
        version: "1",
        issuedAt,
      });
      const signature = await signMessageAsync({ message });
      const verifyResponse = await fetch(`${backendUrl}/auth/session/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          signature,
        }),
      });
      if (!verifyResponse.ok) {
        setActionMessage("That signature could not be verified. Please try again.");
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
      setActionMessage("Wallet confirmed. You're signed in.");
    } catch {
      setActionMessage("The signature request did not complete.");
    } finally {
      setIsSigningInWithBase(false);
    }
  };

  const onRefreshProfile = async () => {
    if (!profileId) {
      setActionMessage("Connect and sign in to load your BubbleDrop profile.");
      return;
    }
    setIsSubmittingAction(true);
    setActionMessage(null);
    try {
      await refreshProfileSummary(profileId);
      setActionMessage("Profile summary refreshed.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const onDailyCheckIn = async () => {
    if (!profileId) {
      setActionMessage("Finish wallet setup before daily check-in.");
      return;
    }
    if (effectiveIsConnected && !isConnectedToBase) {
      setActionMessage("Switch to Base before daily check-in.");
      return;
    }
    if (!authenticatedSessionToken) {
      setActionMessage("Sign in with Base before daily check-in.");
      return;
    }

    setIsSubmittingAction(true);
    setActionMessage(null);
    try {
      const response = await fetch(`${backendUrl}/check-in/daily`, {
        method: "POST",
        headers: createAuthenticatedJsonHeaders(authenticatedSessionToken),
        body: JSON.stringify({ profileId }),
      });

      if (!response.ok) {
        setActionMessage("Today's check-in is already complete or unavailable.");
        return;
      }

      const payload = (await response.json()) as DailyCheckInResponse;
      await refreshProfileSummary(profileId);
      captureAnalyticsEvent("bubbledrop_daily_check_in_completed", {
        profile_id: profileId,
        wallet_address: activeWalletAddress ?? connectedWalletAddress ?? "",
        check_in_date: payload.checkInDate,
      });
      setActionMessage(`Daily check-in recorded for ${payload.checkInDate}.`);
    } catch {
      setActionMessage("We couldn't complete today's check-in.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const onCompleteOnboarding = async () => {
    if (!profileId) {
      setActionMessage("Finish wallet setup before onboarding.");
      return;
    }
    if (effectiveIsConnected && !isConnectedToBase) {
      setActionMessage("Switch to Base before finishing onboarding.");
      return;
    }
    if (!authenticatedSessionToken) {
      setActionMessage("Sign in with Base before completing onboarding.");
      return;
    }

    const nickname = nicknameInput.trim();
    if (!nickname) {
      setActionMessage("Enter nickname before completing onboarding.");
      return;
    }

    if (!selectedStarterAvatarId) {
      setActionMessage("Select one starter avatar before completing onboarding.");
      return;
    }

    setIsSubmittingAction(true);
    setActionMessage(null);
    try {
      const response = await fetch(`${backendUrl}/profile/onboarding/complete`, {
        method: "POST",
        headers: createAuthenticatedJsonHeaders(authenticatedSessionToken),
        body: JSON.stringify({
          profileId,
          nickname,
          avatarId: selectedStarterAvatarId,
        }),
      });

      if (!response.ok) {
        setActionMessage("We couldn't finish onboarding. Check your nickname and avatar.");
        return;
      }

      const payload = (await response.json()) as OnboardingCompletionResponse;
      const refreshedSummary = await refreshProfileSummary(profileId);
      captureAnalyticsEvent("bubbledrop_onboarding_completed", {
        profile_id: payload.profileId,
        wallet_address: activeWalletAddress ?? connectedWalletAddress ?? "",
        avatar_id: payload.avatarId,
        onboarding_xp_granted: payload.onboardingXpGranted,
        total_xp: payload.totalXp,
      });
      if (refreshedSummary) {
        setActionMessage(
          `Onboarding completed. ${payload.onboardingXpGranted} XP granted. Total XP: ${payload.totalXp}.`,
        );
      } else {
        setActionMessage("Onboarding completed. Live profile details are still refreshing.");
      }
    } catch {
      setActionMessage("We couldn't finish onboarding right now.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const onAnswer = (index: number) => {
    setSelectedOption(index);
    if (index === currentCard.correctIndex) {
      setShowWrongExplanation(false);
      setTimeout(() => {
        goNextCard();
      }, 140);
      return;
    }
    setShowWrongExplanation(true);
  };

  const goNextCard = () => {
    setSelectedOption(null);
    setShowWrongExplanation(false);

    if (cardIndex < ONBOARDING_CARDS.length - 1) {
      setCardIndex((prev) => prev + 1);
      return;
    }

    setOnboardingSessionCompleted(true);
  };

  return (
    <div className="relative min-h-screen px-4 py-6 sm:px-6">
      <div className="floating-bubbles">
        <span className="bubble b1" />
        <span className="bubble b2" />
        <span className="bubble b3" />
        <span className="bubble b4" />
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-4">
        {onboardingVisible ? (
          <section className="bubble-card p-4">
            <div className="gloss-pill rounded-2xl bg-gradient-to-r from-[#99dbff] to-[#d6c8ff] p-4 text-[#1d2f57]">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#3d5686]">
                Learning card {cardIndex + 1}/{ONBOARDING_CARDS.length}
              </p>
              <h1 className="mt-1 text-xl font-bold">{currentCard.title}</h1>
              <p className="mt-2 text-sm text-[#425b8a]">{currentCard.question}</p>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {currentCard.options.map((option, index) => {
                const isSelected = selectedOption === index;
                const isCorrect = index === currentCard.correctIndex;
                const style = isSelected
                  ? isCorrect
                    ? "from-[#bef8de] to-[#d8ffe9] text-[#1f5943]"
                    : "from-[#ffd9e7] to-[#ffe6ef] text-[#7c3550]"
                  : "from-white to-white text-[#324d7a]";

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onAnswer(index)}
                    className={`gloss-pill rounded-xl bg-gradient-to-r px-4 py-3 text-left text-sm font-semibold ${style}`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {showWrongExplanation ? (
              <div className="mt-3 rounded-xl border border-[#f6c2d4] bg-[#fff2f7] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9f4b67]">
                  Correct answer note
                </p>
                <p className="mt-1 text-sm text-[#7f3a53]">{currentCard.wrongExplanation}</p>
                <button
                  type="button"
                  onClick={goNextCard}
                  className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#6d466e]"
                >
                  Continue
                </button>
              </div>
            ) : null}
          </section>
        ) : onboardingCompletionVisible ? (
          <section className="bubble-card p-4">
            <div className="gloss-pill rounded-2xl bg-gradient-to-r from-[#99dbff] to-[#d6c8ff] p-4 text-[#1d2f57]">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#3d5686]">
                Complete onboarding
              </p>
              <h1 className="mt-1 text-xl font-bold">Set your BubbleDrop identity</h1>
              <p className="mt-2 text-sm text-[#425b8a]">
                Finish first entry with a nickname and one approved starter avatar. Backend confirms completion.
              </p>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6074a0]">Nickname</label>
              <input
                value={nicknameInput}
                onChange={(event) => setNicknameInput(event.target.value)}
                maxLength={32}
                placeholder="Choose your nickname"
                className="mt-2 w-full rounded-xl border border-[#d6e3ff] bg-white/80 px-3 py-3 text-sm text-[#2d4578] outline-none"
              />
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6074a0]">Starter avatar</p>
              {isLoadingStarterAvatars ? (
                <p className="mt-3 text-sm text-[#6074a0]">Loading starter avatars...</p>
              ) : starterAvatars.length === 0 ? (
                <p className="mt-3 text-sm text-[#7f3a53]">Starter avatars unavailable from backend.</p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {starterAvatars.map((avatar) => {
                    const isSelected = selectedStarterAvatarId === avatar.id;
                    return (
                      <button
                        key={avatar.id}
                        type="button"
                        onClick={() => setSelectedStarterAvatarId(avatar.id)}
                        className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold ${
                          isSelected
                            ? "border-[#8fc9ff] bg-gradient-to-r from-[#dff6ff] to-[#ece2ff] text-[#284679]"
                            : "border-[#dce6ff] bg-white/80 text-[#3c588b]"
                        }`}
                      >
                        {avatar.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onCompleteOnboarding}
              disabled={
                isSubmittingAction ||
                !authenticatedSessionToken ||
                isLoadingStarterAvatars ||
                starterAvatars.length === 0
              }
              className="gloss-pill mt-4 w-full rounded-xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-3 text-left text-sm font-semibold text-[#1f3561] disabled:opacity-60"
            >
              {isSubmittingAction ? "Submitting..." : "Complete onboarding"}
            </button>
            {actionMessage ? (
              <p className="mt-3 rounded-xl bg-white/80 p-3 text-xs font-semibold text-[#4f648f]">{actionMessage}</p>
            ) : null}
          </section>
        ) : (
          <>
            <section className="bubble-card p-4">
              <div className="gloss-pill rounded-2xl bg-gradient-to-r from-[#9dd5ff] to-[#c7c6ff] p-4 text-[#1c2a52]">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#364e7f]">
                  Daily Base check-in
                </p>
                <p className="mt-1 text-lg font-bold">Check-in once per day to keep rare access path active.</p>
                <p className="mt-1 text-sm text-[#42567f]">
                  Status:{" "}
                    {profileSummary
                    ? "Ready for backend action."
                    : connectedWalletAddress
                      ? "Connected wallet ready for backend bootstrap."
                      : "Connect Base wallet to bootstrap backend profile."}
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <div className="rounded-xl border border-[#d6e3ff] bg-white/80 px-3 py-3 text-sm text-[#2d4578]">
                    <p className="text-xs uppercase tracking-[0.08em] text-[#6074a0]">Base wallet</p>
                    <p className="mt-1 break-all font-semibold">
                      {connectedWalletAddress ?? "Not connected"}
                    </p>
                    <p className="mt-1 text-xs text-[#5f739b]">
                      Network:{" "}
                      {effectiveIsConnected
                        ? isConnectedToBase
                          ? "Base"
                          : `Wrong network (${effectiveChainId ?? "unknown"})`
                        : "Connect required"}
                    </p>
                    {bootstrappedWalletAddress ? (
                      <p className="mt-1 text-xs text-[#5f739b]">
                        Backend-bound wallet: {bootstrappedWalletAddress}
                      </p>
                    ) : null}
                    <div className="mt-3 rounded-xl border border-[#dce6ff] bg-[#f8fbff] px-3 py-3">
                      <p className="text-xs uppercase tracking-[0.08em] text-[#6074a0]">
                        Sign in with Base
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#2d4578]">
                        {isSignedInWithBase
                          ? "Wallet ownership confirmed in this browser session."
                          : "Confirm your wallet in-app to unlock protected BubbleDrop actions."}
                      </p>
                      <p className="mt-1 text-xs text-[#5f739b]">
                        {isSignedInWithBase && signInSession
                          ? `Signed at ${new Date(signInSession.issuedAt).toLocaleString()}${signInSession.mode === "smoke" ? " (smoke override)." : "."}`
                          : "BubbleDrop keeps backend verification as the source of truth for your signed-in session."}
                      </p>
                    </div>
                  </div>
                  {!effectiveIsConnected ? (
                    <button
                      type="button"
                      onClick={onConnectWallet}
                      disabled={isWalletConnectPending || isSubmittingAction}
                      className="gloss-pill rounded-xl bg-gradient-to-r from-[#c9f1ff] to-[#d6deff] px-4 py-3 text-left text-sm font-semibold text-[#1f3561] disabled:opacity-60"
                    >
                      {isWalletConnectPending
                        ? "Connecting inside Base App..."
                        : "Connect in Base App"}
                    </button>
                  ) : null}
                  {!effectiveIsConnected &&
                  coinbaseWalletConnector &&
                  coinbaseWalletConnector.id !== baseWalletConnector?.id ? (
                    <button
                      type="button"
                      onClick={onConnectCoinbaseWallet}
                      disabled={isWalletConnectPending || isSubmittingAction}
                      className="rounded-xl bg-white/85 px-4 py-3 text-left text-sm font-semibold text-[#425b8a] disabled:opacity-60"
                    >
                      Use Coinbase Wallet instead
                    </button>
                  ) : null}
                  {effectiveIsConnected && !isConnectedToBase ? (
                    <button
                      type="button"
                      onClick={onSwitchToBase}
                      disabled={isSwitchingChain || isSubmittingAction}
                      className="gloss-pill rounded-xl bg-gradient-to-r from-[#d9f2ff] to-[#e6deff] px-4 py-3 text-left text-sm font-semibold text-[#1f3561] disabled:opacity-60"
                    >
                      {isSwitchingChain ? "Switching to Base..." : "Switch connected wallet to Base"}
                    </button>
                  ) : null}
                  {effectiveIsConnected && isConnectedToBase && !isSignedInWithBase ? (
                    <button
                      type="button"
                      onClick={onSignInWithBase}
                      disabled={isSigningInWithBase || isSubmittingAction}
                      className="gloss-pill rounded-xl bg-gradient-to-r from-[#d3f6ff] to-[#dbe1ff] px-4 py-3 text-left text-sm font-semibold text-[#1f3561] disabled:opacity-60"
                    >
                      {isSigningInWithBase
                        ? "Waiting for signature..."
                        : "Sign in with Base"}
                    </button>
                  ) : null}
                  {effectiveIsConnected && isConnectedToBase && isSignedInWithBase && !smokeWalletOverride ? (
                    <button
                      type="button"
                      onClick={onClearBaseSignIn}
                      disabled={isSubmittingAction || isSigningInWithBase}
                      className="rounded-xl bg-white/80 px-4 py-2 text-left text-xs font-semibold text-[#48608f] disabled:opacity-60"
                    >
                      Clear frontend Base sign-in
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onBootstrapProfile}
                    disabled={
                      isSubmittingAction ||
                      !authenticatedSessionToken ||
                      !connectedWalletAddress ||
                      !isConnectedToBase
                    }
                    className="gloss-pill rounded-xl bg-gradient-to-r from-[#c9f1ff] to-[#d6deff] px-4 py-3 text-left text-sm font-semibold text-[#1f3561] disabled:opacity-60"
                  >
                    Bootstrap / refresh profile from connected wallet
                  </button>
                  <button
                    type="button"
                    onClick={onDailyCheckIn}
                    disabled={
                      isSubmittingAction ||
                      !authenticatedSessionToken ||
                      !profileId ||
                      !connectedWalletAddress ||
                      !isConnectedToBase
                    }
                    className="gloss-pill rounded-xl bg-gradient-to-r from-[#a5f0ff] to-[#b8c8ff] px-4 py-3 text-left text-sm font-semibold text-[#1f3561] disabled:opacity-60"
                  >
                    Daily Base check-in
                  </button>
                  {effectiveIsConnected && !smokeWalletOverride ? (
                    <button
                      type="button"
                      onClick={() => disconnect()}
                      disabled={isSubmittingAction}
                      className="rounded-xl bg-white/80 px-4 py-2 text-left text-xs font-semibold text-[#48608f] disabled:opacity-60"
                    >
                      Disconnect wallet
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onRefreshProfile}
                    disabled={isSubmittingAction}
                    className="rounded-xl bg-white/80 px-4 py-2 text-left text-xs font-semibold text-[#48608f] disabled:opacity-60"
                  >
                    Refresh backend summary
                  </button>
                </div>
              </div>
            </section>

            <section className="bubble-card p-4">
              <h2 className="text-sm font-semibold text-[#30466f]">XP summary</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="gloss-pill rounded-xl bg-white/80 p-3">
                  <p className="text-xs text-[#6074a0]">Total XP</p>
                  <p className="mt-1 font-semibold">{profileSummary ? profileSummary.xpSummary.totalXp : "—"}</p>
                </div>
                <div className="gloss-pill rounded-xl bg-white/80 p-3">
                  <p className="text-xs text-[#6074a0]">Current streak</p>
                  <p className="mt-1 font-semibold">{profileSummary ? profileSummary.xpSummary.currentStreak : "—"}</p>
                </div>
              </div>
            </section>

            <section className="bubble-card p-4">
              <h2 className="text-sm font-semibold text-[#30466f]">Rank frame + qualification overlay</h2>
              <div className="mt-3 rounded-2xl border border-[#d6e3ff] bg-white/80 p-4">
                <div className="relative">
                  <div className="gloss-pill inline-flex rounded-full bg-gradient-to-r from-[#c3dbff] to-[#e2d7ff] px-4 py-2 text-sm font-semibold text-[#30466f]">
                    Frame: {profileSummary?.rankFrameState.currentFrame?.label ?? "—"}
                  </div>
                  <span
                    className={`absolute -top-2 -right-2 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${qualificationBadge.className}`}
                  >
                    {qualificationBadge.label}
                  </span>
                </div>
                <p className="mt-3 text-xs text-[#5f739b]">
                  Next frame:{" "}
                  {profileSummary?.rankFrameState.nextFrame
                    ? `${profileSummary.rankFrameState.nextFrame.label} in ${profileSummary.rankFrameState.nextFrame.xpToReach} XP`
                    : "Top frame reached or backend pending"}
                </p>
              </div>
            </section>

            <section className="bubble-card p-4">
              <h2 className="text-sm font-semibold text-[#30466f]">Rare reward access</h2>
              <div className="mt-3 flex flex-col gap-2">
                <div className="rounded-xl bg-white/80 p-3">
                  <p className="text-xs text-[#6074a0]">Qualification state</p>
                  <p className="mt-1 text-sm font-semibold capitalize">{qualificationLabel}</p>
                </div>
                <div
                  className={`gloss-pill rounded-xl p-3 ${
                    isRareRewardAccessActive
                      ? "bg-gradient-to-r from-[#ffe8a8] via-[#ffd5ef] to-[#d7d4ff]"
                      : "bg-gradient-to-r from-[#eef3ff] to-[#f6f8ff]"
                  }`}
                >
                  <p className="text-xs text-[#6074a0]">
                    {isRareRewardAccessActive ? "Rare reward access" : "XP-only mode"}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#324d7a]">
                    {isRareRewardAccessActive ? "Active" : "Rare reward access inactive"}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={`h-6 w-6 rounded-full ${
                        isRareRewardAccessActive
                          ? "bg-gradient-to-br from-[#ffe388] to-[#ff9ed8] shadow-[0_0_16px_rgba(255,197,125,0.75)]"
                          : "bg-gradient-to-br from-[#dfe7fb] to-[#edf2ff]"
                      }`}
                    />
                    <span className="text-xs text-[#566b95]">
                      {isRareRewardAccessActive
                        ? "Rare bubbles get premium glow when access is active."
                        : "Backend currently keeps this profile in XP-only mode until rare reward access is restored."}
                    </span>
                  </div>
                  {!isRareRewardAccessActive ? (
                    <div className="mt-3 rounded-xl border border-[#d9e5ff] bg-white/80 p-3 text-xs text-[#556b96]">
                      Claim requests are unavailable while access is locked or paused. Keep daily check-ins active and continue valid bubble sessions to restore rare reward eligibility.
                    </div>
                  ) : null}
                </div>
                {isRareRewardAccessActive ? (
                  <Link
                    href={withBubbleDropContext("/claim", {
                      profileId,
                      walletAddress: activeWalletAddress,
                    })}
                    className="gloss-pill rounded-xl bg-gradient-to-r from-[#ffe7b4] to-[#ffd3ee] px-4 py-3 text-left text-sm font-semibold text-[#5e3f21]"
                  >
                    Open meme-token claims
                  </Link>
                ) : null}
              </div>
            </section>

            <section className="bubble-card p-4">
              <h2 className="text-sm font-semibold text-[#30466f]">Active bubble session</h2>
              <Link
                href={withBubbleDropContext("/session", {
                  profileId,
                  walletAddress: activeWalletAddress,
                })}
                className="gloss-pill mt-3 block w-full rounded-xl bg-gradient-to-r from-[#ffe0ef] to-[#e6e0ff] px-4 py-3 text-left text-sm font-semibold text-[#403165]"
              >
                Enter active bubble session
              </Link>
            </section>
            <section className="bubble-card p-4">
              <h2 className="text-sm font-semibold text-[#30466f]">Read surfaces</h2>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href={withBubbleDropContext("/leaderboard", {
                    profileId,
                    walletAddress: activeWalletAddress,
                  })}
                  className="rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold text-[#36568d]"
                >
                  Open leaderboard
                </Link>
                <Link
                  href={withBubbleDropContext("/inventory", {
                    profileId,
                    walletAddress: activeWalletAddress,
                  })}
                  className="rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold text-[#36568d]"
                >
                  Open rewards inventory
                </Link>
                <Link
                  href={withBubbleDropContext("/referrals", {
                    profileId,
                    walletAddress: activeWalletAddress,
                  })}
                  className="rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold text-[#36568d]"
                >
                  Open referral progress
                </Link>
                <Link
                  href={withBubbleDropContext("/season", {
                    profileId,
                    walletAddress: activeWalletAddress,
                  })}
                  className="rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold text-[#36568d]"
                >
                  Open season hub
                </Link>
                <Link
                  href={withBubbleDropContext("/partner-tokens", {
                    profileId,
                    walletAddress: activeWalletAddress,
                  })}
                  onClick={() =>
                    captureAnalyticsEvent("bubbledrop_partner_transparency_opened", {
                      profile_id: profileId,
                    })
                  }
                  className="rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold text-[#36568d]"
                >
                  Open partner token transparency
                </Link>
              </div>
            </section>
            {actionMessage ? (
              <section className="bubble-card p-4">
                <p className="rounded-xl bg-white/80 p-3 text-xs font-semibold text-[#4f648f]">{actionMessage}</p>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
