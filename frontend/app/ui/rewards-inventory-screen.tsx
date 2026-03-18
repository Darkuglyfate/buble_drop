"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { fetchBackendProfileSummary } from "./backend-profile-summary";
import {
  getPrimaryEquippedStyle,
  inferSlotFromRewardKey,
  loadPersistedEquippedStyles,
  savePersistedEquippedStyles,
  type EquippedStyleSnapshot,
} from "./equipped-style-sync";
import { UnifiedIcon } from "./unified-icons";

type InventoryNft = {
  id: string;
  key: string;
  label: string;
  tier: string;
  owned: boolean;
  previewOnly: boolean;
  acquiredAt: string;
};

type InventoryCosmetic = {
  id: string;
  key: string;
  label: string;
  owned: boolean;
  previewOnly: boolean;
  unlockedAt: string;
};

type CosmeticSlot = "avatar" | "bubbleSkin" | "trail" | "badge";
type OwnershipFilter = "all" | "obtained" | "equipped";
import type { ProfileStyleRarity } from "./profile-style-rarity";

type RarityLevel = ProfileStyleRarity;
type RarityFilter = "all" | RarityLevel;
type SeasonFilter = "all" | "core" | "genesis";

type RewardsInventoryView = {
  profileId: string;
  nftCount: number;
  cosmeticCount: number;
  nfts: InventoryNft[];
  cosmetics: InventoryCosmetic[];
};

type StarterAvatar = {
  id: string;
  key: string;
  label: string;
};

type AvatarSelectionResponse = {
  profileId: string;
  avatarId: string;
  avatarLabel: string;
};

type InventoryCollectible = {
  id: string;
  key: string;
  label: string;
  source: "nft" | "cosmetic";
  slot: CosmeticSlot;
  rarity: RarityLevel;
  season: Exclude<SeasonFilter, "all">;
  owned: boolean;
  previewOnly: boolean;
  obtainedAt: string;
};

async function fetchOnboardingStateForProfile(
  backendUrl: string,
  profileId: string,
): Promise<{
  needsOnboarding: boolean;
  currentAvatarId: string | null;
  equippedStyle: EquippedStyleSnapshot | null;
  equippedStyleRewardId: string | null;
} | null> {
  const payload = await fetchBackendProfileSummary(backendUrl, profileId);
  if (!payload) {
    return null;
  }
  const backendEquippedStyle = payload.styleState?.equippedStyle ?? null;
  const persistedBySlot = loadPersistedEquippedStyles(profileId);
  const mergedBySlot = { ...persistedBySlot };
  if (backendEquippedStyle) {
    const slot = inferSlotFromRewardKey(backendEquippedStyle.rewardKey);
    mergedBySlot[slot] = backendEquippedStyle;
  }
  const primary = getPrimaryEquippedStyle(mergedBySlot);

  return {
    needsOnboarding: payload.onboardingState.needsOnboarding,
    currentAvatarId: payload.avatarState.currentAvatar?.id ?? null,
    equippedStyle: backendEquippedStyle,
    equippedStyleRewardId: primary?.rewardId ?? null,
  };
}

function inferSlot(key: string, label: string): CosmeticSlot {
  const source = `${key} ${label}`.toLowerCase();
  if (source.includes("avatar") || source.includes("starter")) {
    return "avatar";
  }
  if (source.includes("trail") || source.includes("aura")) {
    return "trail";
  }
  if (source.includes("badge") || source.includes("emblem") || source.includes("medal")) {
    return "badge";
  }
  return "bubbleSkin";
}

