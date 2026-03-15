"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { captureAnalyticsEvent } from "../analytics";
import { fetchBackendProfileSummary } from "./backend-profile-summary";

const SESSION_DURATION_SECONDS = 10 * 60;
const MIN_SESSION_SECONDS_FOR_COMPLETION = 5 * 60;
const ACTIVE_SECONDS_FOR_COMPLETION_BONUS = 3 * 60;
const ACTIVE_SECONDS_PER_TAP = 12;

type SessionStartResponse = {
  sessionId: string;
  profileId: string;
  startedAt: string;
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
  sessionId: string;
  profileId: string;
  endedAt: string;
  sessionDurationSeconds: number;
  activeSeconds: number;
  activePlayXp: number;
  completionBonusXp: number;
  grantedXp: number;
  totalXp: number;
  qualificationStatus: "locked" | "in_progress" | "qualified" | "paused" | "restored";
  rareRewardAccessActive: boolean;
  rareRewardOutcome: RareRewardOutcome;
};

function getProfileIdFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = new URLSearchParams(window.location.search).get("profileId");
  return value && value.trim() ? value.trim() : null;
}

function getWalletAddressFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = new URLSearchParams(window.location.search).get("walletAddress");
  return value && value.trim() ? value.trim().toLowerCase() : null;
}

