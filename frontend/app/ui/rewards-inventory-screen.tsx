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
import { UnifiedIcon } from "./unified-icons";

type InventoryNft = {
  id: string;
  key: string;
  label: string;
  tier: string;
  acquiredAt: string;
};

type InventoryCosmetic = {
  id: string;
  key: string;
  label: string;
  unlockedAt: string;
};

type CosmeticSlot = "avatar" | "bubbleSkin" | "trail" | "badge";
type OwnershipFilter = "all" | "obtained" | "equipped";
type RarityLevel = "common" | "rare" | "epic" | "legendary";
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
  obtainedAt: string;
};

const QA_FALLBACK_COLLECTIBLES: InventoryCollectible[] = [
  {
    id: "qa-avatar-nebula-helm",
    key: "qa.avatar.nebula-helm",
    label: "Nebula Helm",
    source: "cosmetic",
    slot: "avatar",
    rarity: "epic",
    season: "core",
    obtainedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "qa-avatar-royal-mask",
    key: "qa.avatar.royal-mask",
    label: "Royal Mask",
    source: "nft",
    slot: "avatar",
    rarity: "legendary",
    season: "genesis",
    obtainedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "qa-bubble-neon-spectrum",
    key: "qa.bubble.neon-spectrum",
    label: "Neon Spectrum",
    source: "cosmetic",
    slot: "bubbleSkin",
    rarity: "epic",
    season: "core",
    obtainedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "qa-bubble-gold-foil",
    key: "qa.bubble.gold-foil",
    label: "Gold Foil",
    source: "nft",
    slot: "bubbleSkin",
    rarity: "legendary",
    season: "genesis",
    obtainedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "qa-trail-aurora-wave",
    key: "qa.trail.aurora-wave",
    label: "Aurora Wave",
    source: "cosmetic",
    slot: "trail",
    rarity: "rare",
    season: "core",
    obtainedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "qa-trail-plasma-ribbon",
    key: "qa.trail.plasma-ribbon",
    label: "Plasma Ribbon",
    source: "nft",
    slot: "trail",
    rarity: "epic",
    season: "genesis",
    obtainedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "qa-badge-orbit-star",
    key: "qa.badge.orbit-star",
    label: "Orbit Star",
    source: "cosmetic",
    slot: "badge",
    rarity: "common",
    season: "core",
    obtainedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "qa-badge-crown-sigil",
    key: "qa.badge.crown-sigil",
    label: "Crown Sigil",
    source: "nft",
    slot: "badge",
    rarity: "legendary",
    season: "genesis",
    obtainedAt: "2026-01-01T00:00:00.000Z",
  },
];

type EquipStyleResponse = {
  profileId: string;
  equippedStyle: {
    rewardId: string;
    rewardKey: string;
    rarity: "common" | "rare" | "epic" | "legendary";
    source: "nft" | "cosmetic";
    variant: string;
    appliedAt: string;
  };
};

