"use client";

import type { ProfileStyleRarity } from "./profile-style-rarity";
import { normalizeProfileStyleRarity } from "./profile-style-rarity";

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
  seasonProgress: {
    qualificationStatus: "locked" | "in_progress" | "qualified" | "paused" | "restored";
    eligibleAtSeasonEnd: boolean;
    streak: number;
    xp: number;
    activeSessions: number;
    requiredStreak: number;
    requiredXp: number;
    requiredActiveSessions: number;
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
      rarity: ProfileStyleRarity;
      source: "nft" | "cosmetic";
      variant: string;
      appliedAt: string;
    } | null;
    testingOverrideActive: boolean;
    previewOnly: boolean;
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

  const raw = (await response.json()) as BackendProfileSummary;
  if (raw?.styleState?.equippedStyle?.rarity != null) {
    raw.styleState.equippedStyle = {
      ...raw.styleState.equippedStyle,
      rarity: normalizeProfileStyleRarity(raw.styleState.equippedStyle.rarity as string),
    };
  }
  return raw;
}
