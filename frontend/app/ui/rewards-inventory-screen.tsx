"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
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

function getAvatarGlyph(avatarLabel: string): string {
  const source = avatarLabel.trim();
  const cleaned = source.replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return cleaned.slice(0, 2).toUpperCase() || "BD";
}

function createAvatarBubbleTone(seed: string): {
  base: string;
  highlight: string;
  glow: string;
} {
  const hash = Array.from(seed).reduce((acc, char, index) => {
    return (acc + char.charCodeAt(0) * (index + 13)) % 360;
  }, 0);
  const hue = 180 + (hash % 120);
  return {
    base: `hsl(${hue} 85% 84%)`,
    highlight: `hsl(${(hue + 24) % 360} 90% 89%)`,
    glow: `hsla(${hue} 85% 68% / 0.42)`,
  };
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
  const [pressedAvatarId, setPressedAvatarId] = useState<string | null>(null);
  const [isSwitchingAvatar, setIsSwitchingAvatar] = useState(false);
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
            Your unlocked BubbleDrop collectibles and cosmetics appear here after confirmed rewards.
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
            Avatar styles
          </h2>
          <p className="mt-2 text-xs text-[#6074a0]">
            Starter avatars stay unlocked and can be switched anytime from this collection section.
          </p>
          {!needsOnboarding && starterAvatars.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {starterAvatars.map((avatar) => {
                const isSelected = selectedAvatarId === avatar.id;
                const avatarTone = createAvatarBubbleTone(avatar.id);
                const avatarGlyphPreview = getAvatarGlyph(avatar.label);
                return (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => void onSelectAvatar(avatar.id)}
                    onPointerDown={() => setPressedAvatarId(avatar.id)}
                    onPointerUp={() => setPressedAvatarId((current) => (current === avatar.id ? null : current))}
                    onPointerLeave={() => setPressedAvatarId((current) => (current === avatar.id ? null : current))}
                    onPointerCancel={() => setPressedAvatarId((current) => (current === avatar.id ? null : current))}
                    disabled={isSwitchingAvatar || !authSessionToken}
                    className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-all ${
                      isSelected
                        ? "border-[#8fc9ff] bg-gradient-to-r from-[#dff6ff] to-[#ece2ff] text-[#284679] shadow-[0_10px_24px_rgba(120,167,241,0.25)]"
                        : "border-[#dce6ff] bg-white/80 text-[#3c588b]"
                    } disabled:opacity-60`}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={`avatar-bubble-preview ${
                          pressedAvatarId === avatar.id
                            ? "avatar-bubble-touch"
                            : ""
                        }`}
                        style={
                          {
                            "--avatar-base": avatarTone.base,
                            "--avatar-highlight": avatarTone.highlight,
                            "--avatar-glow": avatarTone.glow,
                          } as CSSProperties
                        }
                      >
                        <span className="avatar-bubble-liquid" />
                        <span className="avatar-bubble-glyph">{avatarGlyphPreview}</span>
                      </span>
                      <span className="block">
                        <span className="block">{avatar.label}</span>
                        <span className="mt-1 block text-[11px] uppercase tracking-[0.12em] text-[#6d82ad]">
                          {isSelected ? "Equipped" : "Tap to equip"}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : !needsOnboarding ? (
            <p className="mt-3 text-sm text-[#6074a0]">
              Starter avatars unavailable right now.
            </p>
          ) : (
            <p className="mt-3 text-sm text-[#6074a0]">
              Finish onboarding first to unlock avatar switching.
            </p>
          )}
        </section>

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#30466f]">
            <UnifiedIcon kind="nft" className="ui-icon text-[#48608f]" />
            NFT ownerships
          </h2>
          {needsOnboarding ? (
            <p className="mt-3 text-sm text-[#6074a0]">
              Your collection will appear after onboarding is complete.
            </p>
          ) : null}
          {inventory?.nfts.length ? (
            inventory.nfts.map((nft) => (
              <article key={nft.id} className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-3">
                <p className="text-sm font-semibold text-[#2f4a7f]">
                  {nft.label} ({nft.tier})
                </p>
                <p className="mt-1 text-xs text-[#6074a0]">{nft.key}</p>
              </article>
            ))
          ) : (
            <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-4 text-sm text-[#6074a0]">
              No NFTs unlocked yet. Rare session rewards will show up here once they are confirmed.
            </div>
          )}
        </section>

        <section className={`bubble-card p-4 ${needsOnboarding ? "opacity-60" : ""}`}>
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#30466f]">
            <UnifiedIcon kind="cosmetic" className="ui-icon text-[#48608f]" />
            Cosmetic unlocks
          </h2>
          {needsOnboarding ? (
            <p className="mt-3 text-sm text-[#6074a0]">
              Cosmetic rewards will appear after onboarding is complete.
            </p>
          ) : null}
          {inventory?.cosmetics.length ? (
            inventory.cosmetics.map((cosmetic) => (
              <article key={cosmetic.id} className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-3">
                <p className="text-sm font-semibold text-[#2f4a7f]">{cosmetic.label}</p>
                <p className="mt-1 text-xs text-[#6074a0]">{cosmetic.key}</p>
              </article>
            ))
          ) : (
            <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-4 text-sm text-[#6074a0]">
              No cosmetics unlocked yet. Keep playing to grow your BubbleDrop style set.
            </div>
          )}
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