async function fetchOnboardingStateForProfile(
  backendUrl: string,
  profileId: string,
): Promise<{
  needsOnboarding: boolean;
  currentAvatarId: string | null;
  equippedStyleRewardId: string | null;
  rareAccessActive: boolean;
  testingOverrideActive: boolean;
} | null> {
  const payload = await fetchBackendProfileSummary(backendUrl, profileId);
  if (!payload) {
    return null;
  }

  return {
    needsOnboarding: payload.onboardingState.needsOnboarding,
    currentAvatarId: payload.avatarState.currentAvatar?.id ?? null,
    equippedStyleRewardId: payload.styleState?.equippedStyle?.rewardId ?? null,
    rareAccessActive: payload.rareRewardAccess.active,
    testingOverrideActive: payload.styleState?.testingOverrideActive ?? false,
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
  const source = `${key} ${label}`.toLowerCase();
  if (source.includes("legendary")) {
    return "legendary";
  }
  if (source.includes("epic")) {
    return "epic";
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
  const [rareAccessActive, setRareAccessActive] = useState(false);
  const [testingOverrideActive, setTestingOverrideActive] = useState(false);
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
        obtainedAt: cosmetic.unlockedAt,
      })) ?? [];
    return [...nfts, ...cosmetics];
  }, [inventory]);

  const displayCollectibles = useMemo(() => {
    if (testingOverrideActive && collectibles.length === 0) {
      return QA_FALLBACK_COLLECTIBLES;
    }
    return collectibles;
  }, [collectibles, testingOverrideActive]);

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
    if (selectedAvatarId) {
      base.avatar = selectedAvatarId;
    }
    return base;
  }, [equippedBySlot, selectedAvatarId]);

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
    if (!profileId || !authSessionToken || needsOnboarding) {
      setErrorMessage("Sign in and finish onboarding before style apply.");
      return;
    }
    if (!rareAccessActive && !testingOverrideActive) {
      setErrorMessage(
        "Style apply is locked. Reach qualification rules with daily streak and active bubble sessions.",
      );
      return;
    }
    setIsApplyingCollectibleId(item.id);
    setErrorMessage(null);
    void (async () => {
      try {
        const response = await fetch(`${backendUrl}/profile/style/equip`, {
          method: "POST",
          headers: createAuthenticatedJsonHeaders(authSessionToken),
          body: JSON.stringify({
            profileId,
            rewardId: item.id,
            rewardKey: item.key,
            rarity: item.rarity,
            source: item.source,
            variant: `${item.rarity.toUpperCase()} INVENTORY`,
          }),
        });
        if (!response.ok) {
          setErrorMessage("We couldn't apply this style right now.");
          return;
        }
        const payload = (await response.json()) as EquipStyleResponse;
        setEquippedStyleRewardId(payload.equippedStyle.rewardId);
        setEquippedBySlot((current) => ({
          ...current,
          [item.slot]: item.id,
        }));
      } catch {
        setErrorMessage("We couldn't apply this style right now.");
      } finally {
        setIsApplyingCollectibleId(null);
      }
    })();
  };

  useEffect(() => {
    setAuthSession(
      getSmokeSignInSessionFromCurrentUrl() ??
        loadBubbleDropFrontendSignInSession(),
    );
  }, [walletAddress]);

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
      setRareAccessActive(onboardingState.rareAccessActive);
      setTestingOverrideActive(onboardingState.testingOverrideActive);
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
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#536ea4]">Collection</p>
              <h1 className="mt-1 text-xl font-bold text-[#27457b]">Rewards inventory</h1>
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
            Pick a slot, tap an item, apply instantly. Designed for quick mobile use.
          </p>
        </section>

        {needsOnboarding ? (
          <section className="bubble-card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#536ea4]">
              First entry required
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#27457b]">
              Finish onboarding before inventory access
            </h2>
            <p className="mt-3 text-sm text-[#5d76a5]">
              Finish your first BubbleDrop setup on the home screen to unlock your collection.
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
              <UnifiedIcon kind="vault" className="ui-icon text-[#48608f]" />
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#48608f] disabled:opacity-60"
            >
              <UnifiedIcon kind="refresh" className="ui-icon ui-icon-active text-[#48608f]" />
              {isLoading ? "Refreshing..." : "Update"}
            </button>
          </div>
          {isResolvingOnboardingState ? (
            <p className="mt-3 text-sm text-[#6074a0]">Checking your collection access...</p>
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
            <div className="rounded-xl bg-white/80 p-3">
              <p className="inline-flex items-center gap-1 text-xs text-[#6074a0]">
                <UnifiedIcon kind="nft" className="ui-icon text-[#6074a0]" />
                NFTs
              </p>
              <p className="mt-1 font-semibold">
                {testingOverrideActive ? displayCounts.nfts : (inventory?.nftCount ?? "—")}
              </p>
            </div>
            <div className="rounded-xl bg-white/80 p-3">
              <p className="inline-flex items-center gap-1 text-xs text-[#6074a0]">
                <UnifiedIcon kind="cosmetic" className="ui-icon text-[#6074a0]" />
                Cosmetics
              </p>
              <p className="mt-1 font-semibold">
                {testingOverrideActive
                  ? displayCounts.cosmetics
                  : (inventory?.cosmeticCount ?? "—")}
              </p>
            </div>
          </div>
        </section>

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <div className="flex items-center justify-between">
            <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#30466f]">
              <UnifiedIcon kind="cosmetic" className="ui-icon text-[#48608f]" />
              Equipped now
            </h2>
            <button
              type="button"
              onClick={() => setIsAdvancedFiltersOpen((current) => !current)}
              className="rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#48608f]"
            >
              {isAdvancedFiltersOpen ? "Hide advanced" : "Advanced filters"}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {SLOT_ORDER.map((slot) => (
              <article key={slot} className="rounded-xl border border-[#dce6ff] bg-white/80 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5c75a4]">
                  {slotLabel(slot)}
                </p>
                <p className="mt-1 text-xs font-semibold text-[#2f4a7f]">{equippedSlotLabel(slot)}</p>
              </article>
            ))}
          </div>
          {isAdvancedFiltersOpen ? (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#445e8f]">
              <label className="rounded-xl bg-white/80 p-2">
                Ownership
                <select
                  value={ownershipFilter}
                  onChange={(event) => setOwnershipFilter(event.target.value as OwnershipFilter)}
                  className="mt-1 block w-full rounded-md bg-white px-2 py-2 text-sm"
                >
                  <option value="all">All</option>
                  <option value="obtained">Obtained</option>
                  <option value="equipped">Equipped</option>
                </select>
              </label>
              <label className="rounded-xl bg-white/80 p-2">
                Rarity
                <select
                  value={rarityFilter}
                  onChange={(event) => setRarityFilter(event.target.value as RarityFilter)}
                  className="mt-1 block w-full rounded-md bg-white px-2 py-2 text-sm"
                >
                  <option value="all">All rarity</option>
                  <option value="common">Common</option>
                  <option value="rare">Rare</option>
                  <option value="epic">Epic</option>
                  <option value="legendary">Legendary</option>
                </select>
              </label>
              <label className="col-span-2 rounded-xl bg-white/80 p-2">
                Season
                <select
                  value={seasonFilter}
                  onChange={(event) => setSeasonFilter(event.target.value as SeasonFilter)}
                  className="mt-1 block w-full rounded-md bg-white px-2 py-2 text-sm"
                >
                  <option value="all">All seasons</option>
                  <option value="core">Core</option>
                  <option value="genesis">Genesis</option>
                </select>
              </label>
            </div>
          ) : null}
        </section>

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#30466f]">
            <UnifiedIcon kind="vault" className="ui-icon text-[#48608f]" />
            {slotLabel(activeSlot)} collectibles
          </h2>
          {needsOnboarding ? (
            <p className="mt-3 text-sm text-[#6074a0]">
              Finish onboarding first to unlock filtering, equip actions, and preview.
            </p>
          ) : null}

          {!needsOnboarding && activeSlot === "avatar" && starterAvatars.length > 0 ? (
            <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#6074a0]">
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
                          ? "border-[#8fc9ff] bg-gradient-to-r from-[#dff6ff] to-[#ece2ff] text-[#284679]"
                          : "border-[#dce6ff] bg-white text-[#3c588b]"
                      } disabled:opacity-60`}
                    >
                      <span className="font-semibold">{avatar.label}</span>
                      <span className="ml-2 text-xs uppercase tracking-[0.08em] text-[#6d82ad]">
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
                    className={`inventory-item-card rarity-${item.rarity} mt-3 rounded-xl border p-3`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#2f4a7f]">{item.label}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#6074a0]">
                          {rarityLabel(item.rarity)}
                        </p>
                      </div>
                      {isEquipped ? (
                        <span className="rounded-full bg-[#ecf8ef] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#2e7a46]">
                          Equipped
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={() => equipCollectible(item)}
                        disabled={
                          (item.slot === "avatar" &&
                            (!authSessionToken || isSwitchingAvatar)) ||
                          (item.slot !== "avatar" && !rareAccessActive && !testingOverrideActive) ||
                          (item.slot !== "avatar" && isApplyingCollectibleId !== null)
                        }
                        className="min-h-11 rounded-lg bg-gradient-to-r from-[#c7efff] to-[#d6d8ff] px-3 py-2 text-xs font-semibold text-[#294578] disabled:opacity-60"
                      >
                        {isEquipped
                          ? "Equipped"
                          : isApplyingCollectibleId === item.id
                            ? "Applying..."
                            : "Apply"}
                      </button>
                    </div>
                  </article>
                );
              })
            : null}

          {!needsOnboarding &&
          filteredCollectibles.length === 0 &&
          !(activeSlot === "avatar" && starterAvatars.length > 0) ? (
            <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-4 text-sm text-[#6074a0]">
              No items for this slot yet. Try clearing advanced filters.
              <button
                type="button"
                onClick={() => {
                  setOwnershipFilter("all");
                  setRarityFilter("all");
                  setSeasonFilter("all");
                }}
                className="mt-3 block rounded-lg bg-[#edf4ff] px-3 py-2 text-xs font-semibold text-[#3e5f93]"
              >
                Reset filters
              </button>
            </div>
          ) : null}

          {!needsOnboarding && !rareAccessActive && !testingOverrideActive ? (
            <div className="mt-3 rounded-xl border border-[#f0ddab] bg-[#fff6de] p-3 text-xs font-semibold text-[#6f5424]">
              Cosmetic apply is visible but locked. Keep daily streak active and complete qualified bubble sessions to unlock apply.
            </div>
          ) : null}

          {!needsOnboarding && testingOverrideActive ? (
            <div className="mt-3 rounded-xl border border-[#cce7ff] bg-[#eaf6ff] p-3 text-xs font-semibold text-[#2e5f8c]">
              Test override active: all skins are visible and apply is unlocked for QA.
            </div>
          ) : null}

          {!needsOnboarding && !isLoading && !errorMessage && displayCollectibles.length === 0 ? (
            <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-4 text-sm text-[#6074a0]">
              Your rewards vault is empty for now. New NFTs/cosmetics will appear after confirmed session rewards.
            </div>
          ) : null}
        </section>

        {errorMessage ? (
          <section className="bubble-card p-4">
            <p className="rounded-xl bg-[#fff2f7] p-3 text-sm text-[#7f3a53]">
              {errorMessage === "Connect and sign in to view your rewards."
                ? errorMessage
                : errorMessage === "We couldn't load your reward access right now."
                  ? errorMessage
                  : errorMessage ===
                      "Style apply is locked. Reach qualification rules with daily streak and active bubble sessions."
                    ? errorMessage
                    : errorMessage === "We couldn't apply this style right now."
                      ? errorMessage
                  : "We couldn't open your rewards inventory right now."}
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