function inferRarity(
  sourceType: "nft" | "cosmetic",
  key: string,
  label: string,
  tier?: string,
): RarityLevel {
  const normalizedTier = tier?.toLowerCase();
  if (normalizedTier === "legendary") {
    return "legendary";
  }
  if (normalizedTier === "epic") {
    return "epic";
  }
  if (normalizedTier === "rare") {
    return "rare";
  }
  if (normalizedTier === "uncommon") {
    return "uncommon";
  }
  const source = `${key} ${label}`.toLowerCase();
  if (source.includes("legendary")) {
    return "legendary";
  }
  if (source.includes("epic")) {
    return "epic";
  }
  if (source.includes("uncommon") || source.includes("unusual")) {
    return "uncommon";
  }
  if (source.includes("rare") || source.includes("glossy")) {
    return "rare";
  }
  if (sourceType === "nft" && source.includes("genesis")) {
    return "rare";
  }
  return "common";
}

function inferSeason(key: string, label: string): Exclude<SeasonFilter, "all"> {
  const source = `${key} ${label}`.toLowerCase();
  if (source.includes("genesis") || source.includes("season-1") || source.includes("s1")) {
    return "genesis";
  }
  return "core";
}

function formatShortDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }
  return parsed.toISOString().slice(0, 10);
}

function slotLabel(slot: CosmeticSlot): string {
  if (slot === "bubbleSkin") {
    return "Bubble skin";
  }
  return slot[0].toUpperCase() + slot.slice(1);
}

function rarityLabel(rarity: RarityLevel): string {
  return rarity[0].toUpperCase() + rarity.slice(1);
}

const SLOT_ORDER: CosmeticSlot[] = ["avatar", "bubbleSkin", "trail", "badge"];

