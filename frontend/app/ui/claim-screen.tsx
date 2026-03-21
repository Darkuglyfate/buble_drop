"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import {
  type BackendProfileSummary,
  fetchBackendProfileSummary,
} from "./backend-profile-summary";
import { UnifiedIcon } from "./unified-icons";

type ClaimableBalance = {
  tokenSymbol: string;
  claimableAmount: string;
  updatedAt?: string;
};

type ClaimResponse = {
  claimId: string;
  profileId: string;
  tokenSymbol: string;
  amount: string;
  status: "pending" | "confirmed" | "failed";
  txHash: string | null;
  remainingClaimableBalance: string;
  relay?: {
    action: "claim";
    relayKind: "backend-sponsored";
    available: boolean;
    userPaysGas: false;
    reason: string | null;
  };
  settlementRecordedOnchain?: boolean;
  settlementRecordTxHash?: string | null;
};

function normalizeIntegerString(value: string): string {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return "0";
  }
  return normalized.replace(/^0+(?=\d)/, "");
}

function addIntegerStrings(a: string, b: string): string {
  const aa = normalizeIntegerString(a);
  const bb = normalizeIntegerString(b);
  let i = aa.length - 1;
  let j = bb.length - 1;
  let carry = 0;
  let out = "";

  while (i >= 0 || j >= 0 || carry > 0) {
    const da = i >= 0 ? Number(aa[i]) : 0;
    const db = j >= 0 ? Number(bb[j]) : 0;
    const sum = da + db + carry;
    out = String(sum % 10) + out;
    carry = Math.floor(sum / 10);
    i -= 1;
    j -= 1;
  }

  return out || "0";
}

async function fetchOnboardingStateForProfile(
  backendUrl: string,
  profileId: string,
): Promise<BackendProfileSummary | null> {
  return fetchBackendProfileSummary(backendUrl, profileId);
}

const QUALIFICATION_BADGE_COPY: Record<
  BackendProfileSummary["qualificationState"]["status"],
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

