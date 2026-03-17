"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useAccount } from "wagmi";
import { captureAnalyticsEvent } from "../analytics";
import {
  BUBBLEDROP_API_BASE,
  useBubbleDropRuntime,
  withBubbleDropContext,
} from "../bubbledrop-runtime";
import {
  createAuthenticatedJsonHeaders,
  getSmokeSignInSessionFromCurrentUrl,
  loadBubbleDropFrontendSignInSession,
  type BubbleDropFrontendSignInSession,
} from "../base-sign-in";
import { fetchBackendProfileSummary } from "./backend-profile-summary";

const SESSION_DURATION_SECONDS = 10 * 60;
const MIN_SESSION_SECONDS_FOR_COMPLETION = 5 * 60;
const ACTIVE_SECONDS_FOR_COMPLETION_BONUS = 3 * 60;
const ACTIVE_SECONDS_PER_TAP = 12;
const SESSION_REWARD_BUBBLES_XP = 30;
const SESSION_COMPLETION_BONUS_XP = 20;
const SESSION_ACTIVE_PLAY_XP_MAX = 20;
const SESSION_ACTIVE_SECONDS_XP_CAP = 10 * 60;
const COMBO_WINDOW_MS = 1500;
const FEATURED_COMBO_TARGET = 5;
const ACTIVE_PLAY_BUBBLE_COUNT = 14;
const DECORATIVE_STANDARD_BUBBLES = [
  { top: "18%", left: "14%", size: "3.25rem" },
  { top: "26%", left: "76%", size: "4.5rem" },
  { top: "44%", left: "10%", size: "2.75rem" },
  { top: "58%", left: "82%", size: "3rem" },
  { top: "70%", left: "18%", size: "4rem" },
] as const;
const DECORATIVE_XP_BUBBLES = [
  { top: "22%", left: "58%", size: "1.4rem" },
  { top: "38%", left: "30%", size: "1.1rem" },
  { top: "62%", left: "64%", size: "1.3rem" },
] as const;
const DECORATIVE_PREMIUM_BUBBLES = [
  { top: "34%", left: "84%", size: "2rem" },
  { top: "64%", left: "40%", size: "2.4rem" },
] as const;

type SessionStartResponse = {
  sessionId: string;
  profileId: string;
  startedAt: string;
};

type ActivePlayBubble = {
  id: number;
  top: number;
  left: number;
  sizeRem: number;
  hue: number;
  alpha: number;
  driftMs: number;
  wobbleDeg: number;
  roundness: number;
  scale: number;
  isBonus: boolean;
  nextShiftAtMs: number;
  poppedUntilMs: number;
};

type PopBurst = {
  id: number;
  xPercent: number;
  yPercent: number;
  hue: number;
  sizeRem: number;
};

type RareRewardTokenOutcome = {
  tokenSymbol: string;
  tokenAmountAwarded: string;
  weeklyTicketsIssued: number;
  seasonId: string;
  weekStartDate: string;
};

type RareRewardCollectibleOutcome = {
  id: string;
  key: string;
};

type RareRewardOutcome = {
  tokenSymbolAwarded: string | null;
  tokenAmountAwarded: string;
  weeklyTicketsIssued: number;
  nftIdsAwarded: string[];
  cosmeticIdsAwarded: string[];
  tokenReward: RareRewardTokenOutcome | null;
  nftRewards: RareRewardCollectibleOutcome[];
  cosmeticRewards: RareRewardCollectibleOutcome[];
};

type SessionCompleteResponse = {
  success: boolean;
  sessionId: string;
  profileId: string;
  endedAt: string;
  sessionDurationSeconds: number;
  activeSeconds: number;
  activePlayXp: number;
  completionBonusXp: number;
  xpAwarded: number;
  newStreak: number;
  rareAccessActive: boolean;
  grantedXp: number;
  totalXp: number;
  qualificationStatus: "locked" | "in_progress" | "qualified" | "paused" | "restored";
  rareRewardAccessActive: boolean;
  rareRewardOutcome: RareRewardOutcome;
};

