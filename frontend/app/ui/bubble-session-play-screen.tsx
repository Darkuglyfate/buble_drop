"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useAccount } from "wagmi";
import { captureAnalyticsEvent } from "../analytics";
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
import type { ProfileStyleRarity } from "./profile-style-rarity";

const SESSION_DURATION_SECONDS = 10 * 60;
const MIN_SESSION_SECONDS_FOR_COMPLETION = 5 * 60;
const ACTIVE_SECONDS_FOR_COMPLETION_BONUS = 3 * 60;
const ACTIVE_SECONDS_PER_TAP = 12;
const TAP_FEEDBACK_XP_PER_UNIT = 12;
const BUBBLE_POP_DURATION_MS = 260;
const BUBBLE_RESPAWN_DELAY_MS = 440;
const BUBBLE_SPAWN_DURATION_MS = 320;
const BUBBLE_DEFORM_DURATION_MS = 132;
const BUBBLE_COLLISION_SOLVER_PASSES = 5;
const BUBBLE_COLLISION_PENETRATION_SLOP_PX = 1.25;
const BUBBLE_COLLISION_CORRECTION_PERCENT = 0.94;
const BUBBLE_COLLISION_RESTITUTION = 0.24;
const BUBBLE_COLLISION_DEFORM_THRESHOLD_PX = 7;
const BUBBLE_SPAWN_PADDING_PX = 14;
const SESSION_REWARD_BUBBLES_XP = 30;
const SESSION_COMPLETION_BONUS_XP = 20;
const SESSION_ACTIVE_PLAY_XP_MAX = 20;
const SESSION_ACTIVE_SECONDS_XP_CAP = 10 * 60;
const COMBO_WINDOW_MS = 1500;
const FEATURED_COMBO_TARGET = 5;
const ACTIVE_PLAY_BUBBLE_COUNT = 18;
const DECORATIVE_STANDARD_BUBBLES = [
  { top: "18%", left: "14%", size: "3.25rem" },
  { top: "26%", left: "76%", size: "4.5rem" },
  { top: "44%", left: "10%", size: "2.75rem" },
  { top: "58%", left: "82%", size: "3rem" },
  { top: "70%", left: "18%", size: "4rem" },
] as const;
const DECORATIVE_XP_BUBBLES = [
  { top: "22%", left: "58%", size: "1.4rem" },
  { top: "38%", left: "30%", size: "1.1rem" },
  { top: "62%", left: "64%", size: "1.3rem" },
] as const;
const DECORATIVE_PREMIUM_BUBBLES = [
  { top: "34%", left: "84%", size: "2rem" },
  { top: "64%", left: "40%", size: "2.4rem" },
] as const;
const POP_SPARKLE_OFFSETS = [
  { xRem: -1.05, yRem: -0.7, scale: 0.28 },
  { xRem: 0.98, yRem: -0.9, scale: 0.22 },
  { xRem: -0.82, yRem: 0.84, scale: 0.18 },
  { xRem: 1.08, yRem: 0.68, scale: 0.24 },
] as const;
const COMBO_BURST_TIER_CONFIG = [
  { combo: 3, label: "Combo rise", accent: "x3", hue: 198, scale: 1 },
  { combo: 5, label: "Flow locked", accent: "x5", hue: 286, scale: 1.16 },
  { combo: 8, label: "Pop frenzy", accent: "x8", hue: 38, scale: 1.32 },
] as const;
const FUN_OVERLAY_ITEM_CONFIG = [
  { kind: "pearl-shard", hue: 196, label: "Pearl shard" },
  { kind: "xp-crystal", hue: 42, label: "XP crystal" },
  { kind: "season-sigil", hue: 318, label: "Season sigil" },
] as const;
const HELPER_THEME_CONFIG = [
  { theme: "pearlDrone", accentHue: 196, label: "Pearl drone" },
  { theme: "prismSkiff", accentHue: 282, label: "Prism skiff" },
  { theme: "haloRay", accentHue: 38, label: "Halo ray" },
] as const;
const DEFAULT_PLAYFIELD_WIDTH_PX = 390;
const DEFAULT_PLAYFIELD_HEIGHT_PX = 760;
const BUBBLE_MAX_FRAME_DT_MS = 32;
const PLAYFIELD_ASSIST_EXTRA_PX_SMALL = 18;
const PLAYFIELD_ASSIST_EXTRA_PX_MEDIUM = 14;
const PLAYFIELD_ASSIST_EXTRA_PX_LARGE = 10;
const PLAYFIELD_TOUCH_CUE_DURATION_MS = 620;
const COMBO_BURST_DURATION_MS = 980;
const FUN_OVERLAY_ITEM_DURATION_MS = 1180;
const ANTICIPATION_POP_DURATION_MS = 220;
const HELPER_EVENT_INITIAL_MIN_DELAY_MS = 18_000;
const HELPER_EVENT_INITIAL_MAX_DELAY_MS = 32_000;
const HELPER_EVENT_REPEAT_MIN_DELAY_MS = 55_000;
const HELPER_EVENT_REPEAT_MAX_DELAY_MS = 95_000;
const HELPER_EVENT_ENTER_DURATION_MS = 1_320;
const HELPER_EVENT_FIRE_DURATION_MS = 2_420;
const HELPER_EVENT_EXIT_DURATION_MS = 1_420;
const HELPER_SHOT_INTERVAL_MS = 440;
const HELPER_SHOT_CUE_DURATION_MS = 1_080;
const HELPER_SHOT_LEAD_IN_MS = 320;
const FINISH_CELEBRATION_DURATION_MS = 2950;
const FINISH_CELEBRATION_BLOOM_BUBBLES = [
  { x: "-12.8rem", y: "-7.2rem", size: "6.2rem", hue: 196, alpha: 0.84, delayMs: 0, durationMs: 1180 },
  { x: "-8.1rem", y: "5.4rem", size: "5.3rem", hue: 318, alpha: 0.78, delayMs: 120, durationMs: 1100 },
  { x: "-3.6rem", y: "-10.6rem", size: "4.7rem", hue: 42, alpha: 0.82, delayMs: 220, durationMs: 980 },
  { x: "4.9rem", y: "-8.8rem", size: "5.5rem", hue: 278, alpha: 0.8, delayMs: 170, durationMs: 1080 },
  { x: "9.8rem", y: "4.9rem", size: "6rem", hue: 332, alpha: 0.8, delayMs: 70, durationMs: 1220 },
  { x: "1.6rem", y: "10.9rem", size: "4.9rem", hue: 188, alpha: 0.74, delayMs: 260, durationMs: 1020 },
] as const;
const FINISH_CELEBRATION_PARTICLES = [
  { x: "-8.2rem", y: "-4.6rem", size: "0.56rem", delayMs: 840, hue: 44 },
  { x: "-6rem", y: "-6.4rem", size: "0.42rem", delayMs: 940, hue: 194 },
  { x: "-2.7rem", y: "-7.5rem", size: "0.36rem", delayMs: 1020, hue: 330 },
  { x: "2.8rem", y: "-7.1rem", size: "0.42rem", delayMs: 1100, hue: 278 },
  { x: "6.4rem", y: "-4.8rem", size: "0.54rem", delayMs: 920, hue: 34 },
  { x: "8.1rem", y: "-0.8rem", size: "0.34rem", delayMs: 1200, hue: 192 },
  { x: "6rem", y: "4.5rem", size: "0.46rem", delayMs: 1260, hue: 316 },
  { x: "2rem", y: "6.8rem", size: "0.52rem", delayMs: 1140, hue: 42 },
  { x: "-3.4rem", y: "7rem", size: "0.38rem", delayMs: 1220, hue: 266 },
  { x: "-6.5rem", y: "4.2rem", size: "0.5rem", delayMs: 980, hue: 204 },
  { x: "-8.4rem", y: "0.4rem", size: "0.34rem", delayMs: 1160, hue: 332 },
] as const;
const FINISH_CELEBRATION_RESIDUE = [
  { x: "-5.8rem", y: "-1.8rem", size: "1rem", delayMs: 1380, durationMs: 1450, hue: 195 },
  { x: "-2rem", y: "2.8rem", size: "0.8rem", delayMs: 1480, durationMs: 1360, hue: 318 },
  { x: "3rem", y: "-2.6rem", size: "1.08rem", delayMs: 1420, durationMs: 1520, hue: 42 },
  { x: "6.1rem", y: "1.7rem", size: "0.74rem", delayMs: 1540, durationMs: 1320, hue: 276 },
  { x: "-7.1rem", y: "2.9rem", size: "0.68rem", delayMs: 1600, durationMs: 1240, hue: 332 },
] as const;

type SessionStartResponse = {
  sessionId: string;
  profileId: string;
  startedAt: string;
};

type BubbleSizeTier = "small" | "medium" | "large";

type ActivePlayBubble = {
  id: number;
  top: number;
  left: number;
  sizeRem: number;
  sizeTier: BubbleSizeTier;
  hue: number;
  alpha: number;
  driftMs: number;
  wobbleDeg: number;
  roundness: number;
  scale: number;
  currentFactor: number;
  velocityX: number;
  velocityY: number;
  deformUntilMs: number;
  deformRotationDeg: number;
  deformStretch: number;
  isBonus: boolean;
  nextShiftAtMs: number;
  poppedUntilMs: number;
  respawnAtMs: number;
  spawnedUntilMs: number;
};

type PopBurst = {
  id: number;
  xPercent: number;
  yPercent: number;
  hue: number;
  sizeRem: number;
  isBonus: boolean;
  comboTier: number | null;
  source: "user" | "helper";
};

type ComboBurst = {
  id: number;
  xPercent: number;
  yPercent: number;
  label: string;
  accent: string;
  hue: number;
  scale: number;
};

type FunOverlayItem = {
  id: number;
  xPercent: number;
  yPercent: number;
  kind: "pearl-shard" | "xp-crystal" | "season-sigil";
  hue: number;
  label: string;
};

type PlayfieldTouchCue = {
  id: number;
  topPercent: number;
  leftPercent: number;
  tone: "assist" | "miss" | "helper";
};

type HelperTheme = (typeof HELPER_THEME_CONFIG)[number]["theme"];
type HelperPhase = "entering" | "firing" | "exiting";

type HelperEvent = {
  id: number;
  theme: HelperTheme;
  label: string;
  accentHue: number;
  phase: HelperPhase;
  anchorXPercent: number;
  anchorYPercent: number;
  startXPercent: number;
  startYPercent: number;
  exitXPercent: number;
  exitYPercent: number;
  targetBubbleIds: number[];
};

type HelperShotCue = {
  id: number;
  theme: HelperTheme;
  accentHue: number;
  originXPercent: number;
  originYPercent: number;
  targetXPercent: number;
  targetYPercent: number;
  beamLengthPx: number;
  beamAngleDeg: number;
};

type SkinRarity = ProfileStyleRarity;
type SkinLayout = "diagonal" | "split" | "frame";

type SkinRewardCard = {
  id: string;
  key: string;
  source: "nft" | "cosmetic";
  rarity: SkinRarity;
  layout: SkinLayout;
  variantLabel: string;
};

type RareRewardTokenOutcome = {
  tokenSymbol: string;
  tokenAmountAwarded: string;
  weeklyTicketsIssued: number;
  seasonId: string;
  weekStartDate: string;
};

type RareRewardCollectibleOutcome = {
  id: string;
  key: string;
};

type RareRewardOutcome = {
  tokenSymbolAwarded: string | null;
  tokenAmountAwarded: string;
  weeklyTicketsIssued: number;
  nftIdsAwarded: string[];
  cosmeticIdsAwarded: string[];
  tokenReward: RareRewardTokenOutcome | null;
  nftRewards: RareRewardCollectibleOutcome[];
  cosmeticRewards: RareRewardCollectibleOutcome[];
};

type SeasonProgress = {
  qualificationStatus: "locked" | "in_progress" | "qualified" | "paused" | "restored";
  eligibleAtSeasonEnd: boolean;
  streak: number;
  xp: number;
  activeSessions: number;
  requiredStreak: number;
  requiredXp: number;
  requiredActiveSessions: number;
};

type SessionCompleteResponse = {
  success: boolean;
  sessionId: string;
  profileId: string;
  endedAt: string;
  sessionDurationSeconds: number;
  activeSeconds: number;
  activePlayXp: number;
  completionBonusXp: number;
  xpAwarded: number;
  newStreak: number;
  rareAccessActive: boolean;
  grantedXp: number;
  totalXp: number;
  qualificationStatus: "locked" | "in_progress" | "qualified" | "paused" | "restored";
  rareRewardAccessActive: boolean;
  seasonProgress: SeasonProgress;
  rareRewardOutcome: RareRewardOutcome;
};

type EquipStyleResponse = {
  profileId: string;
  equippedStyle: {
    rewardId: string;
    rewardKey: string;
    rarity: SkinRarity;
    source: "nft" | "cosmetic";
    variant: string;
    appliedAt: string;
  };
};