export function ClaimScreen() {
  const runtimeContext = useBubbleDropRuntime();
  const { address } = useAccount();
  const [balances, setBalances] = useState<ClaimableBalance[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [claimingToken, setClaimingToken] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<ClaimResponse | null>(null);
  const [authSession, setAuthSession] =
    useState<BubbleDropFrontendSignInSession | null>(null);
  const [isResolvingOnboardingState, setIsResolvingOnboardingState] =
    useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [profileSummary, setProfileSummary] =
    useState<BackendProfileSummary | null>(null);

  const backendUrl = BUBBLEDROP_API_BASE;
  const connectedWalletAddress = address?.trim().toLowerCase() ?? null;
  const profileId = runtimeContext.profileId;
  const walletAddress = connectedWalletAddress ?? runtimeContext.walletAddress;
  const authSessionToken =
    authSession &&
    (!walletAddress || authSession.address === walletAddress) &&
    (!connectedWalletAddress || authSession.address === connectedWalletAddress)
      ? authSession.authSessionToken
      : null;

  const totalClaimable = useMemo(() => {
    return balances.reduce((sum, item) => addIntegerStrings(sum, item.claimableAmount), "0");
  }, [balances]);

  const canUseBackend = !!backendUrl && !!profileId;
  const qualificationStatus = profileSummary?.qualificationState.status;
  const canRequestClaims =
    canUseBackend &&
    !needsOnboarding &&
    !isResolvingOnboardingState &&
    !!authSessionToken;
  const qualificationBadge = qualificationStatus
    ? QUALIFICATION_BADGE_COPY[qualificationStatus]
    : {
        label: "Pending",
        className: "bg-[#eef2fb] text-[#5d6f93]",
      };

  const loadBalances = async (resolvedProfileId: string) => {
    setIsLoadingBalances(true);
    setErrorMessage(null);
    try {
      const response = await fetch(
        `${backendUrl}/claim/balances?profileId=${encodeURIComponent(resolvedProfileId)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        },
      );

      if (!response.ok) {
        setBalances([]);
        setErrorMessage("Unable to load claimable balances from backend.");
        return;
      }

      const payload = (await response.json()) as ClaimableBalance[];
      setBalances(payload);
    } catch {
      setBalances([]);
      setErrorMessage("Backend connection failed while loading claimable balances.");
    } finally {
      setIsLoadingBalances(false);
    }
  };

  useEffect(() => {
    setAuthSession(
      getSmokeSignInSessionFromCurrentUrl() ??
        loadBubbleDropFrontendSignInSession(),
    );
  }, [connectedWalletAddress, walletAddress]);

  useEffect(() => {
    const resolvedProfileId = profileId;
    setIsResolvingOnboardingState(true);
    if (resolvedProfileId) {
      void (async () => {
        const summary = await fetchOnboardingStateForProfile(
          backendUrl,
          resolvedProfileId,
        );
        if (!summary) {
          setProfileSummary(null);
          setNeedsOnboarding(false);
          setErrorMessage("We couldn't load your claim access right now.");
          setIsResolvingOnboardingState(false);
          return;
        }

        setProfileSummary(summary);
        runtimeContext.setAppContext({
          profileId: summary.profileIdentity.profileId,
          walletAddress: summary.profileIdentity.walletAddress,
        });
        setNeedsOnboarding(summary.onboardingState.needsOnboarding);
        setIsResolvingOnboardingState(false);

        if (!summary.onboardingState.needsOnboarding) {
          await loadBalances(resolvedProfileId);
          return;
        }

        setBalances([]);
        setErrorMessage(null);
      })();
    } else {
      setProfileSummary(null);
      setBalances([]);
      setNeedsOnboarding(false);
      setIsResolvingOnboardingState(false);
      setErrorMessage("Connect and sign in on the home screen to claim rewards.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, profileId]);

  const onClaimToken = async (tokenSymbol: string, amount: string) => {
    if (!backendUrl || !profileId || needsOnboarding) {
      return;
    }
    if (!authSessionToken) {
      setErrorMessage("Sign in with Base on the home screen before requesting a claim.");
      return;
    }

    setClaimingToken(tokenSymbol);
    setErrorMessage(null);
    setClaimResult(null);

    try {
      const response = await fetch(`${backendUrl}/claim/request`, {
        method: "POST",
        headers: createAuthenticatedJsonHeaders(authSessionToken),
        body: JSON.stringify({
          profileId,
          tokenSymbol,
          amount,
        }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          setErrorMessage("Claim requests are currently unavailable for this balance.");
          return;
        }
        setErrorMessage("Claim request failed. Check pending claims or requested amount.");
        return;
      }

      const result = (await response.json()) as ClaimResponse;
      setClaimResult(result);
      captureAnalyticsEvent("bubbledrop_claim_requested", {
        profile_id: result.profileId,
        claim_id: result.claimId,
        token_symbol: result.tokenSymbol,
        amount: result.amount,
        status: result.status,
      });
      await loadBalances(profileId);
    } catch {
      setErrorMessage("We couldn't submit that claim right now.");
    } finally {
      setClaimingToken(null);
    }
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
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#536ea4]">MVP claims</p>
              <h1 className="mt-1 text-xl font-bold text-[#27457b]">Legacy token claims</h1>
            </div>
            <Link
              href={withBubbleDropContext("/", {
                profileId,
                walletAddress: connectedWalletAddress ?? walletAddress,
              }, { skipIntro: true })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#425b8a]"
            >
              <UnifiedIcon kind="back" className="ui-icon ui-icon-active text-[#425b8a]" />
              Back
            </Link>
          </div>
          <p className="mt-3 text-sm text-[#5d76a5]">
            Season rewards no longer mint per run. This screen only handles any already-issued legacy
            token balances still waiting to be claimed.
          </p>
        </section>

        {needsOnboarding ? (
          <section className="bubble-card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#536ea4]">
              First entry required
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#27457b]">
              Finish onboarding before claim access
            </h2>
            <p className="mt-3 text-sm text-[#5d76a5]">
              Backend still marks this profile as first-entry. Return home to complete the onboarding learning cards and
              identity setup before opening claim flow.
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
        ) : null}

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#536ea4]">
                Season status
              </p>
              <h2 className="mt-1 text-lg font-bold text-[#27457b]">
                {profileSummary?.seasonProgress.eligibleAtSeasonEnd
                  ? "Season-end chance active"
                  : "Season chance building"}
              </h2>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${qualificationBadge.className}`}
            >
              {qualificationBadge.label}
            </span>
          </div>
          <p className="mt-3 text-sm text-[#5d76a5]">
            {isResolvingOnboardingState
              ? "Loading season status."
              : needsOnboarding
                ? "Claim requests stay locked until backend confirms onboarding completion."
                : "Legacy token claims stay available when a balance already exists. New season rewards are decided at season end."}
          </p>
          {profileSummary ? (
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="gloss-pill rounded-xl bg-white/80 p-3">
                <p className="text-xs text-[#6074a0]">Qualification</p>
                <p className="mt-1 font-semibold">{qualificationBadge.label}</p>
              </div>
              <div className="gloss-pill rounded-xl bg-white/80 p-3">
                <p className="text-xs text-[#6074a0]">Claim requests</p>
                <p className="mt-1 font-semibold">
                  {needsOnboarding ? "Locked" : "Legacy only"}
                </p>
              </div>
            </div>
          ) : null}
        </section>

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <div className="gloss-pill rounded-2xl bg-gradient-to-r from-[#ffe39f] via-[#ffcdea] to-[#d8d0ff] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6c4b1c]">
              Season reward flow
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span className="h-10 w-10 rounded-full bg-gradient-to-br from-[#fff0b9] to-[#ffb5e7] shadow-[0_0_20px_rgba(255,191,123,0.8)]" />
              <p className="text-sm font-semibold text-[#5b3f1f]">
                Daily check-in, streak, and XP now feed a season-end chance instead of instant run-by-run
                token issuance.
              </p>
            </div>
          </div>
        </section>

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#30466f]">
            <UnifiedIcon kind="claim" className="ui-icon text-[#48608f]" />
            Claimable balance summary
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="gloss-pill rounded-xl bg-white/80 p-3">
              <p className="inline-flex items-center gap-1 text-xs text-[#6074a0]">
                <UnifiedIcon kind="tokens" className="ui-icon text-[#6074a0]" />
                Tokens
              </p>
              <p className="mt-1 font-semibold">{canUseBackend ? balances.length : "—"}</p>
            </div>
            <div className="gloss-pill rounded-xl bg-white/80 p-3">
              <p className="inline-flex items-center gap-1 text-xs text-[#6074a0]">
                <UnifiedIcon kind="vault" className="ui-icon text-[#6074a0]" />
                Total claimable
              </p>
              <p className="mt-1 font-semibold">{canUseBackend ? totalClaimable : "—"}</p>
            </div>
          </div>
          {profileId ? <p className="mt-2 text-xs text-[#6b7fa8]">Profile: {profileId}</p> : null}
          {canUseBackend && !needsOnboarding ? (
            <button
              type="button"
              onClick={() => {
                if (!profileId) {
                  return;
                }
                void loadBalances(profileId);
              }}
              disabled={isLoadingBalances}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#48608f] disabled:opacity-60"
            >
              <UnifiedIcon kind="refresh" className="ui-icon ui-icon-active text-[#48608f]" />
              {isLoadingBalances ? "Refreshing..." : "Refresh balances"}
            </button>
          ) : null}
        </section>

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#30466f]">
            <UnifiedIcon kind="tokens" className="ui-icon text-[#48608f]" />
            Claimable legacy balances
          </h2>
          <p className="mt-2 text-xs font-semibold text-[#6074a0]">
            Sponsored payout • No gas from you
          </p>

          {isResolvingOnboardingState ? (
            <p className="mt-3 text-sm text-[#6074a0]">Loading backend onboarding state...</p>
          ) : null}

          {!isResolvingOnboardingState && isLoadingBalances ? (
            <p className="mt-3 text-sm text-[#6074a0]">Loading balances...</p>
          ) : null}

          {!isResolvingOnboardingState &&
          !isLoadingBalances &&
          canUseBackend &&
          !needsOnboarding &&
          balances.length === 0 ? (
            <p className="mt-3 text-sm text-[#6074a0]">No claimable balances available.</p>
          ) : null}

          {!isResolvingOnboardingState && !isLoadingBalances && canUseBackend && !needsOnboarding
            ? balances.map((item) => {
                const isClaiming = claimingToken === item.tokenSymbol;
                return (
                  <div key={item.tokenSymbol} className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[#2f4a7f]">{item.tokenSymbol}</p>
                      <p className="text-sm font-bold text-[#384d78]">{item.claimableAmount}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isClaiming || !canRequestClaims}
                      onClick={() => onClaimToken(item.tokenSymbol, item.claimableAmount)}
                      className="gloss-pill mt-2 w-full rounded-lg bg-gradient-to-r from-[#c7efff] to-[#d6d8ff] px-3 py-2 text-left text-xs font-semibold text-[#294578] disabled:opacity-60"
                    >
                      {isClaiming
                        ? "Submitting claim..."
                        : canRequestClaims
                          ? "Request full claim amount"
                          : "Sign in to claim"}
                    </button>
                  </div>
                );
              })
            : null}

          {!canUseBackend ? (
            <p className="mt-3 text-sm text-[#6074a0]">
              Connect and sign in on the home screen to load live claim data.
            </p>
          ) : null}
          {canUseBackend && needsOnboarding ? (
            <p className="mt-3 text-sm text-[#6074a0]">
              Claim flow is locked until backend confirms onboarding completion.
            </p>
          ) : null}
        </section>

        {claimResult ? (
          <section className="bubble-card p-4">
            <h2 className="text-sm font-semibold text-[#30466f]">Latest claim request</h2>
            <div className="mt-3 rounded-xl bg-white/80 p-3 text-sm text-[#465d88]">
              <p>
                Claim {claimResult.claimId} for {claimResult.tokenSymbol} {claimResult.amount}
              </p>
              <p className="mt-1">
                Status: <span className="font-semibold uppercase">{claimResult.status}</span>
              </p>
              {claimResult.txHash ? (
                <p className="mt-1">
                  Gasless relay tx: <span className="font-semibold">{claimResult.txHash}</span>
                </p>
              ) : null}
              {claimResult.settlementRecordTxHash ? (
                <p className="mt-1">
                  Claim ledger tx:{" "}
                  <span className="font-semibold">{claimResult.settlementRecordTxHash}</span>
                </p>
              ) : null}
              <p className="mt-1">
                Remaining claimable balance after this claim:{" "}
                <span className="font-semibold">{claimResult.remainingClaimableBalance}</span>
              </p>
              <p className="mt-1 text-xs text-[#6074a0]">
                Sponsored payout • No gas from you
              </p>
            </div>
          </section>
        ) : null}

        {errorMessage ? (
          <section className="bubble-card p-4">
            <p className="rounded-xl bg-[#fff2f7] p-3 text-sm text-[#7f3a53]">{errorMessage}</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
