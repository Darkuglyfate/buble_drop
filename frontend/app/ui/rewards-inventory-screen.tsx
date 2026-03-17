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
type RarityFilter = "all" | "common" | "rare";
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
  rarity: Exclude<RarityFilter, "all">;
  season: Exclude<SeasonFilter, "all">;
  obtainedAt: string;
};

async function fetchOnboardingStateForProfile(
  backendUrl: string,
  profileId: string,
): Promise<{ needsOnboarding: boolean; currentAvatarId: string | null } | null> {
  const payload = await fetchBackendProfileSummary(backendUrl, profileId);
  if (!payload) {
    return null;
  }

  return {
    needsOnboarding: payload.onboardingState.needsOnboarding,
    currentAvatarId: payload.avatarState.currentAvatar?.id ?? null,
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
): Exclude<RarityFilter, "all"> {
  if (sourceType === "nft") {
    return tier?.toLowerCase() === "rare" ? "rare" : "common";
  }
  const source = `${key} ${label}`.toLowerCase();
  if (
    source.includes("rare") ||
    source.includes("legendary") ||
    source.includes("epic") ||
    source.includes("glossy")
  ) {
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
  const [equippedBySlot, setEquippedBySlot] = useState<Record<CosmeticSlot, string | null>>({
    avatar: null,
    bubbleSkin: null,
    trail: null,
    badge: null,
  });
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("obtained");
  const [slotFilter, setSlotFilter] = useState<CosmeticSlot | "all">("all");
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("all");
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>("all");
  const [authSession, setAuthSession] =
    useState<BubbleDropFrontendSignInSession | null>(null);

  const backendUrl = BUBBLEDROP_API_BASE;
  const authSessionToken = authSession?.authSessionToken ?? null;
  const equipmentStorageKey = profileId
    ? `bubbledrop.inventory.equipment.${profileId}`
    : null;

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

  const collectibleMap = useMemo(
    () => new Map(collectibles.map((item) => [item.id, item])),
    [collectibles],
  );

  const effectiveEquipment = useMemo<Record<CosmeticSlot, string | null>>(() => {
    const base = { ...equippedBySlot };
    if (selectedAvatarId) {
      base.avatar = selectedAvatarId;
    }
    return base;
  }, [equippedBySlot, selectedAvatarId]);

  const previewItem = previewItemId ? collectibleMap.get(previewItemId) ?? null : null;
  const previewEquipment = useMemo<Record<CosmeticSlot, string | null>>(() => {
    if (!previewItem) {
      return effectiveEquipment;
    }
    return {
      ...effectiveEquipment,
      [previewItem.slot]: previewItem.id,
    };
  }, [effectiveEquipment, previewItem]);

  const filteredCollectibles = useMemo(() => {
    return collectibles.filter((item) => {
      if (slotFilter !== "all" && item.slot !== slotFilter) {
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
    collectibles,
    slotFilter,
    rarityFilter,
    seasonFilter,
    ownershipFilter,
    effectiveEquipment,
  ]);

  const getItemById = (itemId: string | null): InventoryCollectible | null => {
    if (!itemId) {
      return null;
    }
    return collectibleMap.get(itemId) ?? null;
  };

  const equipCollectible = (item: InventoryCollectible) => {
    if (item.slot === "avatar") {
      void onSelectAvatar(item.id);
      return;
    }
    setEquippedBySlot((current) => ({
      ...current,
      [item.slot]: item.id,
    }));
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
    if (!equipmentStorageKey) {
      return;
    }
    try {
      const rawValue = window.localStorage.getItem(equipmentStorageKey);
      if (!rawValue) {
        return;
      }
      const parsed = JSON.parse(rawValue) as Partial<Record<CosmeticSlot, string | null>>;
      setEquippedBySlot({
        avatar: parsed.avatar ?? null,
        bubbleSkin: parsed.bubbleSkin ?? null,
        trail: parsed.trail ?? null,
        badge: parsed.badge ?? null,
      });
    } catch {
      // Ignore corrupted local equipment data and keep defaults.
    }
  }, [equipmentStorageKey]);

  useEffect(() => {
    if (!equipmentStorageKey) {
      return;
    }
    window.localStorage.setItem(
      equipmentStorageKey,
      JSON.stringify({
        avatar: selectedAvatarId,
        bubbleSkin: equippedBySlot.bubbleSkin,
        trail: equippedBySlot.trail,
        badge: equippedBySlot.badge,
      }),
    );
  }, [equipmentStorageKey, selectedAvatarId, equippedBySlot]);

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
            Manage unlocked collectibles by slot, apply filters, equip items, and compare before/after style preview.
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
              Inventory summary
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
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="gloss-pill rounded-xl bg-white/80 p-3">
              <p className="inline-flex items-center gap-1 text-xs text-[#6074a0]">
                <UnifiedIcon kind="nft" className="ui-icon text-[#6074a0]" />
                NFTs
              </p>
              <p className="mt-1 font-semibold">{inventory?.nftCount ?? "—"}</p>
            </div>
            <div className="gloss-pill rounded-xl bg-white/80 p-3">
              <p className="inline-flex items-center gap-1 text-xs text-[#6074a0]">
                <UnifiedIcon kind="cosmetic" className="ui-icon text-[#6074a0]" />
                Cosmetics
              </p>
              <p className="mt-1 font-semibold">{inventory?.cosmeticCount ?? "—"}</p>
            </div>
          </div>
        </section>

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#30466f]">
            <UnifiedIcon kind="cosmetic" className="ui-icon text-[#48608f]" />
            Inventory filters
          </h2>
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
              Slot
              <select
                value={slotFilter}
                onChange={(event) => setSlotFilter(event.target.value as CosmeticSlot | "all")}
                className="mt-1 block w-full rounded-md bg-white px-2 py-2 text-sm"
              >
                <option value="all">All slots</option>
                <option value="avatar">Avatar</option>
                <option value="bubbleSkin">Bubble skin</option>
                <option value="trail">Trail</option>
                <option value="badge">Badge</option>
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
              </select>
            </label>
            <label className="rounded-xl bg-white/80 p-2">
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
          <p className="mt-2 text-xs text-[#6074a0]">
            Tap-friendly controls are tuned for mobile and keep filter changes in one thumb zone.
          </p>
        </section>

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#30466f]">
            <UnifiedIcon kind="nft" className="ui-icon text-[#48608f]" />
            Before / after preview
          </h2>
          <p className="mt-2 text-xs text-[#6074a0]">
            Choose a collectible to preview. Apply confirms equipment to your active slot set.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["avatar", "bubbleSkin", "trail", "badge"] as const).map((slot) => {
              const beforeItem = getItemById(effectiveEquipment[slot]);
              const afterItem = getItemById(previewEquipment[slot]);
              return (
                <article key={slot} className="rounded-xl border border-[#dce6ff] bg-white/80 p-3 text-xs">
                  <p className="font-semibold text-[#2f4a7f]">{slotLabel(slot)}</p>
                  <p className="mt-1 text-[#6074a0]">
                    Before: {beforeItem ? beforeItem.label : "Not equipped"}
                  </p>
                  <p className="mt-1 text-[#445e8f]">
                    After: {afterItem ? afterItem.label : "Not equipped"}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#30466f]">
            <UnifiedIcon kind="vault" className="ui-icon text-[#48608f]" />
            Collectibles
          </h2>
          {needsOnboarding ? (
            <p className="mt-3 text-sm text-[#6074a0]">
              Finish onboarding first to unlock filtering, equip actions, and preview.
            </p>
          ) : null}

          {!needsOnboarding && starterAvatars.length > 0 ? (
            <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#6074a0]">
                Avatar slot (backend synced)
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
                const isPreviewed = previewItemId === item.id;
                return (
                  <article
                    key={item.id}
                    className="mt-3 rounded-xl border border-[#dce6ff] bg-white/85 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#2f4a7f]">{item.label}</p>
                        <p className="mt-1 text-xs text-[#6074a0]">{item.key}</p>
                      </div>
                      <span className="rounded-full bg-[#eef4ff] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#4b648f]">
                        {item.source}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#516a98]">
                      <span className="rounded-full bg-[#f2f6ff] px-2 py-1">{slotLabel(item.slot)}</span>
                      <span className="rounded-full bg-[#f2f6ff] px-2 py-1">{item.rarity}</span>
                      <span className="rounded-full bg-[#f2f6ff] px-2 py-1">{item.season}</span>
                      <span className="rounded-full bg-[#f2f6ff] px-2 py-1">
                        {formatShortDate(item.obtainedAt)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewItemId(item.id)}
                        className={`min-h-11 rounded-lg px-3 py-2 text-xs font-semibold ${
                          isPreviewed
                            ? "bg-[#e7f2ff] text-[#2e4f84]"
                            : "bg-white text-[#445e8f]"
                        }`}
                      >
                        {isPreviewed ? "Previewing" : "Preview"}
                      </button>
                      <button
                        type="button"
                        onClick={() => equipCollectible(item)}
                        disabled={item.slot === "avatar" && (!authSessionToken || isSwitchingAvatar)}
                        className="min-h-11 rounded-lg bg-gradient-to-r from-[#c7efff] to-[#d6d8ff] px-3 py-2 text-xs font-semibold text-[#294578] disabled:opacity-60"
                      >
                        {isEquipped ? "Equipped" : "Apply"}
                      </button>
                    </div>
                  </article>
                );
              })
            : null}

          {!needsOnboarding && filteredCollectibles.length === 0 ? (
            <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-4 text-sm text-[#6074a0]">
              No collectibles match current filters. Try clearing slot/rarity/season filters.
            </div>
          ) : null}

          {!needsOnboarding && !isLoading && !errorMessage && collectibles.length === 0 ? (
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
                  : "We couldn't open your rewards inventory right now."}
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
