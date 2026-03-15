"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchBackendProfileSummary } from "./backend-profile-summary";

type ReferralItem = {
  referralId: string;
  invitedWalletAddress: string;
  invitedProfileId: string | null;
  status: "pending" | "successful";
  successfulAt: string | null;
  createdAt: string;
};

type ReferralProgressView = {
  inviterProfileId: string;
  totalReferrals: number;
  pendingReferrals: number;
  successfulReferrals: number;
  referrals: ReferralItem[];
};

function getBackendUrl(): string | null {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  return backendUrl && backendUrl.trim() ? backendUrl.trim() : null;
}

function getProfileIdFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = new URLSearchParams(window.location.search).get("profileId");
  return value && value.trim() ? value.trim() : null;
}

function withProfileQuery(path: string, profileId: string | null): string {
  if (!profileId) {
    return path;
  }
  return `${path}?profileId=${encodeURIComponent(profileId)}`;
}

async function fetchOnboardingStateForProfile(
  backendUrl: string,
  profileId: string,
): Promise<{ needsOnboarding: boolean } | null> {
  const payload = await fetchBackendProfileSummary(backendUrl, profileId);
  if (!payload) {
    return null;
  }

  return {
    needsOnboarding: payload.onboardingState.needsOnboarding,
  };
}

export function ReferralProgressScreen() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ReferralProgressView | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isResolvingOnboardingState, setIsResolvingOnboardingState] =
    useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const backendUrl = getBackendUrl();

  const loadProgress = async (resolvedProfileId: string) => {
    if (!backendUrl) {
      setErrorMessage("Set NEXT_PUBLIC_BACKEND_URL to load referral progress.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(
        `${backendUrl}/partner-token/referral/progress?profileId=${encodeURIComponent(resolvedProfileId)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        },
      );

      if (!response.ok) {
        setProgress(null);
        setErrorMessage("Unable to load referral progress from backend.");
        return;
      }

      const payload = (await response.json()) as ReferralProgressView;
      setProgress(payload);
    } catch {
      setProgress(null);
      setErrorMessage("Backend connection failed while loading referral progress.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const resolvedProfileId = getProfileIdFromUrl();
    setProfileId(resolvedProfileId);
    if (!resolvedProfileId) {
      setIsResolvingOnboardingState(false);
      setErrorMessage("Open with ?profileId=<uuid> to view referral progress.");
      return;
    }

    if (!backendUrl) {
      setNeedsOnboarding(false);
      setIsResolvingOnboardingState(false);
      void loadProgress(resolvedProfileId);
      return;
    }

    void (async () => {
      const onboardingState = await fetchOnboardingStateForProfile(
        backendUrl,
        resolvedProfileId,
      );
      if (!onboardingState) {
        setNeedsOnboarding(false);
        setIsResolvingOnboardingState(false);
        setErrorMessage("Unable to load onboarding state from backend.");
        return;
      }

      setNeedsOnboarding(onboardingState.needsOnboarding);
      setIsResolvingOnboardingState(false);

      if (onboardingState.needsOnboarding) {
        setProgress(null);
        setErrorMessage(null);
        return;
      }

      await loadProgress(resolvedProfileId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl]);

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
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#536ea4]">MVP read surface</p>
              <h1 className="mt-1 text-xl font-bold text-[#27457b]">Referral progress</h1>
            </div>
            <Link
              href={withProfileQuery("/", profileId)}
              className="rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#425b8a]"
            >
              Back
            </Link>
          </div>
          <p className="mt-3 text-sm text-[#5d76a5]">Read-only referral status and completion progress.</p>
        </section>

        {needsOnboarding ? (
          <section className="bubble-card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#536ea4]">
              First entry required
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#27457b]">
              Finish onboarding before referral access
            </h2>
            <p className="mt-3 text-sm text-[#5d76a5]">
              Backend still marks this profile as first-entry. Return home to complete the onboarding learning cards and
              identity setup before opening profile-owned referral progress.
            </p>
            <Link
              href={withProfileQuery("/", profileId)}
              className="gloss-pill mt-4 inline-flex rounded-xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-3 text-sm font-semibold text-[#1f3561]"
            >
              Go to onboarding
            </Link>
          </section>
        ) : null}

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#30466f]">Progress summary</h2>
            <button
              type="button"
              disabled={!profileId || isLoading || needsOnboarding || isResolvingOnboardingState}
              onClick={() => {
                if (!profileId) {
                  return;
                }
                void loadProgress(profileId);
              }}
              className="rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#48608f] disabled:opacity-60"
            >
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {isResolvingOnboardingState ? (
            <p className="mt-3 text-sm text-[#6074a0]">Loading backend onboarding state...</p>
          ) : null}

          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div className="gloss-pill rounded-xl bg-white/80 p-3">
              <p className="text-xs text-[#6074a0]">Total</p>
              <p className="mt-1 font-semibold">{progress?.totalReferrals ?? "—"}</p>
            </div>
            <div className="gloss-pill rounded-xl bg-white/80 p-3">
              <p className="text-xs text-[#6074a0]">Pending</p>
              <p className="mt-1 font-semibold">{progress?.pendingReferrals ?? "—"}</p>
            </div>
            <div className="gloss-pill rounded-xl bg-white/80 p-3">
              <p className="text-xs text-[#6074a0]">Successful</p>
              <p className="mt-1 font-semibold">{progress?.successfulReferrals ?? "—"}</p>
            </div>
          </div>
        </section>

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <h2 className="text-sm font-semibold text-[#30466f]">Referral list</h2>
          {needsOnboarding ? (
            <p className="mt-3 text-sm text-[#6074a0]">
              Referral progress stays hidden until backend confirms onboarding completion.
            </p>
          ) : null}
          {progress?.referrals.length ? (
            progress.referrals.map((item) => (
              <article key={item.referralId} className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#6074a0]">{item.invitedWalletAddress}</p>
                  <p className="text-xs font-semibold uppercase text-[#3b568b]">{item.status}</p>
                </div>
              </article>
            ))
          ) : (
            <p className="mt-3 text-sm text-[#6074a0]">No referrals yet.</p>
          )}
        </section>

        {errorMessage ? (
          <section className="bubble-card p-4">
            <p className="rounded-xl bg-[#fff2f7] p-3 text-sm text-[#7f3a53]">{errorMessage}</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
