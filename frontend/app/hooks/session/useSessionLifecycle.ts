"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { captureAnalyticsEvent } from "../../analytics";
import { fetchBubbleDropMutation } from "../../base-sign-in";

const SESSION_DURATION_SECONDS = 10 * 60;
const MIN_SESSION_SECONDS_FOR_COMPLETION = 5 * 60;
const ACTIVE_SECONDS_FOR_COMPLETION_BONUS = 3 * 60;

type SessionStartResponse = {
  sessionId: string;
  profileId: string;
  startedAt: string;
};

type SeasonProgress = {
  qualificationStatus: "locked" | "in_progress" | "qualified" | "paused" | "restored";
  eligibleAtSeasonEnd: boolean;
  streak: number;
  xp: number;
  activeSessions: number;
  requiredStreak: number;
  requiredXp: number;
  requiredActiveSessions: number;
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

export type SessionCompleteResponse = {
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
  seasonProgress: SeasonProgress;
  rareRewardOutcome: RareRewardOutcome;
  finalScore: number;
  bestCombo: number;
  rewardFlags: number;
  integrityHash: string;
  onchainCommit: {
    relay: {
      action: "session_outcome";
      relayKind: "backend-sponsored";
      available: boolean;
      userPaysGas: false;
      reason: string | null;
    };
    submitted: boolean;
    txHash: string | null;
    sessionIdHash: string;
    committedAt: string | null;
  };
};

export type UseSessionLifecycleParams = {
  profileId: string | null;
  authenticatedSessionMarker: string | null;
  backendUrl: string;
  needsOnboarding: boolean;
  activeTapCount: number;
  bestTapCombo: number;
  setActionMessage: (message: string | null) => void;
  onSessionStarted?: (payload: SessionStartResponse) => void;
  onSessionCompleted?: (payload: SessionCompleteResponse) => void;
};

const ACTIVE_SECONDS_PER_TAP = 12;

export function useSessionLifecycle(params: UseSessionLifecycleParams) {
  const {
    profileId,
    authenticatedSessionMarker,
    backendUrl,
    needsOnboarding,
    activeTapCount,
    bestTapCombo,
    setActionMessage,
    onSessionStarted,
    onSessionCompleted,
  } = params;

  const [sessionStartedAtMs, setSessionStartedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [backendSessionId, setBackendSessionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completionResult, setCompletionResult] = useState<SessionCompleteResponse | null>(null);

  // Track total paused duration so it can be subtracted from elapsed time
  const pausedDurationMsRef = useRef(0);
  const pauseStartMsRef = useRef<number | null>(null);

  // Visibility change detection: pause session when screen is locked/hidden
  useEffect(() => {
    if (!isActive || sessionCompleted) {
      return;
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        // Screen locked or app backgrounded — pause
        pauseStartMsRef.current = Date.now();
        setIsPaused(true);
      } else {
        // Screen unlocked — resume and accumulate paused time
        if (pauseStartMsRef.current !== null) {
          pausedDurationMsRef.current += Date.now() - pauseStartMsRef.current;
          pauseStartMsRef.current = null;
        }
        setIsPaused(false);
        setNowMs(Date.now());
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isActive, sessionCompleted]);

  // Timer effect: updates nowMs every 1000ms when session is active AND not paused
  useEffect(() => {
    if (!isActive || sessionStartedAtMs === null || isPaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isActive, sessionStartedAtMs, isPaused]);

  const elapsedSeconds = useMemo(() => {
    if (completionResult) {
      return completionResult.sessionDurationSeconds;
    }
    if (!sessionStartedAtMs) {
      return 0;
    }
    // Subtract time spent paused from total elapsed
    const currentPauseDuration = pauseStartMsRef.current !== null
      ? Date.now() - pauseStartMsRef.current
      : 0;
    const totalPausedMs = pausedDurationMsRef.current + currentPauseDuration;
    const activeMs = nowMs - sessionStartedAtMs - totalPausedMs;
    return Math.max(0, Math.floor(activeMs / 1000));
  }, [completionResult, nowMs, sessionStartedAtMs]);

  const sessionTimerGoalReached = elapsedSeconds >= SESSION_DURATION_SECONDS;

  const rawActiveSeconds = activeTapCount * ACTIVE_SECONDS_PER_TAP;
  const backendCountableActiveSeconds = Math.min(rawActiveSeconds, elapsedSeconds);

  const localCompletionEstimateMet =
    elapsedSeconds >= MIN_SESSION_SECONDS_FOR_COMPLETION &&
    backendCountableActiveSeconds >= ACTIVE_SECONDS_FOR_COMPLETION_BONUS;

  const onStartSession = () => {
    if (isActive || sessionCompleted || isSubmitting) {
      return;
    }
    if (!profileId || needsOnboarding) {
      setActionMessage("Finish wallet setup before starting a session.");
      return;
    }
    if (!authenticatedSessionMarker) {
      setActionMessage("Sign in with Base on the home screen before starting a session.");
      return;
    }

    setIsSubmitting(true);
    setActionMessage(null);
    void (async () => {
      try {
        const response = await fetchBubbleDropMutation(`${backendUrl}/bubble-session/start`, {
          method: "POST",
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
        setSessionCompleted(false);
        setCompletionResult(null);
        captureAnalyticsEvent("bubbledrop_bubble_session_started", {
          profile_id: payload.profileId,
          session_id: payload.sessionId,
        });
        setActionMessage("Session started. Build active play to qualify the run.");
        onSessionStarted?.(payload);
      } catch {
        setActionMessage("Session start failed. Check network and try again.");
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const onCompleteSession = () => {
    if (!isActive || sessionCompleted || isSubmitting) {
      return;
    }
    if (!profileId || !backendSessionId || needsOnboarding) {
      setActionMessage("Start a live session before trying to finish it.");
      return;
    }
    if (!authenticatedSessionMarker) {
      setActionMessage("Sign in with Base on the home screen before finishing a session.");
      return;
    }

    setIsSubmitting(true);
    setActionMessage(null);
    void (async () => {
      try {
        const response = await fetchBubbleDropMutation(`${backendUrl}/bubble-session/complete`, {
          method: "POST",
          body: JSON.stringify({
            profileId,
            sessionId: backendSessionId,
            activeSeconds: backendCountableActiveSeconds,
            finalScore: activeTapCount,
            bestCombo: bestTapCombo,
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
          `Session completed. +${payload.xpAwarded} XP. Streak: ${payload.newStreak}. Season chance: ${
            payload.seasonProgress.eligibleAtSeasonEnd ? "eligible" : "building"
          }.${payload.onchainCommit?.submitted ? " Final result committed on Base." : ""}`,
        );
        onSessionCompleted?.(payload);
      } catch {
        setActionMessage("We couldn't complete that session right now.");
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const resetSession = () => {
    setSessionStartedAtMs(null);
    setNowMs(Date.now());
    setIsActive(false);
    setIsPaused(false);
    setSessionCompleted(false);
    setBackendSessionId(null);
    setIsSubmitting(false);
    setCompletionResult(null);
    pausedDurationMsRef.current = 0;
    pauseStartMsRef.current = null;
  };

  return {
    isActive,
    isPaused,
    sessionStartedAtMs,
    nowMs,
    sessionCompleted,
    isSubmitting,
    backendSessionId,
    completionResult,
    onStartSession,
    onCompleteSession,
    elapsedSeconds,
    sessionTimerGoalReached,
    localCompletionEstimateMet,
    resetSession,
  };
}
