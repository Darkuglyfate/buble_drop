"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { captureAnalyticsEvent } from "../analytics";
import {
  type BackendProfileSummary,
  fetchBackendProfileSummary,
} from "./backend-profile-summary";

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
  const { address } = useAccount();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balances, setBalances] = useState<ClaimableBalance[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [claimingToken, setClaimingToken] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<ClaimResponse | null>(null);
  const [isResolvingOnboardingState, setIsResolvingOnboardingState] =
    useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [profileSummary, setProfileSummary] =
    useState<BackendProfileSummary | null>(null);

  const backendUrl = getBackendUrl();
  const connectedWalletAddress = address?.trim().toLowerCase() ?? null;

  const totalClaimable = useMemo(() => {
    return balances.reduce((sum, item) => addIntegerStrings(sum, item.claimableAmount), "0");
  }, [balances]);

  const canUseBackend = !!backendUrl && !!profileId;
  const qualificationStatus = profileSummary?.qualificationState.status;
  const rareRewardAccessActive = profileSummary?.rareRewardAccess.active ?? false;
  const canRequestClaims =
    canUseBackend &&
    !needsOnboarding &&
    !isResolvingOnboardingState &&
    rareRewardAccessActive;
  const qualificationBadge = qualificationStatus
    ? QUALIFICATION_BADGE_COPY[qualificationStatus]
    : {
        label: "Pending",
        className: "bg-[#eef2fb] text-[#5d6f93]",
      };

  const loadBalances = async (resolvedProfileId: string) => {
    if (!backendUrl) {
      setErrorMessage("Set NEXT_PUBLIC_BACKEND_URL to load claimable balances.");
      return;
    }

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
    const resolvedProfileId = getProfileIdFromUrl();
    const resolvedWalletAddress = getWalletAddressFromUrl();
    setProfileId(resolvedProfileId);
    setWalletAddress(resolvedWalletAddress);
    setIsResolvingOnboardingState(true);
    if (resolvedProfileId) {
      if (backendUrl) {
        void (async () => {
          const summary = await fetchOnboardingStateForProfile(
            backendUrl,
            resolvedProfileId,
          );
          if (!summary) {
            setProfileSummary(null);
            setNeedsOnboarding(false);
            setErrorMessage("Unable to load onboarding state from backend.");
            setIsResolvingOnboardingState(false);
            return;
          }

          setProfileSummary(summary);
          setWalletAddress(
            resolvedWalletAddress ?? summary.profileIdentity.walletAddress,
          );
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
        setNeedsOnboarding(false);
        setIsResolvingOnboardingState(false);
      }
    } else {
      setProfileSummary(null);
      setBalances([]);
      setNeedsOnboarding(false);
      setIsResolvingOnboardingState(false);
      setErrorMessage("Open this screen with ?profileId=<uuid> to use backend claim flow.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl]);

  const onClaimToken = async (tokenSymbol: string, amount: string) => {
    if (!backendUrl || !profileId || needsOnboarding || !rareRewardAccessActive) {
      return;
    }
    const requestWalletAddress = connectedWalletAddress ?? walletAddress;
    if (!requestWalletAddress) {
      setErrorMessage("Wallet binding unavailable. Return to home and refresh backend profile first.");
      return;
    }

    setClaimingToken(tokenSymbol);
    setErrorMessage(null);
    setClaimResult(null);

    try {
      const response = await fetch(`${backendUrl}/claim/request`, {
        method: "POST",
        headers: createWalletBoundJsonHeaders(requestWalletAddress),
        body: JSON.stringify({
          profileId,
          tokenSymbol,
          amount,
        }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          setErrorMessage("Rare reward access is inactive. Claim requests are unavailable while this profile is in XP-only mode.");
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
      setErrorMessage("Backend connection failed while creating claim request.");
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
              <h1 className="mt-1 text-xl font-bold text-[#27457b]">Meme-token reward claims</h1>
            </div>
            <Link
              href={withProfileQuery("/", profileId, connectedWalletAddress ?? walletAddress)}
              className="rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#425b8a]"
            >
              Back
            </Link>
          </div>
          <p className="mt-3 text-sm text-[#5d76a5]">
            Claim-based rewards only. Dedicated reward wallet handles payout off this UI flow.
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
              href={withProfileQuery("/", profileId, connectedWalletAddress ?? walletAddress)}
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
                Claim eligibility
              </p>
              <h2 className="mt-1 text-lg font-bold text-[#27457b]">
                {rareRewardAccessActive ? "Rare reward access active" : "XP-only mode"}
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
              ? "Loading backend-owned claim eligibility state."
              : needsOnboarding
                ? "Claim requests stay locked until backend confirms onboarding completion."
                : rareRewardAccessActive
                  ? "Backend currently allows claim requests for this profile."
                  : "Backend currently keeps this profile in XP-only mode, so claim requests are unavailable before submit."}
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
                  {needsOnboarding
                    ? "Locked"
                    : rareRewardAccessActive
                      ? "Available"
                      : "Blocked"}
                </p>
              </div>
            </div>
          ) : null}
        </section>

        <section
          className={`bubble-card p-4 ${
            needsOnboarding || (!rareRewardAccessActive && !isResolvingOnboardingState)
              ? "opacity-60"
              : ""
          }`}
        >
          <div className="gloss-pill rounded-2xl bg-gradient-to-r from-[#ffe39f] via-[#ffcdea] to-[#d8d0ff] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6c4b1c]">
              Rare reward bubble
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span className="h-10 w-10 rounded-full bg-gradient-to-br from-[#fff0b9] to-[#ffb5e7] shadow-[0_0_20px_rgba(255,191,123,0.8)]" />
              <p className="text-sm font-semibold text-[#5b3f1f]">
                {rareRewardAccessActive
                  ? "Premium reveal style for rare reward moments"
                  : "Rare reward visuals stay preview-only while backend keeps this profile in XP-only mode"}
              </p>
            </div>
          </div>
        </section>

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <h2 className="text-sm font-semibold text-[#30466f]">Claimable balance summary</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="gloss-pill rounded-xl bg-white/80 p-3">
              <p className="text-xs text-[#6074a0]">Tokens</p>
              <p className="mt-1 font-semibold">{canUseBackend ? balances.length : "—"}</p>
            </div>
            <div className="gloss-pill rounded-xl bg-white/80 p-3">
              <p className="text-xs text-[#6074a0]">Total claimable</p>
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
              className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#48608f] disabled:opacity-60"
            >
              {isLoadingBalances ? "Refreshing..." : "Refresh balances"}
            </button>
          ) : null}
        </section>

        <section
          className={`bubble-card p-4 ${
            needsOnboarding || (!rareRewardAccessActive && !isResolvingOnboardingState)
              ? "opacity-60"
              : ""
          }`}
        >
          <h2 className="text-sm font-semibold text-[#30466f]">Claimable meme-token balances</h2>

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
                          : "Claim unavailable in XP-only mode"}
                    </button>
                  </div>
                );
              })
            : null}

          {!canUseBackend ? (
            <p className="mt-3 text-sm text-[#6074a0]">
              Backend source required. Set `NEXT_PUBLIC_BACKEND_URL` and open with `?profileId=`.
            </p>
          ) : null}
          {canUseBackend && needsOnboarding ? (
            <p className="mt-3 text-sm text-[#6074a0]">
              Claim flow is locked until backend confirms onboarding completion.
            </p>
          ) : null}
          {canUseBackend &&
          !needsOnboarding &&
          !isResolvingOnboardingState &&
          !rareRewardAccessActive ? (
            <p className="mt-3 text-sm text-[#6074a0]">
              Claim requests are blocked before submit because backend currently reports no active rare reward access for
              this profile.
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
                  Reward wallet tx: <span className="font-semibold">{claimResult.txHash}</span>
                </p>
              ) : null}
              <p className="mt-1">
                Remaining claimable balance after this claim:{" "}
                <span className="font-semibold">{claimResult.remainingClaimableBalance}</span>
              </p>
              <p className="mt-1 text-xs text-[#6074a0]">
                Backend finalized this MVP-safe payout attempt through the dedicated reward wallet model.
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
