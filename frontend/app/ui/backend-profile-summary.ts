"use client";

export type BackendProfileSummary = {
  onboardingState: {
    needsOnboarding: boolean;
    onboardingCompletedAt: string | null;
  };
  profileIdentity: {
    profileId: string;
    walletAddress: string;
    nickname: string | null;
  };
  avatarState: {
    currentAvatar: {
      id: string;
      key: string;
      label: string;
    } | null;
    unlockedAvatarCount: number;
  };
  xpSummary: {
    totalXp: number;
    currentStreak: number;
  };
  rankFrameState: {
    currentFrame: {
      id: string;
      key: string;
      label: string;
      minLifetimeXp: number;
    } | null;
    nextFrame: {
      id: string;
      key: string;
      label: string;
      minLifetimeXp: number;
      xpToReach: number;
    } | null;
  };
  qualificationState: {
    status: "locked" | "in_progress" | "qualified" | "paused" | "restored";
  };
  rareRewardAccess: {
    active: boolean;
  };
  claimableTokenBalanceSummary: {
    totalClaimableAmount: string;
    tokenCount: number;
    balances: Array<{
      tokenSymbol: string;
      claimableAmount: string;
    }>;
  };
  styleState: {
    equippedStyle: {
      rewardId: string;
      rewardKey: string;
      rarity: "common" | "rare" | "epic" | "legendary";
      source: "nft" | "cosmetic";
      variant: string;
      appliedAt: string;
    } | null;
  };
};

export async function fetchBackendProfileSummary(
  backendUrl: string,
  profileId: string,
): Promise<BackendProfileSummary | null> {
  if (!backendUrl || !profileId) {
    return null;
  }

  const response = await fetch(
    `${backendUrl}/profile/summary?profileId=${encodeURIComponent(profileId)}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as BackendProfileSummary;
}