async function fetchOnboardingStateForProfile(
  backendUrl: string,
  profileId: string,
): Promise<{ walletAddress: string; needsOnboarding: boolean } | null> {
  const payload = await fetchBackendProfileSummary(backendUrl, profileId);
  if (!payload) {
    return null;
  }

  return {
    walletAddress: payload.profileIdentity.walletAddress,
    needsOnboarding: payload.onboardingState.needsOnboarding,
  };
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDurationLabel(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function hasIssuedRareRewardOutcome(outcome: RareRewardOutcome): boolean {
  return !!outcome.tokenReward || outcome.nftRewards.length > 0 || outcome.cosmeticRewards.length > 0;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createActivePlayBubble(id: number): ActivePlayBubble {
  const now = Date.now();
  return {
    id,
    top: randomBetween(16, 78),
    left: randomBetween(10, 86),
    sizeRem: randomBetween(2.8, 5.6),
    hue: randomBetween(185, 325),
    alpha: randomBetween(0.42, 0.72),
    driftMs: Math.round(randomBetween(1200, 3200)),
    wobbleDeg: randomBetween(-10, 10),
    roundness: randomBetween(42, 58),
    scale: randomBetween(0.94, 1.08),
    isBonus: Math.random() < 0.16,
    nextShiftAtMs: now + randomBetween(500, 2200),
    poppedUntilMs: 0,
  };
}

function normalizeWalletAddress(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function BubbleSessionPlayScreen() {
  const runtimeContext = useBubbleDropRuntime();
  const { address } = useAccount();
  const backendUrl = BUBBLEDROP_API_BASE;
  const profileId = runtimeContext.profileId;
  const [walletAddress, setWalletAddress] = useState<string | null>(
    runtimeContext.walletAddress,
  );
  const [sessionStartedAtMs, setSessionStartedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isActive, setIsActive] = useState(false);
  const [activeTapCount, setActiveTapCount] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [backendSessionId, setBackendSessionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [lastTapFeedbackAtMs, setLastTapFeedbackAtMs] = useState<number | null>(null);
  const [lastTapAtMs, setLastTapAtMs] = useState<number | null>(null);
  const [tapCombo, setTapCombo] = useState(0);
  const [bestTapCombo, setBestTapCombo] = useState(0);
  const [lastTapGainSeconds, setLastTapGainSeconds] = useState(ACTIVE_SECONDS_PER_TAP);
  const [tapFeedbackPoint, setTapFeedbackPoint] = useState<{
    topPercent: number;
    leftPercent: number;
  } | null>(null);
  const [activePlayBubbles, setActivePlayBubbles] = useState<ActivePlayBubble[]>(
    () =>
      Array.from({ length: ACTIVE_PLAY_BUBBLE_COUNT }, (_, index) =>
        createActivePlayBubble(index),
      ),
  );
  const [popBursts, setPopBursts] = useState<PopBurst[]>([]);
  const [completionResult, setCompletionResult] = useState<SessionCompleteResponse | null>(null);
  const playfieldRef = useRef<HTMLDivElement | null>(null);
  const [authSession, setAuthSession] =
    useState<BubbleDropFrontendSignInSession | null>(null);
  const [isResolvingOnboardingState, setIsResolvingOnboardingState] =
    useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const connectedWalletAddress = normalizeWalletAddress(address);
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const normalizedAuthSessionAddress = normalizeWalletAddress(authSession?.address);
  const authSessionMatchesRuntimeWallet =
    !normalizedWalletAddress || normalizedAuthSessionAddress === normalizedWalletAddress;
  const authSessionMatchesConnectedWallet =
    !connectedWalletAddress || normalizedAuthSessionAddress === connectedWalletAddress;
  const authSessionToken =
    authSession &&
    authSessionMatchesRuntimeWallet &&
    authSessionMatchesConnectedWallet
      ? authSession.authSessionToken
      : null;

  useEffect(() => {
    setAuthSession(
      getSmokeSignInSessionFromCurrentUrl() ??
        loadBubbleDropFrontendSignInSession(),
    );
  }, [connectedWalletAddress, walletAddress]);

  useEffect(() => {
    setIsResolvingOnboardingState(true);

    if (profileId) {
      void (async () => {
        const onboardingState = await fetchOnboardingStateForProfile(
          backendUrl,
          profileId,
        );
        if (!onboardingState) {
          setNeedsOnboarding(false);
          setActionMessage("We couldn't load your session access right now.");
          setIsResolvingOnboardingState(false);
          return;
        }

        runtimeContext.setAppContext({
          profileId,
          walletAddress: onboardingState.walletAddress,
        });
        setWalletAddress(onboardingState.walletAddress);
        setNeedsOnboarding(onboardingState.needsOnboarding);
        setIsResolvingOnboardingState(false);
      })();
      return;
    }

    setNeedsOnboarding(false);
    setIsResolvingOnboardingState(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, profileId]);

  useEffect(() => {
    if (!isActive || sessionStartedAtMs === null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isActive, sessionStartedAtMs]);

  useEffect(() => {
    if (!isActive || sessionCompleted) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setActivePlayBubbles((current) =>
        current.map((bubble) => {
          if (bubble.poppedUntilMs > now || bubble.nextShiftAtMs > now) {
            return bubble;
          }

          return {
            ...bubble,
            top: randomBetween(14, 80),
            left: randomBetween(8, 88),
            driftMs: Math.round(randomBetween(900, 2800)),
            wobbleDeg: randomBetween(-14, 14),
            roundness: randomBetween(40, 62),
            scale: randomBetween(0.9, 1.12),
            isBonus: Math.random() < 0.16,
            nextShiftAtMs: now + randomBetween(600, 2600),
          };
        }),
      );
    }, 240);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isActive, sessionCompleted]);

  const elapsedSeconds = useMemo(() => {
    if (completionResult) {
      return completionResult.sessionDurationSeconds;
    }
    if (!sessionStartedAtMs) {
      return 0;
    }
    return Math.max(0, Math.floor((nowMs - sessionStartedAtMs) / 1000));
  }, [completionResult, nowMs, sessionStartedAtMs]);
  const displayElapsedSeconds = Math.min(elapsedSeconds, SESSION_DURATION_SECONDS);
  const rawActiveSeconds = activeTapCount * ACTIVE_SECONDS_PER_TAP;
  const backendCountableActiveSeconds = Math.min(rawActiveSeconds, elapsedSeconds);
  const elapsedProgressPercent = Math.min(
    100,
    Math.round((Math.min(elapsedSeconds, SESSION_DURATION_SECONDS) / SESSION_DURATION_SECONDS) * 100),
  );
  const activeSignalProgressPercent = Math.min(
    100,
    Math.round((Math.min(backendCountableActiveSeconds, ACTIVE_SECONDS_FOR_COMPLETION_BONUS) /
      ACTIVE_SECONDS_FOR_COMPLETION_BONUS) *
      100),
  );
  const localCompletionEstimateMet =
    elapsedSeconds >= MIN_SESSION_SECONDS_FOR_COMPLETION &&
    backendCountableActiveSeconds >= ACTIVE_SECONDS_FOR_COMPLETION_BONUS;
  const projectedActivePlayXp = Math.floor(
    (Math.min(backendCountableActiveSeconds, SESSION_ACTIVE_SECONDS_XP_CAP) /
      SESSION_ACTIVE_SECONDS_XP_CAP) *
      SESSION_ACTIVE_PLAY_XP_MAX,
  );
  const projectedCompletionBonusXp = localCompletionEstimateMet
    ? SESSION_COMPLETION_BONUS_XP
    : 0;
  const projectedRewardBubblesXp = localCompletionEstimateMet
    ? SESSION_REWARD_BUBBLES_XP
    : 0;
  const projectedXpAwarded =
    projectedActivePlayXp + projectedCompletionBonusXp + projectedRewardBubblesXp;
  const huntReadinessPercent = Math.min(
    100,
    Math.round(
      (Math.min(backendCountableActiveSeconds, ACTIVE_SECONDS_FOR_COMPLETION_BONUS) /
        ACTIVE_SECONDS_FOR_COMPLETION_BONUS) *
        100,
    ),
  );
  const runObjectives = [
    {
      id: "survive",
      label: `Stay in session for ${Math.round(MIN_SESSION_SECONDS_FOR_COMPLETION / 60)} min`,
      done: elapsedSeconds >= MIN_SESSION_SECONDS_FOR_COMPLETION,
    },
    {
      id: "active",
      label: `Accumulate ${Math.round(ACTIVE_SECONDS_FOR_COMPLETION_BONUS / 60)} min active play`,
      done: backendCountableActiveSeconds >= ACTIVE_SECONDS_FOR_COMPLETION_BONUS,
    },
    {
      id: "combo",
      label: `Reach combo x${FEATURED_COMBO_TARGET}`,
      done: bestTapCombo >= FEATURED_COMBO_TARGET,
    },
  ] as const;
  const runObjectiveCompletedCount = runObjectives.filter((objective) => objective.done).length;
  const elapsedSecondsRemaining = Math.max(0, MIN_SESSION_SECONDS_FOR_COMPLETION - elapsedSeconds);
  const activeSecondsRemaining = Math.max(0, ACTIVE_SECONDS_FOR_COMPLETION_BONUS - backendCountableActiveSeconds);
  const readinessLabel = sessionCompleted
    ? "Session finished"
    : isActive
      ? localCompletionEstimateMet
        ? "Ready to submit"
        : "Active run"
      : "Ready to start";
  const readinessCopy = sessionCompleted
    ? "Backend result is locked in below."
    : isActive
      ? localCompletionEstimateMet
        ? `You can submit this run now. Projected reward: ${projectedXpAwarded} XP.`
        : `Keep playing to build activity and time. ${formatTime(
            elapsedSecondsRemaining,
          )} min time and ${formatTime(activeSecondsRemaining)} play target remain.`
      : "Start a run, then keep tapping the bubble field.";
  const canStartSession =
    !isActive &&
    !sessionCompleted &&
    !isSubmitting &&
    !isResolvingOnboardingState &&
    Boolean(profileId) &&
    !needsOnboarding &&
    Boolean(authSessionToken);
  const canCompleteSession =
    isActive &&
    !sessionCompleted &&
    !isSubmitting &&
    !isResolvingOnboardingState;
  const startSessionBlockReason =
    isActive || sessionCompleted
      ? null
      : isResolvingOnboardingState
        ? "Checking your session access..."
        : isSubmitting
          ? "Starting session..."
          : !profileId || needsOnboarding
            ? "Finish wallet setup on Home before starting a run."
            : !authSessionToken
              ? "Use Sign in with Base on Home before starting a run."
              : null;
  const startSessionStatusMessage =
    startSessionBlockReason ??
    (!isActive && !sessionCompleted ? actionMessage : null);
  const gameplayToastMessage =
    actionMessage && !sessionCompleted ? actionMessage : null;
  const showTapFeedback =
    lastTapFeedbackAtMs !== null && Date.now() - lastTapFeedbackAtMs < 850;

  const hasRareRewardOutcome = completionResult
    ? hasIssuedRareRewardOutcome(completionResult.rareRewardOutcome)
    : false;
  const completedResult = sessionCompleted && completionResult ? completionResult : null;
  const completedRunDurationLabel = completedResult
    ? formatDurationLabel(completedResult.sessionDurationSeconds)
    : null;
  const nextStepCopy = completedResult
    ? completedResult.rareAccessActive
      ? "Rare lane is active. Run another session or open vault."
      : "Next step: complete daily check-in on Home to restore rare lane."
    : null;
  const backHomeHrefBase = withBubbleDropContext("/", {
    profileId,
    walletAddress: connectedWalletAddress ?? walletAddress,
  });
  const backHomeHref = backHomeHrefBase.includes("?")
    ? `${backHomeHrefBase}&skipIntro=1`
    : `${backHomeHrefBase}?skipIntro=1`;

  const onStartSession = () => {
    if (isActive || sessionCompleted || isSubmitting) {
      return;
    }
    if (!profileId || needsOnboarding) {
      setActionMessage("Finish wallet setup before starting a session.");
      return;
    }
    if (!authSessionToken) {
      setActionMessage("Sign in with Base on the home screen before starting a session.");
      return;
    }

    setIsSubmitting(true);
    setActionMessage(null);
    void (async () => {
      try {
        const response = await fetch(`${backendUrl}/bubble-session/start`, {
          method: "POST",
          headers: createAuthenticatedJsonHeaders(authSessionToken),
          body: JSON.stringify({ profileId }),
        });

        if (!response.ok) {
          setActionMessage(
            `Session start failed (code ${response.status}). Please retry in a moment.`,
          );
          return;
        }

        const payload = (await response.json()) as SessionStartResponse;
        setBackendSessionId(payload.sessionId);
        setSessionStartedAtMs(new Date(payload.startedAt).getTime());
        setNowMs(Date.now());
        setIsActive(true);
        setActiveTapCount(0);
        setTapCombo(0);
        setBestTapCombo(0);
        setLastTapGainSeconds(ACTIVE_SECONDS_PER_TAP);
        setTapFeedbackPoint(null);
        setLastTapAtMs(null);
        setLastTapFeedbackAtMs(null);
        setPopBursts([]);
        setSessionCompleted(false);
        setCompletionResult(null);
        setActivePlayBubbles(
          Array.from({ length: ACTIVE_PLAY_BUBBLE_COUNT }, (_, index) =>
            createActivePlayBubble(index),
          ),
        );
        captureAnalyticsEvent("bubbledrop_bubble_session_started", {
          profile_id: payload.profileId,
          session_id: payload.sessionId,
        });
        setActionMessage("Session started. Keep tapping to show active play.");
      } catch {
        setActionMessage("Session start failed. Check network and try again.");
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const onRecordActivePlay = (bubbleId?: number, event?: MouseEvent<HTMLButtonElement>) => {
    if (!isActive || sessionCompleted) {
      return;
    }

    const tappedBubble = typeof bubbleId === "number"
      ? activePlayBubbles.find((bubble) => bubble.id === bubbleId)
      : null;
    const tapUnits = tappedBubble?.isBonus ? 2 : 1;
    const tapGainSeconds = tapUnits * ACTIVE_SECONDS_PER_TAP;

    const now = Date.now();
    setActiveTapCount((prev) => prev + tapUnits);
    setLastTapGainSeconds(tapGainSeconds);
    setLastTapFeedbackAtMs(now);
    setTapCombo((prevCombo) => {
      const nextCombo =
        lastTapAtMs !== null && now - lastTapAtMs <= COMBO_WINDOW_MS ? prevCombo + 1 : 1;
      setBestTapCombo((prevBest) => Math.max(prevBest, nextCombo));
      return nextCombo;
    });
    setLastTapAtMs(now);
    if (typeof bubbleId === "number") {
      setActivePlayBubbles((current) =>
        current.map((bubble) =>
          bubble.id === bubbleId
            ? {
                ...bubble,
                top: randomBetween(14, 80),
                left: randomBetween(8, 88),
                driftMs: Math.round(randomBetween(800, 2200)),
                wobbleDeg: randomBetween(-16, 16),
                roundness: randomBetween(38, 64),
                scale: randomBetween(0.88, 1.14),
                isBonus: Math.random() < 0.16,
                nextShiftAtMs: now + randomBetween(700, 2600),
                poppedUntilMs: now + 130,
              }
            : bubble,
        ),
      );

      const rect = event?.currentTarget.getBoundingClientRect();
      const playfieldRect = playfieldRef.current?.getBoundingClientRect();
      if (playfieldRect) {
        const burstId = Math.floor(Math.random() * 1_000_000_000);
        const burstX =
          rect
            ? rect.left + rect.width / 2
            : playfieldRect.left +
              (playfieldRect.width * (tappedBubble?.left ?? 50)) / 100;
        const burstY =
          rect
            ? rect.top + rect.height / 2
            : playfieldRect.top +
              (playfieldRect.height * (tappedBubble?.top ?? 50)) / 100;
        const xPercent = ((burstX - playfieldRect.left) / playfieldRect.width) * 100;
        const yPercent = ((burstY - playfieldRect.top) / playfieldRect.height) * 100;
        setTapFeedbackPoint({ topPercent: yPercent, leftPercent: xPercent });
        setPopBursts((current) => [
          ...current,
          {
            id: burstId,
            xPercent,
            yPercent,
            hue: tappedBubble?.isBonus ? 44 : tappedBubble?.hue ?? 220,
            sizeRem: tappedBubble?.isBonus ? 0.7 : 0.52,
          },
        ]);
        window.setTimeout(() => {
          setPopBursts((current) => current.filter((burst) => burst.id !== burstId));
        }, 520);
      }
    }

    if ("vibrate" in navigator) {
      navigator.vibrate(10);
    }

    if (!profileId || !backendSessionId || !authSessionToken) {
      return;
    }

    void fetch(`${backendUrl}/bubble-session/activity`, {
      method: "POST",
      headers: createAuthenticatedJsonHeaders(authSessionToken),
      body: JSON.stringify({
        profileId,
        sessionId: backendSessionId,
      }),
    });
  };

  const onCompleteSession = () => {
    if (!isActive || sessionCompleted || isSubmitting) {
      return;
    }
    if (!profileId || !backendSessionId || needsOnboarding) {
      setActionMessage("Start a live session before trying to finish it.");
      return;
    }
    if (!authSessionToken) {
      setActionMessage("Sign in with Base on the home screen before finishing a session.");
      return;
    }

    setIsSubmitting(true);
    setActionMessage(null);
    void (async () => {
      try {
        const response = await fetch(`${backendUrl}/bubble-session/complete`, {
          method: "POST",
          headers: createAuthenticatedJsonHeaders(authSessionToken),
          body: JSON.stringify({
            profileId,
            sessionId: backendSessionId,
            activeSeconds: backendCountableActiveSeconds,
          }),
        });

        if (!response.ok) {
          setActionMessage("We couldn't complete that session right now.");
          return;
        }

        const payload = (await response.json()) as SessionCompleteResponse;
        setCompletionResult(payload);
        setSessionCompleted(true);
        setIsActive(false);
        setBackendSessionId(null);
        captureAnalyticsEvent("bubbledrop_bubble_session_completed", {
          profile_id: profileId,
          session_id: payload.sessionId,
          granted_xp: payload.xpAwarded,
          completion_bonus_xp: payload.completionBonusXp,
          new_streak: payload.newStreak,
          qualification_status: payload.qualificationStatus,
          rare_reward_access_active: payload.rareAccessActive,
        });
        setActionMessage(
          `Session completed. +${payload.xpAwarded} XP. Streak: ${payload.newStreak}. Rare access: ${
            payload.rareAccessActive ? "active" : "inactive"
          }.`,
        );
      } catch {
        setActionMessage("We couldn't complete that session right now.");
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#edf7ff_0%,#e9f2ff_28%,#f8ecff_66%,#fff6fb_100%)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="absolute -left-10 top-16 h-32 w-32 rounded-full bg-[#d8f3ff]/85 blur-[1px]" />
        <span className="absolute right-[-1.5rem] top-28 h-40 w-40 rounded-full bg-[#ece0ff]/78 blur-[1px]" />
        <span className="absolute left-[12%] bottom-[18%] h-28 w-28 rounded-full bg-[#ffe4f0]/70 blur-[1px]" />
        <span className="absolute right-[12%] bottom-[12%] h-20 w-20 rounded-full bg-[#ddffea]/68 blur-[1px]" />
      </div>

      {!sessionCompleted ? (
        <main className="relative z-10 min-h-screen">
          <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-4 sm:p-5">
            <div className="mx-auto flex w-full max-w-md items-start justify-between gap-3">
              <Link
                href={backHomeHref}
                className="pointer-events-auto rounded-full border border-white/75 bg-white/76 px-4 py-2 text-xs font-semibold text-[#425b8a] shadow-[0_10px_24px_rgba(96,132,203,0.12)] backdrop-blur-sm"
              >
                Back
              </Link>
              <div className="pointer-events-auto min-w-0 rounded-[1.3rem] border border-white/75 bg-white/78 px-3 py-2 shadow-[0_10px_24px_rgba(96,132,203,0.14)] backdrop-blur-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5b72a3]">
                      Bubble session
                    </p>
                    <p className="mt-1 text-xl font-bold leading-none text-[#2d477f]">
                      {formatTime(displayElapsedSeconds)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5b72a3]">
                      Status
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#3a4f86]">
                      {readinessLabel}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-[#e4ecff]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#98d8ff] to-[#becfff] transition-all"
                      style={{ width: `${elapsedProgressPercent}%` }}
                    />
                  </div>
                  <div className="h-2 w-20 rounded-full bg-[#f3e7ff]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#ffe1a6] to-[#ffc7ef] transition-all"
                      style={{ width: `${activeSignalProgressPercent}%` }}
                    />
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
                  <div className="rounded-lg border border-white/80 bg-white/68 px-2 py-2 text-[#486294]">
                    <p className="uppercase tracking-[0.08em] text-[10px] text-[#6a7faa]">Combo</p>
                    <p className="mt-1 text-xs font-bold text-[#2f4a81]">x{tapCombo}</p>
                  </div>
                  <div className="rounded-lg border border-white/80 bg-white/68 px-2 py-2 text-[#486294]">
                    <p className="uppercase tracking-[0.08em] text-[10px] text-[#6a7faa]">Best</p>
                    <p className="mt-1 text-xs font-bold text-[#2f4a81]">x{bestTapCombo}</p>
                  </div>
                  <div className="rounded-lg border border-white/80 bg-white/68 px-2 py-2 text-[#486294]">
                    <p className="uppercase tracking-[0.08em] text-[10px] text-[#6a7faa]">Hunt</p>
                    <p className="mt-1 text-xs font-bold text-[#2f4a81]">{huntReadinessPercent}%</p>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {needsOnboarding ? (
            <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-24 sm:px-6">
              <section className="bubble-card mx-auto w-full max-w-md p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#45619a]">
                  First entry required
                </p>
                <h1 className="mt-1 text-xl font-bold text-[#273f74]">
                  Finish onboarding before session access
                </h1>
                <p className="mt-3 text-sm text-[#526a96]">
                  Return home to finish your first BubbleDrop setup, then come back for active play.
                </p>
                <Link
                  href={withBubbleDropContext("/", {
                    profileId,
                    walletAddress: connectedWalletAddress ?? walletAddress,
                  }, { skipIntro: true })}
                  className="gloss-pill mt-4 inline-flex rounded-xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-3 text-sm font-semibold text-[#1f3561]"
                >
                  Go to onboarding
                </Link>
              </section>
            </div>
          ) : (
            <section className="relative min-h-screen">
              <div className="pointer-events-none absolute inset-0">
                {DECORATIVE_STANDARD_BUBBLES.map((bubble, index) => (
                  <span
                    key={`standard-${index}`}
                    className="absolute rounded-full border border-white/70 bg-white/34 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                    style={{
                      top: bubble.top,
                      left: bubble.left,
                      width: bubble.size,
                      height: bubble.size,
                    }}
                  />
                ))}
                {DECORATIVE_XP_BUBBLES.map((bubble, index) => (
                  <span
                    key={`xp-${index}`}
                    className="absolute rounded-full border border-[#fff7cf] bg-gradient-to-br from-[#fff3b8]/95 to-[#ffd6ef]/90 shadow-[0_0_18px_rgba(255,207,129,0.45)]"
                    style={{
                      top: bubble.top,
                      left: bubble.left,
                      width: bubble.size,
                      height: bubble.size,
                    }}
                  />
                ))}
                {DECORATIVE_PREMIUM_BUBBLES.map((bubble, index) => (
                  <span
                    key={`premium-${index}`}
                    className="absolute rounded-full border border-white/80 bg-gradient-to-br from-[#fff5c7]/92 via-[#ffd8ef]/92 to-[#e4dfff]/92 shadow-[0_0_26px_rgba(255,200,140,0.48)]"
                    style={{
                      top: bubble.top,
                      left: bubble.left,
                      width: bubble.size,
                      height: bubble.size,
                    }}
                  />
                ))}
                <span className="absolute left-[22%] top-[24%] h-2 w-2 rounded-full bg-white/80" />
                <span className="absolute left-[68%] top-[48%] h-1.5 w-1.5 rounded-full bg-white/80" />
                <span className="absolute left-[48%] top-[70%] h-2.5 w-2.5 rounded-full bg-white/75" />
              </div>

              <div
                ref={playfieldRef}
                className="relative flex min-h-screen items-center justify-center px-4 pb-44 pt-24 sm:px-6 sm:pt-28"
              >
                {!isActive ? (
                  <div className="max-w-[17rem] rounded-[2.25rem] border border-white/80 bg-white/74 px-6 py-7 text-center shadow-[0_20px_54px_rgba(99,131,195,0.16)] backdrop-blur-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5a6fa0]">
                      Immersive play mode
                    </p>
                    <h1 className="mt-2 text-3xl font-bold leading-tight text-[#2b467c]">
                      Enter the bubble field
                    </h1>
                    <p className="mt-3 text-sm text-[#6077a6]">
                      Start the run and keep tapping the moving bubble to build a live session.
                    </p>
                  </div>
                ) : (
                  <>
                    {activePlayBubbles.map((bubble) => (
                      <button
                        key={bubble.id}
                        type="button"
                        aria-label="Pop bubble"
                        onClick={(event) => onRecordActivePlay(bubble.id, event)}
                        disabled={!isActive || sessionCompleted}
                        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 shadow-[0_18px_44px_rgba(122,136,201,0.24)] transition-[top,left,transform,border-radius] ease-in-out disabled:opacity-70"
                        style={{
                          top: `${bubble.top}%`,
                          left: `${bubble.left}%`,
                          width: `${bubble.sizeRem}rem`,
                          height: `${bubble.sizeRem}rem`,
                          borderRadius: `${bubble.roundness}% ${100 - bubble.roundness}% ${
                            bubble.roundness
                          }% ${100 - bubble.roundness}% / ${100 - bubble.roundness}% ${
                            bubble.roundness
                          }% ${100 - bubble.roundness}% ${bubble.roundness}%`,
                          transform: `translate(-50%, -50%) rotate(${bubble.wobbleDeg}deg) scale(${bubble.scale})`,
                          transitionDuration: `${bubble.driftMs}ms`,
                          opacity:
                            bubble.poppedUntilMs > Date.now()
                              ? 0.08
                              : bubble.isBonus
                                ? 0.92
                                : 0.82,
                          background: bubble.isBonus
                            ? "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.68), rgba(255,255,255,0.14) 36%, transparent 56%), radial-gradient(circle at 70% 72%, rgba(255,221,128,0.62), transparent 62%), radial-gradient(circle at 50% 50%, rgba(255,243,176,0.9), rgba(255,215,150,0.62))"
                            : `radial-gradient(circle at 32% 24%, rgba(255,255,255,0.62), rgba(255,255,255,0.1) 35%, transparent 56%), radial-gradient(circle at 68% 72%, hsla(${
                                bubble.hue + 14
                              }, 82%, 70%, ${bubble.alpha * 0.5}), transparent 62%), radial-gradient(circle at 50% 50%, hsla(${
                                bubble.hue
                              }, 78%, 68%, ${bubble.alpha}), hsla(${bubble.hue + 10}, 74%, 84%, ${
                                bubble.alpha * 0.56
                              }))`,
                        }}
                      />
                    ))}
                    {popBursts.map((burst) => (
                      <span key={burst.id}>
                        <span
                          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full"
                          style={{
                            left: `${burst.xPercent}%`,
                            top: `${burst.yPercent}%`,
                            width: `${burst.sizeRem}rem`,
                            height: `${burst.sizeRem}rem`,
                            background: `hsla(${burst.hue}, 95%, 78%, 0.88)`,
                            boxShadow: `0 0 0 10px hsla(${burst.hue}, 92%, 76%, 0.28), 0 0 0 20px hsla(${burst.hue}, 92%, 76%, 0.18)`,
                          }}
                        />
                        <span
                          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full"
                          style={{
                            left: `${burst.xPercent}%`,
                            top: `${burst.yPercent}%`,
                            width: `${burst.sizeRem * 0.45}rem`,
                            height: `${burst.sizeRem * 0.45}rem`,
                            background: "rgba(255,255,255,0.92)",
                          }}
                        />
                      </span>
                    ))}
                    {showTapFeedback && tapFeedbackPoint ? (
                      <div
                        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-sm font-black text-[#3e4f82]"
                        style={{
                          top: `${tapFeedbackPoint.topPercent}%`,
                          left: `${tapFeedbackPoint.leftPercent}%`,
                          marginTop: "-5.4rem",
                        }}
                      >
                        +{lastTapGainSeconds}s active
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              {gameplayToastMessage && isActive ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-[8.75rem] z-20 px-4 sm:px-6">
                  <div className="mx-auto w-full max-w-md rounded-full border border-white/75 bg-white/78 px-4 py-2 text-center text-xs font-semibold text-[#4f648f] shadow-[0_12px_28px_rgba(96,132,203,0.14)] backdrop-blur-sm">
                    {gameplayToastMessage}
                  </div>
                </div>
              ) : null}

              <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4 sm:px-6 sm:pb-5">
                <div className="mx-auto w-full max-w-md rounded-[1.9rem] border border-white/82 bg-white/78 p-4 shadow-[0_18px_48px_rgba(95,130,199,0.16)] backdrop-blur-sm">
                  {isResolvingOnboardingState ? (
                    <p className="text-xs text-[#5f739b]">Loading session access…</p>
                  ) : (
                    <div className="flex flex-col gap-2 text-xs text-[#6178a7]">
                      <div className="flex items-center justify-between">
                        <span>Projected XP: {projectedXpAwarded}</span>
                        <span>
                          {localCompletionEstimateMet
                            ? "Partner drop roll unlocked for this run"
                            : "Keep tapping to unlock partner drop roll"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Active taps: {activeTapCount}</span>
                        <span>{readinessCopy}</span>
                      </div>
                      <div className="rounded-xl border border-white/75 bg-white/62 px-3 py-2">
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#50689a]">
                            Run objectives
                          </p>
                          <p className="text-[11px] font-semibold text-[#415b90]">
                            {runObjectiveCompletedCount}/{runObjectives.length}
                          </p>
                        </div>
                        <div className="space-y-1">
                          {runObjectives.map((objective) => (
                            <div
                              key={objective.id}
                              className="flex items-center justify-between gap-2 text-[11px]"
                            >
                              <span>{objective.label}</span>
                              <span
                                className={
                                  objective.done
                                    ? "rounded-md bg-[#dbffe9] px-2 py-0.5 font-semibold text-[#2e7f57]"
                                    : "rounded-md bg-[#edf2ff] px-2 py-0.5 font-semibold text-[#5c6f99]"
                                }
                              >
                                {objective.done ? "Done" : "In run"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onStartSession}
                      disabled={!canStartSession}
                      className="gloss-pill flex-1 rounded-2xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-4 text-center text-sm font-semibold text-[#1f3561] disabled:opacity-60"
                    >
                      {isSubmitting && !isActive ? "Starting..." : "Start session"}
                    </button>
                    <button
                      type="button"
                      onClick={onCompleteSession}
                      disabled={!canCompleteSession}
                      className="gloss-pill flex-1 rounded-2xl bg-gradient-to-r from-[#ffe0ef] to-[#e6e0ff] px-4 py-4 text-center text-sm font-semibold text-[#403165] disabled:opacity-60"
                    >
                      {isSubmitting && isActive ? "Submitting..." : "Complete session"}
                    </button>
                  </div>
                  {startSessionStatusMessage ? (
                    <p className="mt-2 text-center text-[11px] font-medium text-[#5c6f99]">
                      {startSessionStatusMessage}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          )}
        </main>
      ) : completedResult ? (
        <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-4 py-8 sm:px-6">
          <section className="bubble-card overflow-hidden p-0">
            <div className="bg-[radial-gradient(circle_at_top,#fff4cc_0%,#ffe5f3_38%,#eef0ff_100%)] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7a5a2d]">
                    Session result
                  </p>
                  <h1 className="mt-1 text-2xl font-bold text-[#273f74]">
                    {hasRareRewardOutcome
                      ? "Issued rewards for this session"
                      : "No rare reward issued"}
                  </h1>
                </div>
                <div className="rounded-full bg-white/68 px-3 py-2 text-xs font-semibold text-[#6a548a]">
                  {completedRunDurationLabel} run
                </div>
              </div>
              <p className="mt-3 text-sm text-[#526a96]">
                {hasRareRewardOutcome
                  ? "Backend confirmed reward outcome for this run."
                  : completedResult.rareAccessActive
                    ? "No rare reward was issued in this run."
                    : "Rare reward lane was inactive in this run."}
              </p>
              {nextStepCopy ? (
                <p className="mt-2 text-xs font-semibold text-[#5f749f]">{nextStepCopy}</p>
              ) : null}
            </div>
          </section>

          <section className="bubble-card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#5a6fa0]">
              Confirmed progress
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                <p className="text-xs text-[#6077a6]">XP awarded</p>
                <p className="mt-1 font-semibold text-[#334f82]">{completedResult.xpAwarded}</p>
              </div>
              <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                <p className="text-xs text-[#6077a6]">Total XP</p>
                <p className="mt-1 font-semibold text-[#334f82]">{completedResult.totalXp}</p>
              </div>
              <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                <p className="text-xs text-[#6077a6]">Streak</p>
                <p className="mt-1 font-semibold text-[#334f82]">{completedResult.newStreak}</p>
              </div>
              <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                <p className="text-xs text-[#6077a6]">Rare access</p>
                <p className="mt-1 font-semibold text-[#334f82]">
                  {completedResult.rareAccessActive ? "Active" : "Inactive"}
                </p>
              </div>
            </div>
          </section>

          {completedResult.rareRewardOutcome.tokenReward ? (
            <section className="bubble-card p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#5a6fa0]">
                Claimable token reward
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                  <p className="text-xs text-[#6077a6]">Token</p>
                  <p className="mt-1 font-semibold text-[#334f82]">
                    {completedResult.rareRewardOutcome.tokenReward.tokenSymbol}
                  </p>
                </div>
                <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                  <p className="text-xs text-[#6077a6]">Claimable increment</p>
                  <p className="mt-1 font-semibold text-[#334f82]">
                    {completedResult.rareRewardOutcome.tokenReward.tokenAmountAwarded}
                  </p>
                </div>
                <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                  <p className="text-xs text-[#6077a6]">Weekly tickets</p>
                  <p className="mt-1 font-semibold text-[#334f82]">
                    {completedResult.rareRewardOutcome.tokenReward.weeklyTicketsIssued}
                  </p>
                </div>
                <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                  <p className="text-xs text-[#6077a6]">Week start</p>
                  <p className="mt-1 font-semibold text-[#334f82]">
                    {completedResult.rareRewardOutcome.tokenReward.weekStartDate}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-[#6077a6]">
                Reward-event context: season{" "}
                {completedResult.rareRewardOutcome.tokenReward.seasonId}
              </p>
            </section>
          ) : null}

          {completedResult.rareRewardOutcome.nftRewards.length > 0 ? (
            <section className="bubble-card p-4">
              <h2 className="text-sm font-semibold text-[#30466f]">NFT rewards</h2>
              {completedResult.rareRewardOutcome.nftRewards.map((reward) => (
                <article key={reward.id} className="mt-3 rounded-xl border border-[#dce5ff] bg-white/80 p-3">
                  <p className="text-sm font-semibold text-[#334f82]">{reward.key}</p>
                  <p className="mt-1 text-xs text-[#6077a6]">Definition ID: {reward.id}</p>
                </article>
              ))}
            </section>
          ) : null}

          {completedResult.rareRewardOutcome.cosmeticRewards.length > 0 ? (
            <section className="bubble-card p-4">
              <h2 className="text-sm font-semibold text-[#30466f]">Cosmetic rewards</h2>
              {completedResult.rareRewardOutcome.cosmeticRewards.map((reward) => (
                <article key={reward.id} className="mt-3 rounded-xl border border-[#dce5ff] bg-white/80 p-3">
                  <p className="text-sm font-semibold text-[#334f82]">{reward.key}</p>
                  <p className="mt-1 text-xs text-[#6077a6]">Definition ID: {reward.id}</p>
                </article>
              ))}
            </section>
          ) : null}

          <section className="bubble-card p-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSessionCompleted(false);
                  setCompletionResult(null);
                  setSessionStartedAtMs(null);
                  setActiveTapCount(0);
                  setTapFeedbackPoint(null);
                  setPopBursts([]);
                  setActivePlayBubbles(
                    Array.from({ length: ACTIVE_PLAY_BUBBLE_COUNT }, (_, index) =>
                      createActivePlayBubble(index),
                    ),
                  );
                  setActionMessage("Ready for another run.");
                }}
                className="gloss-pill flex-1 rounded-xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-3 text-sm font-semibold text-[#1f3561]"
              >
                Play again
              </button>
              <Link
                href={withBubbleDropContext("/", {
                  profileId,
                  walletAddress: connectedWalletAddress ?? walletAddress,
                }, { skipIntro: true })}
                className="gloss-pill flex-1 rounded-xl bg-white/85 px-4 py-3 text-center text-sm font-semibold text-[#425b8a]"
              >
                Back home
              </Link>
            </div>
          </section>
        </main>
      ) : null}
    </div>
  );
}
