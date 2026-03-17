"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BUBBLEDROP_API_BASE,
  useBubbleDropRuntime,
  withBubbleDropContext,
} from "../bubbledrop-runtime";
import { fetchBackendProfileSummary } from "./backend-profile-summary";
import { UnifiedIcon } from "./unified-icons";

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

function shortenWalletAddress(walletAddress: string): string {
  return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

function formatReferralStatus(status: ReferralItem["status"]): string {
  return status === "successful" ? "Completed" : "Pending";
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
  const { profileId, walletAddress } = useBubbleDropRuntime();
  const [progress, setProgress] = useState<ReferralProgressView | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isResolvingOnboardingState, setIsResolvingOnboardingState] =
    useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const backendUrl = BUBBLEDROP_API_BASE;

  const loadProgress = async (resolvedProfileId: string) => {
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
    const resolvedProfileId = profileId;
    if (!resolvedProfileId) {
      setIsResolvingOnboardingState(false);
      setErrorMessage("Connect and sign in to view your referrals.");
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
        setErrorMessage("We couldn't load your referral access right now.");
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
  }, [backendUrl, profileId]);

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
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#536ea4]">Invite status</p>
              <h1 className="mt-1 text-xl font-bold text-[#27457b]">Referral progress</h1>
            </div>
            <Link
              href={withBubbleDropContext("/", { profileId, walletAddress }, { skipIntro: true })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#425b8a]"
            >
              <UnifiedIcon kind="back" className="ui-icon ui-icon-active text-[#425b8a]" />
              Back
            </Link>
          </div>
          <p className="mt-3 text-sm text-[#5d76a5]">
            Track your invites and see how many have moved from pending to completed.
          </p>
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
              Finish your first BubbleDrop setup on the home screen to unlock referrals.
            </p>
            <Link
              href={withBubbleDropContext("/", { profileId, walletAddress }, { skipIntro: true })}
              className="gloss-pill mt-4 inline-flex rounded-xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-3 text-sm font-semibold text-[#1f3561]"
            >
              Go to onboarding
            </Link>
          </section>
        ) : null}

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <div className="flex items-center justify-between">
            <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#30466f]">
              <UnifiedIcon kind="referrals" className="ui-icon text-[#48608f]" />
              Progress summary
            </h2>
            <button
              type="button"
              disabled={!profileId || isLoading || needsOnboarding || isResolvingOnboardingState}
              onClick={() => {
                if (!profileId) {
                  return;
                }
                void loadProgress(profileId);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#48608f] disabled:opacity-60"
            >
              <UnifiedIcon kind="refresh" className="ui-icon ui-icon-active text-[#48608f]" />
              {isLoading ? "Refreshing..." : "Update"}
            </button>
          </div>
          {isResolvingOnboardingState ? (
            <p className="mt-3 text-sm text-[#6074a0]">Checking your referral access...</p>
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
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#30466f]">
            <UnifiedIcon kind="referrals" className="ui-icon text-[#48608f]" />
            Referral list
          </h2>
          {needsOnboarding ? (
            <p className="mt-3 text-sm text-[#6074a0]">
              Referral activity appears here after onboarding is complete.
            </p>
          ) : null}
          {progress?.referrals.length ? (
            progress.referrals.map((item) => (
              <article key={item.referralId} className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#2f4a7f]">
                      {shortenWalletAddress(item.invitedWalletAddress)}
                    </p>
                    <p className="mt-1 text-xs text-[#6074a0]">
                      {item.invitedProfileId ? "Profile connected" : "Waiting for profile setup"}
                    </p>
                  </div>
                  <p
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                      item.status === "successful"
                        ? "bg-[#e7fbf0] text-[#2f6f53]"
                        : "bg-[#f2f5ff] text-[#61739b]"
                    }`}
                  >
                    {formatReferralStatus(item.status)}
                  </p>
                </div>
              </article>
            ))
          ) : (
            <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-4 text-sm text-[#6074a0]">
              You have no referrals yet. Invites will appear here once people join through your link.
            </div>
          )}
        </section>

        {errorMessage ? (
          <section className="bubble-card p-4">
            <p className="rounded-xl bg-[#fff2f7] p-3 text-sm text-[#7f3a53]">
              {errorMessage === "Connect and sign in to view your referrals."
                ? errorMessage
                : errorMessage === "We couldn't load your referral access right now."
                  ? errorMessage
                  : "We couldn't open your referral progress right now."}
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
