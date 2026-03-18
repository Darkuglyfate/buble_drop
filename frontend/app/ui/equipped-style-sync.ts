"use client";

import type { ProfileStyleRarity } from "./profile-style-rarity";
import { normalizeProfileStyleRarity } from "./profile-style-rarity";

export type EquippedStyleSnapshot = {
  rewardId: string;
  rewardKey: string;
  rarity: ProfileStyleRarity;
  source: "nft" | "cosmetic";
  variant: string;
  appliedAt: string;
};

export type CosmeticSlot = "avatar" | "bubbleSkin" | "trail" | "badge";

export type EquippedStyleBySlot = Partial<Record<CosmeticSlot, EquippedStyleSnapshot>>;

const STORAGE_PREFIX = "bubbledrop.equipped-style";
const STORAGE_PREFIX_PLURAL = "bubbledrop.equipped-styles";

function getStorageKey(profileId: string): string {
  return `${STORAGE_PREFIX}.${profileId}`;
}

function getStorageKeyPlural(profileId: string): string {
  return `${STORAGE_PREFIX_PLURAL}.${profileId}`;
}

function isValidSnapshot(parsed: unknown): parsed is EquippedStyleSnapshot {
  const p = parsed as EquippedStyleSnapshot;
  if (!p?.rewardId || !p?.rewardKey || !p?.source) {
    return false;
  }
  return true;
}

function normalizeSnapshot(s: EquippedStyleSnapshot): EquippedStyleSnapshot {
  return {
    ...s,
    rarity: normalizeProfileStyleRarity(s.rarity as string),
  };
}

export function inferSlotFromRewardKey(rewardKey: string): CosmeticSlot {
  const k = rewardKey.toLowerCase();
  if (k.includes("avatar") || k.includes("starter")) return "avatar";
  if (k.includes("trail") || k.includes("aura")) return "trail";
  if (k.includes("badge") || k.includes("emblem") || k.includes("medal")) return "badge";
  return "bubbleSkin";
}

/** Load a single equipped style (legacy). Used when only one style is needed, e.g. shell primary. */
export function loadPersistedEquippedStyle(profileId: string): EquippedStyleSnapshot | null {
  const bySlot = loadPersistedEquippedStyles(profileId);
  return getPrimaryEquippedStyle(bySlot);
}

export function loadPersistedEquippedStyles(profileId: string): EquippedStyleBySlot {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const rawPlural = window.sessionStorage.getItem(getStorageKeyPlural(profileId));
    if (rawPlural) {
      const parsed = JSON.parse(rawPlural) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const result: EquippedStyleBySlot = {};
        const slots: CosmeticSlot[] = ["avatar", "bubbleSkin", "trail", "badge"];
        for (const slot of slots) {
          const val = parsed[slot];
          if (val && isValidSnapshot(val))
            result[slot] = normalizeSnapshot(val as EquippedStyleSnapshot);
        }
        return result;
      }
    }
    const rawLegacy = window.sessionStorage.getItem(getStorageKey(profileId));
    if (!rawLegacy) return {};
    const legacy = JSON.parse(rawLegacy) as unknown;
    if (!legacy || !isValidSnapshot(legacy)) return {};
    const snapshot = normalizeSnapshot(legacy as EquippedStyleSnapshot);
    const slot = inferSlotFromRewardKey(snapshot.rewardKey);
    return { [slot]: snapshot };
  } catch {
    return {};
  }
}

export function savePersistedEquippedStyles(
  profileId: string,
  bySlot: EquippedStyleBySlot,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(getStorageKeyPlural(profileId), JSON.stringify(bySlot));
  } catch {
    // ignore
  }
}

/** Persist a single style into the by-slot map (merge with existing slots). */
export function savePersistedEquippedStyle(
  profileId: string,
  style: EquippedStyleSnapshot,
): void {
  const current = loadPersistedEquippedStyles(profileId);
  const slot = inferSlotFromRewardKey(style.rewardKey);
  savePersistedEquippedStyles(profileId, {
    ...current,
    [slot]: normalizeSnapshot(style),
  });
}

/** Primary style for shell display: bubbleSkin > trail > badge > avatar, then by latest appliedAt. */
export function getPrimaryEquippedStyle(bySlot: EquippedStyleBySlot): EquippedStyleSnapshot | null {
  const order: CosmeticSlot[] = ["bubbleSkin", "trail", "badge", "avatar"];
  let primary: EquippedStyleSnapshot | null = null;
  let latestAt = "";
  for (const slot of order) {
    const s = bySlot[slot];
    if (!s) continue;
    if (!primary || (s.appliedAt && s.appliedAt > latestAt)) {
      primary = s;
      latestAt = s.appliedAt ?? "";
    }
  }
  return primary;
}