export function RewardsInventoryScreen() {
  const { profileId, walletAddress } = useBubbleDropRuntime();
  const [inventory, setInventory] = useState<RewardsInventoryView | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isResolvingOnboardingState, setIsResolvingOnboardingState] =
    useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [starterAvatars, setStarterAvatars] = useState<StarterAvatar[]>([]);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [isSwitchingAvatar, setIsSwitchingAvatar] = useState(false);
  const [isApplyingCollectibleId, setIsApplyingCollectibleId] = useState<string | null>(null);
  const [equippedStyleRewardId, setEquippedStyleRewardId] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<CosmeticSlot>("avatar");
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [equippedBySlot, setEquippedBySlot] = useState<Record<CosmeticSlot, string | null>>({
    avatar: null,
    bubbleSkin: null,
    trail: null,
    badge: null,
  });
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("all");
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("all");
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>("all");
  const [authSession, setAuthSession] =
    useState<BubbleDropFrontendSignInSession | null>(null);

  const backendUrl = BUBBLEDROP_API_BASE;
  const authSessionToken = authSession?.authSessionToken ?? null;

  const loadStarterAvatars = async () => {
    try {
      const response = await fetch(`${backendUrl}/profile/starter-avatars`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        setStarterAvatars([]);
        return;
      }
      const payload = (await response.json()) as StarterAvatar[];
      setStarterAvatars(payload);
    } catch {
      setStarterAvatars([]);
    }
  };

  const loadInventory = async (resolvedProfileId: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(
        `${backendUrl}/profile/rewards-inventory?profileId=${encodeURIComponent(resolvedProfileId)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        },
      );

      if (!response.ok) {
        setInventory(null);
        setErrorMessage("Unable to load rewards inventory from backend.");
        return;
      }

      const payload = (await response.json()) as RewardsInventoryView;
      setInventory(payload);
    } catch {
      setInventory(null);
      setErrorMessage("Backend connection failed while loading rewards inventory.");
    } finally {
      setIsLoading(false);
    }
  };

  const collectibles = useMemo<InventoryCollectible[]>(() => {
    const nfts =
      inventory?.nfts.map((nft) => ({
        id: nft.id,
        key: nft.key,
        label: nft.label,
        source: "nft" as const,
        slot: inferSlot(nft.key, nft.label),
        rarity: inferRarity("nft", nft.key, nft.label, nft.tier),
        season: inferSeason(nft.key, nft.label),
        owned: nft.owned,
        previewOnly: nft.previewOnly,
        obtainedAt: nft.acquiredAt,
      })) ?? [];
    const cosmetics =
      inventory?.cosmetics.map((cosmetic) => ({
        id: cosmetic.id,
        key: cosmetic.key,
        label: cosmetic.label,
        source: "cosmetic" as const,
        slot: inferSlot(cosmetic.key, cosmetic.label),
        rarity: inferRarity("cosmetic", cosmetic.key, cosmetic.label),
        season: inferSeason(cosmetic.key, cosmetic.label),
        owned: cosmetic.owned,
        previewOnly: cosmetic.previewOnly,
        obtainedAt: cosmetic.unlockedAt,
      })) ?? [];
    return [...nfts, ...cosmetics];
  }, [inventory]);

  const displayCollectibles = useMemo(() => collectibles, [collectibles]);

  const collectibleMap = useMemo(
    () => new Map(displayCollectibles.map((item) => [item.id, item])),
    [displayCollectibles],
  );

  const starterAvatarIdSet = useMemo(
    () => new Set(starterAvatars.map((avatar) => avatar.id)),
    [starterAvatars],
  );

  const effectiveEquipment = useMemo<Record<CosmeticSlot, string | null>>(() => {
    const base = { ...equippedBySlot };
    if (selectedAvatarId && (!base.avatar || starterAvatarIdSet.has(selectedAvatarId))) {
      base.avatar = selectedAvatarId;
    }
    return base;
  }, [equippedBySlot, selectedAvatarId, starterAvatarIdSet]);

  const filteredCollectibles = useMemo(() => {
    return displayCollectibles.filter((item) => {
      if (item.slot !== activeSlot) {
        return false;
      }
      if (rarityFilter !== "all" && item.rarity !== rarityFilter) {
        return false;
      }
      if (seasonFilter !== "all" && item.season !== seasonFilter) {
        return false;
      }
      if (ownershipFilter === "obtained" && !item.owned) {
        return false;
      }
      if (ownershipFilter === "equipped") {
        return Object.values(effectiveEquipment).some((id) => id === item.id);
      }
      return true;
    });
  }, [
    displayCollectibles,
    activeSlot,
    rarityFilter,
    seasonFilter,
    ownershipFilter,
    effectiveEquipment,
  ]);

  const displayCounts = useMemo(
    () => ({
      nfts: displayCollectibles.filter((item) => item.source === "nft").length,
      cosmetics: displayCollectibles.filter((item) => item.source === "cosmetic").length,
    }),
    [displayCollectibles],
  );

  const getItemById = (itemId: string | null): InventoryCollectible | null => {
    if (!itemId) {
      return null;
    }
    return collectibleMap.get(itemId) ?? null;
  };

  const equipCollectible = (item: InventoryCollectible) => {
    if (item.slot === "avatar" && starterAvatarIdSet.has(item.id)) {
      void onSelectAvatar(item.id);
      return;
    }
    setErrorMessage(
      "Seasonal collectibles are preview-only right now. Keep building streak and XP until the season-end reward distribution.",
    );
    return;
  };

  useEffect(() => {
    setAuthSession(
      getSmokeSignInSessionFromCurrentUrl() ??
        loadBubbleDropFrontendSignInSession(),
    );
  }, [walletAddress]);

  useEffect(() => {
    if (!profileId) return;
    const persisted = loadPersistedEquippedStyles(profileId);
    const primary = getPrimaryEquippedStyle(persisted);
    setEquippedBySlot({
      avatar: persisted.avatar?.rewardId ?? null,
      bubbleSkin: persisted.bubbleSkin?.rewardId ?? null,
      trail: persisted.trail?.rewardId ?? null,
      badge: persisted.badge?.rewardId ?? null,
    });
    if (primary) {
      setEquippedStyleRewardId(primary.rewardId);
    }
  }, [profileId]);

  useEffect(() => {
    const resolvedProfileId = profileId;
    if (!resolvedProfileId) {
      setIsResolvingOnboardingState(false);
      setErrorMessage("Connect and sign in to view your rewards.");
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
        setErrorMessage("We couldn't load your reward access right now.");
        return;
      }

      setNeedsOnboarding(onboardingState.needsOnboarding);
      setSelectedAvatarId(onboardingState.currentAvatarId);
      setEquippedStyleRewardId(onboardingState.equippedStyleRewardId);
      const persistedBySlot = loadPersistedEquippedStyles(resolvedProfileId);
      const mergedBySlot = { ...persistedBySlot };
      if (onboardingState.equippedStyle) {
        const slot = inferSlotFromRewardKey(onboardingState.equippedStyle.rewardKey);
        mergedBySlot[slot] = onboardingState.equippedStyle;
      }
      setEquippedBySlot({
        avatar: onboardingState.currentAvatarId ?? mergedBySlot.avatar?.rewardId ?? null,
        bubbleSkin: mergedBySlot.bubbleSkin?.rewardId ?? null,
        trail: mergedBySlot.trail?.rewardId ?? null,
        badge: mergedBySlot.badge?.rewardId ?? null,
      });
      setIsResolvingOnboardingState(false);
      await loadStarterAvatars();

      if (onboardingState.needsOnboarding) {
        setInventory(null);
        setErrorMessage(null);
        return;
      }

      await loadInventory(resolvedProfileId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, profileId]);

  useEffect(() => {
    if (!equippedStyleRewardId) {
      return;
    }
    const equippedItem = collectibleMap.get(equippedStyleRewardId);
    if (!equippedItem || equippedItem.slot === "avatar") {
      return;
    }
    setEquippedBySlot((current) => ({
      ...current,
      [equippedItem.slot]: equippedItem.id,
    }));
  }, [collectibleMap, equippedStyleRewardId]);

  const onSelectAvatar = async (avatarId: string) => {
    if (!profileId || !authSessionToken || needsOnboarding) {
      return;
    }
    if (selectedAvatarId === avatarId) {
      return;
    }

    setIsSwitchingAvatar(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${backendUrl}/profile/avatar/select`, {
        method: "POST",
        headers: createAuthenticatedJsonHeaders(authSessionToken),
        body: JSON.stringify({
          profileId,
          avatarId,
        }),
      });
      if (!response.ok) {
        setErrorMessage("We couldn't switch avatar right now.");
        return;
      }

      const payload = (await response.json()) as AvatarSelectionResponse;
      setSelectedAvatarId(payload.avatarId);
    } catch {
      setErrorMessage("We couldn't switch avatar right now.");
    } finally {
      setIsSwitchingAvatar(false);
    }
  };

  const equippedSlotLabel = (slot: CosmeticSlot): string => {
    const itemId = effectiveEquipment[slot];
    if (!itemId) {
      return "Not equipped";
    }
    if (slot === "avatar") {
      const avatar = starterAvatars.find((entry) => entry.id === itemId);
      if (avatar) {
        return avatar.label;
      }
    }
    return collectibleMap.get(itemId)?.label ?? "Equipped";
  };

  return (
    <div className="vault-drop-surface relative min-h-screen px-4 py-6 sm:px-6">
      <div className="floating-bubbles">
        <span className="bubble b1" />
        <span className="bubble b2" />
        <span className="bubble b3" />
        <span className="bubble b4" />
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-4">
        <section className="vault-drop-panel p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="vault-drop-muted text-xs font-semibold uppercase tracking-[0.12em]">
                Collection
              </p>
              <h1 className="vault-drop-title mt-1 text-xl font-bold">Rewards inventory</h1>
            </div>
            <Link
              href={withBubbleDropContext("/", { profileId, walletAddress }, { skipIntro: true })}
              className="vault-drop-btn-alt inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
            >
              <UnifiedIcon kind="back" className="ui-icon ui-icon-active text-[#c8daf5]" />
              Back
            </Link>
          </div>
          <p className="vault-drop-muted mt-3 text-sm">
            Browse the full season collection. Skins stay visible as preview-only until season-end
            reward distribution.
          </p>
          <div className="vault-drop-ceremony mt-4">
            <div className="vault-drop-flash" aria-hidden />
            <p className="vault-drop-muted mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em]">
              Drop preview
            </p>
          </div>
        </section>

        {needsOnboarding ? (
          <section className="vault-drop-panel p-4">
            <p className="vault-drop-muted text-xs font-semibold uppercase tracking-[0.12em]">
              First entry required
            </p>
            <h2 className="vault-drop-title mt-1 text-lg font-bold">
              Finish onboarding before inventory access
            </h2>
            <p className="vault-drop-muted mt-3 text-sm">
              Finish your first BubbleDrop setup on the home screen to unlock your collection.
            </p>
            <Link
              href={withBubbleDropContext("/", { profileId, walletAddress }, { skipIntro: true })}
              className="vault-drop-btn-main mt-4 inline-flex rounded-xl px-4 py-3 text-sm"
            >
              Go to onboarding
            </Link>
          </section>
        ) : null}

        <section className={`vault-drop-panel p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <div className="flex items-center justify-between">
            <h2 className="vault-drop-title inline-flex items-center gap-1.5 text-sm font-semibold">
              <UnifiedIcon kind="vault" className="ui-icon text-[#8fa8d4]" />
              Slots
            </h2>
            <button
              type="button"
              disabled={!profileId || isLoading || needsOnboarding || isResolvingOnboardingState}
              onClick={() => {
                if (!profileId) {
                  return;
                }
                void loadInventory(profileId);
              }}
              className="vault-drop-btn-alt inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60"
            >
              <UnifiedIcon kind="refresh" className="ui-icon ui-icon-active text-[#c8daf5]" />
              {isLoading ? "Refreshing..." : "Update"}
            </button>
          </div>
          {isResolvingOnboardingState ? (
            <p className="vault-drop-muted mt-3 text-sm">Checking your collection access...</p>
          ) : null}
          <div className="inventory-slot-tabs mt-3">
            {SLOT_ORDER.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setActiveSlot(slot)}
                className={`inventory-slot-tab ${activeSlot === slot ? "inventory-slot-tab-active" : ""}`}
              >
                <span>{slotLabel(slot)}</span>
                <span className="inventory-slot-subtext">{equippedSlotLabel(slot)}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-white/15 bg-white/10 p-3">
              <p className="vault-drop-muted inline-flex items-center gap-1 text-xs">
                <UnifiedIcon kind="nft" className="ui-icon text-[#8fa8d4]" />
                NFTs
              </p>
              <p className="vault-drop-title mt-1 font-semibold">
                {inventory?.nftCount ?? displayCounts.nfts ?? "—"}
              </p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 p-3">
              <p className="vault-drop-muted inline-flex items-center gap-1 text-xs">
                <UnifiedIcon kind="cosmetic" className="ui-icon text-[#8fa8d4]" />
                Cosmetics
              </p>
              <p className="vault-drop-title mt-1 font-semibold">
                {inventory?.cosmeticCount ?? displayCounts.cosmetics ?? "—"}
              </p>
            </div>
          </div>
        </section>

        <section className={`vault-drop-panel p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <div className="flex items-center justify-between">
            <h2 className="vault-drop-title inline-flex items-center gap-1.5 text-sm font-semibold">
              <UnifiedIcon kind="cosmetic" className="ui-icon text-[#8fa8d4]" />
              Equipped now
            </h2>
            <button
              type="button"
              onClick={() => setIsAdvancedFiltersOpen((current) => !current)}
              className="vault-drop-btn-alt rounded-lg px-3 py-2 text-xs font-semibold"
            >
              {isAdvancedFiltersOpen ? "Hide advanced" : "Advanced filters"}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {SLOT_ORDER.map((slot) => (
              <article
                key={slot}
                className="rounded-xl border border-white/15 bg-white/[0.07] p-3"
              >
                <p className="vault-drop-muted text-[11px] font-semibold uppercase tracking-[0.08em]">
                  {slotLabel(slot)}
                </p>
                <p className="vault-drop-title mt-1 text-xs font-semibold">{equippedSlotLabel(slot)}</p>
              </article>
            ))}
          </div>
          {isAdvancedFiltersOpen ? (
            <div className="vault-drop-muted mt-3 grid grid-cols-2 gap-2 text-xs">
              <label className="rounded-xl border border-white/15 bg-white/[0.07] p-2">
                Ownership
                <select
                  value={ownershipFilter}
                  onChange={(event) => setOwnershipFilter(event.target.value as OwnershipFilter)}
                  className="mt-1 block w-full rounded-md border border-white/15 bg-[#141e36] px-2 py-2 text-sm text-[#eef4ff]"
                >
                  <option value="all">All</option>
                  <option value="obtained">Obtained</option>
              <option value="equipped">Equipped</option>
                </select>
              </label>
              <label className="rounded-xl border border-white/15 bg-white/[0.07] p-2">
                Rarity
                <select
                  value={rarityFilter}
                  onChange={(event) => setRarityFilter(event.target.value as RarityFilter)}
                  className="mt-1 block w-full rounded-md border border-white/15 bg-[#141e36] px-2 py-2 text-sm text-[#eef4ff]"
                >
                  <option value="all">All rarity</option>
                  <option value="common">Common</option>
                  <option value="uncommon">Uncommon</option>
                  <option value="rare">Rare</option>
                  <option value="epic">Epic</option>
                  <option value="legendary">Legendary</option>
                </select>
              </label>
              <label className="col-span-2 rounded-xl border border-white/15 bg-white/[0.07] p-2">
                Season
                <select
                  value={seasonFilter}
                  onChange={(event) => setSeasonFilter(event.target.value as SeasonFilter)}
                  className="mt-1 block w-full rounded-md border border-white/15 bg-[#141e36] px-2 py-2 text-sm text-[#eef4ff]"
                >
                  <option value="all">All seasons</option>
                  <option value="core">Core</option>
                  <option value="genesis">Genesis</option>
                </select>
              </label>
            </div>
          ) : null}
        </section>

        <section className={`vault-drop-panel p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <h2 className="vault-drop-title inline-flex items-center gap-1.5 text-sm font-semibold">
            <UnifiedIcon kind="vault" className="ui-icon text-[#8fa8d4]" />
            {slotLabel(activeSlot)} collectibles
          </h2>
          {needsOnboarding ? (
            <p className="vault-drop-muted mt-3 text-sm">
              Finish onboarding first to unlock the season collection preview.
            </p>
          ) : null}

          {!needsOnboarding && activeSlot === "avatar" && starterAvatars.length > 0 ? (
            <div className="mt-3 rounded-xl border border-white/15 bg-white/[0.07] p-3">
              <p className="vault-drop-muted text-xs font-semibold uppercase tracking-[0.1em]">
                Starter avatars
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {starterAvatars.map((avatar) => {
                  const isEquipped = selectedAvatarId === avatar.id;
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => void onSelectAvatar(avatar.id)}
                      disabled={isSwitchingAvatar || !authSessionToken}
                      className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm transition-all ${
                        isEquipped
                          ? "border-cyan-400/50 bg-gradient-to-r from-cyan-500/20 to-violet-500/15 text-[#eef4ff]"
                          : "border-white/15 bg-white/5 text-[#d7e5ff]"
                      } disabled:opacity-60`}
                    >
                      <span className="font-semibold">{avatar.label}</span>
                      <span className="vault-drop-muted ml-2 text-xs uppercase tracking-[0.08em]">
                        {isEquipped ? "Equipped" : "Tap to equip"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!needsOnboarding && filteredCollectibles.length > 0
            ? filteredCollectibles.map((item) => {
                const isEquipped = Object.values(effectiveEquipment).some((id) => id === item.id);
                return (
                  <article
                    key={item.id}
                    className={`inventory-item-card rarity-${item.rarity} relative mt-3 overflow-hidden rounded-3xl border p-0 ${
                      item.previewOnly ? "inventory-item-card-preview" : ""
                    }`}
                  >
                    <span className="drop-card-bubble-deco" aria-hidden />
                    <div className="drop-card-inner p-3 pt-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="vault-drop-title text-sm font-semibold">{item.label}</p>
                          <p className="vault-drop-muted mt-1 text-xs font-semibold uppercase tracking-[0.08em]">
                            {rarityLabel(item.rarity)}
                          </p>
                          <p className="vault-drop-muted mt-1 text-[11px]">
                            {item.owned
                              ? "Collected on this profile · Preview only"
                              : "Season preview only"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                            isEquipped
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "border border-white/20 bg-white/10 text-[#d5def0]"
                          }`}
                        >
                          {isEquipped ? "Equipped" : item.owned ? "Collected" : "Preview only"}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2">
                        <button
                          type="button"
                          onClick={() => equipCollectible(item)}
                          disabled={
                            (item.slot === "avatar" &&
                              (!authSessionToken || isSwitchingAvatar)) ||
                            (item.slot !== "avatar" && item.previewOnly) ||
                            (item.slot !== "avatar" && isApplyingCollectibleId !== null)
                          }
                          className="vault-drop-btn-main min-h-11 px-3 py-2 text-xs disabled:opacity-60"
                        >
                          {item.slot === "avatar"
                            ? isEquipped
                              ? "Equipped"
                              : "Apply avatar"
                            : item.owned
                              ? "Collected"
                              : "Season preview"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            : null}

          {!needsOnboarding &&
          filteredCollectibles.length === 0 &&
          !(activeSlot === "avatar" && starterAvatars.length > 0) ? (
            <div className="vault-drop-muted mt-3 rounded-xl border border-white/15 bg-white/[0.07] p-4 text-sm">
              No items for this slot yet. Try clearing advanced filters.
              <button
                type="button"
                onClick={() => {
                  setOwnershipFilter("all");
                  setRarityFilter("all");
                  setSeasonFilter("all");
                }}
                className="vault-drop-btn-alt mt-3 block rounded-lg px-3 py-2 text-xs font-semibold"
              >
                Reset filters
              </button>
            </div>
          ) : null}

          {!needsOnboarding ? (
            <div className="mt-3 rounded-xl border border-amber-400/35 bg-amber-500/10 p-3 text-xs font-semibold text-amber-100/95">
              All collectible skins are visible for preview, but apply is locked during the seasonal
              progression phase. Keep daily streak active, earn XP, and wait for season-end reward
              distribution.
            </div>
          ) : null}

          {!needsOnboarding && !isLoading && !errorMessage && displayCollectibles.length === 0 ? (
            <div className="vault-drop-muted mt-3 rounded-xl border border-white/15 bg-white/[0.07] p-4 text-sm">
              The season collection is not available yet for this profile.
            </div>
          ) : null}
        </section>

        {errorMessage ? (
          <section className="vault-drop-panel p-4">
            <p className="rounded-xl border border-rose-400/40 bg-rose-950/40 p-3 text-sm text-rose-100">
              {errorMessage === "Connect and sign in to view your rewards."
                ? errorMessage
                : errorMessage === "We couldn't load your reward access right now."
                  ? errorMessage
                  : errorMessage ===
                      "Seasonal collectibles are preview-only right now. Keep building streak and XP until the season-end reward distribution."
                    ? errorMessage
                  : "We couldn't open your rewards inventory right now."}
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
