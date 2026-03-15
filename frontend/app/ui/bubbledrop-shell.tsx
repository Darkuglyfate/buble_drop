"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";
import {
  captureAnalyticsEvent,
  identifyAnalyticsUser,
} from "../analytics";
import {
  type BackendProfileSummary,
  fetchBackendProfileSummary,
} from "./backend-profile-summary";

type ProfileBootstrapResponse = {
  profileId: string;
  walletAddress: string;
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

function getBackendUrl(): string | null {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  return backendUrl && backendUrl.trim() ? backendUrl.trim() : null;
}

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

function getProfileIdFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = new URLSearchParams(window.location.search).get("profileId");
  return value && value.trim() ? value.trim() : null;
}

function withProfileQuery(
  path: string,
  profileId: string | null,
  walletAddress?: string | null,
): string {
  if (!profileId && !walletAddress) {
    return path;
  }

  const searchParams = new URLSearchParams();
  if (profileId) {
    searchParams.set("profileId", profileId);
  }
  if (walletAddress) {
    searchParams.set("walletAddress", walletAddress);
  }

  return `${path}?${searchParams.toString()}`;
}

function createWalletBoundJsonHeaders(walletAddress: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-bubbledrop-wallet-address": walletAddress.trim().toLowerCase(),
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
  const backendUrl = getBackendUrl();
  const [smokeWalletOverride, setSmokeWalletOverride] = useState<{
    address: string;
    chainId: number;
  } | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [bootstrappedWalletAddress, setBootstrappedWalletAddress] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [starterAvatars, setStarterAvatars] = useState<StarterAvatar[]>([]);
  const [selectedStarterAvatarId, setSelectedStarterAvatarId] = useState<string | null>(null);
  const [isLoadingStarterAvatars, setIsLoadingStarterAvatars] = useState(false);
  const [isResolvingFirstEntry, setIsResolvingFirstEntry] = useState(true);
  const [isFirstEntry, setIsFirstEntry] = useState(true);
  const [profileSummary, setProfileSummary] = useState<BackendProfileSummary | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showWrongExplanation, setShowWrongExplanation] = useState(false);
  const [onboardingSessionCompleted, setOnboardingSessionCompleted] = useState(false);
  const { address, chainId, isConnected } = useAccount();
  const { connectAsync, connectors, isPending: isWalletConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
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
  const baseWalletConnector = connectors[0] ?? null;
  const onboardingVisible = useMemo(() => {
    return !isResolvingFirstEntry && isFirstEntry && !onboardingSessionCompleted;
  }, [isResolvingFirstEntry, isFirstEntry, onboardingSessionCompleted]);
  const onboardingCompletionVisible = useMemo(() => {
    return !isResolvingFirstEntry && isFirstEntry && onboardingSessionCompleted;
  }, [isResolvingFirstEntry, isFirstEntry, onboardingSessionCompleted]);

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
    if (!backendUrl) {
      setActionMessage("Set NEXT_PUBLIC_BACKEND_URL to load backend state.");
      return null;
    }

    const summary = await fetchBackendProfileSummary(backendUrl, targetProfileId);
    if (!summary) {
      setActionMessage("Unable to refresh profile summary from backend.");
      return null;
    }

    const needsOnboarding = summary.onboardingState.needsOnboarding;
    setProfileSummary(summary);
    setIsFirstEntry(needsOnboarding);
    setBootstrappedWalletAddress(summary.profileIdentity.walletAddress);
    setNicknameInput(summary.profileIdentity.nickname ?? "");
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
      backend_configured: !!backendUrl,
      has_profile_id_in_url: !!getProfileIdFromUrl(),
    });
  }, [backendUrl]);

  useEffect(() => {
    const resolveFirstEntry = async () => {
      const resolvedProfileId = getProfileIdFromUrl();
      setProfileId(resolvedProfileId);

      if (!resolvedProfileId || !backendUrl) {
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
  }, [backendUrl]);

  const bootstrapProfileForWallet = async (
    walletAddress: string,
    {
      silent = false,
      source = "manual",
    }: { silent?: boolean; source?: "manual" | "auto" } = {},
  ) => {
    if (!backendUrl) {
      if (!silent) {
        setActionMessage("Set NEXT_PUBLIC_BACKEND_URL before profile bootstrap.");
      }
      return;
    }

    const normalizedWalletAddress = walletAddress.trim().toLowerCase();
    if (!normalizedWalletAddress) {
      if (!silent) {
        setActionMessage("Connect Base wallet before profile bootstrap.");
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
        headers: { "Content-Type": "application/json" },
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
        setActionMessage("Profile bootstrap completed from connected Base wallet.");
      }
    } catch {
      if (!silent) {
        setActionMessage("Backend connection failed during profile bootstrap.");
      }
    } finally {
      setIsSubmittingAction(false);
    }
  };

  useEffect(() => {
    if (
      !backendUrl ||
      !connectedWalletAddress ||
      !isConnectedToBase ||
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
    isConnectedToBase,
    isSubmittingAction,
    profileId,
  ]);

  const onBootstrapProfile = async () => {
    if (!connectedWalletAddress) {
      setActionMessage("Connect Base wallet before profile bootstrap.");
      return;
    }
    if (!isConnectedToBase) {
      setActionMessage("Switch the connected wallet to Base before profile bootstrap.");
      return;
    }

    await bootstrapProfileForWallet(connectedWalletAddress);
  };

  const onConnectWallet = async () => {
    if (!baseWalletConnector) {
      setActionMessage("Base wallet connector is unavailable in this build.");
      return;
    }

    setActionMessage(null);
    try {
      await connectAsync({ connector: baseWalletConnector });
    } catch {
      setActionMessage("Base wallet connection was cancelled or failed.");
    }
  };

  const onSwitchToBase = async () => {
    setActionMessage(null);
    try {
      await switchChainAsync({ chainId: base.id });
    } catch {
      setActionMessage("Unable to switch the connected wallet to Base.");
    }
  };

  const onRefreshProfile = async () => {
    if (!profileId) {
      setActionMessage("No profileId in URL. Bootstrap profile first.");
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
    if (!backendUrl || !profileId) {
      setActionMessage("Profile bootstrap is required before daily check-in.");
      return;
    }
    if (effectiveIsConnected && !isConnectedToBase) {
      setActionMessage("Switch the connected wallet to Base before daily check-in.");
      return;
    }

    const walletAddress = activeWalletAddress?.trim() ?? "";
    if (!walletAddress) {
      setActionMessage("Wallet binding unavailable. Connect Base wallet and bootstrap profile first.");
      return;
    }

    setIsSubmittingAction(true);
    setActionMessage(null);
    try {
      const response = await fetch(`${backendUrl}/check-in/daily`, {
        method: "POST",
        headers: createWalletBoundJsonHeaders(walletAddress),
        body: JSON.stringify({ profileId }),
      });

      if (!response.ok) {
        setActionMessage("Daily check-in failed or already completed today.");
        return;
      }

      const payload = (await response.json()) as DailyCheckInResponse;
      await refreshProfileSummary(profileId);
      captureAnalyticsEvent("bubbledrop_daily_check_in_completed", {
        profile_id: profileId,
        wallet_address: walletAddress,
        check_in_date: payload.checkInDate,
      });
      setActionMessage(`Daily check-in recorded for ${payload.checkInDate}.`);
    } catch {
      setActionMessage("Backend connection failed during daily check-in.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const onCompleteOnboarding = async () => {
    if (!backendUrl || !profileId) {
      setActionMessage("Profile bootstrap is required before onboarding completion.");
      return;
    }
    if (effectiveIsConnected && !isConnectedToBase) {
      setActionMessage("Switch the connected wallet to Base before completing onboarding.");
      return;
    }

    const walletAddress = activeWalletAddress?.trim() ?? "";
    if (!walletAddress) {
      setActionMessage("Wallet binding unavailable. Connect Base wallet and bootstrap profile first.");
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
        headers: createWalletBoundJsonHeaders(walletAddress),
        body: JSON.stringify({
          profileId,
          nickname,
          avatarId: selectedStarterAvatarId,
        }),
      });

      if (!response.ok) {
        setActionMessage("Onboarding completion failed. Check nickname and avatar selection.");
        return;
      }

      const payload = (await response.json()) as OnboardingCompletionResponse;
      const refreshedSummary = await refreshProfileSummary(profileId);
      captureAnalyticsEvent("bubbledrop_onboarding_completed", {
        profile_id: payload.profileId,
        wallet_address: walletAddress,
        avatar_id: payload.avatarId,
        onboarding_xp_granted: payload.onboardingXpGranted,
        total_xp: payload.totalXp,
      });
      if (refreshedSummary) {
        setActionMessage(
          `Onboarding completed. ${payload.onboardingXpGranted} XP granted. Total XP: ${payload.totalXp}.`,
        );
      } else {
        setActionMessage("Onboarding completed, but backend summary refresh failed.");
      }
    } catch {
      setActionMessage("Backend connection failed during onboarding completion.");
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
              disabled={isSubmittingAction || isLoadingStarterAvatars || starterAvatars.length === 0}
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
                  </div>
                  {!effectiveIsConnected ? (
                    <button
                      type="button"
                      onClick={onConnectWallet}
                      disabled={isWalletConnectPending || isSubmittingAction}
                      className="gloss-pill rounded-xl bg-gradient-to-r from-[#c9f1ff] to-[#d6deff] px-4 py-3 text-left text-sm font-semibold text-[#1f3561] disabled:opacity-60"
                    >
                      {isWalletConnectPending ? "Connecting Base wallet..." : "Connect Base wallet"}
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
                  <button
                    type="button"
                    onClick={onBootstrapProfile}
                    disabled={
                      isSubmittingAction ||
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
                    href={withProfileQuery("/claim", profileId, activeWalletAddress)}
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
                href={withProfileQuery("/session", profileId, activeWalletAddress)}
                className="gloss-pill mt-3 block w-full rounded-xl bg-gradient-to-r from-[#ffe0ef] to-[#e6e0ff] px-4 py-3 text-left text-sm font-semibold text-[#403165]"
              >
                Enter active bubble session
              </Link>
            </section>
            <section className="bubble-card p-4">
              <h2 className="text-sm font-semibold text-[#30466f]">Read surfaces</h2>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href={withProfileQuery("/leaderboard", profileId, activeWalletAddress)}
                  className="rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold text-[#36568d]"
                >
                  Open leaderboard
                </Link>
                <Link
                  href={withProfileQuery("/inventory", profileId, activeWalletAddress)}
                  className="rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold text-[#36568d]"
                >
                  Open rewards inventory
                </Link>
                <Link
                  href={withProfileQuery("/referrals", profileId, activeWalletAddress)}
                  className="rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold text-[#36568d]"
                >
                  Open referral progress
                </Link>
                <Link
                  href={withProfileQuery("/season", profileId, activeWalletAddress)}
                  className="rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold text-[#36568d]"
                >
                  Open season hub
                </Link>
                <Link
                  href={withProfileQuery("/partner-tokens", profileId, activeWalletAddress)}
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