async function fetchOnboardingStateForProfile(
  backendUrl: string,
  profileId: string,
): Promise<{ walletAddress: string; needsOnboarding: boolean } | null> {
  const payload = await fetchBackendProfileSummary(backendUrl, profileId);
  if (!payload) {
    return null;
  }

  return {
    walletAddress: payload.profileIdentity.walletAddress,
    needsOnboarding: payload.onboardingState.needsOnboarding,
  };
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDurationLabel(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function hasIssuedRareRewardOutcome(outcome: RareRewardOutcome): boolean {
  return !!outcome.tokenReward || outcome.nftRewards.length > 0 || outcome.cosmeticRewards.length > 0;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function hashValue(input: string): number {
  return Array.from(input).reduce((acc, char, index) => {
    return (acc + char.charCodeAt(0) * (index + 17)) % 10000;
  }, 0);
}

function getSkinRarityFromHash(hash: number): SkinRarity {
  const roll = hash % 100;
  if (roll < 40) {
    return "common";
  }
  if (roll < 58) {
    return "uncommon";
  }
  if (roll < 74) {
    return "rare";
  }
  if (roll < 90) {
    return "epic";
  }
  return "legendary";
}

function getSkinLayoutFromHash(hash: number): SkinLayout {
  const layoutIdx = hash % 3;
  if (layoutIdx === 0) {
    return "diagonal";
  }
  if (layoutIdx === 1) {
    return "split";
  }
  return "frame";
}

function getRarityIntensity(rarity: SkinRarity): string {
  if (rarity === "common") {
    return "1/5";
  }
  if (rarity === "uncommon") {
    return "2/5";
  }
  if (rarity === "rare") {
    return "3/5";
  }
  if (rarity === "epic") {
    return "4/5";
  }
  return "5/5";
}

function getDropStylePalette(rarity: SkinRarity): {
  shell: string;
  chip: string;
  glow: string;
} {
  if (rarity === "common") {
    return {
      shell: "from-[#3d4a69] to-[#2f3955]",
      chip: "bg-[#dce7ff] text-[#3b588f]",
      glow: "shadow-[0_14px_34px_rgba(0,0,0,0.24)]",
    };
  }
  if (rarity === "uncommon") {
    return {
      shell: "from-[#2d5560] to-[#2a4a58]",
      chip: "bg-[#d4f5f0] text-[#0d5c5c]",
      glow: "shadow-[0_14px_34px_rgba(64,180,170,0.22)]",
    };
  }
  if (rarity === "rare") {
    return {
      shell: "from-[#27477a] to-[#27507d]",
      chip: "bg-[#d5f0ff] text-[#125f89]",
      glow: "shadow-[0_14px_34px_rgba(70,164,220,0.24)]",
    };
  }
  if (rarity === "epic") {
    return {
      shell: "from-[#3f2f72] to-[#29426f]",
      chip: "bg-[#f1ddff] text-[#7040a8]",
      glow: "shadow-[0_14px_34px_rgba(164,114,255,0.3)]",
    };
  }
  return {
    shell: "from-[#6f4d2b] via-[#7e4b2d] to-[#6f3f1f]",
    chip: "bg-gradient-to-r from-[#fff2c5] to-[#ffd98a] text-[#6f4100]",
    glow: "shadow-[0_14px_34px_rgba(255,187,80,0.34)] ring-1 ring-[#ffe4aa]/70",
  };
}

function pickBubbleSizeTier(): BubbleSizeTier {
  const roll = Math.random();
  if (roll < 0.42) {
    return "small";
  }
  if (roll < 0.8) {
    return "medium";
  }
  return "large";
}

function pickBubbleZone(sizeTier: BubbleSizeTier): {
  topMin: number;
  topMax: number;
  leftMin: number;
  leftMax: number;
} {
  if (sizeTier === "small") {
    return Math.random() < 0.5
      ? { topMin: 18, topMax: 44, leftMin: 14, leftMax: 42 }
      : { topMin: 30, topMax: 68, leftMin: 58, leftMax: 86 };
  }
  if (sizeTier === "medium") {
    return Math.random() < 0.5
      ? { topMin: 22, topMax: 62, leftMin: 24, leftMax: 56 }
      : { topMin: 34, topMax: 78, leftMin: 46, leftMax: 78 };
  }
  return Math.random() < 0.5
    ? { topMin: 20, topMax: 54, leftMin: 52, leftMax: 84 }
    : { topMin: 48, topMax: 80, leftMin: 18, leftMax: 48 };
}

function getBubbleSpeedRange(sizeTier: BubbleSizeTier): [number, number] {
  if (sizeTier === "small") {
    return [28, 38];
  }
  if (sizeTier === "medium") {
    return [16, 24];
  }
  return [8, 14];
}

function getBubbleSteerWindow(sizeTier: BubbleSizeTier): [number, number] {
  if (sizeTier === "small") {
    return [760, 1700];
  }
  if (sizeTier === "medium") {
    return [1800, 3600];
  }
  return [3200, 5200];
}

function getBubbleMass(sizeRem: number): number {
  return Math.max(0.7, sizeRem * sizeRem * sizeRem * 0.028);
}

function getBubbleRadiusPx(sizeRem: number): number {
  return sizeRem * 8;
}

function clampPercent(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampBubblePosition(
  left: number,
  top: number,
  sizeRem: number,
  playfieldWidth: number,
  playfieldHeight: number,
): { left: number; top: number } {
  const radiusPx = getBubbleRadiusPx(sizeRem);
  const minLeft = (radiusPx / playfieldWidth) * 100;
  const maxLeft = 100 - minLeft;
  const minTop = (radiusPx / playfieldHeight) * 100;
  const maxTop = 100 - minTop;

  return {
    left: clampPercent(left, minLeft, maxLeft),
    top: clampPercent(top, minTop, maxTop),
  };
}

function getBubbleMaxSpeed(sizeTier: BubbleSizeTier): number {
  if (sizeTier === "small") {
    return 38;
  }
  if (sizeTier === "medium") {
    return 26;
  }
  return 17;
}

function clampBubbleVelocity(
  velocityX: number,
  velocityY: number,
  sizeTier: BubbleSizeTier,
): { velocityX: number; velocityY: number } {
  const speed = Math.hypot(velocityX, velocityY);
  const maxSpeed = getBubbleMaxSpeed(sizeTier);
  if (speed <= maxSpeed || speed === 0) {
    return { velocityX, velocityY };
  }

  const ratio = maxSpeed / speed;
  return {
    velocityX: velocityX * ratio,
    velocityY: velocityY * ratio,
  };
}

function getBubbleAssistRadiusPx(bubble: ActivePlayBubble): number {
  return (
    getBubbleRadiusPx(bubble.sizeRem) +
    (bubble.sizeTier === "small"
      ? PLAYFIELD_ASSIST_EXTRA_PX_SMALL
      : bubble.sizeTier === "medium"
        ? PLAYFIELD_ASSIST_EXTRA_PX_MEDIUM
        : PLAYFIELD_ASSIST_EXTRA_PX_LARGE)
  );
}

function getPlayfieldPercentPoint(
  playfieldRect: DOMRect,
  clientX: number,
  clientY: number,
): { leftPercent: number; topPercent: number } {
  return {
    leftPercent: clampPercent(((clientX - playfieldRect.left) / playfieldRect.width) * 100, 0, 100),
    topPercent: clampPercent(((clientY - playfieldRect.top) / playfieldRect.height) * 100, 0, 100),
  };
}

function getSpawnClearanceScore(
  left: number,
  top: number,
  sizeRem: number,
  existingBubbles: ActivePlayBubble[],
  playfieldWidth: number,
  playfieldHeight: number,
  ignoreId: number,
): number {
  const candidateRadiusPx = getBubbleRadiusPx(sizeRem);
  let closestClearancePx = Number.POSITIVE_INFINITY;

  for (const bubble of existingBubbles) {
    if (bubble.id === ignoreId) {
      continue;
    }

    const minDistancePx =
      candidateRadiusPx + getBubbleRadiusPx(bubble.sizeRem) + BUBBLE_SPAWN_PADDING_PX;
    const deltaXPx = ((bubble.left - left) / 100) * playfieldWidth;
    const deltaYPx = ((bubble.top - top) / 100) * playfieldHeight;
    const distancePx = Math.hypot(deltaXPx, deltaYPx);
    closestClearancePx = Math.min(closestClearancePx, distancePx - minDistancePx);
  }

  return closestClearancePx;
}

function findSafeBubbleSpawnPosition(input: {
  id: number;
  sizeRem: number;
  zone: ReturnType<typeof pickBubbleZone>;
  existingBubbles: ActivePlayBubble[];
  playfieldWidth: number;
  playfieldHeight: number;
}): { left: number; top: number } {
  let bestCandidate = clampBubblePosition(
    randomBetween(input.zone.leftMin, input.zone.leftMax),
    randomBetween(input.zone.topMin, input.zone.topMax),
    input.sizeRem,
    input.playfieldWidth,
    input.playfieldHeight,
  );
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const zone =
      attempt < 12
        ? input.zone
        : {
            topMin: 18,
            topMax: 82,
            leftMin: 12,
            leftMax: 88,
          };
    const candidate = clampBubblePosition(
      randomBetween(zone.leftMin, zone.leftMax),
      randomBetween(zone.topMin, zone.topMax),
      input.sizeRem,
      input.playfieldWidth,
      input.playfieldHeight,
    );
    const score = getSpawnClearanceScore(
      candidate.left,
      candidate.top,
      input.sizeRem,
      input.existingBubbles,
      input.playfieldWidth,
      input.playfieldHeight,
      input.id,
    );

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }

    if (score >= 0) {
      return candidate;
    }
  }

  return bestCandidate;
}

function createActivePlayBubble(
  id: number,
  previous?: ActivePlayBubble,
  existingBubbles: ActivePlayBubble[] = [],
  playfieldWidth = DEFAULT_PLAYFIELD_WIDTH_PX,
  playfieldHeight = DEFAULT_PLAYFIELD_HEIGHT_PX,
): ActivePlayBubble {
  const now = Date.now();
  const sizeTier =
    previous?.sizeTier && Math.random() < 0.82 ? previous.sizeTier : pickBubbleSizeTier();
  const zone = pickBubbleZone(sizeTier);
  const sizeRange =
    sizeTier === "small"
      ? [1.95, 2.95]
      : sizeTier === "medium"
        ? [3.35, 4.5]
        : [4.95, 6.55];
  const driftRange =
    sizeTier === "small"
      ? [900, 1850]
      : sizeTier === "medium"
        ? [2500, 4300]
        : [4600, 7600];
  const scaleRange =
    sizeTier === "small"
      ? [0.92, 1.18]
      : sizeTier === "medium"
        ? [0.97, 1.08]
        : [0.985, 1.03];
  const wobbleRange =
    sizeTier === "small"
      ? [-22, 22]
      : sizeTier === "medium"
        ? [-9, 9]
        : [-4, 4];
  const bonusChance =
    sizeTier === "large" ? 0.24 : sizeTier === "medium" ? 0.16 : 0.11;
  const [speedMin, speedMax] = getBubbleSpeedRange(sizeTier);
  const [steerMin, steerMax] = getBubbleSteerWindow(sizeTier);
  const angle = randomBetween(0, Math.PI * 2);
  const speed = randomBetween(speedMin, speedMax);
  const sizeRem = randomBetween(sizeRange[0], sizeRange[1]);
  const spawnPosition = findSafeBubbleSpawnPosition({
    id,
    sizeRem,
    zone,
    existingBubbles,
    playfieldWidth,
    playfieldHeight,
  });

  return {
    id,
    top: spawnPosition.top,
    left: spawnPosition.left,
    sizeRem,
    sizeTier,
    hue:
      sizeTier === "small"
        ? randomBetween(196, 288)
        : sizeTier === "medium"
          ? randomBetween(208, 312)
          : randomBetween(220, 330),
    alpha:
      sizeTier === "small"
        ? randomBetween(0.4, 0.56)
        : sizeTier === "medium"
          ? randomBetween(0.46, 0.66)
          : randomBetween(0.54, 0.76),
    driftMs: Math.round(randomBetween(driftRange[0], driftRange[1])),
    wobbleDeg: randomBetween(wobbleRange[0], wobbleRange[1]),
    roundness: randomBetween(40, 62),
    scale: randomBetween(scaleRange[0], scaleRange[1]),
    currentFactor:
      sizeTier === "small" ? 1.82 : sizeTier === "medium" ? 1.08 : 0.6,
    velocityX: Math.cos(angle) * speed,
    velocityY:
      Math.sin(angle) * speed * (sizeTier === "small" ? 1.24 : sizeTier === "medium" ? 1.02 : 0.86),
    deformUntilMs: 0,
    deformRotationDeg: 0,
    deformStretch: 0,
    isBonus: Math.random() < bonusChance,
    nextShiftAtMs: now + randomBetween(steerMin, steerMax),
    poppedUntilMs: 0,
    respawnAtMs: 0,
    spawnedUntilMs: 0,
  };
}

function createActivePlayBubbleSet(): ActivePlayBubble[] {
  const created: ActivePlayBubble[] = [];
  for (let index = 0; index < ACTIVE_PLAY_BUBBLE_COUNT; index += 1) {
    created.push(
      createActivePlayBubble(
        index,
        undefined,
        created,
        DEFAULT_PLAYFIELD_WIDTH_PX,
        DEFAULT_PLAYFIELD_HEIGHT_PX,
      ),
    );
  }
  return created;
}

function normalizeWalletAddress(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function BubbleSessionPlayScreen() {
  const runtimeContext = useBubbleDropRuntime();
  const { address } = useAccount();
  const backendUrl = BUBBLEDROP_API_BASE;
  const profileId = runtimeContext.profileId;
  const [walletAddress, setWalletAddress] = useState<string | null>(
    runtimeContext.walletAddress,
  );
  const [sessionStartedAtMs, setSessionStartedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isActive, setIsActive] = useState(false);
  const [activeTapCount, setActiveTapCount] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [backendSessionId, setBackendSessionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [lastTapFeedbackAtMs, setLastTapFeedbackAtMs] = useState<number | null>(null);
  const [lastTapAtMs, setLastTapAtMs] = useState<number | null>(null);
  const [tapCombo, setTapCombo] = useState(0);
  const [bestTapCombo, setBestTapCombo] = useState(0);
  const [lastTapRewardXp, setLastTapRewardXp] = useState(TAP_FEEDBACK_XP_PER_UNIT);
  const [tapFeedbackPoint, setTapFeedbackPoint] = useState<{
    topPercent: number;
    leftPercent: number;
  } | null>(null);
  const [lastTapComboValue, setLastTapComboValue] = useState(0);
  const [playfieldTouchCue, setPlayfieldTouchCue] = useState<PlayfieldTouchCue | null>(null);
  const [activePlayBubbles, setActivePlayBubbles] = useState<ActivePlayBubble[]>(
    () => createActivePlayBubbleSet(),
  );
  const [popBursts, setPopBursts] = useState<PopBurst[]>([]);
  const [comboBursts, setComboBursts] = useState<ComboBurst[]>([]);
  const [funOverlayItems, setFunOverlayItems] = useState<FunOverlayItem[]>([]);
  const [helperEvent, setHelperEvent] = useState<HelperEvent | null>(null);
  const [helperShotCues, setHelperShotCues] = useState<HelperShotCue[]>([]);
  const [helperScheduleTick, setHelperScheduleTick] = useState(0);
  const [completionResult, setCompletionResult] = useState<SessionCompleteResponse | null>(null);
  const [finishCelebrationVisible, setFinishCelebrationVisible] = useState(false);
  const [postTimerChoiceVisible, setPostTimerChoiceVisible] = useState(false);
  const [equippedSkinRewardId, setEquippedSkinRewardId] = useState<string | null>(null);
  const [inventorySavedRewardIds, setInventorySavedRewardIds] = useState<string[]>([]);
  const [lastApplyMoment, setLastApplyMoment] = useState<{
    rewardId: string;
    rewardKey: string;
    rarity: SkinRarity;
    source: "nft" | "cosmetic";
  } | null>(null);
  const playfieldRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const activePlayBubblesRef = useRef<ActivePlayBubble[]>(activePlayBubbles);
  const helperEventRef = useRef<HelperEvent | null>(null);
  const helperHasAppearedRef = useRef(false);
  const finishCelebrationTimeoutRef = useRef<number | null>(null);
  const helperTimeoutsRef = useRef<number[]>([]);
  const hasShownMinimumCelebrationRef = useRef(false);
  const hasShownTimerChoiceRef = useRef(false);
  const popAudioContextRef = useRef<AudioContext | null>(null);
  const popAudioUnavailableRef = useRef(false);
  const playfieldMetricsRef = useRef({
    width: DEFAULT_PLAYFIELD_WIDTH_PX,
    height: DEFAULT_PLAYFIELD_HEIGHT_PX,
  });
  const [authSession, setAuthSession] =
    useState<BubbleDropFrontendSignInSession | null>(null);
  const [isResolvingOnboardingState, setIsResolvingOnboardingState] =
    useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [headerHeightPx, setHeaderHeightPx] = useState(116);
  const [footerHeightPx, setFooterHeightPx] = useState(156);
  const connectedWalletAddress = normalizeWalletAddress(address);
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const effectiveProfileId = profileId;
  const effectiveWalletAddress = walletAddress;
  const normalizedAuthSessionAddress = normalizeWalletAddress(authSession?.address);
  const authSessionMatchesRuntimeWallet =
    !normalizedWalletAddress ||
    normalizedAuthSessionAddress === normalizedWalletAddress;
  const authSessionMatchesConnectedWallet =
    !connectedWalletAddress || normalizedAuthSessionAddress === connectedWalletAddress;
  const authSessionToken =
    authSession &&
    authSessionMatchesRuntimeWallet &&
    authSessionMatchesConnectedWallet
      ? authSession.authSessionToken
      : null;

  const playPopSound = (isBonus: boolean) => {
    if (typeof window === "undefined" || popAudioUnavailableRef.current) {
      return;
    }
    try {
      const contextCandidate = window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextCtor = window.AudioContext || contextCandidate.webkitAudioContext;
      if (!AudioContextCtor) {
        popAudioUnavailableRef.current = true;
        return;
      }

      let audioContext = popAudioContextRef.current;
      if (!audioContext) {
        audioContext = new AudioContextCtor();
        popAudioContextRef.current = audioContext;
      }
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }

      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = isBonus ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(isBonus ? 780 : 560, now);
      oscillator.frequency.exponentialRampToValueAtTime(
        isBonus ? 280 : 180,
        now + (isBonus ? 0.16 : 0.12),
      );

      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(isBonus ? 0.08 : 0.06, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + (isBonus ? 0.2 : 0.14));

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + (isBonus ? 0.22 : 0.16));
    } catch {
      popAudioUnavailableRef.current = true;
    }
  };

  const clearHelperTimeouts = () => {
    helperTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    helperTimeoutsRef.current = [];
  };

  useEffect(() => {
    activePlayBubblesRef.current = activePlayBubbles;
  }, [activePlayBubbles]);

  useEffect(() => {
    helperEventRef.current = helperEvent;
  }, [helperEvent]);

  useEffect(() => {
    setAuthSession(
      getSmokeSignInSessionFromCurrentUrl() ??
        loadBubbleDropFrontendSignInSession(),
    );
  }, [connectedWalletAddress, walletAddress]);

  useEffect(() => {
    return () => {
      if (finishCelebrationTimeoutRef.current !== null) {
        window.clearTimeout(finishCelebrationTimeoutRef.current);
        finishCelebrationTimeoutRef.current = null;
      }
      clearHelperTimeouts();
      const currentAudioContext = popAudioContextRef.current;
      if (currentAudioContext) {
        void currentAudioContext.close();
      }
      popAudioContextRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const observers: ResizeObserver[] = [];
    const observeElement = (
      element: Element | null,
      onMeasure: (height: number) => void,
    ) => {
      if (!element) {
        return;
      }
      const measure = () => {
        const height = Math.round(element.getBoundingClientRect().height);
        if (height > 0) {
          onMeasure(height);
        }
      };
      measure();
      const observer = new ResizeObserver(() => {
        measure();
      });
      observer.observe(element);
      observers.push(observer);
    };

    observeElement(headerRef.current, setHeaderHeightPx);
    observeElement(footerRef.current, setFooterHeightPx);

    const playfieldElement = playfieldRef.current;
    if (playfieldElement) {
      const measurePlayfield = () => {
        const bounds = playfieldElement.getBoundingClientRect();
        if (bounds.width > 0 && bounds.height > 0) {
          playfieldMetricsRef.current = {
            width: bounds.width,
            height: bounds.height,
          };
        }
      };
      measurePlayfield();
      const playfieldObserver = new ResizeObserver(() => {
        measurePlayfield();
      });
      playfieldObserver.observe(playfieldElement);
      observers.push(playfieldObserver);
    }

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [isActive]);

  useEffect(() => {
    setIsResolvingOnboardingState(true);

    if (profileId) {
      void (async () => {
        const onboardingState = await fetchOnboardingStateForProfile(
          backendUrl,
          profileId,
        );
        if (!onboardingState) {
          setNeedsOnboarding(false);
          setActionMessage("We couldn't load your session access right now.");
          setIsResolvingOnboardingState(false);
          return;
        }

        runtimeContext.setAppContext({
          profileId,
          walletAddress: onboardingState.walletAddress,
        });
        setWalletAddress(onboardingState.walletAddress);
        setNeedsOnboarding(onboardingState.needsOnboarding);
        setIsResolvingOnboardingState(false);
      })();
      return;
    }

    setNeedsOnboarding(false);
    setIsResolvingOnboardingState(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, profileId]);

  useEffect(() => {
    if (!isActive || sessionStartedAtMs === null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isActive, sessionStartedAtMs]);

  useEffect(() => {
    if (!isActive || sessionCompleted) {
      return;
    }

    let animationFrameId = 0;
    let previousFrameAt = performance.now();

    const tick = (frameAt: number) => {
      const frameDeltaMs = Math.min(BUBBLE_MAX_FRAME_DT_MS, Math.max(8, frameAt - previousFrameAt));
      previousFrameAt = frameAt;
      const now = Date.now();
      const playfieldWidth = playfieldMetricsRef.current.width;
      const playfieldHeight = playfieldMetricsRef.current.height;
      const dt = frameDeltaMs / 1000;
      const currentDriftX = Math.sin(now / 1800) * 4.6;
      const currentDriftY = Math.cos(now / 2500) * 2.6;

      setActivePlayBubbles((current) => {
        const prepared = current.map((bubble) => {
          if (bubble.poppedUntilMs > now) {
            return bubble;
          }

          if (bubble.respawnAtMs > now) {
            return bubble;
          }

          if (bubble.respawnAtMs > 0) {
            const existingBubbles = current.filter(
              (candidate) =>
                candidate.id !== bubble.id &&
                candidate.poppedUntilMs <= now &&
                candidate.respawnAtMs <= now,
            );
            return {
              ...createActivePlayBubble(
                bubble.id,
                bubble,
                existingBubbles,
                playfieldWidth,
                playfieldHeight,
              ),
              respawnAtMs: 0,
              spawnedUntilMs: now + BUBBLE_SPAWN_DURATION_MS,
            };
          }

          let velocityX = bubble.velocityX;
          let velocityY = bubble.velocityY;
          let nextShiftAtMs = bubble.nextShiftAtMs;
          if (bubble.nextShiftAtMs <= now) {
            const [steerMin, steerMax] = getBubbleSteerWindow(bubble.sizeTier);
            const baseSpeed = Math.hypot(velocityX, velocityY);
            const steerAngle =
              Math.atan2(velocityY, velocityX) +
              randomBetween(
                bubble.sizeTier === "small" ? -1.05 : bubble.sizeTier === "medium" ? -0.56 : -0.28,
                bubble.sizeTier === "small" ? 1.05 : bubble.sizeTier === "medium" ? 0.56 : 0.28,
              );
            const nextSpeed = baseSpeed * randomBetween(0.98, 1.18);
            velocityX = Math.cos(steerAngle) * nextSpeed;
            velocityY = Math.sin(steerAngle) * nextSpeed;
            nextShiftAtMs = now + randomBetween(steerMin, steerMax);
          }

          const radiusPx = getBubbleRadiusPx(bubble.sizeRem);
          const minLeft = (radiusPx / playfieldWidth) * 100;
          const maxLeft = 100 - minLeft;
          const minTop = (radiusPx / playfieldHeight) * 100;
          const maxTop = 100 - minTop;

          let left = bubble.left + (velocityX + currentDriftX * bubble.currentFactor) * dt;
          let top = bubble.top + (velocityY + currentDriftY * bubble.currentFactor) * dt;

          if (left < minLeft) {
            left = minLeft;
            velocityX = Math.abs(velocityX);
          } else if (left > maxLeft) {
            left = maxLeft;
            velocityX = -Math.abs(velocityX);
          }

          if (top < minTop) {
            top = minTop;
            velocityY = Math.abs(velocityY);
          } else if (top > maxTop) {
            top = maxTop;
            velocityY = -Math.abs(velocityY);
          }

          const clampedVelocity = clampBubbleVelocity(velocityX, velocityY, bubble.sizeTier);
          const clampedPosition = clampBubblePosition(
            left,
            top,
            bubble.sizeRem,
            playfieldWidth,
            playfieldHeight,
          );

          return {
            ...bubble,
            left: clampedPosition.left,
            top: clampedPosition.top,
            velocityX: clampedVelocity.velocityX,
            velocityY: clampedVelocity.velocityY,
            nextShiftAtMs,
            spawnedUntilMs: bubble.spawnedUntilMs > now ? bubble.spawnedUntilMs : 0,
            deformUntilMs: bubble.deformUntilMs > now ? bubble.deformUntilMs : 0,
            deformRotationDeg: bubble.deformUntilMs > now ? bubble.deformRotationDeg : 0,
            deformStretch: bubble.deformUntilMs > now ? bubble.deformStretch : 0,
          };
        });

        for (let solverPass = 0; solverPass < BUBBLE_COLLISION_SOLVER_PASSES; solverPass += 1) {
          for (let firstIdx = 0; firstIdx < prepared.length; firstIdx += 1) {
            const first = prepared[firstIdx];
            if (
              first.poppedUntilMs > now ||
              first.respawnAtMs > now ||
              first.spawnedUntilMs > now
            ) {
              continue;
            }

            for (let secondIdx = firstIdx + 1; secondIdx < prepared.length; secondIdx += 1) {
              const second = prepared[secondIdx];
              if (
                second.poppedUntilMs > now ||
                second.respawnAtMs > now ||
                second.spawnedUntilMs > now
              ) {
                continue;
              }

              const deltaXPx = ((second.left - first.left) / 100) * playfieldWidth;
              const deltaYPx = ((second.top - first.top) / 100) * playfieldHeight;
              const distancePx = Math.hypot(deltaXPx, deltaYPx) || 0.0001;
              const combinedRadiusPx =
                getBubbleRadiusPx(first.sizeRem) + getBubbleRadiusPx(second.sizeRem);
              if (distancePx >= combinedRadiusPx) {
                continue;
              }

              const normalX = deltaXPx / distancePx;
              const normalY = deltaYPx / distancePx;
              const overlapPx = combinedRadiusPx - distancePx;
              const correctionPx =
                Math.max(0, overlapPx - BUBBLE_COLLISION_PENETRATION_SLOP_PX) *
                BUBBLE_COLLISION_CORRECTION_PERCENT;
              if (correctionPx <= 0) {
                continue;
              }

              const firstMass = getBubbleMass(first.sizeRem);
              const secondMass = getBubbleMass(second.sizeRem);
              const totalMass = firstMass + secondMass;
              const firstPushShare = Math.pow(secondMass / totalMass, 1.28);
              const secondPushShare = Math.pow(firstMass / totalMass, 1.28);
              const pushShareTotal = firstPushShare + secondPushShare;
              const firstPushPx = correctionPx * (firstPushShare / pushShareTotal);
              const secondPushPx = correctionPx * (secondPushShare / pushShareTotal);

              first.left -= (normalX * firstPushPx / playfieldWidth) * 100;
              first.top -= (normalY * firstPushPx / playfieldHeight) * 100;
              second.left += (normalX * secondPushPx / playfieldWidth) * 100;
              second.top += (normalY * secondPushPx / playfieldHeight) * 100;

              const firstClampedPosition = clampBubblePosition(
                first.left,
                first.top,
                first.sizeRem,
                playfieldWidth,
                playfieldHeight,
              );
              first.left = firstClampedPosition.left;
              first.top = firstClampedPosition.top;

              const secondClampedPosition = clampBubblePosition(
                second.left,
                second.top,
                second.sizeRem,
                playfieldWidth,
                playfieldHeight,
              );
              second.left = secondClampedPosition.left;
              second.top = secondClampedPosition.top;

              const firstEffectiveVelocityXPx =
                ((first.velocityX + currentDriftX * first.currentFactor) / 100) * playfieldWidth;
              const firstEffectiveVelocityYPx =
                ((first.velocityY + currentDriftY * first.currentFactor) / 100) * playfieldHeight;
              const secondEffectiveVelocityXPx =
                ((second.velocityX + currentDriftX * second.currentFactor) / 100) * playfieldWidth;
              const secondEffectiveVelocityYPx =
                ((second.velocityY + currentDriftY * second.currentFactor) / 100) * playfieldHeight;
              const relativeVelocityAlongNormal =
                (secondEffectiveVelocityXPx - firstEffectiveVelocityXPx) * normalX +
                (secondEffectiveVelocityYPx - firstEffectiveVelocityYPx) * normalY;

              if (relativeVelocityAlongNormal < -0.6) {
                const impulse =
                  (-(1 + BUBBLE_COLLISION_RESTITUTION) * relativeVelocityAlongNormal) /
                  (1 / firstMass + 1 / secondMass);

                const impulseX = impulse * normalX;
                const impulseY = impulse * normalY;

                const firstVelocity = clampBubbleVelocity(
                  first.velocityX - (impulseX / firstMass / playfieldWidth) * 100,
                  first.velocityY - (impulseY / firstMass / playfieldHeight) * 100,
                  first.sizeTier,
                );
                first.velocityX = firstVelocity.velocityX;
                first.velocityY = firstVelocity.velocityY;

                const secondVelocity = clampBubbleVelocity(
                  second.velocityX + (impulseX / secondMass / playfieldWidth) * 100,
                  second.velocityY + (impulseY / secondMass / playfieldHeight) * 100,
                  second.sizeTier,
                );
                second.velocityX = secondVelocity.velocityX;
                second.velocityY = secondVelocity.velocityY;
              }

              const impactStrength = Math.min(
                0.28,
                Math.max(
                  0.05,
                  correctionPx / combinedRadiusPx + Math.abs(relativeVelocityAlongNormal) / 320,
                ),
              );
              const impactRotationDeg = Math.max(-4.5, Math.min(4.5, normalX * 7));
              const shouldRefreshDeform =
                correctionPx > BUBBLE_COLLISION_DEFORM_THRESHOLD_PX ||
                Math.abs(relativeVelocityAlongNormal) > BUBBLE_COLLISION_DEFORM_THRESHOLD_PX;

              if (shouldRefreshDeform && impactStrength > first.deformStretch + 0.02) {
                first.deformUntilMs = now + BUBBLE_DEFORM_DURATION_MS + 18;
                first.deformRotationDeg = impactRotationDeg;
                first.deformStretch = impactStrength;
              }

              if (shouldRefreshDeform && impactStrength > second.deformStretch + 0.02) {
                second.deformUntilMs = now + BUBBLE_DEFORM_DURATION_MS + 18;
                second.deformRotationDeg = impactRotationDeg;
                second.deformStretch = impactStrength;
              }
            }
          }
        }

        return prepared;
      });

      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [isActive, sessionCompleted]);

  const elapsedSeconds = useMemo(() => {
    if (completionResult) {
      return completionResult.sessionDurationSeconds;
    }
    if (!sessionStartedAtMs) {
      return 0;
    }
    return Math.max(0, Math.floor((nowMs - sessionStartedAtMs) / 1000));
  }, [completionResult, nowMs, sessionStartedAtMs]);
  const displayElapsedSeconds = Math.min(elapsedSeconds, SESSION_DURATION_SECONDS);
  const sessionTimerGoalReached = elapsedSeconds >= SESSION_DURATION_SECONDS;
  const rawActiveSeconds = activeTapCount * ACTIVE_SECONDS_PER_TAP;
  const backendCountableActiveSeconds = Math.min(rawActiveSeconds, elapsedSeconds);
  const elapsedProgressPercent = Math.min(
    100,
    Math.round((Math.min(elapsedSeconds, SESSION_DURATION_SECONDS) / SESSION_DURATION_SECONDS) * 100),
  );
  const activeSignalProgressPercent = Math.min(
    100,
    Math.round((Math.min(backendCountableActiveSeconds, ACTIVE_SECONDS_FOR_COMPLETION_BONUS) /
      ACTIVE_SECONDS_FOR_COMPLETION_BONUS) *
      100),
  );
  const localCompletionEstimateMet =
    elapsedSeconds >= MIN_SESSION_SECONDS_FOR_COMPLETION &&
    backendCountableActiveSeconds >= ACTIVE_SECONDS_FOR_COMPLETION_BONUS;
  const projectedActivePlayXp = Math.floor(
    (Math.min(backendCountableActiveSeconds, SESSION_ACTIVE_SECONDS_XP_CAP) /
      SESSION_ACTIVE_SECONDS_XP_CAP) *
      SESSION_ACTIVE_PLAY_XP_MAX,
  );
  const projectedCompletionBonusXp = localCompletionEstimateMet
    ? SESSION_COMPLETION_BONUS_XP
    : 0;
  const projectedRewardBubblesXp = localCompletionEstimateMet
    ? SESSION_REWARD_BUBBLES_XP
    : 0;
  const projectedXpAwarded =
    projectedActivePlayXp + projectedCompletionBonusXp + projectedRewardBubblesXp;
  const huntReadinessPercent = Math.min(
    100,
    Math.round(
      (Math.min(backendCountableActiveSeconds, ACTIVE_SECONDS_FOR_COMPLETION_BONUS) /
        ACTIVE_SECONDS_FOR_COMPLETION_BONUS) *
        100,
    ),
  );
  const runObjectives = [
    {
      id: "survive",
      label: `Stay in session for ${Math.round(MIN_SESSION_SECONDS_FOR_COMPLETION / 60)} min`,
      done: elapsedSeconds >= MIN_SESSION_SECONDS_FOR_COMPLETION,
    },
    {
      id: "active",
      label: `Accumulate ${Math.round(ACTIVE_SECONDS_FOR_COMPLETION_BONUS / 60)} min active play`,
      done: backendCountableActiveSeconds >= ACTIVE_SECONDS_FOR_COMPLETION_BONUS,
    },
    {
      id: "combo",
      label: `Reach combo x${FEATURED_COMBO_TARGET}`,
      done: bestTapCombo >= FEATURED_COMBO_TARGET,
    },
  ] as const;
  const runObjectiveCompletedCount = runObjectives.filter((objective) => objective.done).length;
  const elapsedSecondsRemaining = Math.max(0, MIN_SESSION_SECONDS_FOR_COMPLETION - elapsedSeconds);
  const activeSecondsRemaining = Math.max(0, ACTIVE_SECONDS_FOR_COMPLETION_BONUS - backendCountableActiveSeconds);
  const readinessLabel = sessionCompleted
    ? "Session finished"
    : isActive
      ? sessionTimerGoalReached
        ? "Timed goal complete"
        : localCompletionEstimateMet
        ? "Ready to submit"
        : "Active run"
      : "Ready to start";
  const readinessCopy = sessionCompleted
    ? "Backend result is locked in below."
    : isActive
      ? sessionTimerGoalReached
        ? localCompletionEstimateMet
          ? "Today's 10-minute target is complete. Finish now or keep popping to stack more XP."
          : "The 10-minute timer is over. Finish now, or keep popping to close the active-play gap."
        : localCompletionEstimateMet
        ? `You can submit this run now. Projected XP: ${projectedXpAwarded}.`
        : `Stay in the run to build activity and time. ${formatTime(
            elapsedSecondsRemaining,
          )} min time and ${formatTime(activeSecondsRemaining)} play target remain.`
      : "Review the rules, then start the run when you are ready.";
  const canStartSession =
    !isActive &&
    !sessionCompleted &&
    !isSubmitting &&
    !isResolvingOnboardingState &&
    Boolean(effectiveProfileId) &&
    !needsOnboarding &&
    Boolean(authSessionToken);
  const canCompleteSession =
    isActive &&
    !sessionCompleted &&
    !isSubmitting &&
    !isResolvingOnboardingState;
  const startSessionBlockReason =
    isActive || sessionCompleted
      ? null
      : isResolvingOnboardingState
        ? "Checking your session access..."
        : isSubmitting
          ? "Starting session..."
          : !effectiveProfileId || needsOnboarding
            ? "Finish wallet setup on Home before starting a run."
            : !authSessionToken
              ? "Use Sign in with Base on Home before starting a run."
              : null;
  const startSessionStatusMessage =
    startSessionBlockReason ??
    (!isActive && !sessionCompleted ? actionMessage : null);
  const gameplayToastMessage =
    actionMessage &&
    isActive &&
    !sessionCompleted &&
    (actionMessage.startsWith("We couldn't") ||
      actionMessage.startsWith("Session start failed") ||
      actionMessage.startsWith("Finish ") ||
      actionMessage.startsWith("Sign in") ||
      actionMessage.startsWith("Start a live session"))
      ? actionMessage
      : null;
  const showTapFeedback =
    lastTapFeedbackAtMs !== null && Date.now() - lastTapFeedbackAtMs < 850;
  const compactRuntimeLayout = isActive && !sessionCompleted;
  const showFinishCelebration = finishCelebrationVisible && isActive && !sessionCompleted;
  const runtimeFrameStyle = {
    minHeight: "100dvh",
    "--session-header-offset": `${headerHeightPx}px`,
    "--session-footer-offset": `${footerHeightPx}px`,
  } as CSSProperties;
  const runtimeHeaderStyle = {
    paddingTop: compactRuntimeLayout
      ? "max(0.5rem, calc(env(safe-area-inset-top) + 0.32rem))"
      : "max(0.75rem, calc(env(safe-area-inset-top) + 0.5rem))",
    paddingLeft: compactRuntimeLayout
      ? "max(0.75rem, calc(env(safe-area-inset-left) + 0.45rem))"
      : "max(1rem, calc(env(safe-area-inset-left) + 0.75rem))",
    paddingRight: compactRuntimeLayout
      ? "max(0.75rem, calc(env(safe-area-inset-right) + 0.45rem))"
      : "max(1rem, calc(env(safe-area-inset-right) + 0.75rem))",
  } satisfies CSSProperties;
  const playfieldLayoutStyle = {
    minHeight: "100dvh",
    paddingTop: compactRuntimeLayout
      ? "max(0.45rem, calc(env(safe-area-inset-top) + 0.28rem))"
      : "calc(var(--session-header-offset) + 0.75rem)",
    paddingBottom: compactRuntimeLayout
      ? "calc(var(--session-footer-offset) + 0.9rem)"
      : "calc(var(--session-footer-offset) + 0.75rem)",
    paddingLeft: compactRuntimeLayout
      ? "max(1rem, calc(env(safe-area-inset-left) + 0.75rem))"
      : "max(1rem, calc(env(safe-area-inset-left) + 0.75rem))",
    paddingRight: compactRuntimeLayout
      ? "max(1rem, calc(env(safe-area-inset-right) + 0.75rem))"
      : "max(1rem, calc(env(safe-area-inset-right) + 0.75rem))",
  } satisfies CSSProperties;
  const playfieldBoundariesStyle = {
    top: compactRuntimeLayout
      ? "max(0.25rem, calc(env(safe-area-inset-top) + 0.12rem))"
      : "calc(var(--session-header-offset) + 0.4rem)",
    bottom: compactRuntimeLayout
      ? "calc(var(--session-footer-offset) + 0.55rem)"
      : "calc(var(--session-footer-offset) + 0.4rem)",
    left: compactRuntimeLayout
      ? "max(0.5rem, calc(env(safe-area-inset-left) + 0.25rem))"
      : "max(0.75rem, calc(env(safe-area-inset-left) + 0.5rem))",
    right: compactRuntimeLayout
      ? "max(0.5rem, calc(env(safe-area-inset-right) + 0.25rem))"
      : "max(0.75rem, calc(env(safe-area-inset-right) + 0.5rem))",
  } satisfies CSSProperties;
  const runtimeFooterStyle = {
    paddingBottom: "max(0.75rem, calc(env(safe-area-inset-bottom) + 0.25rem))",
    paddingLeft: "max(1rem, calc(env(safe-area-inset-left) + 0.75rem))",
    paddingRight: "max(1rem, calc(env(safe-area-inset-right) + 0.75rem))",
  } satisfies CSSProperties;
  const gameplayToastStyle = {
    bottom: "calc(var(--session-footer-offset) + 0.55rem)",
  } satisfies CSSProperties;

  const completedResult = sessionCompleted && completionResult ? completionResult : null;
  const completedRunDurationLabel = completedResult
    ? formatDurationLabel(completedResult.sessionDurationSeconds)
    : null;
  const nextStepCopy = completedResult
    ? completedResult.seasonProgress.eligibleAtSeasonEnd
      ? "Season-end chance is live for this profile. Keep the streak active and stack more XP."
      : "Next step: keep daily streak alive and finish more active runs to reach season-end eligibility."
    : null;
  const backHomeHrefBase = withBubbleDropContext("/", {
    profileId: effectiveProfileId,
    walletAddress: connectedWalletAddress ?? effectiveWalletAddress,
  });
  const backHomeHref = backHomeHrefBase.includes("?")
    ? `${backHomeHrefBase}&skipIntro=1`
    : `${backHomeHrefBase}?skipIntro=1`;
  useEffect(() => {
    if (!isActive || sessionCompleted) {
      setFinishCelebrationVisible(false);
      return;
    }
    if (!localCompletionEstimateMet || hasShownMinimumCelebrationRef.current) {
      return;
    }

    hasShownMinimumCelebrationRef.current = true;
    setFinishCelebrationVisible(true);
    setActionMessage("Minimum run complete. You can bank season progress now.");
    playPopSound(true);
    if ("vibrate" in navigator) {
      navigator.vibrate([18, 32, 18]);
    }
    if (finishCelebrationTimeoutRef.current !== null) {
      window.clearTimeout(finishCelebrationTimeoutRef.current);
    }
    finishCelebrationTimeoutRef.current = window.setTimeout(() => {
      setFinishCelebrationVisible(false);
      finishCelebrationTimeoutRef.current = null;
    }, FINISH_CELEBRATION_DURATION_MS);
  }, [isActive, localCompletionEstimateMet, sessionCompleted]);

  useEffect(() => {
    if (!isActive || sessionCompleted) {
      setPostTimerChoiceVisible(false);
      return;
    }
    if (!sessionTimerGoalReached || hasShownTimerChoiceRef.current) {
      return;
    }

    hasShownTimerChoiceRef.current = true;
    setPostTimerChoiceVisible(true);
    setFinishCelebrationVisible(localCompletionEstimateMet);
    setActionMessage(
      localCompletionEstimateMet
        ? "Today's timed goal is complete. Finish now or keep popping for more XP."
        : "10 minutes reached. Finish now or keep popping to complete the active-play target.",
    );
    playPopSound(localCompletionEstimateMet);
    if ("vibrate" in navigator) {
      navigator.vibrate(localCompletionEstimateMet ? [22, 32, 22] : [14, 22, 14]);
    }
    if (localCompletionEstimateMet) {
      if (finishCelebrationTimeoutRef.current !== null) {
        window.clearTimeout(finishCelebrationTimeoutRef.current);
      }
      finishCelebrationTimeoutRef.current = window.setTimeout(() => {
        setFinishCelebrationVisible(false);
        finishCelebrationTimeoutRef.current = null;
      }, FINISH_CELEBRATION_DURATION_MS);
    }
  }, [isActive, localCompletionEstimateMet, sessionCompleted, sessionTimerGoalReached]);

  const onKeepPopping = () => {
    setPostTimerChoiceVisible(false);
    setActionMessage(
      localCompletionEstimateMet
        ? "Timed goal complete. Keep popping to stack more XP and strengthen season progress."
        : "Keep popping to finish the active-play target and strengthen season progress.",
    );
  };

  const showPlayfieldTouchCue = (
    tone: PlayfieldTouchCue["tone"],
    point: { topPercent: number; leftPercent: number },
  ) => {
    const cueId = Math.floor(Math.random() * 1_000_000_000);
    setPlayfieldTouchCue({
      id: cueId,
      topPercent: point.topPercent,
      leftPercent: point.leftPercent,
      tone,
    });
    window.setTimeout(() => {
      setPlayfieldTouchCue((current) => (current?.id === cueId ? null : current));
    }, PLAYFIELD_TOUCH_CUE_DURATION_MS);
  };

  const triggerComboBurst = (
    comboValue: number,
    point: { xPercent: number; yPercent: number },
  ) => {
    const comboTier =
      [...COMBO_BURST_TIER_CONFIG]
        .reverse()
        .find((tier) => comboValue >= tier.combo) ?? null;
    if (!comboTier) {
      return null;
    }
    const comboBurstId = Math.floor(Math.random() * 1_000_000_000);
    setComboBursts((current) => [
      ...current,
      {
        id: comboBurstId,
        xPercent: point.xPercent,
        yPercent: point.yPercent,
        label: comboTier.label,
        accent: comboTier.accent,
        hue: comboTier.hue,
        scale: comboTier.scale,
      },
    ]);
    window.setTimeout(() => {
      setComboBursts((current) => current.filter((burst) => burst.id !== comboBurstId));
    }, COMBO_BURST_DURATION_MS);
    return comboTier.combo;
  };

  const spawnFunOverlayItem = (
    point: { xPercent: number; yPercent: number },
    isBonusSource: boolean,
    comboValue: number,
  ) => {
    const shouldSpawnItem =
      isBonusSource || comboValue >= 5 || Math.random() < 0.34;
    if (!shouldSpawnItem) {
      return;
    }
    const config =
      FUN_OVERLAY_ITEM_CONFIG[
        Math.floor(Math.random() * FUN_OVERLAY_ITEM_CONFIG.length)
      ];
    const itemId = Math.floor(Math.random() * 1_000_000_000);
    setFunOverlayItems((current) => [
      ...current,
      {
        id: itemId,
        xPercent: point.xPercent,
        yPercent: point.yPercent,
        kind: config.kind,
        hue: config.hue,
        label: config.label,
      },
    ]);
    window.setTimeout(() => {
      setFunOverlayItems((current) => current.filter((item) => item.id !== itemId));
    }, FUN_OVERLAY_ITEM_DURATION_MS);
  };

  const queuePopBurst = ({
    xPercent,
    yPercent,
    hue,
    sizeRem,
    isBonus,
    comboTier,
    source,
  }: {
    xPercent: number;
    yPercent: number;
    hue: number;
    sizeRem: number;
    isBonus: boolean;
    comboTier: number | null;
    source: PopBurst["source"];
  }) => {
    const burstId = Math.floor(Math.random() * 1_000_000_000);
    setPopBursts((current) => [
      ...current,
      {
        id: burstId,
        xPercent,
        yPercent,
        hue,
        sizeRem,
        isBonus,
        comboTier,
        source,
      },
    ]);
    window.setTimeout(() => {
      setPopBursts((current) => current.filter((burst) => burst.id !== burstId));
    }, source === "helper" ? HELPER_SHOT_CUE_DURATION_MS : 620);
  };

  const applyBubblePopLifecycle = (
    bubbleId: number,
    bubbleSnapshot: ActivePlayBubble,
    now: number,
    options?: { anticipationMs?: number; deformStretch?: number; deformRotationDeg?: number },
  ) => {
    const anticipationMs = options?.anticipationMs ?? ANTICIPATION_POP_DURATION_MS;
    const deformStretch = options?.deformStretch ?? (bubbleSnapshot.isBonus ? 0.26 : 0.18);
    const deformRotationDeg = options?.deformRotationDeg ?? (bubbleSnapshot.isBonus ? 3.2 : 2.2);
    setActivePlayBubbles((current) =>
      current.map((bubble) => {
        if (bubble.id !== bubbleId) {
          return bubble;
        }
        if (
          bubble.poppedUntilMs > now ||
          bubble.respawnAtMs > now ||
          bubble.spawnedUntilMs > now
        ) {
          return bubble;
        }
        return {
          ...bubble,
          poppedUntilMs: now + anticipationMs + BUBBLE_POP_DURATION_MS,
          respawnAtMs:
            now +
            anticipationMs +
            BUBBLE_POP_DURATION_MS +
            BUBBLE_RESPAWN_DELAY_MS,
          spawnedUntilMs: 0,
          nextShiftAtMs:
            now +
            anticipationMs +
            BUBBLE_POP_DURATION_MS +
            BUBBLE_RESPAWN_DELAY_MS,
          deformUntilMs: now + anticipationMs,
          deformStretch,
          deformRotationDeg,
        };
      }),
    );
  };

  const addHelperShotCue = ({
    event,
    targetBubble,
    xPercent,
    yPercent,
  }: {
    event: HelperEvent;
    targetBubble: ActivePlayBubble;
    xPercent: number;
    yPercent: number;
  }) => {
    const metrics = playfieldMetricsRef.current;
    const isCompactPlayfield = metrics.width <= 460;
    const originXPercent = clampPercent(
      event.anchorXPercent + randomBetween(-2.4, 2.4),
      isCompactPlayfield ? 4 : -8,
      isCompactPlayfield ? 96 : 108,
    );
    const originYPercent = clampPercent(
      event.anchorYPercent + randomBetween(-1.2, 1.2),
      isCompactPlayfield ? 14 : 0,
      isCompactPlayfield ? 86 : 100,
    );
    const originXpx = (metrics.width * originXPercent) / 100;
    const originYpx = (metrics.height * originYPercent) / 100;
    const targetXpx = (metrics.width * xPercent) / 100;
    const targetYpx = (metrics.height * yPercent) / 100;
    const shotId = Math.floor(Math.random() * 1_000_000_000);
    setHelperShotCues((current) => [
      ...current,
      {
        id: shotId,
        theme: event.theme,
        accentHue: event.accentHue,
        originXPercent,
        originYPercent,
        targetXPercent: xPercent,
        targetYPercent: yPercent,
        beamLengthPx: Math.hypot(targetXpx - originXpx, targetYpx - originYpx),
        beamAngleDeg: (Math.atan2(targetYpx - originYpx, targetXpx - originXpx) * 180) / Math.PI,
      },
    ]);
    window.setTimeout(() => {
      setHelperShotCues((current) => current.filter((cue) => cue.id !== shotId));
    }, HELPER_SHOT_CUE_DURATION_MS);
    showPlayfieldTouchCue("helper", {
      topPercent: yPercent,
      leftPercent: xPercent,
    });
    triggerNeighborRipple(targetBubble.id, { xPercent, yPercent }, targetBubble.isBonus);
  };

  const fireHelperShot = (eventId: number, bubbleId: number) => {
    const currentEvent =
      helperEventRef.current && helperEventRef.current.id === eventId
        ? helperEventRef.current
        : null;
    if (!currentEvent) {
      return;
    }
    const now = Date.now();
    const findEligibleBubble = (candidateId?: number) =>
      activePlayBubblesRef.current.find(
        (bubble) =>
          (candidateId == null || bubble.id === candidateId) &&
          bubble.poppedUntilMs <= now &&
          bubble.respawnAtMs <= now &&
          bubble.spawnedUntilMs <= now,
      );
    const targetBubble =
      findEligibleBubble(bubbleId) ??
      [...activePlayBubblesRef.current]
        .filter(
          (bubble) =>
            bubble.poppedUntilMs <= now &&
            bubble.respawnAtMs <= now &&
            bubble.spawnedUntilMs <= now,
        )
        .sort((first, second) => {
          const firstDistance =
            Math.abs(first.left - currentEvent.anchorXPercent) +
            Math.abs(first.top - currentEvent.anchorYPercent);
          const secondDistance =
            Math.abs(second.left - currentEvent.anchorXPercent) +
            Math.abs(second.top - currentEvent.anchorYPercent);
          return firstDistance - secondDistance;
        })[0] ??
      null;
    if (!targetBubble) {
      return;
    }

    const xPercent = targetBubble.left;
    const yPercent = targetBubble.top;
    applyBubblePopLifecycle(targetBubble.id, targetBubble, now, {
      anticipationMs: 80,
      deformStretch: targetBubble.isBonus ? 0.2 : 0.16,
      deformRotationDeg: targetBubble.left >= currentEvent.anchorXPercent ? 2.4 : -2.4,
    });
    queuePopBurst({
      xPercent,
      yPercent,
      hue: currentEvent.accentHue,
      sizeRem: targetBubble.isBonus ? 0.86 : 0.58,
      isBonus: targetBubble.isBonus,
      comboTier: null,
      source: "helper",
    });
    addHelperShotCue({
      event: currentEvent,
      targetBubble,
      xPercent,
      yPercent,
    });
  };

  const triggerHelperEvent = (): boolean => {
    const now = Date.now();
    const availableTargets = activePlayBubblesRef.current.filter(
      (bubble) =>
        bubble.poppedUntilMs <= now &&
        bubble.respawnAtMs <= now &&
        bubble.spawnedUntilMs <= now,
    );
    if (availableTargets.length === 0) {
      return false;
    }

    const isCompactPlayfield = playfieldMetricsRef.current.width <= 460;
    const targetCount = Math.max(
      1,
      Math.min(availableTargets.length, isCompactPlayfield ? 2 : 3),
    );
    const upperPriority = [...availableTargets]
      .sort((first, second) => first.top - second.top)
      .slice(
        0,
        Math.max(
          targetCount + 1,
          Math.ceil(availableTargets.length * (isCompactPlayfield ? 0.62 : 0.45)),
        ),
      );
    const targets = upperPriority.slice(0, targetCount);
    if (targets.length === 0) {
      return false;
    }
    const shotTargetIds = Array.from(
      {
        length: isCompactPlayfield
          ? Math.max(2, targets.length)
          : Math.max(3, targets.length),
      },
      (_, index) => targets[index % targets.length]?.id,
    ).filter((bubbleId): bubbleId is number => typeof bubbleId === "number");

    const helperThemeConfig =
      HELPER_THEME_CONFIG[Math.floor(Math.random() * HELPER_THEME_CONFIG.length)];
    const averageLeft =
      targets.reduce((sum, bubble) => sum + bubble.left, 0) / targets.length;
    const averageTop =
      targets.reduce((sum, bubble) => sum + bubble.top, 0) / targets.length;
    const anchorXPercent = clampPercent(
      averageLeft + randomBetween(isCompactPlayfield ? -4.8 : -7.5, isCompactPlayfield ? 4.8 : 7.5),
      isCompactPlayfield ? 20 : 16,
      isCompactPlayfield ? 80 : 84,
    );
    const anchorYPercent = clampPercent(
      averageTop - randomBetween(isCompactPlayfield ? 7 : 11, isCompactPlayfield ? 14 : 20),
      isCompactPlayfield ? 20 : 14,
      isCompactPlayfield ? 62 : 50,
    );
    const helperFlightPattern = (() => {
      const leftEdge = isCompactPlayfield ? -14 : -22;
      const rightEdge = isCompactPlayfield ? 114 : 122;
      const topEdge = isCompactPlayfield ? -12 : -18;
      const leftSweepStartY = clampPercent(
        anchorYPercent - randomBetween(isCompactPlayfield ? 2 : 4, isCompactPlayfield ? 8 : 14),
        isCompactPlayfield ? 14 : 8,
        isCompactPlayfield ? 70 : 58,
      );
      const rightSweepStartY = clampPercent(
        anchorYPercent - randomBetween(isCompactPlayfield ? 1 : 3, isCompactPlayfield ? 7 : 13),
        isCompactPlayfield ? 14 : 8,
        isCompactPlayfield ? 70 : 58,
      );
      const exitHighY = clampPercent(
        anchorYPercent - randomBetween(isCompactPlayfield ? 8 : 12, isCompactPlayfield ? 16 : 24),
        isCompactPlayfield ? 8 : 2,
        isCompactPlayfield ? 48 : 34,
      );
      const exitLowY = clampPercent(
        anchorYPercent + randomBetween(isCompactPlayfield ? 4 : 6, isCompactPlayfield ? 10 : 16),
        isCompactPlayfield ? 34 : 26,
        isCompactPlayfield ? 80 : 74,
      );

      const lowerEntryY = clampPercent(
        anchorYPercent + randomBetween(isCompactPlayfield ? 8 : 10, isCompactPlayfield ? 15 : 20),
        isCompactPlayfield ? 38 : 32,
        isCompactPlayfield ? 78 : 72,
      );

      const patterns = [
        {
          startXPercent: leftEdge,
          startYPercent: leftSweepStartY,
          exitXPercent: rightEdge,
          exitYPercent: exitHighY,
        },
        {
          startXPercent: rightEdge,
          startYPercent: rightSweepStartY,
          exitXPercent: leftEdge,
          exitYPercent: exitHighY,
        },
        {
          startXPercent: clampPercent(
            anchorXPercent - randomBetween(isCompactPlayfield ? 16 : 24, isCompactPlayfield ? 26 : 36),
            leftEdge,
            isCompactPlayfield ? 30 : 26,
          ),
          startYPercent: topEdge,
          exitXPercent: rightEdge,
          exitYPercent: exitLowY,
        },
        {
          startXPercent: clampPercent(
            anchorXPercent + randomBetween(isCompactPlayfield ? 16 : 24, isCompactPlayfield ? 26 : 36),
            isCompactPlayfield ? 70 : 74,
            rightEdge,
          ),
          startYPercent: topEdge,
          exitXPercent: leftEdge,
          exitYPercent: exitLowY,
        },
        {
          startXPercent: leftEdge,
          startYPercent: lowerEntryY,
          exitXPercent: clampPercent(anchorXPercent + randomBetween(16, 28), 68, rightEdge),
          exitYPercent: exitHighY,
        },
        {
          startXPercent: rightEdge,
          startYPercent: lowerEntryY,
          exitXPercent: clampPercent(anchorXPercent - randomBetween(16, 28), leftEdge, 32),
          exitYPercent: exitHighY,
        },
      ] as const;

      return patterns[Math.floor(Math.random() * patterns.length)];
    })();
    const eventId = Math.floor(Math.random() * 1_000_000_000);
    const nextEvent: HelperEvent = {
      id: eventId,
      theme: helperThemeConfig.theme,
      label: helperThemeConfig.label,
      accentHue: helperThemeConfig.accentHue,
      phase: "entering",
      anchorXPercent,
      anchorYPercent,
      startXPercent: helperFlightPattern.startXPercent,
      startYPercent: helperFlightPattern.startYPercent,
      exitXPercent: helperFlightPattern.exitXPercent,
      exitYPercent: helperFlightPattern.exitYPercent,
      targetBubbleIds: targets.map((bubble) => bubble.id),
    };

    setHelperEvent(nextEvent);
    helperHasAppearedRef.current = true;

    const enterTimeout = window.setTimeout(() => {
      setHelperEvent((current) =>
        current?.id === eventId
          ? { ...current, phase: "firing" }
          : current,
      );
    }, HELPER_EVENT_ENTER_DURATION_MS);
    helperTimeoutsRef.current.push(enterTimeout);

    shotTargetIds.forEach((targetBubbleId, index) => {
      const shotTimeout = window.setTimeout(() => {
        fireHelperShot(eventId, targetBubbleId);
      }, HELPER_EVENT_ENTER_DURATION_MS + HELPER_SHOT_LEAD_IN_MS + index * HELPER_SHOT_INTERVAL_MS);
      helperTimeoutsRef.current.push(shotTimeout);
    });

    const exitTimeout = window.setTimeout(() => {
      setHelperEvent((current) =>
        current?.id === eventId
          ? { ...current, phase: "exiting" }
          : current,
      );
    }, HELPER_EVENT_ENTER_DURATION_MS + HELPER_EVENT_FIRE_DURATION_MS);
    helperTimeoutsRef.current.push(exitTimeout);

    const cleanupTimeout = window.setTimeout(() => {
      setHelperEvent((current) => (current?.id === eventId ? null : current));
      setHelperShotCues([]);
    }, HELPER_EVENT_ENTER_DURATION_MS + HELPER_EVENT_FIRE_DURATION_MS + HELPER_EVENT_EXIT_DURATION_MS);
    helperTimeoutsRef.current.push(cleanupTimeout);
    return true;
  };

  useEffect(() => {
    if (!isActive || sessionCompleted || sessionTimerGoalReached || postTimerChoiceVisible) {
      clearHelperTimeouts();
      setHelperEvent(null);
      setHelperShotCues([]);
      return;
    }
    if (helperEvent) {
      return;
    }
    const [minDelayMs, maxDelayMs] = helperHasAppearedRef.current
      ? [HELPER_EVENT_REPEAT_MIN_DELAY_MS, HELPER_EVENT_REPEAT_MAX_DELAY_MS]
      : [HELPER_EVENT_INITIAL_MIN_DELAY_MS, HELPER_EVENT_INITIAL_MAX_DELAY_MS];
    const scheduleDelayMs = randomBetween(
      minDelayMs,
      maxDelayMs,
    );
    const timeoutId = window.setTimeout(() => {
      const triggered = triggerHelperEvent();
      if (!triggered) {
        setHelperScheduleTick((current) => current + 1);
      }
      helperTimeoutsRef.current = helperTimeoutsRef.current.filter(
        (currentId) => currentId !== timeoutId,
      );
    }, scheduleDelayMs);
    helperTimeoutsRef.current.push(timeoutId);
    return () => {
      window.clearTimeout(timeoutId);
      helperTimeoutsRef.current = helperTimeoutsRef.current.filter(
        (currentId) => currentId !== timeoutId,
      );
    };
  }, [
    helperEvent,
    helperScheduleTick,
    isActive,
    postTimerChoiceVisible,
    sessionCompleted,
    sessionTimerGoalReached,
  ]);

  const triggerNeighborRipple = (
    sourceBubbleId: number,
    sourcePoint: { xPercent: number; yPercent: number },
    sourceIsBonus: boolean,
  ) => {
    setActivePlayBubbles((current) => {
      const neighbors = current
        .filter(
          (bubble) =>
            bubble.id !== sourceBubbleId &&
            bubble.poppedUntilMs <= Date.now() &&
            bubble.respawnAtMs <= Date.now(),
        )
        .map((bubble) => ({
          bubble,
          distance:
            Math.hypot(bubble.left - sourcePoint.xPercent, bubble.top - sourcePoint.yPercent),
        }))
        .sort((first, second) => first.distance - second.distance)
        .slice(0, 2);

      if (neighbors.length === 0) {
        return current;
      }

      return current.map((bubble) => {
        const neighborIndex = neighbors.findIndex((entry) => entry.bubble.id === bubble.id);
        if (neighborIndex === -1) {
          return bubble;
        }
        const neighbor = neighbors[neighborIndex].bubble;
        const directionX = bubble.left >= sourcePoint.xPercent ? 1 : -1;
        const directionY = bubble.top >= sourcePoint.yPercent ? 1 : -1;
        const rippleStrength = (sourceIsBonus ? 0.3 : 0.2) - neighborIndex * 0.05;

        return {
          ...bubble,
          deformUntilMs: Date.now() + BUBBLE_DEFORM_DURATION_MS + 110,
          deformStretch: Math.max(bubble.deformStretch, sourceIsBonus ? 0.28 : 0.2),
          deformRotationDeg:
            directionX * 3.2 + directionY * 1.4,
          velocityX: bubble.velocityX + directionX * rippleStrength * (neighbor.sizeTier === "small" ? 1.2 : 0.85),
          velocityY: bubble.velocityY + directionY * rippleStrength * 0.8,
        };
      });
    });
  };

  const onEquipRewardNow = (rewardCard: SkinRewardCard) => {
    void rewardCard;
    setActionMessage(
      "Seasonal skin rewards stay preview-only for now. Inventory apply is locked until season-end distribution.",
    );
  };

  const onSaveRewardToInventory = (rewardCard: SkinRewardCard) => {
    setInventorySavedRewardIds((current) =>
      current.includes(rewardCard.id) ? current : [...current, rewardCard.id],
    );
    setActionMessage(`${rewardCard.key} saved to inventory.`);
  };

  const onStartSession = () => {
    if (isActive || sessionCompleted || isSubmitting) {
      return;
    }
    if (!effectiveProfileId || needsOnboarding) {
      setActionMessage("Finish wallet setup before starting a session.");
      return;
    }
    if (!authSessionToken) {
      setActionMessage("Sign in with Base on the home screen before starting a session.");
      return;
    }

    setIsSubmitting(true);
    setActionMessage(null);
    void (async () => {
      try {
        const response = await fetch(`${backendUrl}/bubble-session/start`, {
          method: "POST",
          headers: createAuthenticatedJsonHeaders(authSessionToken),
          body: JSON.stringify({ profileId: effectiveProfileId }),
        });

        if (!response.ok) {
          setActionMessage(
            `Session start failed (code ${response.status}). Please retry in a moment.`,
          );
          return;
        }

        const payload = (await response.json()) as SessionStartResponse;
        setBackendSessionId(payload.sessionId);
        setSessionStartedAtMs(new Date(payload.startedAt).getTime());
        setNowMs(Date.now());
        setIsActive(true);
        setActiveTapCount(0);
        setTapCombo(0);
        setBestTapCombo(0);
        setLastTapComboValue(0);
        setLastTapRewardXp(TAP_FEEDBACK_XP_PER_UNIT);
        setTapFeedbackPoint(null);
        setPlayfieldTouchCue(null);
        setLastTapAtMs(null);
        setLastTapFeedbackAtMs(null);
        setPopBursts([]);
        setComboBursts([]);
        setFunOverlayItems([]);
        helperHasAppearedRef.current = false;
        setHelperScheduleTick(0);
        clearHelperTimeouts();
        setHelperEvent(null);
        setHelperShotCues([]);
        if (finishCelebrationTimeoutRef.current !== null) {
          window.clearTimeout(finishCelebrationTimeoutRef.current);
          finishCelebrationTimeoutRef.current = null;
        }
        hasShownMinimumCelebrationRef.current = false;
        hasShownTimerChoiceRef.current = false;
        setFinishCelebrationVisible(false);
        setPostTimerChoiceVisible(false);
        setSessionCompleted(false);
        setCompletionResult(null);
        setEquippedSkinRewardId(null);
        setInventorySavedRewardIds([]);
        setLastApplyMoment(null);
        setActivePlayBubbles(createActivePlayBubbleSet());
        captureAnalyticsEvent("bubbledrop_bubble_session_started", {
          profile_id: payload.profileId,
          session_id: payload.sessionId,
        });
        setActionMessage("Session started. Build active play to qualify the run.");
      } catch {
        setActionMessage("Session start failed. Check network and try again.");
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const onRecordActivePlay = (
    bubbleId?: number,
    event?: MouseEvent<HTMLButtonElement>,
    touchPointOverride?: { topPercent: number; leftPercent: number },
  ) => {
    if (!isActive || sessionCompleted) {
      return;
    }

    const tappedBubble = typeof bubbleId === "number"
      ? activePlayBubbles.find((bubble) => bubble.id === bubbleId)
      : null;
    if (tappedBubble && tappedBubble.poppedUntilMs > Date.now()) {
      return;
    }
    const tapUnits = tappedBubble?.isBonus ? 2 : 1;
    const tapRewardXp = tapUnits * TAP_FEEDBACK_XP_PER_UNIT;

    const now = Date.now();
    const nextCombo =
      lastTapAtMs !== null && now - lastTapAtMs <= COMBO_WINDOW_MS ? tapCombo + 1 : 1;
    setActiveTapCount((prev) => prev + tapUnits);
    setLastTapRewardXp(tapRewardXp);
    setLastTapComboValue(nextCombo);
    setLastTapFeedbackAtMs(now);
    playPopSound(Boolean(tappedBubble?.isBonus) || nextCombo >= 5);
    setTapCombo(nextCombo);
    setBestTapCombo((prevBest) => Math.max(prevBest, nextCombo));
    setLastTapAtMs(now);
    if (typeof bubbleId === "number" && tappedBubble) {
      applyBubblePopLifecycle(bubbleId, tappedBubble, now);
      const rect = event?.currentTarget.getBoundingClientRect();
      const playfieldRect = playfieldRef.current?.getBoundingClientRect();
      if (playfieldRect) {
        const burstX =
          rect
            ? rect.left + rect.width / 2
            : playfieldRect.left +
              (playfieldRect.width * (tappedBubble?.left ?? 50)) / 100;
        const burstY =
          rect
            ? rect.top + rect.height / 2
            : playfieldRect.top +
              (playfieldRect.height * (tappedBubble?.top ?? 50)) / 100;
        const xPercent = ((burstX - playfieldRect.left) / playfieldRect.width) * 100;
        const yPercent = ((burstY - playfieldRect.top) / playfieldRect.height) * 100;
        setTapFeedbackPoint(touchPointOverride ?? { topPercent: yPercent, leftPercent: xPercent });
        const comboTier = triggerComboBurst(nextCombo, { xPercent, yPercent });
        queuePopBurst({
          xPercent,
          yPercent,
          hue: tappedBubble.isBonus ? 44 : tappedBubble.hue,
          sizeRem: tappedBubble.isBonus ? 0.92 : 0.62,
          isBonus: tappedBubble.isBonus,
          comboTier,
          source: "user",
        });
        triggerNeighborRipple(
          bubbleId,
          { xPercent, yPercent },
          tappedBubble.isBonus,
        );
        spawnFunOverlayItem(
          { xPercent, yPercent },
          tappedBubble.isBonus,
          nextCombo,
        );
      }
    }

    if ("vibrate" in navigator) {
      navigator.vibrate(nextCombo >= 5 ? [10, 24, 12] : 10);
    }

    if (!effectiveProfileId || !backendSessionId || !authSessionToken) {
      return;
    }

    void fetch(`${backendUrl}/bubble-session/activity`, {
      method: "POST",
      headers: createAuthenticatedJsonHeaders(authSessionToken),
      body: JSON.stringify({
        profileId: effectiveProfileId,
        sessionId: backendSessionId,
      }),
    });
  };

  const onPlayfieldTap = (event: MouseEvent<HTMLDivElement>) => {
    if (!isActive || sessionCompleted) {
      return;
    }
    if (event.target instanceof Element && event.target.closest("[data-bubble-button='true']")) {
      return;
    }
    const playfieldRect = playfieldRef.current?.getBoundingClientRect();
    if (!playfieldRect) {
      return;
    }
    const touchPoint = getPlayfieldPercentPoint(playfieldRect, event.clientX, event.clientY);
    const nearestBubble = activePlayBubbles.reduce<{
      bubble: ActivePlayBubble | null;
      distancePx: number;
      assistRadiusPx: number;
    }>(
      (closest, bubble) => {
        if (
          bubble.poppedUntilMs > Date.now() ||
          bubble.respawnAtMs > Date.now() ||
          bubble.spawnedUntilMs > Date.now()
        ) {
          return closest;
        }
        const bubbleCenterX = playfieldRect.left + (playfieldRect.width * bubble.left) / 100;
        const bubbleCenterY = playfieldRect.top + (playfieldRect.height * bubble.top) / 100;
        const distancePx = Math.hypot(event.clientX - bubbleCenterX, event.clientY - bubbleCenterY);
        if (distancePx >= closest.distancePx) {
          return closest;
        }
        return {
          bubble,
          distancePx,
          assistRadiusPx: getBubbleAssistRadiusPx(bubble),
        };
      },
      { bubble: null, distancePx: Number.POSITIVE_INFINITY, assistRadiusPx: 0 },
    );

    if (
      nearestBubble.bubble &&
      nearestBubble.distancePx <= nearestBubble.assistRadiusPx
    ) {
      showPlayfieldTouchCue("assist", touchPoint);
      onRecordActivePlay(nearestBubble.bubble.id, undefined, touchPoint);
      return;
    }

    showPlayfieldTouchCue("miss", touchPoint);
  };

  const onCompleteSession = () => {
    if (!isActive || sessionCompleted || isSubmitting) {
      return;
    }
    if (!effectiveProfileId || !backendSessionId || needsOnboarding) {
      setActionMessage("Start a live session before trying to finish it.");
      return;
    }
    if (!authSessionToken) {
      setActionMessage("Sign in with Base on the home screen before finishing a session.");
      return;
    }

    setIsSubmitting(true);
    setActionMessage(null);
    void (async () => {
      try {
        const response = await fetch(`${backendUrl}/bubble-session/complete`, {
          method: "POST",
          headers: createAuthenticatedJsonHeaders(authSessionToken),
          body: JSON.stringify({
            profileId: effectiveProfileId,
            sessionId: backendSessionId,
            activeSeconds: backendCountableActiveSeconds,
          }),
        });

        if (!response.ok) {
          setActionMessage("We couldn't complete that session right now.");
          return;
        }

        const payload = (await response.json()) as SessionCompleteResponse;
        setCompletionResult(payload);
        setSessionCompleted(true);
        setIsActive(false);
        setBackendSessionId(null);
        captureAnalyticsEvent("bubbledrop_bubble_session_completed", {
          profile_id: effectiveProfileId,
          session_id: payload.sessionId,
          granted_xp: payload.xpAwarded,
          completion_bonus_xp: payload.completionBonusXp,
          new_streak: payload.newStreak,
          qualification_status: payload.qualificationStatus,
          rare_reward_access_active: payload.rareAccessActive,
        });
        setActionMessage(
          `Session completed. +${payload.xpAwarded} XP. Streak: ${payload.newStreak}. Season chance: ${
            payload.seasonProgress.eligibleAtSeasonEnd ? "eligible" : "building"
          }.`,
        );
      } catch {
        setActionMessage("We couldn't complete that session right now.");
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  return (
    <div
      className={`session-runtime-shell relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#edf7ff_0%,#e9f2ff_28%,#f8ecff_66%,#fff6fb_100%)] ${
        compactRuntimeLayout ? "session-runtime-active" : ""
      }`}
      style={runtimeFrameStyle}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="absolute -left-10 top-16 h-32 w-32 rounded-full bg-[#d8f3ff]/85 blur-[1px]" />
        <span className="absolute right-[-1.5rem] top-28 h-40 w-40 rounded-full bg-[#ece0ff]/78 blur-[1px]" />
        <span className="absolute left-[12%] bottom-[18%] h-28 w-28 rounded-full bg-[#ffe4f0]/70 blur-[1px]" />
        <span className="absolute right-[12%] bottom-[12%] h-20 w-20 rounded-full bg-[#ddffea]/68 blur-[1px]" />
      </div>
      {showFinishCelebration ? (
        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
          <div className="session-finish-celebration-veil absolute inset-0" />
          <div className="session-finish-celebration-glow absolute inset-0" />
          {FINISH_CELEBRATION_BLOOM_BUBBLES.map((bubble, index) => (
            <span
              key={`finish-bloom-bubble-${index}`}
              className={`session-finish-bloom-bubble absolute left-1/2 top-[46%] rounded-full ${
                index > 3 ? "session-finish-bloom-bubble-secondary" : ""
              }`}
              style={
                {
                  "--session-finish-bloom-x": bubble.x,
                  "--session-finish-bloom-y": bubble.y,
                  "--session-finish-bloom-size": bubble.size,
                  "--session-finish-bloom-hue": `${bubble.hue}`,
                  "--session-finish-bloom-alpha": `${bubble.alpha}`,
                  animationDelay: `${bubble.delayMs}ms`,
                  animationDuration: `${bubble.durationMs}ms`,
                } as CSSProperties
              }
            />
          ))}
          <div className="session-finish-bloom-halo absolute left-1/2 top-[46%] h-[19rem] w-[19rem] -translate-x-1/2 -translate-y-1/2 rounded-full" />
          <div className="session-finish-celebration-core absolute left-1/2 top-[46%] h-[11.8rem] w-[11.8rem] -translate-x-1/2 -translate-y-1/2 rounded-full" />
          <span className="session-finish-shockwave absolute left-1/2 top-[46%]" />
          <span className="session-finish-ring session-finish-ring-a absolute left-1/2 top-[46%]" />
          <span className="session-finish-ring session-finish-ring-b absolute left-1/2 top-[46%]" />
          <span className="session-finish-ring session-finish-ring-c absolute left-1/2 top-[46%]" />
          {FINISH_CELEBRATION_PARTICLES.map((particle, index) => (
            <span
              key={`finish-particle-${index}`}
              className="session-finish-particle absolute left-1/2 top-[46%] rounded-full"
              style={
                {
                  "--session-finish-x": particle.x,
                  "--session-finish-y": particle.y,
                  "--session-finish-size": particle.size,
                  "--session-finish-particle-hue": `${particle.hue}`,
                  animationDelay: `${particle.delayMs}ms`,
                } as CSSProperties
              }
            />
          ))}
          {FINISH_CELEBRATION_RESIDUE.map((residue, index) => (
            <span
              key={`finish-residue-${index}`}
              className={`session-finish-residue absolute left-1/2 top-[46%] rounded-full ${
                index > 2 ? "session-finish-residue-secondary" : ""
              }`}
              style={
                {
                  "--session-finish-residue-x": residue.x,
                  "--session-finish-residue-y": residue.y,
                  "--session-finish-residue-size": residue.size,
                  "--session-finish-residue-hue": `${residue.hue}`,
                  animationDelay: `${residue.delayMs}ms`,
                  animationDuration: `${residue.durationMs}ms`,
                } as CSSProperties
              }
            />
          ))}
          <div className="absolute inset-x-0 top-[46%] flex -translate-y-1/2 justify-center px-5">
            <div className="session-finish-badge">
              <span className="session-finish-badge-chip">RUN SECURED</span>
              <h2 className="session-finish-badge-title">Well done</h2>
              <p className="session-finish-badge-copy">
                Minimum run complete. Your season progress is secured and ready for the next move.
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {postTimerChoiceVisible ? (
        <div className="session-finish-choice-layer absolute inset-0 z-40 flex items-end justify-center px-5 pt-8">
          <div className="session-finish-choice-card w-full max-w-sm rounded-[2rem] border border-white/54 bg-white/76 p-5 text-center shadow-[0_28px_72px_rgba(92,122,189,0.18)]">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7084ae]">
              Session milestone
            </p>
            <h2 className="mt-2 text-[1.9rem] font-black tracking-[-0.04em] text-[#263f74]">
              {localCompletionEstimateMet ? "Run secured" : "Time goal reached"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#546c99]">
              {localCompletionEstimateMet
                ? "You locked in today's minimum. Finish now or keep popping to stack more XP and strengthen your season-end chance."
                : "The 10-minute timer is over. Finish now, or keep popping to close the active-play gap before you bank this run."}
            </p>
            <div className="session-finish-choice-actions mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setPostTimerChoiceVisible(false);
                  onCompleteSession();
                }}
                className="gloss-pill rounded-2xl bg-gradient-to-r from-[#ffe1ef] to-[#e5dfff] px-4 py-3 text-sm font-semibold text-[#3f3167]"
              >
                Finish run
              </button>
              <button
                type="button"
                onClick={onKeepPopping}
                className="gloss-pill rounded-2xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-3 text-sm font-semibold text-[#1f3561]"
              >
                Keep popping
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!sessionCompleted ? (
        <main className="relative z-10 min-h-screen" style={runtimeFrameStyle}>
          <header
            ref={headerRef}
            className="pointer-events-none absolute inset-x-0 top-0 z-20 sm:p-5"
            style={runtimeHeaderStyle}
          >
            <div className="mx-auto flex w-full max-w-md flex-col items-stretch gap-2 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
              <Link
                href={backHomeHref}
                className={`session-runtime-back-button pointer-events-auto self-start rounded-full border text-xs font-semibold text-[#425b8a] shadow-[0_10px_24px_rgba(96,132,203,0.07)] backdrop-blur-[10px] transition-all ${
                  compactRuntimeLayout
                    ? "border-white/30 bg-white/14 px-3.5 py-2"
                    : "border-white/48 bg-white/28 px-4 py-2"
                }`}
              >
                Back
              </Link>
              <div
                className={`session-runtime-hud-card pointer-events-auto min-w-0 w-full self-stretch shadow-[0_10px_24px_rgba(96,132,203,0.07)] backdrop-blur-[10px] transition-all max-w-full min-[520px]:max-w-[17rem] ${
                  compactRuntimeLayout
                    ? "rounded-[1.1rem] border border-white/30 bg-white/12 px-2.5 py-1.5"
                    : "rounded-[1.3rem] border border-white/48 bg-white/24 px-3 py-2"
                }`}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5b72a3]">
                      Bubble session
                    </p>
                    <p
                      className={`mt-1 font-bold leading-none text-[#2d477f] ${
                        compactRuntimeLayout ? "text-[1.05rem]" : "text-xl"
                      }`}
                    >
                      {formatTime(displayElapsedSeconds)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5b72a3]">
                      Status
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-[#3a4f86]">
                      {readinessLabel}
                    </p>
                  </div>
                </div>
                {compactRuntimeLayout ? (
                  <>
                    <div className="mt-1.5 h-1.5 rounded-full bg-[#e7eeff]/76">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#98d8ff] to-[#becfff] transition-all"
                        style={{ width: `${elapsedProgressPercent}%` }}
                      />
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-1 text-[9px]">
                      <span className="rounded-full border border-white/34 bg-white/16 px-1.5 py-[0.32rem] text-center font-semibold text-[#47608f]">
                        Combo x{tapCombo}
                      </span>
                      <span className="rounded-full border border-white/34 bg-white/16 px-1.5 py-[0.32rem] text-center font-semibold text-[#47608f]">
                        Hunt {huntReadinessPercent}%
                      </span>
                      <span className="rounded-full border border-white/34 bg-white/16 px-1.5 py-[0.32rem] text-center font-semibold text-[#47608f]">
                        Goals {runObjectiveCompletedCount}/{runObjectives.length}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-2 hidden min-[420px]:flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-[#e4ecff]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#98d8ff] to-[#becfff] transition-all"
                          style={{ width: `${elapsedProgressPercent}%` }}
                        />
                      </div>
                      <div className="h-2 w-20 rounded-full bg-[#f3e7ff]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#ffe1a6] to-[#ffc7ef] transition-all"
                          style={{ width: `${activeSignalProgressPercent}%` }}
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] min-[420px]:hidden">
                      <span className="rounded-full border border-white/40 bg-white/20 px-2 py-1 font-semibold text-[#47608f]">
                        Target {Math.round(MIN_SESSION_SECONDS_FOR_COMPLETION / 60)}m
                      </span>
                      <span className="rounded-full border border-white/40 bg-white/20 px-2 py-1 font-semibold text-[#47608f]">
                        Goals {runObjectiveCompletedCount}/{runObjectives.length}
                      </span>
                    </div>
                    <div className="mt-2 hidden min-[420px]:grid grid-cols-3 gap-1.5 text-[10px]">
                      <div className="rounded-lg border border-white/48 bg-white/22 px-2 py-2 text-[#486294]">
                        <p className="uppercase tracking-[0.08em] text-[10px] text-[#6a7faa]">Combo</p>
                        <p className="mt-1 text-xs font-bold text-[#2f4a81]">x{tapCombo}</p>
                      </div>
                      <div className="rounded-lg border border-white/48 bg-white/22 px-2 py-2 text-[#486294]">
                        <p className="uppercase tracking-[0.08em] text-[10px] text-[#6a7faa]">Best</p>
                        <p className="mt-1 text-xs font-bold text-[#2f4a81]">x{bestTapCombo}</p>
                      </div>
                      <div className="rounded-lg border border-white/48 bg-white/22 px-2 py-2 text-[#486294]">
                        <p className="uppercase tracking-[0.08em] text-[10px] text-[#6a7faa]">Hunt</p>
                        <p className="mt-1 text-xs font-bold text-[#2f4a81]">{huntReadinessPercent}%</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {needsOnboarding ? (
            <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-24 sm:px-6">
              <section className="bubble-card mx-auto w-full max-w-md p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#45619a]">
                  First entry required
                </p>
                <h1 className="mt-1 text-xl font-bold text-[#273f74]">
                  Finish onboarding before session access
                </h1>
                <p className="mt-3 text-sm text-[#526a96]">
                  Return home to finish your first BubbleDrop setup, then come back for active play.
                </p>
                <Link
                  href={withBubbleDropContext("/", {
                    profileId: effectiveProfileId,
                    walletAddress: connectedWalletAddress ?? effectiveWalletAddress,
                  }, { skipIntro: true })}
                  className="gloss-pill mt-4 inline-flex rounded-xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-3 text-sm font-semibold text-[#1f3561]"
                >
                  Go to onboarding
                </Link>
              </section>
            </div>
          ) : (
            <section className="relative min-h-screen" style={runtimeFrameStyle}>
              <div className="pointer-events-none absolute inset-0">
                {DECORATIVE_STANDARD_BUBBLES.map((bubble, index) => (
                  <span
                    key={`standard-${index}`}
                    className="absolute rounded-full border border-white/70 bg-white/34 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                    style={{
                      top: bubble.top,
                      left: bubble.left,
                      width: bubble.size,
                      height: bubble.size,
                    }}
                  />
                ))}
                {DECORATIVE_XP_BUBBLES.map((bubble, index) => (
                  <span
                    key={`xp-${index}`}
                    className="absolute rounded-full border border-[#fff7cf] bg-gradient-to-br from-[#fff3b8]/95 to-[#ffd6ef]/90 shadow-[0_0_18px_rgba(255,207,129,0.45)]"
                    style={{
                      top: bubble.top,
                      left: bubble.left,
                      width: bubble.size,
                      height: bubble.size,
                    }}
                  />
                ))}
                {DECORATIVE_PREMIUM_BUBBLES.map((bubble, index) => (
                  <span
                    key={`premium-${index}`}
                    className="absolute rounded-full border border-white/80 bg-gradient-to-br from-[#fff5c7]/92 via-[#ffd8ef]/92 to-[#e4dfff]/92 shadow-[0_0_26px_rgba(255,200,140,0.48)]"
                    style={{
                      top: bubble.top,
                      left: bubble.left,
                      width: bubble.size,
                      height: bubble.size,
                    }}
                  />
                ))}
                <span className="absolute left-[22%] top-[24%] h-2 w-2 rounded-full bg-white/80" />
                <span className="absolute left-[68%] top-[48%] h-1.5 w-1.5 rounded-full bg-white/80" />
                <span className="absolute left-[48%] top-[70%] h-2.5 w-2.5 rounded-full bg-white/75" />
              </div>

              <div
                className={`relative min-h-screen sm:px-6 ${
                  isActive ? "" : "flex items-start justify-center"
                }`}
                style={playfieldLayoutStyle}
              >
                {!isActive ? (
                  <div className="session-runtime-start-card w-full max-w-[16.75rem] rounded-[1.85rem] border border-white/46 bg-white/24 px-4 py-[1.125rem] text-center shadow-[0_20px_54px_rgba(99,131,195,0.09)] backdrop-blur-[10px] sm:max-w-[19rem] sm:rounded-[2.25rem] sm:px-6 sm:py-7">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5a6fa0]">
                      Bubble session
                    </p>
                    <h1 className="mt-1.5 text-[1.65rem] font-bold leading-[1.02] text-[#2b467c] sm:mt-2 sm:text-[2rem] sm:leading-tight">
                      How the run works
                    </h1>
                    <p className="mt-2 text-[13px] leading-5 text-[#6077a6] sm:mt-3 sm:text-sm">
                      Stay in the run, keep active play growing, and bank progress toward the season-end reward chance.
                    </p>
                    <div className="mt-3 grid gap-2 text-left sm:hidden">
                      <div className="rounded-[1.25rem] border border-white/44 bg-white/26 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5a6fa0]">
                          Goal
                        </p>
                        <p className="mt-1 text-[13px] font-medium leading-5 text-[#385180]">
                          Hold the session and build active play.
                        </p>
                      </div>
                      <div className="rounded-[1.25rem] border border-white/44 bg-white/26 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5a6fa0]">
                          Minimum
                        </p>
                        <p className="mt-1 text-[13px] font-medium leading-5 text-[#385180]">
                          {Math.round(MIN_SESSION_SECONDS_FOR_COMPLETION / 60)} min run and {Math.round(
                            ACTIVE_SECONDS_FOR_COMPLETION_BONUS / 60,
                          )} min active play.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 hidden space-y-2 text-left sm:block">
                      <div className="rounded-2xl border border-white/44 bg-white/26 px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5a6fa0]">
                          Goal
                        </p>
                        <p className="mt-1 text-sm font-medium text-[#385180]">
                          Hold the session and build active play.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/44 bg-white/26 px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5a6fa0]">
                          Minimum
                        </p>
                        <p className="mt-1 text-sm font-medium text-[#385180]">
                          {Math.round(MIN_SESSION_SECONDS_FOR_COMPLETION / 60)} min run and {Math.round(
                            ACTIVE_SECONDS_FOR_COMPLETION_BONUS / 60,
                          )} min active play.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/44 bg-white/26 px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5a6fa0]">
                          Why
                        </p>
                        <p className="mt-1 text-sm font-medium text-[#385180]">
                          Earn XP, protect your streak, and build your season-end reward chance.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onStartSession}
                      disabled={!canStartSession}
                      className="gloss-pill mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-3.5 text-sm font-semibold text-[#1f3561] disabled:opacity-60 sm:mt-5 sm:py-4"
                    >
                      {isSubmitting && !isActive ? "Starting..." : "Start session"}
                    </button>
                    {startSessionStatusMessage ? (
                      <p className="mt-3 text-center text-[11px] font-medium text-[#5c6f99]">
                        {startSessionStatusMessage}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div
                    ref={playfieldRef}
                    onClick={onPlayfieldTap}
                    className="absolute overflow-visible"
                    style={playfieldBoundariesStyle}
                  >
                    <div className="session-current-layer absolute inset-0">
                      {activePlayBubbles.map((bubble) => (
                        (() => {
                          const now = Date.now();
                          if (bubble.poppedUntilMs <= now && bubble.respawnAtMs > now) {
                            return null;
                          }
                          const deformProgress =
                            bubble.deformUntilMs > now
                              ? (bubble.deformUntilMs - now) / BUBBLE_DEFORM_DURATION_MS
                              : 0;
                          const deformStretch = 1 + bubble.deformStretch * deformProgress;
                          const deformSquash = Math.max(
                            0.78,
                            1 - bubble.deformStretch * 0.82 * deformProgress,
                          );
                          const deformRotation = Math.max(
                            -5,
                            Math.min(5, bubble.deformRotationDeg * deformProgress),
                          );
                          const hitSizeRem =
                            bubble.sizeRem +
                            (bubble.sizeTier === "small"
                              ? 0.9
                              : bubble.sizeTier === "medium"
                                ? 0.5
                                : 0.24);
                          const helperTargeted =
                            helperEvent?.phase === "firing" &&
                            helperEvent.targetBubbleIds.includes(bubble.id);

                          return (
                            <button
                              key={bubble.id}
                              type="button"
                              data-bubble-button="true"
                              aria-label="Pop bubble"
                              onClick={(event) => {
                                event.stopPropagation();
                                onRecordActivePlay(bubble.id, event);
                              }}
                              disabled={!isActive || sessionCompleted || bubble.poppedUntilMs > now}
                              className={`session-active-bubble pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border transition-[opacity,box-shadow,border-color] ease-out disabled:opacity-70 ${
                                bubble.poppedUntilMs > now ? "session-active-bubble-popping" : ""
                              } ${
                                bubble.spawnedUntilMs > now ? "session-active-bubble-spawning" : ""
                              } ${
                                bubble.isBonus ? "session-active-bubble-bonus" : ""
                              } ${
                                bubble.sizeTier === "large" ? "session-active-bubble-large" : ""
                              } ${
                                bubble.sizeTier === "small" ? "session-active-bubble-small" : ""
                              } ${
                                helperTargeted ? "session-active-bubble-helper-targeted" : ""
                              }`}
                              style={{
                                top: `${bubble.top}%`,
                                left: `${bubble.left}%`,
                                width: `${hitSizeRem}rem`,
                                height: `${hitSizeRem}rem`,
                                borderRadius: `${bubble.roundness}% ${100 - bubble.roundness}% ${
                                  bubble.roundness
                                }% ${100 - bubble.roundness}% / ${100 - bubble.roundness}% ${
                                  bubble.roundness
                                }% ${100 - bubble.roundness}% ${bubble.roundness}%`,
                                transform: `translate(-50%, -50%) rotate(${bubble.wobbleDeg + deformRotation}deg) scale(${bubble.scale * deformStretch}, ${bubble.scale * deformSquash})`,
                                transitionDuration: `${bubble.poppedUntilMs > now ? 150 : 110}ms`,
                                "--bubble-morph-duration": `${Math.max(1800, bubble.driftMs + 400)}ms`,
                                "--bubble-sheen-duration": `${Math.max(1800, bubble.driftMs - 200)}ms`,
                                "--bubble-current-factor": `${bubble.currentFactor}`,
                                "--bubble-rim-hue": `${bubble.isBonus ? 42 : bubble.hue + 28}`,
                                "--bubble-rim-hue-2": `${bubble.isBonus ? 330 : bubble.hue + 102}`,
                                "--session-helper-hue": `${helperTargeted ? helperEvent?.accentHue ?? 196 : 196}`,
                                "--bubble-pop-duration": `${ANTICIPATION_POP_DURATION_MS + BUBBLE_POP_DURATION_MS}ms`,
                                "--bubble-pop-intensity": `${bubble.isBonus ? 1.08 : bubble.sizeTier === "small" ? 0.92 : 1}`,
                                opacity:
                                  bubble.poppedUntilMs > now
                                    ? 0.06
                                    : bubble.spawnedUntilMs > now
                                      ? 0.42
                                      : bubble.isBonus
                                        ? 0.98
                                        : bubble.sizeTier === "small"
                                          ? 0.74
                                          : bubble.sizeTier === "medium"
                                            ? 0.84
                                            : 0.91,
                                borderColor: bubble.isBonus
                                  ? "rgba(255, 242, 188, 0.9)"
                                  : `hsla(${bubble.hue + 34}, 80%, 96%, 0.72)`,
                                boxShadow: bubble.isBonus
                                  ? "0 22px 58px rgba(255,201,108,0.42), 0 0 26px rgba(255,236,182,0.44), inset 0 0 0 1px rgba(255,248,218,0.58)"
                                  : bubble.sizeTier === "large"
                                    ? "0 20px 52px rgba(122,136,201,0.22), inset 0 0 0 1px rgba(255,255,255,0.16)"
                                    : "0 14px 36px rgba(122,136,201,0.18), inset 0 0 0 1px rgba(255,255,255,0.14)",
                                background: bubble.isBonus
                                  ? "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.92), rgba(255,255,255,0.22) 34%, transparent 56%), radial-gradient(circle at 72% 72%, rgba(255,238,185,0.96), rgba(255,205,126,0.54) 42%, transparent 68%), radial-gradient(circle at 50% 50%, rgba(255,246,214,0.96), rgba(255,219,150,0.82) 48%, rgba(255,183,118,0.58) 100%)"
                                  : `radial-gradient(circle at 32% 24%, rgba(255,255,255,0.62), rgba(255,255,255,0.1) 35%, transparent 56%), radial-gradient(circle at 68% 72%, hsla(${
                                      bubble.hue + 14
                                    }, 82%, 70%, ${bubble.alpha * 0.5}), transparent 62%), radial-gradient(circle at 50% 50%, hsla(${
                                      bubble.hue
                                    }, 78%, 68%, ${bubble.alpha}), hsla(${bubble.hue + 10}, 74%, 84%, ${
                                      bubble.alpha * 0.56
                                    }))`,
                              } as CSSProperties}
                            >
                              <span className="session-bubble-edge-rim" />
                              <span className="session-bubble-core" />
                              <span className="session-bubble-highlight session-bubble-highlight-a" />
                              <span className="session-bubble-highlight session-bubble-highlight-b" />
                              <span className="session-bubble-sheen-band" />
                              {bubble.isBonus ? <span className="session-bubble-bonus-tease" /> : null}
                              {bubble.isBonus ? <span className="session-bubble-glint" /> : null}
                              {helperTargeted ? <span className="session-bubble-helper-lock" /> : null}
                            </button>
                          );
                        })()
                      ))}
                      {helperEvent
                        ? (() => {
                            const playfieldMetrics = playfieldMetricsRef.current;
                            const enterOffsetXPx =
                              ((helperEvent.startXPercent - helperEvent.anchorXPercent) / 100) *
                              playfieldMetrics.width;
                            const enterOffsetYPx =
                              ((helperEvent.startYPercent - helperEvent.anchorYPercent) / 100) *
                              playfieldMetrics.height;
                            const exitOffsetXPx =
                              ((helperEvent.exitXPercent - helperEvent.anchorXPercent) / 100) *
                              playfieldMetrics.width;
                            const exitOffsetYPx =
                              ((helperEvent.exitYPercent - helperEvent.anchorYPercent) / 100) *
                              playfieldMetrics.height;
                            const enteringFromLeft =
                              helperEvent.startXPercent <= helperEvent.anchorXPercent;
                            return (
                              <div
                                className={`session-helper-event session-helper-event-${helperEvent.theme} session-helper-event-${helperEvent.phase} pointer-events-none absolute`}
                                style={{
                                  left: `${helperEvent.anchorXPercent}%`,
                                  top: `${helperEvent.anchorYPercent}%`,
                                  "--session-helper-enter-x": `${enterOffsetXPx}px`,
                                  "--session-helper-enter-y": `${enterOffsetYPx}px`,
                                  "--session-helper-exit-x": `${exitOffsetXPx}px`,
                                  "--session-helper-exit-y": `${exitOffsetYPx}px`,
                                  "--session-helper-hue": `${helperEvent.accentHue}`,
                                  "--session-helper-start-tilt": `${enteringFromLeft ? -14 : 14}deg`,
                                  "--session-helper-hover-tilt-a": `${enteringFromLeft ? -1.6 : 1.6}deg`,
                                  "--session-helper-hover-tilt-b": `${enteringFromLeft ? 1.6 : -1.6}deg`,
                                  "--session-helper-exit-tilt": `${exitOffsetXPx >= 0 ? 16 : -16}deg`,
                                  "--session-helper-trail-left": enteringFromLeft ? "-1.8rem" : "3.8rem",
                                  "--session-helper-trail-scale-x": enteringFromLeft ? "1" : "-1",
                                } as CSSProperties}
                                aria-hidden="true"
                              >
                                <span className="session-helper-event-trail" />
                                <span className="session-helper-event-body">
                                  <span className="session-helper-event-orbit" />
                                  <span className="session-helper-event-core" />
                                  <span className="session-helper-event-wing session-helper-event-wing-a" />
                                  <span className="session-helper-event-wing session-helper-event-wing-b" />
                                  <span className="session-helper-event-crown" />
                                  <span className="session-helper-event-glow" />
                                </span>
                                <span className="session-helper-event-chip">{helperEvent.label}</span>
                              </div>
                            );
                          })()
                        : null}
                      {helperShotCues.map((cue) => (
                        <span
                          key={cue.id}
                          className={`session-helper-shot session-helper-shot-${cue.theme} pointer-events-none absolute`}
                          style={{
                            left: `${cue.originXPercent}%`,
                            top: `${cue.originYPercent}%`,
                            width: `${cue.beamLengthPx}px`,
                            transform: `translateY(-50%) rotate(${cue.beamAngleDeg}deg)`,
                            "--session-helper-hue": `${cue.accentHue}`,
                          } as CSSProperties}
                          aria-hidden="true"
                        >
                          <span className="session-helper-shot-beam" />
                          <span className="session-helper-shot-wave" />
                          <span className="session-helper-shot-hit" />
                        </span>
                      ))}
                      {popBursts.map((burst) => (
                        <span key={burst.id}>
                          <span
                            className={`session-pop-ring pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
                              burst.source === "helper" ? "session-pop-ring-helper" : ""
                            }`}
                            style={{
                              left: `${burst.xPercent}%`,
                              top: `${burst.yPercent}%`,
                              width: `${burst.sizeRem * (burst.isBonus ? 2.8 : burst.comboTier ? 2.45 : 2.1)}rem`,
                              height: `${burst.sizeRem * (burst.isBonus ? 2.8 : burst.comboTier ? 2.45 : 2.1)}rem`,
                              borderColor: `hsla(${burst.hue}, 94%, 78%, ${burst.isBonus ? 0.88 : 0.72})`,
                              boxShadow: `0 0 0 8px hsla(${burst.hue}, 92%, 76%, 0.16), 0 0 24px hsla(${burst.hue}, 94%, 74%, ${
                                burst.isBonus ? 0.34 : 0.22
                              })`,
                              animationDuration: `${burst.comboTier ? 760 : 620}ms`,
                            }}
                          />
                          <span
                            className={`session-pop-core pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
                              burst.source === "helper" ? "session-pop-core-helper" : ""
                            }`}
                            style={{
                              left: `${burst.xPercent}%`,
                              top: `${burst.yPercent}%`,
                              width: `${burst.sizeRem * (burst.isBonus ? 0.88 : 0.58)}rem`,
                              height: `${burst.sizeRem * (burst.isBonus ? 0.88 : 0.58)}rem`,
                              background: "rgba(255,255,255,0.92)",
                            }}
                          />
                          {POP_SPARKLE_OFFSETS.map((sparkle, index) => (
                            <span
                              key={`${burst.id}-sparkle-${index}`}
                              className={`session-pop-sparkle pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
                                burst.source === "helper" ? "session-pop-sparkle-helper" : ""
                              }`}
                              style={{
                                left: `calc(${burst.xPercent}% + ${sparkle.xRem * burst.sizeRem}rem)`,
                                top: `calc(${burst.yPercent}% + ${sparkle.yRem * burst.sizeRem}rem)`,
                                width: `${burst.sizeRem * sparkle.scale * (burst.isBonus ? 1.4 : 1)}rem`,
                                height: `${burst.sizeRem * sparkle.scale * (burst.isBonus ? 1.4 : 1)}rem`,
                                background: burst.isBonus
                                  ? "rgba(255, 236, 175, 0.92)"
                                  : `hsla(${burst.hue + 18}, 96%, 84%, 0.88)`,
                                boxShadow: burst.isBonus
                                  ? "0 0 12px rgba(255,223,140,0.7)"
                                  : `0 0 10px hsla(${burst.hue + 22}, 96%, 80%, 0.44)`,
                                animationDelay: `${index * 40}ms`,
                              }}
                            />
                          ))}
                        </span>
                      ))}
                      {comboBursts.map((burst) => (
                        <span
                          key={burst.id}
                          className="session-combo-burst pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                          style={{
                            left: `${burst.xPercent}%`,
                            top: `${burst.yPercent}%`,
                            "--session-combo-hue": `${burst.hue}`,
                            "--session-combo-scale": `${burst.scale}`,
                          } as CSSProperties}
                        >
                          <span className="session-combo-burst-orbit session-combo-burst-orbit-a" />
                          <span className="session-combo-burst-orbit session-combo-burst-orbit-b" />
                          <span className="session-combo-burst-chip">
                            <span className="session-combo-burst-accent">{burst.accent}</span>
                            <span className="session-combo-burst-label">{burst.label}</span>
                          </span>
                        </span>
                      ))}
                      {funOverlayItems.map((item) => (
                        <span
                          key={item.id}
                          className={`session-fun-overlay-item session-fun-overlay-item-${item.kind} pointer-events-none absolute -translate-x-1/2 -translate-y-1/2`}
                          style={{
                            left: `${item.xPercent}%`,
                            top: `${item.yPercent}%`,
                            "--session-item-hue": `${item.hue}`,
                          } as CSSProperties}
                          aria-hidden="true"
                        >
                          <span className="session-fun-overlay-item-core" />
                          <span className="session-fun-overlay-item-label">{item.label}</span>
                        </span>
                      ))}
                      {showTapFeedback && tapFeedbackPoint ? (
                        <div
                          className="session-touch-feedback session-touch-feedback-xp pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                          style={{
                            top: `${tapFeedbackPoint.topPercent}%`,
                            left: `${tapFeedbackPoint.leftPercent}%`,
                            marginTop: "-4.4rem",
                          }}
                        >
                          <span className="session-touch-feedback-badge">
                            <span className="session-touch-feedback-xp-value">+{lastTapRewardXp} XP</span>
                            {lastTapComboValue > 1 ? (
                              <span className="session-touch-feedback-combo-pill">
                                x{lastTapComboValue}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      ) : null}
                      {playfieldTouchCue ? (
                        <div
                          className={`session-touch-feedback pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 ${
                            playfieldTouchCue.tone === "assist"
                              ? "session-touch-feedback-assist"
                              : playfieldTouchCue.tone === "helper"
                                ? "session-touch-feedback-helper"
                                : "session-touch-feedback-miss"
                          }`}
                          style={{
                            top: `${playfieldTouchCue.topPercent}%`,
                            left: `${playfieldTouchCue.leftPercent}%`,
                            "--session-helper-hue": `${helperEvent?.accentHue ?? 196}`,
                          } as CSSProperties}
                        >
                          <span className="session-touch-feedback-ring" />
                          <span className="session-touch-feedback-core" />
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              {gameplayToastMessage && isActive ? (
                <div className="pointer-events-none absolute inset-x-0 z-20 px-4 sm:px-6" style={gameplayToastStyle}>
                  <div className="session-runtime-toast-card mx-auto w-full max-w-sm rounded-full border border-white/38 bg-white/18 px-4 py-2 text-center text-[11px] font-semibold text-[#4f648f] shadow-[0_12px_28px_rgba(96,132,203,0.09)] backdrop-blur-[10px]">
                    {gameplayToastMessage}
                  </div>
                </div>
              ) : null}

              <div
                ref={footerRef}
                className="absolute inset-x-0 bottom-0 z-20 sm:px-6 sm:pb-5"
                style={runtimeFooterStyle}
              >
                <div
                  className={`session-runtime-footer-card mx-auto w-full max-w-md shadow-[0_18px_48px_rgba(95,130,199,0.09)] backdrop-blur-[10px] transition-all ${
                    compactRuntimeLayout
                      ? "rounded-[1.55rem] border border-white/38 bg-white/14 p-3.5"
                      : "rounded-[1.9rem] border border-white/48 bg-white/24 p-4"
                  }`}
                >
                  {isResolvingOnboardingState ? (
                    <p className="text-xs text-[#5f739b]">Loading session access…</p>
                  ) : compactRuntimeLayout ? (
                    <div className="flex items-center justify-between gap-3 text-[11px] text-[#5e75a3]">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#516798]">
                          Live run
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold text-[#314a7e]">
                          {projectedXpAwarded} XP projected
                        </p>
                        <p className="mt-1 text-[11px] text-[#647aab]">
                          Goals {runObjectiveCompletedCount}/{runObjectives.length} · Best x{bestTapCombo}
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-[#6b7fa9]">
                          Run active
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onCompleteSession}
                        disabled={!canCompleteSession}
                        className="gloss-pill shrink-0 rounded-2xl bg-gradient-to-r from-[#ffe0ef] to-[#e6e0ff] px-4 py-3 text-center text-sm font-semibold text-[#403165] disabled:opacity-60"
                      >
                        {isSubmitting && isActive ? "Submitting..." : "Complete"}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-2 text-[11px] text-[#6178a7] sm:hidden">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full border border-white/48 bg-white/26 px-2.5 py-1 font-semibold text-[#4d6595]">
                            Target {Math.round(MIN_SESSION_SECONDS_FOR_COMPLETION / 60)} min
                          </span>
                          <span className="rounded-full border border-white/48 bg-white/26 px-2.5 py-1 font-semibold text-[#4d6595]">
                            Goals {runObjectiveCompletedCount}/{runObjectives.length}
                          </span>
                        </div>
                        <p className="leading-5 text-[#6277a5]">{readinessCopy}</p>
                      </div>
                      <div className="hidden flex-col gap-2 text-xs text-[#6178a7] sm:flex">
                        <div className="flex items-center justify-between">
                          <span>Projected XP: {projectedXpAwarded}</span>
                          <span>
                            {localCompletionEstimateMet
                              ? "Qualified progress added to this season"
                              : "Finish the run to bank season progress"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Run target: {Math.round(MIN_SESSION_SECONDS_FOR_COMPLETION / 60)} min</span>
                          <span>{readinessCopy}</span>
                        </div>
                        <div className="rounded-xl border border-white/52 bg-white/30 px-3 py-2">
                          <div className="mb-1 flex items-center justify-between">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#50689a]">
                              Run objectives
                            </p>
                            <p className="text-[11px] font-semibold text-[#415b90]">
                              {runObjectiveCompletedCount}/{runObjectives.length}
                            </p>
                          </div>
                          <div className="space-y-1">
                            {runObjectives.map((objective) => (
                              <div
                                key={objective.id}
                                className="flex items-center justify-between gap-2 text-[11px]"
                              >
                                <span>{objective.label}</span>
                                <span
                                  className={
                                    objective.done
                                      ? "rounded-md bg-[#dbffe9] px-2 py-0.5 font-semibold text-[#2e7f57]"
                                      : "rounded-md bg-[#edf2ff] px-2 py-0.5 font-semibold text-[#5c6f99]"
                                  }
                                >
                                  {objective.done ? "Done" : "In run"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  {!compactRuntimeLayout && !startSessionStatusMessage ? (
                    <p className="mt-2 hidden text-center text-[11px] font-medium text-[#5c6f99] sm:block">
                      Review the rules above, then start when you are ready.
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          )}
        </main>
      ) : completedResult ? (
        <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-4 py-8 sm:px-6">
          <section className="bubble-card overflow-hidden p-0">
            <div className="bg-[radial-gradient(circle_at_top,#fff4cc_0%,#ffe5f3_38%,#eef0ff_100%)] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7a5a2d]">
                    Session result
                  </p>
                  <h1 className="mt-1 text-2xl font-bold text-[#273f74]">
                    Season progress updated
                  </h1>
                </div>
                <div className="rounded-full bg-white/68 px-3 py-2 text-xs font-semibold text-[#6a548a]">
                  {completedRunDurationLabel} run
                </div>
              </div>
              <p className="mt-3 text-sm text-[#526a96]">
                {completedResult.seasonProgress.eligibleAtSeasonEnd
                  ? "This run strengthened a profile that is already eligible for the season-end reward chance."
                  : "This run banked XP and active-play progress toward the season-end reward chance."}
              </p>
              {nextStepCopy ? (
                <p className="mt-2 text-xs font-semibold text-[#5f749f]">{nextStepCopy}</p>
              ) : null}
            </div>
          </section>

          <section className="bubble-card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#5a6fa0]">
              Confirmed progress
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                <p className="text-xs text-[#6077a6]">XP awarded</p>
                <p className="mt-1 font-semibold text-[#334f82]">{completedResult.xpAwarded}</p>
              </div>
              <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                <p className="text-xs text-[#6077a6]">Total XP</p>
                <p className="mt-1 font-semibold text-[#334f82]">{completedResult.totalXp}</p>
              </div>
              <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                <p className="text-xs text-[#6077a6]">Streak</p>
                <p className="mt-1 font-semibold text-[#334f82]">{completedResult.newStreak}</p>
              </div>
              <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                <p className="text-xs text-[#6077a6]">Season chance</p>
                <p className="mt-1 font-semibold text-[#334f82]">
                  {completedResult.seasonProgress.eligibleAtSeasonEnd ? "Eligible" : "Building"}
                </p>
              </div>
            </div>
          </section>

          <section className="bubble-card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#5a6fa0]">
              Season progress
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                <p className="text-xs text-[#6077a6]">Streak</p>
                <p className="mt-1 font-semibold text-[#334f82]">
                  {completedResult.seasonProgress.streak}/{completedResult.seasonProgress.requiredStreak}
                </p>
              </div>
              <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                <p className="text-xs text-[#6077a6]">Season XP</p>
                <p className="mt-1 font-semibold text-[#334f82]">
                  {completedResult.seasonProgress.xp}/{completedResult.seasonProgress.requiredXp}
                </p>
              </div>
              <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                <p className="text-xs text-[#6077a6]">Qualified runs</p>
                <p className="mt-1 font-semibold text-[#334f82]">
                  {completedResult.seasonProgress.activeSessions}/
                  {completedResult.seasonProgress.requiredActiveSessions}
                </p>
              </div>
              <div className="gloss-pill rounded-xl bg-[#f8fbff] p-3">
                <p className="text-xs text-[#6077a6]">Status</p>
                <p className="mt-1 font-semibold capitalize text-[#334f82]">
                  {completedResult.seasonProgress.qualificationStatus.replaceAll("_", " ")}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-[#6077a6]">
              Memecoin, NFT, and cosmetic rewards no longer roll instantly per run. This session only
              updates the season-end chance model.
            </p>
          </section>

          <section className="bubble-card p-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (finishCelebrationTimeoutRef.current !== null) {
                    window.clearTimeout(finishCelebrationTimeoutRef.current);
                    finishCelebrationTimeoutRef.current = null;
                  }
                  hasShownMinimumCelebrationRef.current = false;
                  hasShownTimerChoiceRef.current = false;
                  setFinishCelebrationVisible(false);
                  setPostTimerChoiceVisible(false);
                  setSessionCompleted(false);
                  setCompletionResult(null);
                  setEquippedSkinRewardId(null);
                  setInventorySavedRewardIds([]);
                  setLastApplyMoment(null);
                  setSessionStartedAtMs(null);
                  setActiveTapCount(0);
                  setTapFeedbackPoint(null);
                  setPopBursts([]);
                  setComboBursts([]);
                  setFunOverlayItems([]);
                  helperHasAppearedRef.current = false;
                  setHelperScheduleTick(0);
                  clearHelperTimeouts();
                  setHelperEvent(null);
                  setHelperShotCues([]);
                  setActivePlayBubbles(createActivePlayBubbleSet());
                  setActionMessage("Ready for another run.");
                }}
                className="gloss-pill flex-1 rounded-xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-3 text-sm font-semibold text-[#1f3561]"
              >
                Play again
              </button>
              <Link
                href={withBubbleDropContext("/", {
                  profileId: effectiveProfileId,
                  walletAddress: connectedWalletAddress ?? effectiveWalletAddress,
                }, { skipIntro: true })}
                className="gloss-pill flex-1 rounded-xl bg-white/85 px-4 py-3 text-center text-sm font-semibold text-[#425b8a]"
              >
                Back home
              </Link>
            </div>
          </section>
        </main>
      ) : null}
    </div>
  );
}




