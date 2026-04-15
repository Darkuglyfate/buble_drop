"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection } from "wagmi";
import {
  captureAnalyticsEvent,
  identifyAnalyticsUser,
} from "../analytics";
import {
  createAuthenticatedJsonHeaders,
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
import {
  loadSelectedAvatarOverrideState,
  loadSelectedAvatarOverride,
  saveSelectedAvatarOverride,
} from "./avatar-selection-sync";
import { getAvatarBubbleTone } from "./avatar-bubble-palette";
import {
  getPrimaryEquippedStyle,
  inferSlotFromRewardKey,
  loadPersistedEquippedStyles,
  savePersistedEquippedStyle,
  type EquippedStyleSnapshot,
} from "./equipped-style-sync";
import { WelcomeIntroScreen } from "./welcome-intro-screen";
import { OnboardingFlow } from "./shell/OnboardingFlow";
import { ProfileCard } from "./shell/ProfileCard";
import { HeroSection } from "./shell/HeroSection";
import { BubbleWorldMenu } from "./shell/BubbleWorldMenu";
import { useGlassMode } from "../hooks/shell/useGlassMode";
import { useOnboardingCards } from "../hooks/shell/useOnboardingCards";
import { useIntroBubbleGame } from "../hooks/shell/useIntroBubbleGame";
import { useWalletFlow } from "../hooks/shell/useWalletFlow";
import { useDailyCheckIn } from "../hooks/shell/useDailyCheckIn";
import {
  Button,
  Card,
  Row,
  ScreenLayout,
  Section,
  Text,
} from "../components";

type ProfileBootstrapResponse = {
  profileId: string;
  walletAddress: string;
};

type OnboardingCompletionResponse = {
  profileId: string;
  nickname: string;
  avatarId: string;
  onboardingXpGranted: number;
  totalXp: number;
};

type QualificationStatus =
  | "locked"
  | "in_progress"
  | "qualified"
  | "paused"
  | "restored";

type QualificationBadgeTone = "neutral" | "info" | "muted" | "rare" | "qualified";

const QUALIFICATION_BADGE_COPY: Record<
  QualificationStatus,
  {
    label: string;
    tone: QualificationBadgeTone;
  }
> = {
  locked: { label: "Locked", tone: "neutral" },
  in_progress: { label: "In progress", tone: "info" },
  paused: { label: "Paused", tone: "muted" },
  restored: { label: "Restored", tone: "rare" },
  qualified: { label: "Qualified", tone: "qualified" },
};

/** Local-only demo: cycles profile bubble through all five rarity tiers (motion + styling). */
const COSMETIC_PREVIEW_INTERVAL_MS = 5000;

const COSMETIC_PREVIEW_DEMOS: EquippedStyleSnapshot[] = [
  {
    rewardId: "demo-c",
    rewardKey: "preview.bubble.azure.mist",
    rarity: "common",
    source: "cosmetic",
    variant: "preview",
    appliedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    rewardId: "demo-u",
    rewardKey: "preview.bubble.lagoon.sheen",
    rarity: "uncommon",
    source: "cosmetic",
    variant: "preview",
    appliedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    rewardId: "demo-r",
    rewardKey: "preview.bubble.reef.current",
    rarity: "rare",
    source: "cosmetic",
    variant: "preview",
    appliedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    rewardId: "demo-e",
    rewardKey: "preview.bubble.nebula.veil",
    rarity: "epic",
    source: "cosmetic",
    variant: "preview",
    appliedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    rewardId: "demo-l",
    rewardKey: "preview.bubble.solar.crown",
    rarity: "legendary",
    source: "cosmetic",
    variant: "preview",
    appliedAt: "2026-01-01T00:00:00.000Z",
  },
];

function shortenWalletAddress(value: string | null): string {
  if (!value) {
    return "No wallet yet";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatRewardKeyLabel(rewardKey: string): string {
  return rewardKey
    .split(/[._-]+/)
    .filter((part) => part && part !== "qa" && part !== "inventory")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function inferStyleCategoryLabel(rewardKey: string): string {
  const normalized = rewardKey.toLowerCase();
  if (normalized.includes("avatar")) {
    return "Avatar";
  }
  if (normalized.includes("trail") || normalized.includes("aura")) {
    return "Trail";
  }
  if (normalized.includes("badge") || normalized.includes("emblem")) {
    return "Badge";
  }
  return "Bubble skin";
}

const NETWORK_REQUEST_TIMEOUT_MS = 15_000;
const PROFILE_SYNC_RETRY_COUNT = 1;

/** User-visible reason when POST /profile/connect-wallet fails (debug Sync profile). */
async function getProfileConnectWalletErrorMessage(
  response: Response,
): Promise<string> {
  const status = response.status;
  let raw = "";
  try {
    raw = await response.text();
  } catch {
    return `Server error (HTTP ${status}). Tap Sync profile to retry.`;
  }

  let serverMessage = "";
  try {
    const parsed = JSON.parse(raw) as {
      message?: string | string[];
      error?: string;
    };
    if (Array.isArray(parsed.message)) {
      serverMessage = parsed.message.filter(Boolean).join(". ");
    } else if (typeof parsed.message === "string") {
      serverMessage = parsed.message.trim();
    }
    if (!serverMessage && typeof parsed.error === "string") {
      serverMessage = parsed.error.trim();
    }
  } catch {
    serverMessage = raw.replace(/\s+/g, " ").trim().slice(0, 240);
  }

  if (status === 503) {
    if (
      serverMessage.includes("BubbleDrop live data is unavailable") ||
      serverMessage.includes("unavailable right now")
    ) {
      return "API not linked: set BACKEND_URL (your Nest API URL) in Vercel → Environment Variables, redeploy, then Sync profile again.";
    }
    return serverMessage
      ? `Service unavailable (503): ${serverMessage}`
      : "Service unavailable (503). Check backend is running and BACKEND_URL is correct.";
  }

  if (status === 403) {
    return "Session wallet mismatch: use Sign in with Base for this wallet, then Sync profile again.";
  }

  if (status === 401) {
    return "Session expired or invalid: Sign in with Base again, then Sync profile.";
  }

  if (status >= 500) {
    const trimmed = serverMessage.trim();
    const isGeneric =
      !trimmed ||
      /^internal server error$/i.test(trimmed) ||
      /^http \d+$/i.test(trimmed);
    if (isGeneric) {
      return `Server error (${status}). API side: set DATABASE_URL to PostgreSQL, run migrations (npm run db:migration:run), redeploy backend. Then Sync profile again.`;
    }
    return `Server error (${status}): ${serverMessage.slice(0, 220)}`;
  }

  if (serverMessage) {
    return `Could not create profile (${status}): ${serverMessage.slice(0, 220)}`;
  }

  return `Could not create profile (HTTP ${status}). Tap Sync profile to retry.`;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = NETWORK_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function BubbleDropShell() {
  const backendUrl = BUBBLEDROP_API_BASE;
  const runtimeContext = useBubbleDropRuntime();
  const [profileId, setProfileId] = useState<string | null>(
    runtimeContext.profileId,
  );
  const [bootstrappedWalletAddress, setBootstrappedWalletAddress] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [isResolvingFirstEntry, setIsResolvingFirstEntry] = useState(true);
  const [isFirstEntry, setIsFirstEntry] = useState(true);
  const [profileSummary, setProfileSummary] = useState<BackendProfileSummary | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const { glassMode, setGlassMode } = useGlassMode();
  const [onboardingSessionCompleted, setOnboardingSessionCompleted] = useState(false);
  const [isProfileBubblePressed, setIsProfileBubblePressed] = useState(false);
  const [equippedStyleSnapshot, setEquippedStyleSnapshot] =
    useState<EquippedStyleSnapshot | null>(null);
  const [selectedAvatarOverrideId, setSelectedAvatarOverrideId] = useState<string | null>(null);
  const [selectedAvatarOverridePaletteKey, setSelectedAvatarOverridePaletteKey] =
    useState<string | null>(null);
  const [cosmeticTierPreviewActive, setCosmeticTierPreviewActive] = useState(false);
  const [cosmeticPreviewIndex, setCosmeticPreviewIndex] = useState(0);

  const connection = useConnection();

  // ---- Wallet flow hook ----
  const {
    connectedWalletAddress,
    effectiveIsConnected,
    effectiveChainId,
    isConnectedToBase,
    isSignedInWithBase,
    authenticatedSessionToken,
    walletFlowState,
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
    onSwitchToBase: walletOnSwitchToBase,
    onSignInWithBase: walletOnSignInWithBase,
    onClearBaseSignIn: walletOnClearBaseSignIn,
    onDisconnectWallet,
  } = useWalletFlow({ backendUrl });

  // ---- Onboarding cards hook ----
  const {
    cardIndex,
    selectedOption,
    showWrongExplanation,
    currentCard,
    totalCards,
    setSelectedOption,
    setShowWrongExplanation,
    goNextCard: hookGoNextCard,
    resetCards,
  } = useOnboardingCards();

  // ---- Intro bubble game hook ----
  const onIntroComplete = useCallback(() => {
    // no-op: shell just hides the intro screen via welcomeIntroVisible from the hook
  }, []);

  const {
    welcomeIntroVisible,
    introBubbles,
    introPoppedBubbleIds,
    introPoppingBubbleIds,
    introNudgedBubbleIds,
    introPopBursts,
    introProgressCount,
    requiredIntroPops,
    introBubblesRemaining,
    onPopIntroBubble,
    onSkipIntro,
  } = useIntroBubbleGame({ onIntroComplete });

  // ---- Derived wallet/profile state ----
  const activeWalletAddress =
    connectedWalletAddress ?? (bootstrappedWalletAddress.trim() || null);

  const onboardingVisible = useMemo(() => {
    return !isResolvingFirstEntry && isFirstEntry && !onboardingSessionCompleted;
  }, [isResolvingFirstEntry, isFirstEntry, onboardingSessionCompleted]);
  const onboardingCompletionVisible = useMemo(() => {
    return !isResolvingFirstEntry && isFirstEntry && onboardingSessionCompleted;
  }, [isResolvingFirstEntry, isFirstEntry, onboardingSessionCompleted]);

  const showWelcomeBeforeSync = Boolean(
    !profileId && connectedWalletAddress && authenticatedSessionToken,
  );

  const quickSessionHref = withBubbleDropContext("/session", {
    profileId,
    walletAddress: activeWalletAddress,
  });
  const rewardsInventoryHref = withBubbleDropContext("/inventory", {
    profileId,
    walletAddress: activeWalletAddress,
  });

  // ---- Profile summary refresh ----
  const refreshProfileSummary = async (targetProfileId: string) => {
    const summary = await fetchBackendProfileSummary(backendUrl, targetProfileId, authenticatedSessionToken);
    if (!summary) {
      setActionMessage("BubbleDrop is still waking up. Try again in a moment.");
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
    return summary;
  };

  // ---- Daily check-in hook ----
  const {
    dailyCheckInCompletedToday,
    dailyCheckInUiState,
    isSubmittingCheckIn,
    onDailyCheckIn: checkInOnDailyCheckIn,
    setDailyCheckInCompletedToday,
  } = useDailyCheckIn({
    backendUrl,
    profileId,
    connectedWalletAddress,
    activeWalletAddress,
    effectiveIsConnected,
    isConnectedToBase,
    authenticatedSessionToken,
    quickSessionHref,
    refreshProfileSummary,
  });

  // ---- Profile data ----
  const qualificationStatus = profileSummary?.qualificationState.status;
  const isRareRewardAccessActive = profileSummary?.rareRewardAccess.active ?? false;
  const qualificationBadge = qualificationStatus
    ? QUALIFICATION_BADGE_COPY[qualificationStatus]
    : null;
  const nicknameDisplay =
    profileSummary?.profileIdentity.nickname ??
    (connectedWalletAddress ? "Fresh bubble" : "Guest bubble");
  const profileCardEquippedStyle = cosmeticTierPreviewActive
    ? COSMETIC_PREVIEW_DEMOS[cosmeticPreviewIndex % COSMETIC_PREVIEW_DEMOS.length]
    : equippedStyleSnapshot;
  const profileVisualSeed =
    profileCardEquippedStyle?.rewardKey ??
    profileCardEquippedStyle?.rewardId ??
    profileSummary?.avatarState.currentAvatar?.key ??
    selectedAvatarOverrideId ??
    profileSummary?.avatarState.currentAvatar?.id ??
    "bubble-default";
  const profileBubbleTone = getAvatarBubbleTone(
    profileSummary?.avatarState.currentAvatar?.paletteKey ??
      selectedAvatarOverridePaletteKey,
    profileVisualSeed,
  );
  const equippedRarity = profileCardEquippedStyle?.rarity ?? null;
  const profileStyleShellClass =
    equippedRarity === "legendary"
      ? "from-white/90 via-[#faf8f5]/88 to-[#f5f0e8]/82 ring-[#e8dcc8]/70"
      : equippedRarity === "epic"
        ? "from-[#f2e8ff]/86 via-[#e7ddff]/72 to-[#d8ecff]/68 ring-[#ddbeff]/72"
        : equippedRarity === "rare"
          ? "from-[#e6f8ff]/86 via-[#d8f0ff]/74 to-[#dce8ff]/66 ring-[#b8e8ff]/72"
          : equippedRarity === "uncommon"
            ? "from-[#e8fbff]/86 via-[#dcf8fc]/74 to-[#e6f2ff]/68 ring-[#8ee0e8]/72"
            : "from-white/84 via-white/72 to-white/66 ring-white/72";
  const profileRarityChipClass =
    equippedRarity === "legendary"
      ? "profile-rarity-chip-legendary"
      : equippedRarity === "epic"
        ? "profile-rarity-chip-epic"
        : equippedRarity === "rare"
          ? "profile-rarity-chip-rare"
          : equippedRarity === "uncommon"
            ? "profile-rarity-chip-uncommon"
            : "profile-rarity-chip-common";
  const profileEmblemRarityClass =
    equippedRarity === "legendary"
      ? "profile-emblem-rarity-legendary-framer"
      : equippedRarity === "epic"
        ? "profile-emblem-rarity-epic"
        : equippedRarity === "rare"
          ? "profile-emblem-rarity-rare"
          : equippedRarity === "uncommon"
            ? "profile-emblem-rarity-uncommon"
            : "profile-emblem-rarity-common";
  const profileEmblemCategoryClass = profileCardEquippedStyle
    ? inferStyleCategoryLabel(profileCardEquippedStyle.rewardKey) === "Trail"
      ? "profile-emblem-category-trail"
      : inferStyleCategoryLabel(profileCardEquippedStyle.rewardKey) === "Badge"
        ? "profile-emblem-category-badge"
        : inferStyleCategoryLabel(profileCardEquippedStyle.rewardKey) === "Avatar"
          ? "profile-emblem-category-avatar"
          : "profile-emblem-category-bubble"
    : "profile-emblem-category-bubble";
  const equippedStyleName = profileCardEquippedStyle
    ? formatRewardKeyLabel(profileCardEquippedStyle.rewardKey)
    : "Default style";
  const walletDisplay = shortenWalletAddress(
    activeWalletAddress ?? connectedWalletAddress,
  );
  const totalXp = profileSummary?.xpSummary.totalXp ?? 0;
  const currentStreak = profileSummary?.xpSummary.currentStreak ?? 0;
  const currentFrameLabel =
    profileSummary?.rankFrameState.currentFrame?.label ?? "Fresh bubble";
  const nextFrame = profileSummary?.rankFrameState.nextFrame;
  const currentFrameFloorXp =
    profileSummary?.rankFrameState.currentFrame?.minLifetimeXp ?? 0;
  const hasUnlockedCollection =
    Boolean(profileId) && !profileSummary?.onboardingState.needsOnboarding;
  /** After wallet + profile sync: show hero, Bubble world, Glass, etc. */
  const showFullBubbleDropMenu = Boolean(profileId);
  const progressToNextFramePercent = nextFrame
    ? Math.max(
        8,
        Math.min(
          100,
          Math.round(
            ((totalXp - currentFrameFloorXp) /
              Math.max(1, nextFrame.minLifetimeXp - currentFrameFloorXp)) *
              100,
          ),
        ),
      )
    : profileSummary
      ? 100
      : 8;

  const walletFlowTitle =
    walletFlowState.stage === "connecting"
      ? "Signing in…"
      : walletFlowState.stage === "awaiting_wallet_approval"
        ? "Awaiting wallet approval"
        : walletFlowState.stage === "signing_in"
          ? "Signing in"
          : walletFlowState.stage === "connect_failed"
            ? "Connect failed"
            : walletFlowState.stage === "sign_in_failed"
              ? "Sign-in failed"
              : walletFlowState.stage === "timed_out"
                ? "Timed out"
                : walletFlowState.stage === "connected"
                  ? "Connected"
                  : null;

  // ---- Effects ----

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
    if (!profileId) {
      setEquippedStyleSnapshot(null);
      return;
    }
    const persisted = loadPersistedEquippedStyles(profileId);
    const merged = { ...persisted };
    const backendStyle = profileSummary?.styleState?.equippedStyle ?? null;
    if (backendStyle) {
      const slot = inferSlotFromRewardKey(backendStyle.rewardKey);
      merged[slot] = backendStyle;
      savePersistedEquippedStyle(profileId, backendStyle);
    }
    const primary = getPrimaryEquippedStyle(merged);
    setEquippedStyleSnapshot(primary);
  }, [profileId, profileSummary]);

  useEffect(() => {
    if (!profileId) {
      setSelectedAvatarOverrideId(null);
      setSelectedAvatarOverridePaletteKey(null);
      return;
    }
    const override = loadSelectedAvatarOverrideState(profileId);
    setSelectedAvatarOverrideId(override?.avatarId ?? loadSelectedAvatarOverride(profileId));
    setSelectedAvatarOverridePaletteKey(override?.paletteKey ?? null);
  }, [profileId]);

  useEffect(() => {
    if (!profileId) {
      return;
    }
    const currentAvatarId = profileSummary?.avatarState.currentAvatar?.id ?? null;
    const currentAvatarPaletteKey =
      profileSummary?.avatarState.currentAvatar?.paletteKey ?? null;
    if (!currentAvatarId) {
      return;
    }
    saveSelectedAvatarOverride(profileId, currentAvatarId, currentAvatarPaletteKey);
    setSelectedAvatarOverrideId(currentAvatarId);
    setSelectedAvatarOverridePaletteKey(currentAvatarPaletteKey);
  }, [
    profileId,
    profileSummary?.avatarState.currentAvatar?.id,
    profileSummary?.avatarState.currentAvatar?.paletteKey,
  ]);

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

  // ---- Profile bootstrap ----
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

    const shouldBlockActions = !silent;
    if (shouldBlockActions) {
      setIsSubmittingAction(true);
      setActionMessage(null);
    }
    try {
      let response: Response | null = null;
      let timeoutTriggered = false;
      for (let attempt = 0; attempt <= PROFILE_SYNC_RETRY_COUNT; attempt += 1) {
        try {
          response = await fetchWithTimeout(`${backendUrl}/profile/connect-wallet`, {
            method: "POST",
            headers: createAuthenticatedJsonHeaders(authenticatedSessionToken),
            body: JSON.stringify({ walletAddress: normalizedWalletAddress }),
          });
          timeoutTriggered = false;
          break;
        } catch (error) {
          const isTimeoutAbort =
            error instanceof DOMException && error.name === "AbortError";
          if (!isTimeoutAbort || attempt >= PROFILE_SYNC_RETRY_COUNT) {
            throw error;
          }
          timeoutTriggered = true;
        }
      }

      if (!response) {
        if (shouldBlockActions && timeoutTriggered) {
          setActionMessage(
            "Profile sync timed out. Tap Sync profile below to try again.",
          );
        }
        return;
      }

      if (!response.ok) {
        if (shouldBlockActions) {
          const diagnostic = await getProfileConnectWalletErrorMessage(response);
          setActionMessage(diagnostic);
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[BubbleDrop] profile/connect-wallet failed", {
              status: response.status,
              hint: diagnostic,
            });
          }
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
      if (shouldBlockActions) {
        setActionMessage("Your BubbleDrop home is ready.");
      }
    } catch (error) {
      if (shouldBlockActions) {
        const isTimeoutAbort =
          error instanceof DOMException && error.name === "AbortError";
        if (isTimeoutAbort) {
          setActionMessage(
            "Profile sync timed out. Tap Sync profile below to try again.",
          );
        } else {
          const msg =
            error instanceof Error ? error.message : String(error ?? "unknown");
          const isNetwork =
            /failed to fetch|networkerror|load failed|network request failed/i.test(
              msg,
            );
          setActionMessage(
            isNetwork
              ? "Network error — check connection or VPN, then Sync profile again."
              : `Sync failed: ${msg.slice(0, 160)}`,
          );
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[BubbleDrop] profile/connect-wallet exception", error);
          }
        }
      }
    } finally {
      if (shouldBlockActions) {
        setIsSubmittingAction(false);
      }
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

  // ---- Shell action handlers (delegating to hooks with actionMessage) ----

  const onSwitchToBase = () => {
    void walletOnSwitchToBase(setActionMessage);
  };

  const onSignInWithBase = () => {
    void walletOnSignInWithBase(setActionMessage);
  };

  const onClearBaseSignIn = () => {
    walletOnClearBaseSignIn(setActionMessage);
  };

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

  const onRefreshProfile = async () => {
    if (!profileId) {
      setActionMessage("Connect and sign in to open your BubbleDrop home.");
      return;
    }
    setIsSubmittingAction(true);
    setActionMessage(null);
    try {
      await refreshProfileSummary(profileId);
      setActionMessage("Your home is refreshed.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const onReplayIntro = () => {
    // Note: intro replay would need hook support; currently just a placeholder
    // since the hook manages its own state. For full replay we'd need a reset method on the hook.
  };

  const onDailyCheckIn = (opts?: { openBubbleSessionAfter?: boolean }) => {
    void checkInOnDailyCheckIn(setActionMessage, opts);
  };

  const onCompleteOnboarding = async () => {
    if (!profileId) {
      setActionMessage("Connect, sign in, and sync your profile before finishing onboarding.");
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

    setIsSubmittingAction(true);
    setActionMessage(null);
    try {
      const response = await fetch(`${backendUrl}/profile/onboarding/complete`, {
        method: "POST",
        headers: createAuthenticatedJsonHeaders(authenticatedSessionToken),
        body: JSON.stringify({
          profileId,
          nickname,
        }),
      });

      if (!response.ok) {
        setActionMessage("We couldn't finish onboarding. Check your nickname and try again.");
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
        setActionMessage("Onboarding completed. Your new bubble is still settling in.");
      }
    } catch {
      setActionMessage("Your identity update did not land. Try again in a moment.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // ---- Onboarding card answer handler ----
  const onAnswer = (index: number) => {
    setSelectedOption(index);
    if (index === currentCard.correctIndex) {
      setShowWrongExplanation(false);
      setTimeout(() => {
        const hasMore = hookGoNextCard();
        if (!hasMore) {
          setOnboardingSessionCompleted(true);
        }
      }, 140);
      return;
    }
    setShowWrongExplanation(true);
  };

  const goNextCard = () => {
    const hasMore = hookGoNextCard();
    if (!hasMore) {
      setOnboardingSessionCompleted(true);
    }
  };

  // ---- Derived UI state ----
  const homeStatusPills = [
    effectiveIsConnected
      ? isConnectedToBase
        ? "Base ready"
        : "Switch to Base"
      : "Sign in needed",
    authenticatedSessionToken ? "Signed in" : "Secure sign-in needed",
    isRareRewardAccessActive
      ? "Season chance live"
      : qualificationBadge
        ? qualificationBadge.label
        : "Season chance building",
  ];
  const canSyncProfile =
    !isSubmittingAction &&
    Boolean(authenticatedSessionToken) &&
    Boolean(connectedWalletAddress) &&
    isConnectedToBase;
  let heroStatusLabel = "Wallet";
  let heroTitle = "Start here — then play, streak, earn.";
  let heroBody =
    "Pop bubbles in runs, check in daily to grow your streak, and build your season-end reward chance. Your first move: connect your wallet, sign in, and mark the day on Base.";
  const secondaryHeroActionLabel: string | null = null;
  const secondaryHeroActionDisabled = false;
  const secondaryHeroActionHandler: (() => void) | null = null;
  let heroPortalCopy = "Bubble lane offline";
  const showHeroSection = true;
  const dailyMissionHint = isFirstEntry
    ? "Finish onboarding first."
    : isRareRewardAccessActive
      ? "Season chance is warm."
      : "Season chance needs check-in.";
  const showDropRadar = Boolean(authenticatedSessionToken && profileId);
  const dropRadarPercent = !effectiveIsConnected
    ? 16
    : !isConnectedToBase
      ? 34
      : !authenticatedSessionToken
        ? 52
        : isFirstEntry
          ? 66
          : isRareRewardAccessActive
            ? Math.min(98, 84 + Math.min(currentStreak, 7) * 2)
            : Math.min(82, 62 + Math.min(currentStreak, 7) * 2);
  const dropRadarStateLabel = !effectiveIsConnected
    ? "Wallet offline"
    : !isConnectedToBase
      ? "Need Base network"
      : !authenticatedSessionToken
        ? "Auth lock active"
        : isFirstEntry
          ? "Onboarding required"
          : isRareRewardAccessActive
            ? "Season chance detected"
            : "XP lane detected";
  const dropRadarHeadline = !effectiveIsConnected
    ? "WALLET OFFLINE"
    : !isConnectedToBase
      ? "BASE REQUIRED"
      : !authenticatedSessionToken
        ? "AUTH LOCKED"
        : isFirstEntry
          ? "ONBOARDING"
          : isRareRewardAccessActive
            ? "SEASON DETECTED"
            : "XP DETECTED";

  const cosmeticUrlDemoRef = useRef(false);
  useEffect(() => {
    if (welcomeIntroVisible || cosmeticUrlDemoRef.current) {
      return;
    }
    try {
      if (new URLSearchParams(window.location.search).get("cosmeticDemo") === "1") {
        cosmeticUrlDemoRef.current = true;
        setCosmeticTierPreviewActive(true);
      }
    } catch {
      /* ignore */
    }
  }, [welcomeIntroVisible]);

  useEffect(() => {
    if (!cosmeticTierPreviewActive) {
      return;
    }
    const id = window.setInterval(() => {
      setCosmeticPreviewIndex((i) => (i + 1) % COSMETIC_PREVIEW_DEMOS.length);
    }, COSMETIC_PREVIEW_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [cosmeticTierPreviewActive]);

  const showHeroSecondaryAction = false;

  if (!effectiveIsConnected) {
    heroStatusLabel = "Wallet";
    heroPortalCopy = "Base entry";
    heroTitle = "Start here — then play, streak, earn.";
    heroBody =
      "Pop bubbles in runs, check in daily to grow your streak, and build your season-end reward chance. Your first move: connect your wallet, sign in, and mark the day on Base.";
  } else if (effectiveIsConnected && !isConnectedToBase) {
    heroStatusLabel = "Base needed";
    heroTitle = "Your bubble is here, but it still needs the Base lane.";
    heroBody = "Switch network to Base.";
    heroPortalCopy = "Base lane waiting";
  } else if (effectiveIsConnected && !isSignedInWithBase) {
    heroStatusLabel = "Secure sign-in";
    heroTitle = "Confirm this bubble so the app can trust your next move.";
    heroBody =
      "Use the Sign in with Base button on your Player profile card above — only place to sign in.";
    heroPortalCopy = "Seal your glow";
  } else if (!profileId) {
    heroStatusLabel = "Profile sync";
    heroTitle = "Shape this bubble into your BubbleDrop identity.";
    heroBody = "Create your player profile.";
    heroPortalCopy = "Home still forming";
  } else if (!profileSummary) {
    heroStatusLabel = "Refreshing";
    heroTitle = "Your bubble is almost ready to glow.";
    heroBody = "Updating profile state...";
    heroPortalCopy = "Glow calibrating";
  } else if (!dailyCheckInCompletedToday) {
    /* ARRIVAL: ежедневный check-in на Base (газ), пока визит не отмечен */
    heroStatusLabel = "Arrival";
    heroTitle = "Mark today's visit on Base.";
    heroBody = "Onchain on Base • You pay gas for this step";
    heroPortalCopy = "Base check-in";
  } else if (qualificationStatus === "paused") {
    heroStatusLabel = "Season paused";
    heroTitle = "Your season chance paused after the streak broke.";
    heroBody = "Check in again, rebuild momentum, and return to active runs.";
    heroPortalCopy = "Season lane resting";
  } else if (isRareRewardAccessActive && qualificationStatus === "qualified") {
    heroStatusLabel = "Qualified";
    heroTitle = "Your profile is on pace for the season-end reward draw.";
    heroBody = "Season-end reward chance is active today. Keep the streak alive and keep earning XP.";
    heroPortalCopy = "Season lane live";
  } else if (!isRareRewardAccessActive) {
    heroStatusLabel = "Season build";
    heroTitle = "Today still moves your bubble toward season-end rewards.";
    heroBody = "XP progress is active. Keep the streak alive and bank more active-play XP.";
    heroPortalCopy = "XP lane open";
  } else if (profileSummary) {
    heroStatusLabel = "Ready to play";
    heroTitle = "You're checked in — time for bubbles.";
    heroBody = "Open the bubble session when you're ready.";
    heroPortalCopy = "Play portal ready";
  }

  const profilePrimaryAction = !effectiveIsConnected
    ? null
    : !isConnectedToBase
      ? {
          kind: "button" as const,
          label: "Switch to Base",
          onClick: onSwitchToBase,
          disabled: isWalletFlowBusy || isSubmittingAction,
        }
      : !authenticatedSessionToken
        ? {
            kind: "button" as const,
            label: isSigningInWithBase ? "Signing in…" : "Sign in with Base",
            onClick: onSignInWithBase,
            disabled: isWalletFlowBusy || isSubmittingAction,
          }
        : !profileId
          ? {
              kind: "button" as const,
              label: "Sync profile",
              onClick: onBootstrapProfile,
              disabled: !canSyncProfile,
            }
          : null;

  const isDailyCheckInBusy =
    dailyCheckInUiState === "preparing_transaction" ||
    dailyCheckInUiState === "wallet_confirmation_requested" ||
    dailyCheckInUiState === "pending_onchain";
  const dailyCheckInAction = dailyCheckInCompletedToday
    ? {
        label: "Daily check-in complete",
        disabled: true,
      }
    : {
        label:
          dailyCheckInUiState === "preparing_transaction"
            ? "Preparing…"
            : dailyCheckInUiState === "wallet_confirmation_requested"
              ? "Confirm in wallet…"
              : dailyCheckInUiState === "pending_onchain"
                ? "Pending on Base…"
                : "Daily check-in (+20 XP)",
        disabled: isSubmittingAction || isSubmittingCheckIn || isDailyCheckInBusy,
      };

  const hasEnteredBubbleDropApp = Boolean(authenticatedSessionToken && profileId);

  const dailyMissionPrimaryAction =
    hasEnteredBubbleDropApp && quickSessionHref
      ? {
          kind: "link" as const,
          label: "Tap to play",
          href: quickSessionHref,
        }
      : null;

  const dailyCheckInCardAction = hasEnteredBubbleDropApp
    ? {
        label: dailyCheckInAction.label,
        disabled: dailyCheckInAction.disabled,
        onClick: () => {
          onDailyCheckIn();
        },
      }
    : null;

  return (
    <ScreenLayout>
      {/*
        ambient-aura and the extra b5/b6 bubbles come from globals.css keyframes
        and are additive decoration on top of ScreenLayout's built-in bubbles.
        Kept inline because ScreenLayout exposes no slot for extra background layers.
      */}
      <div className="ambient-aura" aria-hidden="true">
        <span className="aura aura1" />
        <span className="aura aura2" />
        <span className="aura aura3" />
      </div>
      <div className="floating-bubbles" aria-hidden="true">
        <span className="bubble b5" />
        <span className="bubble b6" />
      </div>
      {welcomeIntroVisible ? (
        <WelcomeIntroScreen
          introProgressCount={introProgressCount}
          requiredIntroPops={requiredIntroPops}
          introBubblesRemaining={introBubblesRemaining}
          introBubbles={introBubbles}
          introPoppedBubbleIds={introPoppedBubbleIds}
          introPoppingBubbleIds={introPoppingBubbleIds}
          introNudgedBubbleIds={introNudgedBubbleIds}
          introPopBursts={introPopBursts}
          onSkipIntro={onSkipIntro}
          onPopIntroBubble={onPopIntroBubble}
        />
      ) : null}

      {onboardingVisible || onboardingCompletionVisible ? (
          <OnboardingFlow
            onboardingVisible={onboardingVisible}
            onboardingCompletionVisible={onboardingCompletionVisible}
            cardIndex={cardIndex}
            totalCards={totalCards}
            currentCard={currentCard}
            selectedOption={selectedOption}
            showWrongExplanation={showWrongExplanation}
            nicknameInput={nicknameInput}
            isSubmittingAction={isSubmittingAction}
            authenticatedSessionToken={authenticatedSessionToken}
            actionMessage={actionMessage}
            onAnswer={onAnswer}
            goNextCard={goNextCard}
            onNicknameChange={setNicknameInput}
            onCompleteOnboarding={onCompleteOnboarding}
          />
        ) : (
          <>
            <ProfileCard
              showWelcomeBeforeSync={showWelcomeBeforeSync}
              cosmeticTierPreviewActive={cosmeticTierPreviewActive}
              cosmeticPreviewIndex={cosmeticPreviewIndex}
              cosmeticPreviewDemosLength={COSMETIC_PREVIEW_DEMOS.length}
              cosmeticPreviewRarity={COSMETIC_PREVIEW_DEMOS[cosmeticPreviewIndex % COSMETIC_PREVIEW_DEMOS.length].rarity}
              onStopCosmeticPreview={() => {
                setCosmeticTierPreviewActive(false);
                setCosmeticPreviewIndex(0);
              }}
              profileCardEquippedStyle={profileCardEquippedStyle}
              profileEmblemRarityClass={profileEmblemRarityClass}
              profileEmblemCategoryClass={profileEmblemCategoryClass}
              profileStyleShellClass={profileStyleShellClass}
              profileRarityChipClass={profileRarityChipClass}
              isProfileBubblePressed={isProfileBubblePressed}
              onProfileBubblePointerDown={() => setIsProfileBubblePressed(true)}
              onProfileBubblePointerUp={() => setIsProfileBubblePressed(false)}
              onProfileBubblePointerLeave={() => setIsProfileBubblePressed(false)}
              onProfileBubblePointerCancel={() => setIsProfileBubblePressed(false)}
              profileBubbleTone={profileBubbleTone}
              nicknameDisplay={nicknameDisplay}
              equippedStyleName={equippedStyleName}
              walletDisplay={walletDisplay}
              bootstrappedWalletAddress={bootstrappedWalletAddress}
              connectedWalletAddress={connectedWalletAddress}
              qualificationBadge={qualificationBadge}
              profilePrimaryAction={profilePrimaryAction}
              totalXp={totalXp}
              currentStreak={currentStreak}
              currentFrameLabel={currentFrameLabel}
              nextFrame={nextFrame}
              profileSummary={profileSummary}
              progressToNextFramePercent={progressToNextFramePercent}
              showDropRadar={showDropRadar}
              dailyMissionHint={dailyMissionHint}
              isRareRewardAccessActive={isRareRewardAccessActive}
              dailyMissionPrimaryAction={dailyMissionPrimaryAction}
              dropRadarPercent={dropRadarPercent}
              dropRadarHeadline={dropRadarHeadline}
              dropRadarStateLabel={dropRadarStateLabel}
              hasUnlockedCollection={hasUnlockedCollection}
              rewardsInventoryHref={rewardsInventoryHref}
              dailyCheckInCardAction={dailyCheckInCardAction}
              hasEnteredBubbleDropApp={hasEnteredBubbleDropApp}
            />

            {showFullBubbleDropMenu ? (
            <>
            {showHeroSection && !profileId ? (
              <HeroSection
                effectiveIsConnected={effectiveIsConnected}
                isRareRewardAccessActive={isRareRewardAccessActive}
                heroStatusLabel={heroStatusLabel}
                heroTitle={heroTitle}
                heroBody={heroBody}
                heroPortalCopy={heroPortalCopy}
                homeStatusPills={homeStatusPills}
                walletFlowTitle={walletFlowTitle}
                walletFlowState={walletFlowState}
                showConnectRecovery={showConnectRecovery}
                showSignInRecovery={showSignInRecovery}
                isWalletFlowBusy={isWalletFlowBusy}
                isSubmittingAction={isSubmittingAction}
                preferredConnectorUsesCoinbaseWallet={preferredConnectorUsesCoinbaseWallet}
                preferredConnectorUsesBaseAccount={preferredConnectorUsesBaseAccount}
                fallbackWalletConnector={fallbackWalletConnector}
                fallbackConnectorUsesCoinbaseWallet={fallbackConnectorUsesCoinbaseWallet}
                onConnectWallet={onConnectWallet}
                onConnectCoinbaseWallet={onConnectCoinbaseWallet}
                onSignInWithBase={onSignInWithBase}
                showHeroSecondaryAction={showHeroSecondaryAction}
                secondaryHeroActionLabel={secondaryHeroActionLabel}
                secondaryHeroActionDisabled={secondaryHeroActionDisabled}
                secondaryHeroActionHandler={secondaryHeroActionHandler}
              />
            ) : null}

            <BubbleWorldMenu
              profileId={profileId}
              walletAddress={activeWalletAddress}
            />

            <Section title="Glass mode">
              <Row gap={2}>
                {(["soft", "medium", "strong"] as const).map((mode) => (
                  <Button
                    key={mode}
                    size="sm"
                    variant={glassMode === mode ? "primary" : "secondary"}
                    onClick={() => setGlassMode(mode)}
                  >
                    {mode}
                  </Button>
                ))}
              </Row>
            </Section>

            </>
            ) : null}

            {actionMessage ? (
              // Sticky positioning preserved inline because the component library
              // has no Sticky/Toast primitive; visible content wrapped in Card+Text.
              <div style={{ position: "sticky", bottom: "0.75rem", zIndex: 20 }}>
                <Card variant="warning" padding="sm">
                  <Text>{actionMessage}</Text>
                </Card>
              </div>
            ) : null}
          </>
        )}
    </ScreenLayout>
  );
}