function getBackendUrl(): string | null {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  return backendUrl && backendUrl.trim() ? backendUrl.trim() : null;
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

function hasIssuedRareRewardOutcome(outcome: RareRewardOutcome): boolean {
  return !!outcome.tokenReward || outcome.nftRewards.length > 0 || outcome.cosmeticRewards.length > 0;
}

export function BubbleSessionPlayScreen() {
  const { address } = useAccount();
  const [backendUrl, setBackendUrl] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [sessionStartedAtMs, setSessionStartedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isActive, setIsActive] = useState(false);
  const [activeTapCount, setActiveTapCount] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [backendSessionId, setBackendSessionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [completionResult, setCompletionResult] = useState<SessionCompleteResponse | null>(null);
  const [isResolvingOnboardingState, setIsResolvingOnboardingState] =
    useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const connectedWalletAddress = address?.trim().toLowerCase() ?? null;

  useEffect(() => {
    const resolvedBackendUrl = getBackendUrl();
    const resolvedProfileId = getProfileIdFromUrl();
    const resolvedWalletAddress = getWalletAddressFromUrl();

    setBackendUrl(resolvedBackendUrl);
    setProfileId(resolvedProfileId);
    setWalletAddress(resolvedWalletAddress);

    setIsResolvingOnboardingState(true);

    if (resolvedBackendUrl && resolvedProfileId) {
      void (async () => {
        const onboardingState = await fetchOnboardingStateForProfile(
          resolvedBackendUrl,
          resolvedProfileId,
        );
        if (!onboardingState) {
          setNeedsOnboarding(false);
          setActionMessage("Unable to load backend onboarding state.");
          setIsResolvingOnboardingState(false);
          return;
        }

        setWalletAddress(resolvedWalletAddress ?? onboardingState.walletAddress);
        setNeedsOnboarding(onboardingState.needsOnboarding);
        setIsResolvingOnboardingState(false);
      })();
      return;
    }

    setNeedsOnboarding(false);
    setIsResolvingOnboardingState(false);
  }, []);

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

  const elapsedSeconds = useMemo(() => {
    if (completionResult) {
      return completionResult.sessionDurationSeconds;
    }
    if (!sessionStartedAtMs) {
      return 0;
    }
    return Math.max(0, Math.floor((nowMs - sessionStartedAtMs) / 1000));
  }, [completionResult, nowMs, sessionStartedAtMs]);
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
  const elapsedSecondsRemaining = Math.max(0, MIN_SESSION_SECONDS_FOR_COMPLETION - elapsedSeconds);
  const activeSecondsRemaining = Math.max(0, ACTIVE_SECONDS_FOR_COMPLETION_BONUS - backendCountableActiveSeconds);

  const statusText = useMemo(() => {
    if (sessionCompleted && completionResult) {
      const hasRareRewardOutcome = hasIssuedRareRewardOutcome(
        completionResult.rareRewardOutcome,
      );
      return completionResult.completionBonusXp > 0
        ? hasRareRewardOutcome
          ? "Session completed. Backend confirmed completion reward eligibility and returned the issued rare reward outcome below."
          : "Session completed. Backend confirmed completion reward eligibility."
        : "Session completed. Backend awarded only the XP that matched actual session activity.";
    }
    if (!isActive) {
      return "Press Start session to begin backend-timed active bubble play.";
    }
    if (localCompletionEstimateMet) {
      return "Local session estimate meets the current thresholds, but backend still decides final completion eligibility on submit.";
    }
    return "Completion-related rewards remain backend-confirmed only after submit. Local progress here is just an estimate against the current thresholds.";
  }, [completionResult, isActive, localCompletionEstimateMet, sessionCompleted]);
  const hasRareRewardOutcome = completionResult
    ? hasIssuedRareRewardOutcome(completionResult.rareRewardOutcome)
    : false;

  const onStartSession = () => {
    if (isActive || sessionCompleted || isSubmitting) {
      return;
    }
    if (!backendUrl || !profileId || needsOnboarding) {
      setActionMessage("Profile bootstrap required before starting backend session.");
      return;
    }
    const requestWalletAddress = connectedWalletAddress ?? walletAddress;
    if (!requestWalletAddress) {
      setActionMessage("Wallet binding unavailable. Return to home and refresh backend profile first.");
      return;
    }

    setIsSubmitting(true);
    setActionMessage(null);
    void (async () => {
      try {
        const response = await fetch(`${backendUrl}/bubble-session/start`, {
          method: "POST",
          headers: createWalletBoundJsonHeaders(requestWalletAddress),
          body: JSON.stringify({ profileId }),
        });

        if (!response.ok) {
          setActionMessage("Unable to start backend session.");
          return;
        }

        const payload = (await response.json()) as SessionStartResponse;
        setBackendSessionId(payload.sessionId);
        setSessionStartedAtMs(new Date(payload.startedAt).getTime());
        setNowMs(Date.now());
        setIsActive(true);
        setActiveTapCount(0);
        setSessionCompleted(false);
        setCompletionResult(null);
        captureAnalyticsEvent("bubbledrop_bubble_session_started", {
          profile_id: payload.profileId,
          session_id: payload.sessionId,
        });
        setActionMessage("Backend session started.");
      } catch {
        setActionMessage("Backend connection failed while starting session.");
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const onRecordActivePlay = () => {
    if (!isActive || sessionCompleted) {
      return;
    }

    setActiveTapCount((prev) => prev + 1);

    const requestWalletAddress = connectedWalletAddress ?? walletAddress;
    if (!backendUrl || !profileId || !backendSessionId || !requestWalletAddress) {
      return;
    }

    void fetch(`${backendUrl}/bubble-session/activity`, {
      method: "POST",
      headers: createWalletBoundJsonHeaders(requestWalletAddress),
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
    if (!backendUrl || !profileId || !backendSessionId || needsOnboarding) {
      setActionMessage("No active backend session to complete.");
      return;
    }
    const requestWalletAddress = connectedWalletAddress ?? walletAddress;
    if (!requestWalletAddress) {
      setActionMessage("Wallet binding unavailable. Return to home and refresh backend profile first.");
      return;
    }

    setIsSubmitting(true);
    setActionMessage(null);
    void (async () => {
      try {
        const response = await fetch(`${backendUrl}/bubble-session/complete`, {
          method: "POST",
          headers: createWalletBoundJsonHeaders(requestWalletAddress),
          body: JSON.stringify({
            profileId,
            sessionId: backendSessionId,
            activeSeconds: backendCountableActiveSeconds,
          }),
        });

        if (!response.ok) {
          setActionMessage("Unable to complete backend session.");
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
          granted_xp: payload.grantedXp,
          completion_bonus_xp: payload.completionBonusXp,
          qualification_status: payload.qualificationStatus,
          rare_reward_access_active: payload.rareRewardAccessActive,
        });
        setActionMessage(
          `Session completed. Granted XP: ${payload.grantedXp}. Completion bonus XP: ${payload.completionBonusXp}. Qualification: ${payload.qualificationStatus}.`,
        );
      } catch {
        setActionMessage("Backend connection failed while completing session.");
      } finally {
        setIsSubmitting(false);
      }
    })();
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
        <section className="bubble-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#45619a]">Bubble session</p>
              <h1 className="mt-1 text-xl font-bold text-[#273f74]">Active play (5-10 min)</h1>
            </div>
            <Link
              href={withProfileQuery("/", profileId, connectedWalletAddress ?? walletAddress)}
              className="rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#425b8a]"
            >
              Back
            </Link>
          </div>
          <p className="mt-3 text-sm text-[#526a96]">{statusText}</p>
        </section>

        {needsOnboarding ? (
          <section className="bubble-card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#45619a]">
              First entry required
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#273f74]">
              Finish onboarding before session access
            </h2>
            <p className="mt-3 text-sm text-[#526a96]">
              Backend still marks this profile as first-entry. Return home to complete the onboarding learning cards and
              profile setup before starting active bubble sessions.
            </p>
            <Link
              href={withProfileQuery("/", profileId, connectedWalletAddress ?? walletAddress)}
              className="gloss-pill mt-4 inline-flex rounded-xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-3 text-sm font-semibold text-[#1f3561]"
            >
              Go to onboarding
            </Link>
          </section>
        ) : null}

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#5a6fa0]">Session timer</p>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-4xl font-bold text-[#2d477f]">{formatTime(elapsedSeconds)}</p>
            <p className="text-xs text-[#667dab]">{elapsedProgressPercent}% of 10 min window</p>
          </div>

          <div className="mt-3 h-2 rounded-full bg-[#e7efff]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#9ad7ff] to-[#c8c8ff] transition-all"
              style={{ width: `${elapsedProgressPercent}%` }}
            />
          </div>
          <div className="mt-3 rounded-xl bg-white/80 p-3 text-xs text-[#6077a6]">
            <p>Local threshold estimate: 5:00 elapsed session time and 3:00 active signal.</p>
            <p className="mt-1">
              Elapsed requirement:{" "}
              <span className="font-semibold text-[#334f82]">
                {elapsedSeconds >= MIN_SESSION_SECONDS_FOR_COMPLETION
                  ? "met"
                  : `${formatTime(elapsedSecondsRemaining)} remaining`}
              </span>
            </p>
            <p className="mt-1 text-[#6b7fa8]">
              Backend confirms actual completion eligibility only when the session is submitted.
            </p>
          </div>
        </section>

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#5a6fa0]">Active play signal</p>
          <div className="mt-3 rounded-2xl border border-[#dce5ff] bg-white/80 p-4 text-center">
            <button
              type="button"
              onClick={onRecordActivePlay}
              disabled={!isActive || sessionCompleted}
              className={`gloss-pill mx-auto flex h-28 w-28 items-center justify-center rounded-full text-sm font-bold ${
                isActive && !sessionCompleted
                  ? "bg-gradient-to-br from-[#ffe7a8] to-[#ffc7ef] text-[#6b3f00] shadow-[0_0_28px_rgba(255,205,120,0.8)]"
                  : "bg-gradient-to-br from-[#e7edff] to-[#eef3ff] text-[#6a7ea5]"
              }`}
            >
              Active tap
            </button>
            <div className="mt-3 h-2 rounded-full bg-[#e7efff]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#ffe6a8] to-[#ffc7ef] transition-all"
                style={{ width: `${activeSignalProgressPercent}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-[#6077a6]">
              Active interactions: <span className="font-semibold text-[#334f82]">{activeTapCount}</span>
            </p>
            <p className="mt-1 text-xs text-[#6077a6]">
              Backend-countable active signal:{" "}
              <span className="font-semibold text-[#334f82]">{backendCountableActiveSeconds}s</span>
              {rawActiveSeconds > backendCountableActiveSeconds ? " (capped by elapsed time)" : ""}
            </p>
            <p className="mt-1 text-xs text-[#6077a6]">
              Local active threshold estimate:{" "}
              <span className="font-semibold text-[#334f82]">
                {backendCountableActiveSeconds >= ACTIVE_SECONDS_FOR_COMPLETION_BONUS
                  ? "met"
                  : `${formatTime(activeSecondsRemaining)} remaining`}
              </span>
            </p>
          </div>
        </section>

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#5a6fa0]">Session actions</p>
          {isResolvingOnboardingState ? (
            <p className="mt-3 text-xs text-[#5f739b]">
              Loading backend onboarding state...
            </p>
          ) : null}
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={onStartSession}
              disabled={
                isActive ||
                sessionCompleted ||
                isSubmitting ||
                needsOnboarding ||
                isResolvingOnboardingState
              }
              className="gloss-pill rounded-xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-3 text-left text-sm font-semibold text-[#1f3561] disabled:opacity-60"
            >
              {isSubmitting ? "Submitting..." : "Start session"}
            </button>
            <button
              type="button"
              onClick={onCompleteSession}
              disabled={
                !isActive ||
                sessionCompleted ||
                isSubmitting ||
                needsOnboarding ||
                isResolvingOnboardingState
              }
              className="gloss-pill rounded-xl bg-gradient-to-r from-[#ffe0ef] to-[#e6e0ff] px-4 py-3 text-left text-sm font-semibold text-[#403165] disabled:opacity-60"
            >
              {isSubmitting ? "Submitting..." : "Complete session with backend validation"}
            </button>
          </div>
          <p className="mt-3 text-xs text-[#5f739b]">
            MVP note: this screen tracks local active signals, but backend remains the source of truth for elapsed time,
            completion eligibility, XP, and qualification updates.
          </p>
          {needsOnboarding ? (
            <p className="mt-2 rounded-lg bg-[#f4f7ff] px-3 py-2 text-xs font-semibold text-[#5a6e97]">
              Session flow is locked until backend confirms onboarding completion.
            </p>
          ) : null}
          {!sessionCompleted && isActive ? (
            <p
              className={`mt-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                localCompletionEstimateMet
                  ? "bg-[#f8f1ff] text-[#5c4f7f]"
                  : "bg-[#f4f7ff] text-[#5a6e97]"
              }`}
            >
              {localCompletionEstimateMet
                ? "Local thresholds look met, but backend still validates elapsed time, recorded activity, XP, and completion eligibility on submit."
                : "Local progress has not yet reached the current threshold estimate. Backend will make the final decision only after submit."}
            </p>
          ) : null}
          {sessionCompleted && completionResult ? (
            <p
              className={`mt-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                completionResult.completionBonusXp > 0 ? "bg-[#eafbf2] text-[#2e6e52]" : "bg-[#f4f7ff] text-[#5a6e97]"
              }`}
            >
              {completionResult.completionBonusXp > 0
                ? "Backend confirmed completion reward eligibility for this session."
                : "Backend completed the session without completion reward eligibility."}
            </p>
          ) : null}
        </section>
        {sessionCompleted && completionResult ? (
          <section className="bubble-card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#5a6fa0]">
              Confirmed rare reward outcome
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#273f74]">
              {hasRareRewardOutcome ? "Issued rewards for this session" : "No rare reward issued"}
            </h2>
            <p className="mt-3 text-sm text-[#526a96]">
              {hasRareRewardOutcome
                ? "Only backend-confirmed reward issuance results are shown here immediately after session completion."
                : completionResult.rareRewardAccessActive
                  ? "Backend completed the session without issuing a rare reward outcome."
                  : "Rare reward access was inactive for this session result, so backend returned no rare reward outcome."}
            </p>

            {completionResult.rareRewardOutcome.tokenReward ? (
              <article className="mt-3 rounded-xl border border-[#dce5ff] bg-white/80 p-3">
                <p className="text-sm font-semibold text-[#30466f]">Claimable token reward</p>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                    <p className="text-xs text-[#6077a6]">Token</p>
                    <p className="mt-1 font-semibold text-[#334f82]">
                      {completionResult.rareRewardOutcome.tokenReward.tokenSymbol}
                    </p>
                  </div>
                  <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                    <p className="text-xs text-[#6077a6]">Claimable increment</p>
                    <p className="mt-1 font-semibold text-[#334f82]">
                      {completionResult.rareRewardOutcome.tokenReward.tokenAmountAwarded}
                    </p>
                  </div>
                  <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                    <p className="text-xs text-[#6077a6]">Weekly tickets</p>
                    <p className="mt-1 font-semibold text-[#334f82]">
                      {completionResult.rareRewardOutcome.tokenReward.weeklyTicketsIssued}
                    </p>
                  </div>
                  <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                    <p className="text-xs text-[#6077a6]">Week start</p>
                    <p className="mt-1 font-semibold text-[#334f82]">
                      {completionResult.rareRewardOutcome.tokenReward.weekStartDate}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-[#6077a6]">
                  Reward-event context: season {completionResult.rareRewardOutcome.tokenReward.seasonId}
                </p>
              </article>
            ) : null}

            {completionResult.rareRewardOutcome.nftRewards.length > 0 ? (
              <div className="mt-3">
                <h3 className="text-sm font-semibold text-[#30466f]">NFT rewards</h3>
                {completionResult.rareRewardOutcome.nftRewards.map((reward) => (
                  <article key={reward.id} className="mt-2 rounded-xl border border-[#dce5ff] bg-white/80 p-3">
                    <p className="text-sm font-semibold text-[#334f82]">{reward.key}</p>
                    <p className="mt-1 text-xs text-[#6077a6]">Definition ID: {reward.id}</p>
                  </article>
                ))}
              </div>
            ) : null}

            {completionResult.rareRewardOutcome.cosmeticRewards.length > 0 ? (
              <div className="mt-3">
                <h3 className="text-sm font-semibold text-[#30466f]">Cosmetic rewards</h3>
                {completionResult.rareRewardOutcome.cosmeticRewards.map((reward) => (
                  <article key={reward.id} className="mt-2 rounded-xl border border-[#dce5ff] bg-white/80 p-3">
                    <p className="text-sm font-semibold text-[#334f82]">{reward.key}</p>
                    <p className="mt-1 text-xs text-[#6077a6]">Definition ID: {reward.id}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
        {actionMessage ? (
          <section className="bubble-card p-4">
            <p className="rounded-xl bg-white/80 p-3 text-xs font-semibold text-[#4f648f]">{actionMessage}</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
