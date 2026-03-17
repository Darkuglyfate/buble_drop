"use client";

export type EquippedStyleSnapshot = {
  rewardId: string;
  rewardKey: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  source: "nft" | "cosmetic";
  variant: string;
  appliedAt: string;
};

const STORAGE_PREFIX = "bubbledrop.equipped-style";

function getStorageKey(profileId: string): string {
  return `${STORAGE_PREFIX}.${profileId}`;
}

export function loadPersistedEquippedStyle(profileId: string): EquippedStyleSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const rawValue = window.sessionStorage.getItem(getStorageKey(profileId));
    if (!rawValue) {
      return null;
    }
    const parsed = JSON.parse(rawValue) as EquippedStyleSnapshot;
    if (!parsed?.rewardId || !parsed?.rewardKey || !parsed?.rarity || !parsed?.source) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePersistedEquippedStyle(
  profileId: string,
  style: EquippedStyleSnapshot,
): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(getStorageKey(profileId), JSON.stringify(style));
}
