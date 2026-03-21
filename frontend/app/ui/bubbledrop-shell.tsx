"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { encodeFunctionData, isAddress, parseAbi, type Address, type Hash } from "viem";
import { createSiweMessage } from "viem/siwe";
import {
  useAccount,
  useConnect,
  useConnection,
  useDisconnect,
  usePublicClient,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { base } from "wagmi/chains";
import {
  captureAnalyticsEvent,
  identifyAnalyticsUser,
} from "../analytics";
import {
  BASE_MAINNET_CHAIN_HEX,
  classifyWalletFlowError,
  isBaseChainHex,
  getBubbleDropWalletConnectors,
  supportsWalletSendCalls,
  withFlowTimeout,
  type WalletCapabilitiesRecord,
} from "../base-wallet-runtime";
import {
  clearBubbleDropFrontendSignInSession,
  createAuthenticatedJsonHeaders,
  createSmokeSignInSession,
  hasVerifiedAuthSession,
  loadBubbleDropFrontendSignInSession,
  signInSessionMatchesWallet,
  storeBubbleDropFrontendSignInSession,
  type BubbleDropFrontendSignInSession,
} from "../base-sign-in";
import {
  BUBBLEDROP_API_BASE,
  useBubbleDropRuntime,
  withBubbleDropContext,
} from "../bubbledrop-runtime";
import {
  type BackendProfileSummary,
  fetchBackendProfileSummary,
} from "./backend-profile-summary";
import {
  loadSelectedAvatarOverrideState,
  loadSelectedAvatarOverride,
  saveSelectedAvatarOverride,
} from "./avatar-selection-sync";
import { getAvatarBubbleTone } from "./avatar-bubble-palette";
import {
  getPrimaryEquippedStyle,
  inferSlotFromRewardKey,
  loadPersistedEquippedStyles,
  savePersistedEquippedStyle,
  type EquippedStyleSnapshot,
} from "./equipped-style-sync";
import {
  ProfileBubbleMotionShell,
  ProfileRarityChipMotion,
} from "./profile-rarity-motion";
import { WelcomeIntroScreen } from "./welcome-intro-screen";

type ProfileBootstrapResponse = {
  profileId: string;
  walletAddress: string;
};

type AuthSessionNonceResponse = {
  walletAddress: string;
  chainId: number;
  nonce: string;
  statement: string;
  expiresAt: string;
};

type VerifiedAuthSessionResponse = {
  walletAddress: string;
  chainId: number;
  issuedAt: string;
  expiresAt: string;
  authSessionToken: string;
};

type DailyCheckInResponse = {
  success: boolean;
  checkInDate: string;
  xpAwarded?: number;
  newStreak?: number;
  rareAccessActive?: boolean;
  currentStreak?: number;
  rareRewardAccessActive?: boolean;
  onchain?: {
    mode: "user-paid";
    txHash: string | null;
  };
};

type OnboardingCompletionResponse = {
  profileId: string;
  nickname: string;
  avatarId: string;
  onboardingXpGranted: number;
  totalXp: number;
};

type OnboardingCard = {
  id: string;
  title: string;
  question: string;
  options: [string, string];
  correctIndex: 0 | 1;
  wrongExplanation: string;
};

type WalletFlowStage =
  | "idle"
  | "connecting"
  | "awaiting_wallet_approval"
  | "connected"
  | "signing_in"
  | "connect_failed"
  | "sign_in_failed"
  | "timed_out";

type WalletFlowPhase = "connect" | "sign_in" | null;
type GlassMode = "soft" | "medium" | "strong";

type WalletFlowState = {
  stage: WalletFlowStage;
  phase: WalletFlowPhase;
  message: string | null;
  detail?: string | null;
};

function getUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type QualificationStatus =
  | "locked"
  | "in_progress"
  | "qualified"
  | "paused"
  | "restored";

const QUALIFICATION_BADGE_COPY: Record<
  QualificationStatus,
  {
    label: string;
    className: string;
  }
> = {
  locked: {
    label: "Locked",
    className: "bg-[#eef2fb] text-[#5d6f93]",
  },
  in_progress: {
    label: "In progress",
    className:
      "bg-gradient-to-r from-[#dff2ff] to-[#e7e3ff] text-[#39588d]",
  },
  paused: {
    label: "Paused",
    className: "bg-[#f2ecff] text-[#6a5d93]",
  },
  restored: {
    label: "Restored",
    className:
      "bg-gradient-to-r from-[#fff0b0] to-[#ffd8ef] text-[#6e4f1f] shadow-[0_0_16px_rgba(255,212,135,0.45)]",
  },
  qualified: {
    label: "Qualified",
    className:
      "bg-gradient-to-r from-[#ffe38f] to-[#ffb5e7] text-[#6b3f00] shadow-[0_0_20px_rgba(255,208,128,0.65)]",
  },
};

/** Local-only demo: cycles profile bubble through all five rarity tiers (motion + styling). */
const COSMETIC_PREVIEW_INTERVAL_MS = 5000;

const COSMETIC_PREVIEW_DEMOS: EquippedStyleSnapshot[] = [
  {
    rewardId: "demo-c",
    rewardKey: "preview.bubble.azure.mist",
    rarity: "common",
    source: "cosmetic",
    variant: "preview",
    appliedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    rewardId: "demo-u",
    rewardKey: "preview.bubble.lagoon.sheen",
    rarity: "uncommon",
    source: "cosmetic",
    variant: "preview",
    appliedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    rewardId: "demo-r",
    rewardKey: "preview.bubble.reef.current",
    rarity: "rare",
    source: "cosmetic",
    variant: "preview",
    appliedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    rewardId: "demo-e",
    rewardKey: "preview.bubble.nebula.veil",
    rarity: "epic",
    source: "cosmetic",
    variant: "preview",
    appliedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    rewardId: "demo-l",
    rewardKey: "preview.bubble.solar.crown",
    rarity: "legendary",
    source: "cosmetic",
    variant: "preview",
    appliedAt: "2026-01-01T00:00:00.000Z",
  },
];

const ONBOARDING_CARDS: OnboardingCard[] = [
  {
    id: "daily-checkin",
    title: "Daily rhythm",
    question: "What keeps season reward progress active in BubbleDrop?",
    options: ["Daily Base check-in", "Opening the app only"],
    correctIndex: 0,
    wrongExplanation:
      "Season reward progress is tied to daily Base check-ins, not passive app opens.",
  },
  {
    id: "active-play",
    title: "Active session",
    question: "When is XP earned in bubble sessions?",
    options: ["Only during active play", "While idle in the app"],
    correctIndex: 0,
    wrongExplanation:
      "XP is active-play based. Idle presence must not grant session XP.",
  },
  {
    id: "qualified-overlay",
    title: "Status logic",
    question: "How does Qualified Status work with Rank Frame?",
    options: ["It overlays Rank Frame", "It replaces Rank Frame"],
    correctIndex: 0,
    wrongExplanation:
      "Qualified is a live overlay. Rank Frame remains long-term profile status.",
  },
];

function shortenWalletAddress(value: string | null): string {
  if (!value) {
    return "No wallet yet";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function getAvatarGlyph(
  nickname: string | null | undefined,
  avatarLabel: string | null | undefined,
): string {
  const source = nickname?.trim() || avatarLabel?.trim() || "Bubble";
  const cleaned = source.replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return cleaned.slice(0, 2).toUpperCase() || "BD";
}

function formatRewardKeyLabel(rewardKey: string): string {
  return rewardKey
    .split(/[._-]+/)
    .filter((part) => part && part !== "qa" && part !== "inventory")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function inferStyleCategoryLabel(rewardKey: string): string {
  const normalized = rewardKey.toLowerCase();
  if (normalized.includes("avatar")) {
    return "Avatar";
  }
  if (normalized.includes("trail") || normalized.includes("aura")) {
    return "Trail";
  }
  if (normalized.includes("badge") || normalized.includes("emblem")) {
    return "Badge";
  }
  return "Bubble skin";
}

type WorldIconKind =
  | "season"
  | "hunt"
  | "style"
  | "board"
  | "referrals"
  | "tokens"
  | "refresh"
  | "sync"
  | "disconnect"
  | "vault"
  | "claim"
  | "auth";

function WorldIcon({ kind, className }: { kind: WorldIconKind; className?: string }) {
  const iconClassName = "h-3.5 w-3.5 text-[#4f6796]";
  const mergedClassName = className
    ? `${iconClassName} ${className}`
    : iconClassName;
  if (kind === "season") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 3.8V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16 3.8V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7 10.5H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "hunt") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="11" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M15.8 15.8L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "style") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <path
          d="M12 3.5L13.8 8.2L18.5 10L13.8 11.8L12 16.5L10.2 11.8L5.5 10L10.2 8.2L12 3.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "board") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <path d="M12 4.5L14.3 9.2L19.5 9.9L15.7 13.5L16.6 18.7L12 16.2L7.4 18.7L8.3 13.5L4.5 9.9L9.7 9.2L12 4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "referrals") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="16.5" cy="10.5" r="2.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4.8 17.8C5.5 15.7 7.1 14.6 9 14.6C10.9 14.6 12.5 15.7 13.2 17.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M14.6 17.5C15.1 16.2 16.1 15.4 17.3 15.4C18.1 15.4 18.8 15.7 19.4 16.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "refresh") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <path d="M19 9.5A7.2 7.2 0 1 0 20 13.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M19.8 5.5V10H15.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "sync") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <path d="M8 7H16V17H8V7Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 4.8H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M11.2 10.5L14.3 12L11.2 13.5V10.5Z" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "disconnect") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <path d="M9 8.2V6.8C9 5.8 9.8 5 10.8 5H17.2C18.2 5 19 5.8 19 6.8V17.2C19 18.2 18.2 19 17.2 19H10.8C9.8 19 9 18.2 9 17.2V15.8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M14 12H3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6.4 9.4L3.8 12L6.4 14.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "vault") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <rect x="4" y="6" width="16" height="12" rx="2.6" stroke="currentColor" strokeWidth="1.8" />
        <path d="M13 12H16.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="10" cy="12" r="1.6" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (kind === "claim") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <path d="M7 12.2L10.3 15.5L17.2 8.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (kind === "auth") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <path d="M7.2 10V7.8C7.2 5.6 9 3.8 11.2 3.8H12.8C15 3.8 16.8 5.6 16.8 7.8V10" stroke="currentColor" strokeWidth="1.8" />
        <rect x="5.2" y="10" width="13.6" height="10.2" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="15.1" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
      <ellipse cx="12" cy="13.6" rx="7" ry="5.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.2 11.7C9.1 10.7 10.5 10 12 10C13.5 10 14.9 10.7 15.8 11.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9.2" cy="13.2" r="0.8" fill="currentColor" />
      <circle cx="14.8" cy="13.2" r="0.8" fill="currentColor" />
    </svg>
  );
}

const CONNECT_TIMEOUT_MS = 25_000;
const SIGN_IN_TIMEOUT_MS = 45_000;
const NETWORK_REQUEST_TIMEOUT_MS = 15_000;
const PROFILE_SYNC_RETRY_COUNT = 1;
const GLASS_MODE_STORAGE_KEY = "bubbledrop.glass-mode";
const IDLE_WALLET_FLOW_STATE: WalletFlowState = {
  stage: "idle",
  phase: null,
  message: null,
  detail: null,
};

type BackendFailureDetails = {
  userMessage: string;
  detail: string | null;
};

async function getBackendFailureDetails(
  response: Response,
  fallbackMessage: string,
): Promise<BackendFailureDetails> {
  let rawMessage = "";

  try {
    const responseText = await response.text();
    if (responseText) {
      try {
        const parsed = JSON.parse(responseText) as { message?: unknown };
        rawMessage =
          typeof parsed.message === "string" ? parsed.message.trim() : responseText.trim();
      } catch {
        rawMessage = responseText.trim();
      }
    }
  } catch {
    rawMessage = "";
  }

  if (
    response.status === 503 &&
    rawMessage === "BubbleDrop live data is unavailable right now."
  ) {
    return {
      userMessage: "BubbleDrop sign-in is temporarily unavailable right now.",
      detail:
        "Diagnostic: the frontend backend-proxy returned 503 because this deployment does not have a backend origin configured.",
    };
  }

  if (rawMessage) {
    return {
      userMessage: fallbackMessage,
      detail: `Diagnostic: backend returned ${response.status} ${rawMessage}`,
    };
  }

  return {
    userMessage: fallbackMessage,
    detail: `Diagnostic: backend returned HTTP ${response.status}.`,
  };
}

/** User-visible reason when POST /profile/connect-wallet fails (debug Sync profile). */
async function getProfileConnectWalletErrorMessage(
  response: Response,
): Promise<string> {
  const status = response.status;
  let raw = "";
  try {
    raw = await response.text();
  } catch {
    return `Server error (HTTP ${status}). Tap Sync profile to retry.`;
  }

  let serverMessage = "";
  try {
    const parsed = JSON.parse(raw) as {
      message?: string | string[];
      error?: string;
    };
    if (Array.isArray(parsed.message)) {
      serverMessage = parsed.message.filter(Boolean).join(". ");
    } else if (typeof parsed.message === "string") {
      serverMessage = parsed.message.trim();
    }
    if (!serverMessage && typeof parsed.error === "string") {
      serverMessage = parsed.error.trim();
    }
  } catch {
    serverMessage = raw.replace(/\s+/g, " ").trim().slice(0, 240);
  }

  if (status === 503) {
    if (
      serverMessage.includes("BubbleDrop live data is unavailable") ||
      serverMessage.includes("unavailable right now")
    ) {
      return "API not linked: set BACKEND_URL (your Nest API URL) in Vercel → Environment Variables, redeploy, then Sync profile again.";
    }
    return serverMessage
      ? `Service unavailable (503): ${serverMessage}`
      : "Service unavailable (503). Check backend is running and BACKEND_URL is correct.";
  }

  if (status === 403) {
    return "Session wallet mismatch: use Sign in with Base for this wallet, then Sync profile again.";
  }

  if (status === 401) {
    return "Session expired or invalid: Sign in with Base again, then Sync profile.";
  }

  if (status >= 500) {
    const trimmed = serverMessage.trim();
    const isGeneric =
      !trimmed ||
      /^internal server error$/i.test(trimmed) ||
      /^http \d+$/i.test(trimmed);
    if (isGeneric) {
      return `Server error (${status}). API side: set DATABASE_URL to PostgreSQL, run migrations (npm run db:migration:run), redeploy backend. Then Sync profile again.`;
    }
    return `Server error (${status}): ${serverMessage.slice(0, 220)}`;
  }

  if (serverMessage) {
    return `Could not create profile (${status}): ${serverMessage.slice(0, 220)}`;
  }

  return `Could not create profile (HTTP ${status}). Tap Sync profile to retry.`;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = NETWORK_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getSmokeWalletOverride():
  | {
      address: string;
      chainId: number;
    }
  | null {
  if (
    process.env.NEXT_PUBLIC_SMOKE_TEST_MODE !== "1" ||
    typeof window === "undefined"
  ) {
    return null;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const address = searchParams.get("smokeWalletAddress")?.trim().toLowerCase();
  if (!address) {
    return null;
  }

  const chainIdValue = searchParams.get("smokeChainId");
  const parsedChainId = chainIdValue ? Number(chainIdValue) : base.id;
  return {
    address,
    chainId: Number.isFinite(parsedChainId) ? parsedChainId : base.id,
  };
}

type IntroBubbleRole = "ambient" | "interactive" | "heroTarget";

type IntroBubbleSpec = {
  id: string;
  role: IntroBubbleRole;
  topPct: number;
  leftPct: number;
  sizeRem: number;
  delayMs: number;
  driftDurationMs: number;
  pulseDurationMs: number;
  driftX1: string;
  driftY1: string;
  driftX2: string;
  driftY2: string;
  driftX3: string;
  driftY3: string;
  driftX4: string;
  driftY4: string;
  hue: number;
  alpha: number;
};
const REQUIRED_INTRO_POPS = 4;
const INTRO_SKIP_SESSION_KEY = "bubbledrop:intro-skip-once";
const DAILY_CHECK_IN_CALLS_TIMEOUT_MS = 45_000;
const DAILY_CHECK_IN_CALLS_POLL_INTERVAL_MS = 1_200;
const DAILY_CHECK_IN_STREAK_ABI = parseAbi([
  "function checkIn(address wallet, uint32 dayKey) returns (uint32)",
]);

function getUtcDayKey(date: Date): number {
  return Math.floor(Date.parse(`${getUtcDateKey(date)}T00:00:00.000Z`) / 1000 / (24 * 60 * 60));
}

async function waitForCallsStatusTxHash(
  provider: {
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  },
  id: string,
): Promise<string | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < DAILY_CHECK_IN_CALLS_TIMEOUT_MS) {
    const result = (await provider.request({
      method: "wallet_getCallsStatus",
      params: [id],
    })) as {
      status: "pending" | "success" | "failure" | undefined;
      receipts?: Array<{ transactionHash?: string }>;
    };
    const transactionHash =
      result.receipts?.find((receipt) => typeof receipt.transactionHash === "string")
        ?.transactionHash ?? null;

    if (result.status === "success" && transactionHash) {
      return transactionHash;
    }

    if (result.status === "failure") {
      throw new Error("bubbledrop-daily-checkin-sendcalls-failed");
    }

    if (result.status === "success" && !transactionHash) {
      return null;
    }

    await new Promise((resolve) =>
      window.setTimeout(resolve, DAILY_CHECK_IN_CALLS_POLL_INTERVAL_MS),
    );
  }

  throw new Error("bubbledrop-timeout:daily_check_in");
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function createIntroBubbles(count = 26, patternSeed = 0): IntroBubbleSpec[] {
  return Array.from({ length: count }, (_, index) => {
    const idx = index + 1;
    const seedOffset = patternSeed * 0.61803398875;
    const majorSeed = seededUnit(idx * 1.73 + seedOffset);
    const speedSeed = seededUnit(idx * 2.31 + seedOffset);
    const directionSeed = seededUnit(idx * 3.17 + seedOffset);
    const toneSeed = seededUnit(idx * 4.09 + seedOffset);
    const roleSeed = seededUnit(idx * 5.67 + seedOffset);
    const pathSeedA = seededUnit(idx * 10.11 + seedOffset);
    const pathSeedB = seededUnit(idx * 11.17 + seedOffset);
    const pathSeedC = seededUnit(idx * 12.23 + seedOffset);
    const pathSeedD = seededUnit(idx * 13.19 + seedOffset);
    const pathSeedE = seededUnit(idx * 14.27 + seedOffset);
    const role: IntroBubbleRole =
      roleSeed > 0.88 || idx % 11 === 0
        ? "heroTarget"
        : roleSeed > 0.42
          ? "interactive"
          : "ambient";
    const rolePalette =
      role === "heroTarget"
        ? [202, 214, 224, 272, 316]
        : role === "interactive"
          ? [198, 208, 220, 266, 308]
          : [192, 204, 214, 258, 294];
    const hue = rolePalette[Math.floor(toneSeed * rolePalette.length) % rolePalette.length];
    const baseTop =
      role === "heroTarget"
        ? 26 + majorSeed * 56
        : role === "interactive"
          ? 18 + majorSeed * 70
          : 12 + majorSeed * 82;
    const baseLeft = 7 + seededUnit(idx * 9.13 + seedOffset) * 86;
    const sizeRem =
      role === "heroTarget"
        ? 3.55 + majorSeed * 1.35
        : role === "interactive"
          ? 2.2 + majorSeed * 1.3
          : 1.2 + majorSeed * 1.5;
    const driftDurationMs =
      role === "heroTarget"
        ? 7600 + Math.round(speedSeed * 2800)
        : role === "interactive"
          ? 9800 + Math.round(speedSeed * 3600)
          : 14000 + Math.round(speedSeed * 5200);
    const pulseDurationMs =
      role === "heroTarget"
        ? 1900 + Math.round(pathSeedA * 900)
        : role === "interactive"
          ? 2400 + Math.round(pathSeedA * 1200)
          : 3200 + Math.round(pathSeedA * 1400);
    const driftScale = role === "ambient" ? 0.45 : role === "interactive" ? 0.8 : 1;

    return {
      id: `intro-${idx}`,
      role,
      topPct: Number(baseTop.toFixed(2)),
      leftPct: Number(baseLeft.toFixed(2)),
      sizeRem,
      delayMs: Math.round(speedSeed * 1600),
      driftDurationMs,
      pulseDurationMs,
      driftX1: `${Math.round((pathSeedA - 0.5) * 44 * driftScale)}vw`,
      driftY1: `${Math.round((pathSeedB - 0.5) * 32 * driftScale)}vh`,
      driftX2: `${Math.round((directionSeed - 0.5) * 40 * driftScale)}vw`,
      driftY2: `${Math.round((pathSeedC - 0.5) * 28 * driftScale)}vh`,
      driftX3: `${Math.round((pathSeedD - 0.5) * 36 * driftScale)}vw`,
      driftY3: `${Math.round((pathSeedE - 0.5) * 34 * driftScale)}vh`,
      driftX4: `${Math.round((pathSeedB - 0.5) * 26 * driftScale)}vw`,
      driftY4: `${Math.round((pathSeedD - 0.5) * 22 * driftScale)}vh`,
      hue,
      alpha:
        role === "ambient"
          ? 0.22 + seededUnit(idx * 8.21 + seedOffset) * 0.12
          : role === "interactive"
            ? 0.34 + seededUnit(idx * 8.21 + seedOffset) * 0.18
            : 0.46 + seededUnit(idx * 8.21 + seedOffset) * 0.2,
    };
  });
}

export function BubbleDropShell() {
  const backendUrl = BUBBLEDROP_API_BASE;
  const runtimeContext = useBubbleDropRuntime();
  const [smokeWalletOverride, setSmokeWalletOverride] = useState<{
    address: string;
    chainId: number;
  } | null>(null);
  const [profileId, setProfileId] = useState<string | null>(
    runtimeContext.profileId,
  );
  const [bootstrappedWalletAddress, setBootstrappedWalletAddress] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [isResolvingFirstEntry, setIsResolvingFirstEntry] = useState(true);
  const [isFirstEntry, setIsFirstEntry] = useState(true);
  const [profileSummary, setProfileSummary] = useState<BackendProfileSummary | null>(null);
  const [signInSession, setSignInSession] =
    useState<BubbleDropFrontendSignInSession | null>(null);
  const [walletFlowState, setWalletFlowState] =
    useState<WalletFlowState>(IDLE_WALLET_FLOW_STATE);
  const [isSigningInWithBase, setIsSigningInWithBase] = useState(false);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [dailyCheckInCompletedToday, setDailyCheckInCompletedToday] = useState(false);
  const [glassMode, setGlassMode] = useState<GlassMode>("medium");
  const [cardIndex, setCardIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showWrongExplanation, setShowWrongExplanation] = useState(false);
  const [onboardingSessionCompleted, setOnboardingSessionCompleted] = useState(false);
  const [isProfileBubblePressed, setIsProfileBubblePressed] = useState(false);
  const [welcomeIntroVisible, setWelcomeIntroVisible] = useState(true);
  const [equippedStyleSnapshot, setEquippedStyleSnapshot] =
    useState<EquippedStyleSnapshot | null>(null);
  const [selectedAvatarOverrideId, setSelectedAvatarOverrideId] = useState<string | null>(null);
  const [selectedAvatarOverridePaletteKey, setSelectedAvatarOverridePaletteKey] =
    useState<string | null>(null);
  const [cosmeticTierPreviewActive, setCosmeticTierPreviewActive] = useState(false);
  const [cosmeticPreviewIndex, setCosmeticPreviewIndex] = useState(0);
  const [introPoppedBubbleIds, setIntroPoppedBubbleIds] = useState<string[]>([]);
  const [introPoppingBubbleIds, setIntroPoppingBubbleIds] = useState<string[]>([]);
  const [introNudgedBubbleIds, setIntroNudgedBubbleIds] = useState<string[]>([]);
  const [introPopBursts, setIntroPopBursts] = useState<
    Array<{ id: string; x: number; y: number; hue: number }>
  >([]);
  const [introPatternSeed, setIntroPatternSeed] = useState(0);
  const introBubbles = useMemo(
    () => createIntroBubbles(26, introPatternSeed),
    [introPatternSeed],
  );
  const introBubbleMap = useMemo(
    () => new Map(introBubbles.map((bubble) => [bubble.id, bubble])),
    [introBubbles],
  );
  const introAudioContextRef = useRef<AudioContext | null>(null);
  const introAudioUnavailableRef = useRef(false);
  const { address, chainId, isConnected } = useAccount();
  const connection = useConnection();
  const { connectAsync, connectors, isPending: isWalletConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: base.id });
  const { writeContractAsync } = useWriteContract();

  const currentCard = ONBOARDING_CARDS[cardIndex];
  const connectedWalletAddress =
    smokeWalletOverride?.address ?? address?.trim().toLowerCase() ?? null;
  const activeWalletAddress =
    connectedWalletAddress ?? (bootstrappedWalletAddress.trim() || null);
  const effectiveIsConnected = smokeWalletOverride ? true : isConnected;
  const effectiveChainId = smokeWalletOverride?.chainId ?? chainId;
  const isConnectedToBase =
    effectiveIsConnected && effectiveChainId === base.id;
  const dailyCheckInContractAddress = useMemo(() => {
    const configuredAddress =
      process.env.NEXT_PUBLIC_ONCHAIN_STREAK_CONTRACT_ADDRESS?.trim() ?? "";
    return isAddress(configuredAddress)
      ? (configuredAddress as Address)
      : null;
  }, []);
  const {
    preferredConnector,
    coinbaseInjectedConnector,
    baseAccountConnector,
    coinbaseWalletConnector,
  } = useMemo(() => getBubbleDropWalletConnectors(connectors), [connectors]);
  const preferredConnectorUsesInjectedBase =
    preferredConnector?.id === coinbaseInjectedConnector?.id;
  const preferredConnectorUsesCoinbaseWallet =
    preferredConnector?.id === coinbaseWalletConnector?.id;
  const preferredConnectorUsesBaseAccount =
    preferredConnector?.id === baseAccountConnector?.id;
  const fallbackWalletConnector =
    [coinbaseWalletConnector, baseAccountConnector].find(
      (connector) => connector && connector.id !== preferredConnector?.id,
    ) ?? null;
  const fallbackConnectorUsesCoinbaseWallet =
    fallbackWalletConnector?.id === coinbaseWalletConnector?.id;
  const onboardingVisible = useMemo(() => {
    return !isResolvingFirstEntry && isFirstEntry && !onboardingSessionCompleted;
  }, [isResolvingFirstEntry, isFirstEntry, onboardingSessionCompleted]);
  const onboardingCompletionVisible = useMemo(() => {
    return !isResolvingFirstEntry && isFirstEntry && onboardingSessionCompleted;
  }, [isResolvingFirstEntry, isFirstEntry, onboardingSessionCompleted]);
  const isSignedInWithBase = signInSessionMatchesWallet(
    signInSession,
    connectedWalletAddress,
    effectiveChainId,
  );
  const authenticatedSessionToken =
    isSignedInWithBase && hasVerifiedAuthSession(signInSession)
      ? signInSession?.authSessionToken ?? null
      : null;
  const showWelcomeBeforeSync = Boolean(
    !profileId && connectedWalletAddress && authenticatedSessionToken,
  );
  const isWalletFlowBusy =
    isWalletConnectPending ||
    isSigningInWithBase ||
    walletFlowState.stage === "connecting" ||
    walletFlowState.stage === "awaiting_wallet_approval" ||
    walletFlowState.stage === "signing_in";
  const showConnectRecovery =
    !effectiveIsConnected &&
    (walletFlowState.stage === "connect_failed" ||
      (walletFlowState.stage === "timed_out" &&
        walletFlowState.phase === "connect"));
  const showSignInRecovery =
    effectiveIsConnected &&
    isConnectedToBase &&
    !isSignedInWithBase &&
    (walletFlowState.stage === "sign_in_failed" ||
      (walletFlowState.stage === "timed_out" &&
        walletFlowState.phase === "sign_in"));

  const qualificationStatus = profileSummary?.qualificationState.status;
  const isRareRewardAccessActive = profileSummary?.rareRewardAccess.active ?? false;
  const qualificationBadge = qualificationStatus
    ? QUALIFICATION_BADGE_COPY[qualificationStatus]
    : null;
  const nicknameDisplay =
    profileSummary?.profileIdentity.nickname ??
    (connectedWalletAddress ? "Fresh bubble" : "Guest bubble");
  const profileCardEquippedStyle = cosmeticTierPreviewActive
    ? COSMETIC_PREVIEW_DEMOS[cosmeticPreviewIndex % COSMETIC_PREVIEW_DEMOS.length]
    : equippedStyleSnapshot;
  const profileVisualSeed =
    profileCardEquippedStyle?.rewardKey ??
    profileCardEquippedStyle?.rewardId ??
    profileSummary?.avatarState.currentAvatar?.key ??
    selectedAvatarOverrideId ??
    profileSummary?.avatarState.currentAvatar?.id ??
    "bubble-default";
  const profileBubbleTone = getAvatarBubbleTone(
    profileSummary?.avatarState.currentAvatar?.paletteKey ??
      selectedAvatarOverridePaletteKey,
    profileVisualSeed,
  );
  const equippedRarity = profileCardEquippedStyle?.rarity ?? null;
  const profileStyleShellClass =
    equippedRarity === "legendary"
      ? "from-white/90 via-[#faf8f5]/88 to-[#f5f0e8]/82 ring-[#e8dcc8]/70"
      : equippedRarity === "epic"
        ? "from-[#f2e8ff]/86 via-[#e7ddff]/72 to-[#d8ecff]/68 ring-[#ddbeff]/72"
        : equippedRarity === "rare"
          ? "from-[#e6f8ff]/86 via-[#d8f0ff]/74 to-[#dce8ff]/66 ring-[#b8e8ff]/72"
          : equippedRarity === "uncommon"
            ? "from-[#e8fbff]/86 via-[#dcf8fc]/74 to-[#e6f2ff]/68 ring-[#8ee0e8]/72"
            : "from-white/84 via-white/72 to-white/66 ring-white/72";
  const profileRarityChipClass =
    equippedRarity === "legendary"
      ? "profile-rarity-chip-legendary"
      : equippedRarity === "epic"
        ? "profile-rarity-chip-epic"
        : equippedRarity === "rare"
          ? "profile-rarity-chip-rare"
          : equippedRarity === "uncommon"
            ? "profile-rarity-chip-uncommon"
            : "profile-rarity-chip-common";
  const profileEmblemRarityClass =
    equippedRarity === "legendary"
      ? "profile-emblem-rarity-legendary-framer"
      : equippedRarity === "epic"
        ? "profile-emblem-rarity-epic"
        : equippedRarity === "rare"
          ? "profile-emblem-rarity-rare"
          : equippedRarity === "uncommon"
            ? "profile-emblem-rarity-uncommon"
            : "profile-emblem-rarity-common";
  const profileEmblemCategoryClass = profileCardEquippedStyle
    ? inferStyleCategoryLabel(profileCardEquippedStyle.rewardKey) === "Trail"
      ? "profile-emblem-category-trail"
      : inferStyleCategoryLabel(profileCardEquippedStyle.rewardKey) === "Badge"
        ? "profile-emblem-category-badge"
        : inferStyleCategoryLabel(profileCardEquippedStyle.rewardKey) === "Avatar"
          ? "profile-emblem-category-avatar"
          : "profile-emblem-category-bubble"
    : "profile-emblem-category-bubble";
  const equippedStyleName = profileCardEquippedStyle
    ? formatRewardKeyLabel(profileCardEquippedStyle.rewardKey)
    : "Default style";
  const walletDisplay = shortenWalletAddress(
    activeWalletAddress ?? connectedWalletAddress,
  );
  const totalXp = profileSummary?.xpSummary.totalXp ?? 0;
  const currentStreak = profileSummary?.xpSummary.currentStreak ?? 0;
  const currentFrameLabel =
    profileSummary?.rankFrameState.currentFrame?.label ?? "Fresh bubble";
  const nextFrame = profileSummary?.rankFrameState.nextFrame;
  const currentFrameFloorXp =
    profileSummary?.rankFrameState.currentFrame?.minLifetimeXp ?? 0;
  const hasUnlockedCollection =
    Boolean(profileId) && !profileSummary?.onboardingState.needsOnboarding;
  /** After wallet + profile sync: show hero, Bubble world, Glass, etc. */
  const showFullBubbleDropMenu = Boolean(profileId);
  const progressToNextFramePercent = nextFrame
    ? Math.max(
        8,
        Math.min(
          100,
          Math.round(
            ((totalXp - currentFrameFloorXp) /
              Math.max(1, nextFrame.minLifetimeXp - currentFrameFloorXp)) *
              100,
          ),
        ),
      )
    : profileSummary
      ? 100
      : 8;
  const quickSessionHref = withBubbleDropContext("/session", {
    profileId,
    walletAddress: activeWalletAddress,
  });
  const rewardsInventoryHref = withBubbleDropContext("/inventory", {
    profileId,
    walletAddress: activeWalletAddress,
  });
  const referralsHref = withBubbleDropContext("/referrals", {
    profileId,
    walletAddress: activeWalletAddress,
  });
  const leaderboardHref = withBubbleDropContext("/leaderboard", {
    profileId,
    walletAddress: activeWalletAddress,
  });
  const seasonHref = withBubbleDropContext("/season", {
    profileId,
    walletAddress: activeWalletAddress,
  });
  const partnerTokensHref = withBubbleDropContext("/partner-tokens", {
    profileId,
    walletAddress: activeWalletAddress,
  });
  const walletFlowCardStyle =
    walletFlowState.stage === "connect_failed" ||
    walletFlowState.stage === "sign_in_failed" ||
    walletFlowState.stage === "timed_out"
      ? "border-[#f6c2d4] bg-[#fff2f7] text-[#7f3a53]"
      : "border-[#dce6ff] bg-[#f8fbff] text-[#2d4578]";
  const walletFlowTitle =
    walletFlowState.stage === "connecting"
      ? "Signing in…"
      : walletFlowState.stage === "awaiting_wallet_approval"
        ? "Awaiting wallet approval"
        : walletFlowState.stage === "signing_in"
          ? "Signing in"
          : walletFlowState.stage === "connect_failed"
            ? "Connect failed"
            : walletFlowState.stage === "sign_in_failed"
              ? "Sign-in failed"
              : walletFlowState.stage === "timed_out"
                ? "Timed out"
                : walletFlowState.stage === "connected"
                  ? "Connected"
                  : null;
  useEffect(() => {
    setSmokeWalletOverride(getSmokeWalletOverride());
  }, []);

  useEffect(() => {
    if (
      smokeWalletOverride &&
      connectedWalletAddress &&
      effectiveChainId === base.id
    ) {
      setSignInSession(
        createSmokeSignInSession(connectedWalletAddress, effectiveChainId),
      );
      return;
    }

    if (!connectedWalletAddress || !effectiveChainId) {
      clearBubbleDropFrontendSignInSession();
      setSignInSession(null);
      return;
    }

    const storedSession = loadBubbleDropFrontendSignInSession();
    if (
      signInSessionMatchesWallet(
        storedSession,
        connectedWalletAddress,
        effectiveChainId,
      )
    ) {
      setSignInSession(storedSession);
      return;
    }

    clearBubbleDropFrontendSignInSession();
    setSignInSession(null);
  }, [connectedWalletAddress, effectiveChainId, smokeWalletOverride]);

  useEffect(() => {
    if (!effectiveIsConnected) {
      setWalletFlowState((currentState) =>
        currentState.stage === "connect_failed" ||
        currentState.stage === "timed_out"
          ? currentState
          : IDLE_WALLET_FLOW_STATE,
      );
      return;
    }

    if (
      isSignedInWithBase &&
      (walletFlowState.stage === "signing_in" ||
        (walletFlowState.stage === "awaiting_wallet_approval" &&
          walletFlowState.phase === "sign_in"))
    ) {
      setWalletFlowState({
        stage: "connected",
        phase: "sign_in",
        message: "Wallet confirmed. You're signed in.",
        detail: null,
      });
    }
  }, [effectiveIsConnected, isSignedInWithBase, walletFlowState.phase, walletFlowState.stage]);

  const refreshProfileSummary = async (targetProfileId: string) => {
    const summary = await fetchBackendProfileSummary(backendUrl, targetProfileId);
    if (!summary) {
      setActionMessage("BubbleDrop is still waking up. Try again in a moment.");
      return null;
    }

    const needsOnboarding = summary.onboardingState.needsOnboarding;
    setProfileSummary(summary);
    setProfileId(summary.profileIdentity.profileId);
    setIsFirstEntry(needsOnboarding);
    setBootstrappedWalletAddress(summary.profileIdentity.walletAddress);
    setNicknameInput(summary.profileIdentity.nickname ?? "");
    runtimeContext.setAppContext({
      profileId: summary.profileIdentity.profileId,
      walletAddress: summary.profileIdentity.walletAddress,
    });
    identifyAnalyticsUser(summary.profileIdentity.profileId, {
      wallet_address: summary.profileIdentity.walletAddress,
    });
    return summary;
  };

  useEffect(() => {
    captureAnalyticsEvent("bubbledrop_app_started", {
      backend_proxy_enabled: true,
      has_profile_context: !!runtimeContext.profileId,
    });
  }, [runtimeContext.profileId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedMode = window.localStorage.getItem(GLASS_MODE_STORAGE_KEY);
    if (storedMode === "soft" || storedMode === "medium" || storedMode === "strong") {
      setGlassMode(storedMode);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const body = window.document.body;
    body.classList.remove("glass-soft", "glass-medium", "glass-strong");
    body.classList.add(`glass-${glassMode}`);
    window.localStorage.setItem(GLASS_MODE_STORAGE_KEY, glassMode);
  }, [glassMode]);

  useEffect(() => {
    setProfileId(runtimeContext.profileId);
  }, [runtimeContext.profileId]);

  useEffect(() => {
    if (!profileId) {
      setEquippedStyleSnapshot(null);
      return;
    }
    const persisted = loadPersistedEquippedStyles(profileId);
    const merged = { ...persisted };
    const backendStyle = profileSummary?.styleState?.equippedStyle ?? null;
    if (backendStyle) {
      const slot = inferSlotFromRewardKey(backendStyle.rewardKey);
      merged[slot] = backendStyle;
      savePersistedEquippedStyle(profileId, backendStyle);
    }
    const primary = getPrimaryEquippedStyle(merged);
    setEquippedStyleSnapshot(primary);
  }, [profileId, profileSummary]);

  useEffect(() => {
    if (!profileId) {
      setSelectedAvatarOverrideId(null);
      setSelectedAvatarOverridePaletteKey(null);
      return;
    }
    const override = loadSelectedAvatarOverrideState(profileId);
    setSelectedAvatarOverrideId(override?.avatarId ?? loadSelectedAvatarOverride(profileId));
    setSelectedAvatarOverridePaletteKey(override?.paletteKey ?? null);
  }, [profileId]);

  useEffect(() => {
    if (!profileId) {
      return;
    }
    const currentAvatarId = profileSummary?.avatarState.currentAvatar?.id ?? null;
    const currentAvatarPaletteKey =
      profileSummary?.avatarState.currentAvatar?.paletteKey ?? null;
    if (!currentAvatarId) {
      return;
    }
    saveSelectedAvatarOverride(profileId, currentAvatarId, currentAvatarPaletteKey);
    setSelectedAvatarOverrideId(currentAvatarId);
    setSelectedAvatarOverridePaletteKey(currentAvatarPaletteKey);
  }, [
    profileId,
    profileSummary?.avatarState.currentAvatar?.id,
    profileSummary?.avatarState.currentAvatar?.paletteKey,
  ]);

  useEffect(() => {
    const resolveFirstEntry = async () => {
      const resolvedProfileId = runtimeContext.profileId;
      setProfileId(resolvedProfileId);

      if (!resolvedProfileId) {
        setIsFirstEntry(false);
        setIsResolvingFirstEntry(false);
        return;
      }

      try {
        const summary = await refreshProfileSummary(resolvedProfileId);
        if (!summary) {
          setIsFirstEntry(false);
        }
      } catch {
        setIsFirstEntry(false);
      } finally {
        setIsResolvingFirstEntry(false);
      }
    };

    void resolveFirstEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeContext.profileId]);

  const bootstrapProfileForWallet = async (
    walletAddress: string,
    {
      silent = false,
      source = "manual",
    }: { silent?: boolean; source?: "manual" | "auto" } = {},
  ) => {
    const normalizedWalletAddress = walletAddress.trim().toLowerCase();
    if (!normalizedWalletAddress) {
      if (!silent) {
        setActionMessage("Connect your Base wallet to continue.");
      }
      return;
    }
    if (!authenticatedSessionToken) {
      if (!silent) {
        setActionMessage("Sign in with Base to unlock your BubbleDrop profile.");
      }
      return;
    }

    const shouldBlockActions = !silent;
    if (shouldBlockActions) {
      setIsSubmittingAction(true);
      setActionMessage(null);
    }
    try {
      let response: Response | null = null;
      let timeoutTriggered = false;
      for (let attempt = 0; attempt <= PROFILE_SYNC_RETRY_COUNT; attempt += 1) {
        try {
          response = await fetchWithTimeout(`${backendUrl}/profile/connect-wallet`, {
            method: "POST",
            headers: createAuthenticatedJsonHeaders(authenticatedSessionToken),
            body: JSON.stringify({ walletAddress: normalizedWalletAddress }),
          });
          timeoutTriggered = false;
          break;
        } catch (error) {
          const isTimeoutAbort =
            error instanceof DOMException && error.name === "AbortError";
          if (!isTimeoutAbort || attempt >= PROFILE_SYNC_RETRY_COUNT) {
            throw error;
          }
          timeoutTriggered = true;
        }
      }

      if (!response) {
        if (shouldBlockActions && timeoutTriggered) {
          setActionMessage(
            "Profile sync timed out. Tap Sync profile below to try again.",
          );
        }
        return;
      }

      if (!response.ok) {
        if (shouldBlockActions) {
          const diagnostic = await getProfileConnectWalletErrorMessage(response);
          setActionMessage(diagnostic);
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[BubbleDrop] profile/connect-wallet failed", {
              status: response.status,
              hint: diagnostic,
            });
          }
        }
        return;
      }

      const payload = (await response.json()) as ProfileBootstrapResponse;
      setProfileId(payload.profileId);
      setBootstrappedWalletAddress(payload.walletAddress);
      runtimeContext.setAppContext({
        profileId: payload.profileId,
        walletAddress: payload.walletAddress,
      });
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("profileId", payload.profileId);
        url.searchParams.set("walletAddress", payload.walletAddress);
        window.history.replaceState(null, "", url.toString());
      }
      await refreshProfileSummary(payload.profileId);
      identifyAnalyticsUser(payload.profileId, {
        wallet_address: payload.walletAddress,
      });
      captureAnalyticsEvent("bubbledrop_profile_bootstrap_completed", {
        profile_id: payload.profileId,
        wallet_address: payload.walletAddress,
        source,
      });
      if (shouldBlockActions) {
        setActionMessage("Your BubbleDrop home is ready.");
      }
    } catch (error) {
      if (shouldBlockActions) {
        const isTimeoutAbort =
          error instanceof DOMException && error.name === "AbortError";
        if (isTimeoutAbort) {
          setActionMessage(
            "Profile sync timed out. Tap Sync profile below to try again.",
          );
        } else {
          const msg =
            error instanceof Error ? error.message : String(error ?? "unknown");
          const isNetwork =
            /failed to fetch|networkerror|load failed|network request failed/i.test(
              msg,
            );
          setActionMessage(
            isNetwork
              ? "Network error — check connection or VPN, then Sync profile again."
              : `Sync failed: ${msg.slice(0, 160)}`,
          );
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[BubbleDrop] profile/connect-wallet exception", error);
          }
        }
      }
    } finally {
      if (shouldBlockActions) {
        setIsSubmittingAction(false);
      }
    }
  };

  useEffect(() => {
    if (
      !backendUrl ||
      profileId ||
      !connectedWalletAddress ||
      !isConnectedToBase ||
      !authenticatedSessionToken ||
      isSubmittingAction
    ) {
      return;
    }

    const normalizedBootstrappedWalletAddress =
      bootstrappedWalletAddress.trim().toLowerCase();
    if (
      profileId &&
      normalizedBootstrappedWalletAddress === connectedWalletAddress
    ) {
      return;
    }

    void bootstrapProfileForWallet(connectedWalletAddress, {
      silent: true,
      source: "auto",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    backendUrl,
    bootstrappedWalletAddress,
    connectedWalletAddress,
    authenticatedSessionToken,
    isConnectedToBase,
    isSubmittingAction,
    profileId,
  ]);

  const onBootstrapProfile = async () => {
    if (!connectedWalletAddress) {
      setActionMessage("Connect your Base wallet to continue.");
      return;
    }
    if (!isConnectedToBase) {
      setActionMessage("Switch to Base and try again.");
      return;
    }
    if (!authenticatedSessionToken) {
      setActionMessage("Sign in with Base to unlock your BubbleDrop profile.");
      return;
    }

    await bootstrapProfileForWallet(connectedWalletAddress);
  };

  const connectWalletWithConnector = async (
    connector: NonNullable<typeof preferredConnector>,
    messages: {
      connecting: string;
      awaitingApproval: string;
      success: string;
      failed: string;
      timedOut: string;
    },
  ) => {
    setWalletFlowState({
      stage: "connecting",
      phase: "connect",
      message: messages.connecting,
      detail: null,
    });

    try {
      const connectPromise = connectAsync({ connector });
      setWalletFlowState({
        stage: "awaiting_wallet_approval",
        phase: "connect",
        message: messages.awaitingApproval,
        detail: null,
      });
      await withFlowTimeout(connectPromise, CONNECT_TIMEOUT_MS, "connect");
      setWalletFlowState({
        stage: "connected",
        phase: "connect",
        message: messages.success,
        detail: null,
      });
    } catch (error) {
      const classifiedError = classifyWalletFlowError(error);
      if (classifiedError.kind === "timeout") {
        setWalletFlowState({
          stage: "timed_out",
          phase: "connect",
          message: messages.timedOut,
          detail: "Diagnostic: wallet connection did not resolve before the local timeout window expired.",
        });
        return;
      }

      setWalletFlowState({
        stage: "connect_failed",
        phase: "connect",
        message:
          classifiedError.kind === "rejected"
            ? "Connection was cancelled. You can retry when you're ready."
            : messages.failed,
        detail:
          classifiedError.kind === "rejected"
            ? "Diagnostic: wallet connection request was rejected or closed by the wallet runtime."
            : `Diagnostic: ${classifiedError.message}`,
      });
    }
  };

  useEffect(() => {
    if (!profileId || typeof window === "undefined") {
      setDailyCheckInCompletedToday(false);
      return;
    }
    const today = getUtcDateKey(new Date());
    const storageKey = `bubbledrop:daily-checkin:${profileId}`;
    const storedDate = window.localStorage.getItem(storageKey);
    setDailyCheckInCompletedToday(storedDate === today);
  }, [profileId]);

  useEffect(() => {
    return () => {
      const currentAudioContext = introAudioContextRef.current;
      if (currentAudioContext) {
        void currentAudioContext.close();
      }
      introAudioContextRef.current = null;
    };
  }, []);

  useEffect(() => {
    const nextSeed = Math.floor(Math.random() * 1_000_000);
    setIntroPatternSeed(nextSeed);
    if (typeof window === "undefined") {
      setWelcomeIntroVisible(true);
      return;
    }

    const url = new URL(window.location.href);
    const skipIntroFromQuery = url.searchParams.get("skipIntro") === "1";
    const skipIntroFromSession =
      window.sessionStorage.getItem(INTRO_SKIP_SESSION_KEY) === "1";
    const skipIntro = skipIntroFromQuery || skipIntroFromSession;
    setWelcomeIntroVisible(!skipIntro);

    if (skipIntroFromQuery) {
      window.sessionStorage.setItem(INTRO_SKIP_SESSION_KEY, "1");
      url.searchParams.delete("skipIntro");
      window.history.replaceState(null, "", url.toString());
    }
    if (skipIntroFromSession) {
      window.sessionStorage.removeItem(INTRO_SKIP_SESSION_KEY);
    }
  }, []);

  const onConnectWallet = async () => {
    if (!preferredConnector) {
      setWalletFlowState({
        stage: "connect_failed",
        phase: "connect",
        message: "BubbleDrop could not open a Base wallet connection right now.",
        detail: "Diagnostic: no compatible Base or Coinbase wallet connector is available in this runtime.",
      });
      return;
    }

    if (preferredConnectorUsesCoinbaseWallet) {
      await connectWalletWithConnector(preferredConnector, {
        connecting: "Opening Coinbase Wallet...",
        awaitingApproval: "Approve the Coinbase Wallet connection request to continue.",
        success: "Wallet connected. Switch to Base if needed, then sign in.",
        failed: "Coinbase Wallet did not complete.",
        timedOut: "Coinbase Wallet took too long. Please retry.",
      });
      return;
    }

    if (preferredConnectorUsesBaseAccount) {
      await connectWalletWithConnector(preferredConnector, {
        connecting: "Opening Base connection...",
        awaitingApproval: "Approve the Base connection request to continue.",
        success: "Wallet connected. Continue with Sign in with Base.",
        failed: "BubbleDrop could not complete the Base connection right now.",
        timedOut: "Base connection took too long. Please retry.",
      });
      return;
    }

    await connectWalletWithConnector(preferredConnector, {
      connecting: preferredConnectorUsesInjectedBase
        ? "Checking for the in-app Base wallet..."
        : "Opening your Base wallet...",
      awaitingApproval: preferredConnectorUsesInjectedBase
        ? "Approve the in-app wallet prompt to continue."
        : "Approve the wallet connection request to continue.",
      success: "Wallet connected. Continue with Sign in with Base.",
      failed: preferredConnectorUsesInjectedBase
        ? "BubbleDrop could not complete the in-app Base connection. Stay in Base App and try again."
        : "BubbleDrop could not connect this wallet right now.",
      timedOut: preferredConnectorUsesInjectedBase
        ? "The in-app wallet prompt took too long. Stay in Base App and try again."
        : "Wallet connection took too long. Please retry.",
    });
  };

  const onConnectCoinbaseWallet = async () => {
    if (!fallbackWalletConnector) {
      return;
    }

    if (fallbackConnectorUsesCoinbaseWallet) {
      await connectWalletWithConnector(fallbackWalletConnector, {
        connecting: "Opening Coinbase Wallet fallback...",
        awaitingApproval: "Approve the Coinbase Wallet connection request to continue.",
        success: "Wallet connected. Switch to Base if needed, then sign in.",
        failed: "Coinbase Wallet fallback did not complete.",
        timedOut: "Coinbase Wallet fallback took too long. Please retry.",
      });
      return;
    }

    await connectWalletWithConnector(fallbackWalletConnector, {
      connecting: "Opening alternate Base connection...",
      awaitingApproval: "Approve the alternate Base connection request to continue.",
      success: "Wallet connected. Switch to Base if needed, then sign in.",
      failed: "Alternate Base connection did not complete.",
      timedOut: "Alternate Base connection took too long. Please retry.",
    });
  };

  const onSwitchToBase = async () => {
    setActionMessage("Switching to Base...");
    try {
      await switchChainAsync({ chainId: base.id });
      setActionMessage("Connected wallet is now on Base.");
    } catch {
      setActionMessage("We couldn't switch that wallet to Base.");
    }
  };

  const onClearBaseSignIn = () => {
    clearBubbleDropFrontendSignInSession();
    setSignInSession(null);
    setWalletFlowState(IDLE_WALLET_FLOW_STATE);
    setActionMessage("This browser session is signed out.");
  };

  const onSignInWithBase = async () => {
    if (!connectedWalletAddress) {
      setActionMessage("Connect your Base wallet first.");
      return;
    }
    if (!isConnectedToBase || !effectiveChainId) {
      setActionMessage("Switch to Base before signing in.");
      return;
    }

    setIsSigningInWithBase(true);
    setWalletFlowState({
      stage: "signing_in",
      phase: "sign_in",
      message: "Preparing secure sign-in...",
        detail: null,
    });

    try {
      const nonceResponse = await withFlowTimeout(
        fetch(`${backendUrl}/auth/session/nonce`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: connectedWalletAddress,
            chainId: effectiveChainId,
          }),
        }),
        SIGN_IN_TIMEOUT_MS,
        "sign_in",
      );
      if (!nonceResponse.ok) {
        const failureDetails = await getBackendFailureDetails(
          nonceResponse,
          "Sign in could not start right now.",
        );
        setWalletFlowState({
          stage: "sign_in_failed",
          phase: "sign_in",
          message: failureDetails.userMessage,
          detail: failureDetails.detail,
        });
        return;
      }

      const noncePayload =
        (await nonceResponse.json()) as AuthSessionNonceResponse;
      const issuedAt = new Date();
      const message = createSiweMessage({
        address: noncePayload.walletAddress as Address,
        chainId: noncePayload.chainId,
        domain: window.location.host,
        nonce: noncePayload.nonce,
        statement: noncePayload.statement,
        uri: window.location.origin,
        version: "1",
        issuedAt,
      });
      setWalletFlowState({
        stage: "awaiting_wallet_approval",
        phase: "sign_in",
        message: "Approve the Base signature to finish sign-in.",
        detail: null,
      });
      const signature = await withFlowTimeout(
        signMessageAsync({ message }),
        SIGN_IN_TIMEOUT_MS,
        "sign_in",
      );
      setWalletFlowState({
        stage: "signing_in",
        phase: "sign_in",
        message: "Finishing secure sign-in...",
        detail: null,
      });
      const verifyResponse = await withFlowTimeout(
        fetch(`${backendUrl}/auth/session/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            signature,
          }),
        }),
        SIGN_IN_TIMEOUT_MS,
        "sign_in",
      );
      if (!verifyResponse.ok) {
        const failureDetails = await getBackendFailureDetails(
          verifyResponse,
          "That signature could not be verified. Please try again.",
        );
        setWalletFlowState({
          stage: "sign_in_failed",
          phase: "sign_in",
          message: failureDetails.userMessage,
          detail: failureDetails.detail,
        });
        return;
      }
      const verifiedSession =
        (await verifyResponse.json()) as VerifiedAuthSessionResponse;

      const session: BubbleDropFrontendSignInSession = {
        address: verifiedSession.walletAddress,
        chainId: verifiedSession.chainId,
        issuedAt: verifiedSession.issuedAt,
        expiresAt: verifiedSession.expiresAt,
        statement: noncePayload.statement,
        message,
        signature,
        authSessionToken: verifiedSession.authSessionToken,
        mode: "siwe",
      };
      storeBubbleDropFrontendSignInSession(session);
      setSignInSession(session);
      captureAnalyticsEvent("bubbledrop_frontend_base_sign_in_completed", {
        wallet_address: verifiedSession.walletAddress,
        chain_id: verifiedSession.chainId,
      });
      setWalletFlowState({
        stage: "connected",
        phase: "sign_in",
        message: "Wallet confirmed. You're signed in.",
        detail: null,
      });
    } catch (error) {
      const classifiedError = classifyWalletFlowError(error);
      if (classifiedError.kind === "timeout") {
        setWalletFlowState({
          stage: "timed_out",
          phase: "sign_in",
          message: "The signature request took too long. Please retry in Base App.",
          detail:
            "Diagnostic: the sign-in flow did not complete before the local timeout window expired.",
        });
        return;
      }

      setWalletFlowState({
        stage: "sign_in_failed",
        phase: "sign_in",
        message:
          classifiedError.kind === "rejected"
            ? "The signature request was cancelled. You can retry when you're ready."
            : "The signature request did not complete.",
        detail:
          classifiedError.kind === "rejected"
            ? "Diagnostic: the wallet rejected or closed the signature prompt."
            : `Diagnostic: ${classifiedError.message}`,
      });
    } finally {
      setIsSigningInWithBase(false);
    }
  };

  const onDisconnectWallet = () => {
    setWalletFlowState(IDLE_WALLET_FLOW_STATE);
    disconnect();
  };

  const onRefreshProfile = async () => {
    if (!profileId) {
      setActionMessage("Connect and sign in to open your BubbleDrop home.");
      return;
    }
    setIsSubmittingAction(true);
    setActionMessage(null);
    try {
      await refreshProfileSummary(profileId);
      setActionMessage("Your home is refreshed.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const onReplayIntro = () => {
    setIntroPoppedBubbleIds([]);
    setIntroPopBursts([]);
    setIntroPatternSeed(Math.floor(Math.random() * 1_000_000));
    setWelcomeIntroVisible(true);
  };

  const onSkipIntro = () => {
    setWelcomeIntroVisible(false);
  };

  const onDailyCheckIn = async (opts?: { openBubbleSessionAfter?: boolean }) => {
    if (!profileId) {
      setActionMessage("Connect, sign in, and sync your profile before checking in.");
      return;
    }
    if (effectiveIsConnected && !isConnectedToBase) {
      setActionMessage("Switch to Base before daily check-in.");
      return;
    }
    if (!authenticatedSessionToken) {
      setActionMessage("Sign in with Base before daily check-in.");
      return;
    }
    if (!connectedWalletAddress) {
      setActionMessage("Connect your Base wallet before daily check-in.");
      return;
    }
    if (process.env.NEXT_PUBLIC_SMOKE_TEST_MODE !== "1" && !dailyCheckInContractAddress) {
      setActionMessage("Daily check-in contract is not configured for this app build.");
      return;
    }
    if (process.env.NEXT_PUBLIC_SMOKE_TEST_MODE !== "1" && !publicClient) {
      setActionMessage("Base client is not ready yet. Try daily check-in again in a moment.");
      return;
    }

    setIsSubmittingAction(true);
    setActionMessage(null);
    try {
      let checkInTxHash: string | null = null;
      if (process.env.NEXT_PUBLIC_SMOKE_TEST_MODE !== "1") {
        const activeConnector = connection.connector;
        const activeProvider = activeConnector
          ? ((await activeConnector
              .getProvider({ chainId: base.id })
              .catch(() => null)) as {
                request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
              } | null)
          : null;
        const activeProviderRequest = activeProvider?.request;
        const runtimeChainHex =
          typeof activeProviderRequest === "function"
            ? await activeProviderRequest({ method: "eth_chainId" })
                .then((value) => (typeof value === "string" ? value : null))
                .catch(() => null)
            : null;

        if (runtimeChainHex !== null && !isBaseChainHex(runtimeChainHex)) {
          throw new Error(
            `bubbledrop-daily-checkin-wrong-chain:${runtimeChainHex}:${BASE_MAINNET_CHAIN_HEX}`,
          );
        }

        const capabilities =
          typeof activeProviderRequest === "function" &&
          connectedWalletAddress
            ? await activeProviderRequest({
                  method: "wallet_getCapabilities",
                  params: [connectedWalletAddress as Address, [BASE_MAINNET_CHAIN_HEX]],
                })
                .then((value) => (value ?? null) as WalletCapabilitiesRecord | null)
                .catch((error) => {
                  const classified = classifyWalletFlowError(error);
                  if (classified.kind === "unsupported_runtime") {
                    return null;
                  }
                  throw error;
                })
            : null;
        const shouldUseCapabilityAwarePath =
          typeof activeProviderRequest === "function" &&
          supportsWalletSendCalls(capabilities, base.id);

        setActionMessage("Confirm daily check-in in your wallet.");
        if (shouldUseCapabilityAwarePath) {
          try {
            const callBundle = await withFlowTimeout(
              activeProviderRequest!({
                method: "wallet_sendCalls",
                params: [
                  {
                    atomicRequired: false,
                    calls: [
                      {
                        data: encodeFunctionData({
                          abi: DAILY_CHECK_IN_STREAK_ABI,
                          args: [connectedWalletAddress as Address, getUtcDayKey(new Date())],
                          functionName: "checkIn",
                        }),
                        to: dailyCheckInContractAddress as Address,
                      },
                    ],
                    chainId: BASE_MAINNET_CHAIN_HEX,
                    from: connectedWalletAddress as Address,
                    version: "2.0.0",
                  },
                ],
              }),
              DAILY_CHECK_IN_CALLS_TIMEOUT_MS,
              "daily_check_in",
            ).then((value) => value as { id?: string } | string);

            setActionMessage("Waiting for Base confirmation...");
            const callBundleId =
              typeof callBundle === "string" ? callBundle : callBundle.id ?? null;
            if (!callBundleId) {
              throw new Error("bubbledrop-daily-checkin-no-call-bundle-id");
            }
            checkInTxHash = await waitForCallsStatusTxHash(
              { request: activeProviderRequest! },
              callBundleId,
            );
            if (!checkInTxHash) {
              setActionMessage(
                "Daily check-in was submitted, but the wallet did not expose a transaction hash yet. Please try again in a moment.",
              );
              return;
            }
          } catch (error) {
            const classified = classifyWalletFlowError(error);
            if (classified.kind !== "unsupported_runtime") {
              throw error;
            }
          }
        }

        if (!checkInTxHash) {
          const txHash = await writeContractAsync({
            abi: DAILY_CHECK_IN_STREAK_ABI,
            address: dailyCheckInContractAddress as Address,
            functionName: "checkIn",
            args: [connectedWalletAddress as Address, getUtcDayKey(new Date())],
            chainId: base.id,
          });
          checkInTxHash = txHash;
        }

        setActionMessage("Waiting for Base confirmation...");
        const receipt = await publicClient!.waitForTransactionReceipt({
          hash: checkInTxHash as Hash,
        });
        if (receipt.status !== "success") {
          setActionMessage("Today's check-in transaction did not confirm on Base.");
          return;
        }
      }

      const response = await fetch(`${backendUrl}/check-in/daily`, {
        method: "POST",
        headers: createAuthenticatedJsonHeaders(authenticatedSessionToken),
        body: JSON.stringify({
          profileId,
          txHash: checkInTxHash ?? undefined,
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          if (profileId && typeof window !== "undefined") {
            window.localStorage.setItem(
              `bubbledrop:daily-checkin:${profileId}`,
              getUtcDateKey(new Date()),
            );
          }
          setDailyCheckInCompletedToday(true);
          setActionMessage("Daily check-in is already done for today. Session is open.");
          if (quickSessionHref) {
            window.location.assign(quickSessionHref);
          }
          return;
        }
        setActionMessage("Daily check-in is unavailable right now. You can still play a session.");
        return;
      }

      const payload = (await response.json()) as DailyCheckInResponse;
      await refreshProfileSummary(profileId);
      if (profileId && typeof window !== "undefined") {
        window.localStorage.setItem(
          `bubbledrop:daily-checkin:${profileId}`,
          payload.checkInDate ?? getUtcDateKey(new Date()),
        );
      }
      setDailyCheckInCompletedToday(
        (payload.checkInDate ?? getUtcDateKey(new Date())) === getUtcDateKey(new Date()),
      );
      captureAnalyticsEvent("bubbledrop_daily_check_in_completed", {
        profile_id: profileId,
        wallet_address: activeWalletAddress ?? connectedWalletAddress ?? "",
        check_in_date: payload.checkInDate,
        xp_awarded: payload.xpAwarded ?? 0,
        new_streak: payload.newStreak ?? payload.currentStreak ?? 0,
        rare_access_active:
          payload.rareAccessActive ?? payload.rareRewardAccessActive ?? false,
      });
      setActionMessage(
        payload.onchain?.txHash
          ? `Daily check-in complete. +${payload.xpAwarded ?? 0} XP. Streak: ${
              payload.newStreak ?? payload.currentStreak ?? 0
            }. Wallet transaction confirmed on Base.`
          : `Daily check-in complete. +${payload.xpAwarded ?? 0} XP. Streak: ${
              payload.newStreak ?? payload.currentStreak ?? 0
            }.`,
      );
      if (opts?.openBubbleSessionAfter && quickSessionHref) {
        window.location.assign(quickSessionHref);
      }
    } catch (error) {
      const walletError = classifyWalletFlowError(error);
      if (walletError.kind === "rejected") {
        setActionMessage("Daily check-in was cancelled in your wallet.");
      } else if (walletError.kind === "wrong_chain") {
        setActionMessage("Switch your wallet to Base before daily check-in.");
      } else if (walletError.kind === "insufficient_funds") {
        setActionMessage("Your Base wallet does not have enough ETH for this daily check-in.");
      } else if (walletError.kind === "unsupported_runtime") {
        setActionMessage("This wallet runtime could not prepare the Base check-in transaction.");
      } else if (walletError.kind === "tx_generation_failed") {
        setActionMessage("The wallet could not generate the daily check-in transaction. Try again.");
      } else {
        setActionMessage("Today's check-in did not land. Try again in a moment.");
      }
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const onCompleteOnboarding = async () => {
    if (!profileId) {
      setActionMessage("Connect, sign in, and sync your profile before finishing onboarding.");
      return;
    }
    if (effectiveIsConnected && !isConnectedToBase) {
      setActionMessage("Switch to Base before finishing onboarding.");
      return;
    }
    if (!authenticatedSessionToken) {
      setActionMessage("Sign in with Base before completing onboarding.");
      return;
    }

    const nickname = nicknameInput.trim();
    if (!nickname) {
      setActionMessage("Enter nickname before completing onboarding.");
      return;
    }

    setIsSubmittingAction(true);
    setActionMessage(null);
    try {
      const response = await fetch(`${backendUrl}/profile/onboarding/complete`, {
        method: "POST",
        headers: createAuthenticatedJsonHeaders(authenticatedSessionToken),
        body: JSON.stringify({
          profileId,
          nickname,
        }),
      });

      if (!response.ok) {
        setActionMessage("We couldn't finish onboarding. Check your nickname and try again.");
        return;
      }

      const payload = (await response.json()) as OnboardingCompletionResponse;
      const refreshedSummary = await refreshProfileSummary(profileId);
      captureAnalyticsEvent("bubbledrop_onboarding_completed", {
        profile_id: payload.profileId,
        wallet_address: activeWalletAddress ?? connectedWalletAddress ?? "",
        avatar_id: payload.avatarId,
        onboarding_xp_granted: payload.onboardingXpGranted,
        total_xp: payload.totalXp,
      });
      if (refreshedSummary) {
        setActionMessage(
          `Onboarding completed. ${payload.onboardingXpGranted} XP granted. Total XP: ${payload.totalXp}.`,
        );
      } else {
        setActionMessage("Onboarding completed. Your new bubble is still settling in.");
      }
    } catch {
      setActionMessage("Your identity update did not land. Try again in a moment.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const homeStatusPills = [
    effectiveIsConnected
      ? isConnectedToBase
        ? "Base ready"
        : "Switch to Base"
      : "Sign in needed",
    authenticatedSessionToken ? "Signed in" : "Secure sign-in needed",
    isRareRewardAccessActive
      ? "Season chance live"
      : qualificationBadge
        ? qualificationBadge.label
        : "Season chance building",
  ];
  const canSyncProfile =
    !isSubmittingAction &&
    Boolean(authenticatedSessionToken) &&
    Boolean(connectedWalletAddress) &&
    isConnectedToBase;
  let heroStatusLabel = "Wallet";
  let heroTitle = "Start here — then play, streak, earn.";
  let heroBody =
    "Pop bubbles in runs, check in daily to grow your streak, and build your season-end reward chance. Your first move: connect your wallet, sign in, and mark the day on Base.";
  let heroAccentClass =
    "from-[#8fdcff]/95 via-[#c6d7ff]/92 to-[#ffd9ef]/92 text-[#173056]";
  const secondaryHeroActionLabel: string | null = null;
  const secondaryHeroActionDisabled = false;
  const secondaryHeroActionHandler: (() => void) | null = null;
  let heroPortalCopy = "Bubble lane offline";
  const showHeroSection = true;
  const dailyMissionHint = isFirstEntry
    ? "Finish onboarding first."
    : isRareRewardAccessActive
      ? "Season chance is warm."
      : "Season chance needs check-in.";
  const showDropRadar = Boolean(authenticatedSessionToken && profileId);
  const dropRadarPercent = !effectiveIsConnected
    ? 16
    : !isConnectedToBase
      ? 34
      : !authenticatedSessionToken
        ? 52
        : isFirstEntry
          ? 66
          : isRareRewardAccessActive
            ? Math.min(98, 84 + Math.min(currentStreak, 7) * 2)
            : Math.min(82, 62 + Math.min(currentStreak, 7) * 2);
  const dropRadarStateLabel = !effectiveIsConnected
    ? "Wallet offline"
    : !isConnectedToBase
      ? "Need Base network"
      : !authenticatedSessionToken
        ? "Auth lock active"
        : isFirstEntry
          ? "Onboarding required"
          : isRareRewardAccessActive
            ? "Season chance detected"
            : "XP lane detected";
  const dropRadarHeadline = !effectiveIsConnected
    ? "WALLET OFFLINE"
    : !isConnectedToBase
      ? "BASE REQUIRED"
      : !authenticatedSessionToken
        ? "AUTH LOCKED"
        : isFirstEntry
          ? "ONBOARDING"
          : isRareRewardAccessActive
            ? "SEASON DETECTED"
            : "XP DETECTED";
  const introProgressCount = Math.min(REQUIRED_INTRO_POPS, introPoppedBubbleIds.length);
  const introBubblesRemaining = REQUIRED_INTRO_POPS - introProgressCount;
  useEffect(() => {
    if (!welcomeIntroVisible) {
      return;
    }
    if (introBubblesRemaining > 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setWelcomeIntroVisible(false);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [introBubblesRemaining, welcomeIntroVisible]);

  const cosmeticUrlDemoRef = useRef(false);
  useEffect(() => {
    if (welcomeIntroVisible || cosmeticUrlDemoRef.current) {
      return;
    }
    try {
      if (new URLSearchParams(window.location.search).get("cosmeticDemo") === "1") {
        cosmeticUrlDemoRef.current = true;
        setCosmeticTierPreviewActive(true);
      }
    } catch {
      /* ignore */
    }
  }, [welcomeIntroVisible]);

  useEffect(() => {
    if (!cosmeticTierPreviewActive) {
      return;
    }
    const id = window.setInterval(() => {
      setCosmeticPreviewIndex((i) => (i + 1) % COSMETIC_PREVIEW_DEMOS.length);
    }, COSMETIC_PREVIEW_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [cosmeticTierPreviewActive]);

  const showHeroSecondaryAction = false;

  if (!effectiveIsConnected) {
    heroStatusLabel = "Wallet";
    heroPortalCopy = "Base entry";
    heroTitle = "Start here — then play, streak, earn.";
    heroBody =
      "Pop bubbles in runs, check in daily to grow your streak, and build your season-end reward chance. Your first move: connect your wallet, sign in, and mark the day on Base.";
  } else if (effectiveIsConnected && !isConnectedToBase) {
    heroStatusLabel = "Base needed";
    heroTitle = "Your bubble is here, but it still needs the Base lane.";
    heroBody = "Switch network to Base.";
    heroAccentClass =
      "from-[#ffe4bb]/95 via-[#ffd7f0]/92 to-[#e5d6ff]/92 text-[#5a391d]";
    heroPortalCopy = "Base lane waiting";
  } else if (effectiveIsConnected && !isSignedInWithBase) {
    heroStatusLabel = "Secure sign-in";
    heroTitle = "Confirm this bubble so the app can trust your next move.";
    heroBody =
      "Use the Sign in with Base button on your Player profile card above — only place to sign in.";
    heroAccentClass =
      "from-[#b8f3ff]/95 via-[#d7ddff]/92 to-[#ffe2f4]/92 text-[#173056]";
    heroPortalCopy = "Seal your glow";
  } else if (!profileId) {
    heroStatusLabel = "Profile sync";
    heroTitle = "Shape this bubble into your BubbleDrop identity.";
    heroBody = "Create your player profile.";
    heroAccentClass =
      "from-[#9ae8ff]/95 via-[#cdd8ff]/92 to-[#ffd9eb]/92 text-[#173056]";
    heroPortalCopy = "Home still forming";
  } else if (!profileSummary) {
    heroStatusLabel = "Refreshing";
    heroTitle = "Your bubble is almost ready to glow.";
    heroBody = "Updating profile state...";
    heroAccentClass =
      "from-[#c3e9ff]/95 via-[#e4ddff]/92 to-[#ffe6f2]/92 text-[#173056]";
    heroPortalCopy = "Glow calibrating";
  } else if (!dailyCheckInCompletedToday) {
    /* ARRIVAL: ежедневный check-in на Base (газ), пока визит не отмечен */
    heroStatusLabel = "Arrival";
    heroTitle = "Mark today's visit on Base.";
    heroBody =
      "Daily check-in is submitted from your wallet on Base - one user-paid transaction for +XP and streak once per day.";
    heroAccentClass =
      "from-[#8fdcff]/95 via-[#c6d7ff]/92 to-[#ffd9ef]/92 text-[#173056]";
    heroPortalCopy = "Base check-in";
  } else if (qualificationStatus === "paused") {
    heroStatusLabel = "Season paused";
    heroTitle = "Your season chance paused after the streak broke.";
    heroBody = "Check in again, rebuild momentum, and return to active runs.";
    heroAccentClass =
      "from-[#fff0be]/95 via-[#ffd9e8]/92 to-[#e8deff]/92 text-[#63411d]";
    heroPortalCopy = "Season lane resting";
  } else if (isRareRewardAccessActive && qualificationStatus === "qualified") {
    heroStatusLabel = "Qualified";
    heroTitle = "Your profile is on pace for the season-end reward draw.";
    heroBody = "Season-end reward chance is active today. Keep the streak alive and keep earning XP.";
    heroAccentClass =
      "from-[#ffe9a8]/95 via-[#ffd7ec]/92 to-[#ddd8ff]/92 text-[#593612]";
    heroPortalCopy = "Season lane live";
  } else if (!isRareRewardAccessActive) {
    heroStatusLabel = "Season build";
    heroTitle = "Today still moves your bubble toward season-end rewards.";
    heroBody = "XP progress is active. Keep the streak alive and bank more active-play XP.";
    heroAccentClass =
      "from-[#ccecff]/95 via-[#dce2ff]/92 to-[#ffe7f4]/92 text-[#173056]";
    heroPortalCopy = "XP lane open";
  } else if (profileSummary) {
    heroStatusLabel = "Ready to play";
    heroTitle = "You're checked in — time for bubbles.";
    heroBody = "Open the bubble session when you're ready.";
    heroAccentClass =
      "from-[#b7f0ff]/95 via-[#d8dcff]/92 to-[#ffe0f0]/92 text-[#173056]";
    heroPortalCopy = "Play portal ready";
  }

  const profilePrimaryAction = !effectiveIsConnected
    ? null
    : !isConnectedToBase
      ? {
          kind: "button" as const,
          label: "Switch to Base",
          onClick: onSwitchToBase,
          disabled: isWalletFlowBusy || isSubmittingAction,
        }
      : !authenticatedSessionToken
        ? {
            kind: "button" as const,
            label: isSigningInWithBase ? "Signing in…" : "Sign in with Base",
            onClick: onSignInWithBase,
            disabled: isWalletFlowBusy || isSubmittingAction,
          }
        : !profileId
          ? {
              kind: "button" as const,
              label: "Sync profile",
              onClick: onBootstrapProfile,
              disabled: !canSyncProfile,
            }
          : null;

  const dailyCheckInAction = dailyCheckInCompletedToday
    ? {
        label: "Daily check-in complete",
        disabled: true,
      }
    : {
        label: isSubmittingAction ? "Checking in…" : "Daily check-in (+20 XP)",
        disabled: isSubmittingAction,
      };

  const hasEnteredBubbleDropApp = Boolean(authenticatedSessionToken && profileId);

  const dailyMissionPrimaryAction =
    hasEnteredBubbleDropApp && quickSessionHref
      ? {
          kind: "link" as const,
          label: "Tap to play",
          href: quickSessionHref,
        }
      : null;

  const dailyCheckInCardAction = hasEnteredBubbleDropApp
    ? {
        label: dailyCheckInAction.label,
        disabled: dailyCheckInAction.disabled,
        onClick: () => {
          void onDailyCheckIn();
        },
      }
    : null;

  const onAnswer = (index: number) => {
    setSelectedOption(index);
    if (index === currentCard.correctIndex) {
      setShowWrongExplanation(false);
      setTimeout(() => {
        goNextCard();
      }, 140);
      return;
    }
    setShowWrongExplanation(true);
  };

  const playIntroPopSound = () => {
    if (typeof window === "undefined") {
      return;
    }
    if (introAudioUnavailableRef.current) {
      return;
    }
    try {
      const contextCandidate = window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextCtor = window.AudioContext || contextCandidate.webkitAudioContext;
      if (!AudioContextCtor) {
        introAudioUnavailableRef.current = true;
        return;
      }
      let audioContext = introAudioContextRef.current;
      if (!audioContext) {
        audioContext = new AudioContextCtor();
        introAudioContextRef.current = audioContext;
      }
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(640, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(210, audioContext.currentTime + 0.06);
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.06, audioContext.currentTime + 0.012);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.08);
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.09);
    } catch {
      // Sound is optional: keep interaction smooth even if audio fails.
      introAudioUnavailableRef.current = true;
    }
  };

  const onPopIntroBubble = (bubbleId: string, event: MouseEvent<HTMLButtonElement>) => {
    if (!welcomeIntroVisible) {
      return;
    }
    const bubble = introBubbleMap.get(bubbleId);
    if (!bubble) {
      return;
    }
    if (
      introPoppedBubbleIds.includes(bubbleId) ||
      introPoppingBubbleIds.includes(bubbleId) ||
      introPoppedBubbleIds.length + introPoppingBubbleIds.length >= REQUIRED_INTRO_POPS
    ) {
      return;
    }
    setIntroPoppingBubbleIds((current) => [...current, bubbleId]);
    if ("vibrate" in navigator) {
      navigator.vibrate(12);
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const playfieldRect = event.currentTarget.parentElement?.getBoundingClientRect();
    const burstX = playfieldRect
      ? rect.left - playfieldRect.left + rect.width / 2
      : rect.width / 2;
    const burstY = playfieldRect
      ? rect.top - playfieldRect.top + rect.height / 2
      : rect.height / 2;
    const burstId = `${bubbleId}-${Date.now()}`;
    setIntroPopBursts((current) => [
      ...current,
      { id: burstId, x: burstX, y: burstY, hue: bubble.hue },
    ]);
    const nudgedIds = introBubbles
      .filter((candidate) => candidate.id !== bubbleId)
      .filter((candidate) => {
        const dx = candidate.leftPct - bubble.leftPct;
        const dy = candidate.topPct - bubble.topPct;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < 24;
      })
      .map((candidate) => candidate.id);
    setIntroNudgedBubbleIds(nudgedIds);
    window.setTimeout(() => {
      setIntroPoppingBubbleIds((current) => current.filter((id) => id !== bubbleId));
      setIntroPoppedBubbleIds((current) => {
        if (current.includes(bubbleId)) {
          return current;
        }
        return [...current, bubbleId];
      });
    }, 220);
    window.setTimeout(() => {
      setIntroPopBursts((current) => current.filter((burst) => burst.id !== burstId));
    }, 550);
    window.setTimeout(() => {
      setIntroNudgedBubbleIds((current) =>
        current.filter((candidateId) => !nudgedIds.includes(candidateId)),
      );
    }, 420);
    playIntroPopSound();
  };

  const goNextCard = () => {
    setSelectedOption(null);
    setShowWrongExplanation(false);

    if (cardIndex < ONBOARDING_CARDS.length - 1) {
      setCardIndex((prev) => prev + 1);
      return;
    }

    setOnboardingSessionCompleted(true);
  };

  return (
    <div className="relative min-h-screen px-4 py-6 sm:px-6">
      <div className="ambient-aura">
        <span className="aura aura1" />
        <span className="aura aura2" />
        <span className="aura aura3" />
      </div>
      <div className="floating-bubbles">
        <span className="bubble b1" />
        <span className="bubble b2" />
        <span className="bubble b3" />
        <span className="bubble b4" />
        <span className="bubble b5" />
        <span className="bubble b6" />
      </div>
      {welcomeIntroVisible ? (
        <WelcomeIntroScreen
          introProgressCount={introProgressCount}
          requiredIntroPops={REQUIRED_INTRO_POPS}
          introBubblesRemaining={introBubblesRemaining}
          introBubbles={introBubbles}
          introPoppedBubbleIds={introPoppedBubbleIds}
          introPoppingBubbleIds={introPoppingBubbleIds}
          introNudgedBubbleIds={introNudgedBubbleIds}
          introPopBursts={introPopBursts}
          onSkipIntro={onSkipIntro}
          onPopIntroBubble={onPopIntroBubble}
        />
      ) : null}

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-4">
        {onboardingVisible ? (
          <section className="bubble-card p-4">
            <div className="gloss-pill rounded-2xl bg-gradient-to-r from-[#99dbff] to-[#d6c8ff] p-4 text-[#1d2f57]">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#3d5686]">
                Learning card {cardIndex + 1}/{ONBOARDING_CARDS.length}
              </p>
              <h1 className="mt-1 text-xl font-bold">{currentCard.title}</h1>
              <p className="mt-2 text-sm text-[#425b8a]">{currentCard.question}</p>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {currentCard.options.map((option, index) => {
                const isSelected = selectedOption === index;
                const isCorrect = index === currentCard.correctIndex;
                const style = isSelected
                  ? isCorrect
                    ? "from-[#bef8de] to-[#d8ffe9] text-[#1f5943]"
                    : "from-[#ffd9e7] to-[#ffe6ef] text-[#7c3550]"
                  : "from-white to-white text-[#324d7a]";

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onAnswer(index)}
                    className={`gloss-pill rounded-xl bg-gradient-to-r px-4 py-3 text-left text-sm font-semibold ${style}`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {showWrongExplanation ? (
              <div className="mt-3 rounded-xl border border-[#f6c2d4] bg-[#fff2f7] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9f4b67]">
                  Correct answer note
                </p>
                <p className="mt-1 text-sm text-[#7f3a53]">{currentCard.wrongExplanation}</p>
                <button
                  type="button"
                  onClick={goNextCard}
                  className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#6d466e]"
                >
                  Continue
                </button>
              </div>
            ) : null}
          </section>
        ) : onboardingCompletionVisible ? (
          <section className="bubble-card p-4">
            <div className="gloss-pill rounded-2xl bg-gradient-to-r from-[#99dbff] to-[#d6c8ff] p-4 text-[#1d2f57]">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#3d5686]">
                Complete onboarding
              </p>
              <h1 className="mt-1 text-xl font-bold">Set your BubbleDrop identity</h1>
              <p className="mt-2 text-sm text-[#425b8a]">
                Finish first entry with a nickname. Starter Bubble Blue is applied automatically.
              </p>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6074a0]">Nickname</label>
              <input
                value={nicknameInput}
                onChange={(event) => setNicknameInput(event.target.value)}
                maxLength={32}
                placeholder="Choose your nickname"
                className="mt-2 w-full rounded-xl border border-[#d6e3ff] bg-white/80 px-3 py-3 text-sm text-[#2d4578] outline-none"
              />
            </div>

            <button
              type="button"
              onClick={onCompleteOnboarding}
              disabled={
                isSubmittingAction ||
                !authenticatedSessionToken
              }
              className="gloss-pill mt-4 w-full rounded-xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-3 text-left text-sm font-semibold text-[#1f3561] disabled:opacity-60"
            >
              {isSubmittingAction ? "Submitting..." : "Complete onboarding"}
            </button>
            {actionMessage ? (
              <p className="mt-3 rounded-xl bg-white/80 p-3 text-xs font-semibold text-[#4f648f]">{actionMessage}</p>
            ) : null}
          </section>
        ) : (
          <>
            <section
              className={`bubble-card player-profile-card relative overflow-hidden bg-gradient-to-br p-4 ring-1 ${profileStyleShellClass}`}
            >
              {showWelcomeBeforeSync ? (
                <div className="relative z-[2] mb-3 rounded-xl border border-[#b8d4ff]/90 bg-gradient-to-r from-[#e8f4ff] to-[#f0e8ff] px-3 py-2.5 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3d5686]">
                    Welcome
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-snug text-[#2d4578]">
                    Almost there — tap <strong className="text-[#1f3561]">Sync profile</strong> in{" "}
                    <strong className="text-[#1f3561]">Daily mission</strong> below.
                  </p>
                </div>
              ) : null}
              {cosmeticTierPreviewActive ? (
                <div className="relative z-[2] mb-3 flex flex-col items-center gap-1 rounded-xl border border-[#b8cce8]/90 bg-white/80 px-3 py-2 shadow-sm">
                  <p className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#2a4a78]">
                    Rarity demo {cosmeticPreviewIndex + 1}/{COSMETIC_PREVIEW_DEMOS.length} ·{" "}
                    {COSMETIC_PREVIEW_DEMOS[cosmeticPreviewIndex].rarity}
                  </p>
                  <p className="text-center text-[10px] text-[#62759a]">
                    Pauses {COSMETIC_PREVIEW_INTERVAL_MS / 1000}s each ·{" "}
                    <button
                      type="button"
                      className="font-semibold text-[#3d5a9e] underline decoration-[#b8c8e8] underline-offset-2"
                      onClick={() => {
                        setCosmeticTierPreviewActive(false);
                        setCosmeticPreviewIndex(0);
                      }}
                    >
                      Stop
                    </button>
                  </p>
                </div>
              ) : null}
              <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.7),transparent_70%)]" />
              <div className="absolute -right-10 top-0 h-28 w-28 rounded-full bg-[#ffdff0]/50 blur-3xl" />
              <div className="absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-[#ccefff]/50 blur-3xl" />
              <div className="relative flex items-start gap-3">
                <ProfileBubbleMotionShell
                  rarity={
                    profileCardEquippedStyle?.rarity ??
                    ("common" as const)
                  }
                  className={`profile-emblem profile-bubble-main ${profileEmblemRarityClass} ${profileEmblemCategoryClass} ${profileCardEquippedStyle ? "profile-emblem-equipped" : ""} relative flex h-24 w-24 items-center justify-center rounded-[2.2rem] text-3xl font-black tracking-[0.12em] text-[#21406e] shadow-[0_18px_45px_rgba(109,145,219,0.28)] ring-1 ring-white/70 ${
                    isProfileBubblePressed ? "profile-bubble-touch" : ""
                  }`}
                  style={
                    {
                      "--avatar-base": profileBubbleTone.base,
                      "--avatar-highlight": profileBubbleTone.highlight,
                      "--avatar-glow": profileBubbleTone.glow,
                    } as CSSProperties
                  }
                  onPointerDown={() => setIsProfileBubblePressed(true)}
                  onPointerUp={() => setIsProfileBubblePressed(false)}
                  onPointerLeave={() => setIsProfileBubblePressed(false)}
                  onPointerCancel={() => setIsProfileBubblePressed(false)}
                >
                  <span className="avatar-bubble-liquid" />
                  <span className="profile-bubble-sheen profile-bubble-sheen-a" />
                  <span className="profile-bubble-sheen profile-bubble-sheen-b" />
                  <span className="profile-bubble-swell" />
                  <span className="profile-bubble-orbit profile-bubble-orbit-a" />
                  <span className="profile-bubble-orbit profile-bubble-orbit-b" />
                  <span className="absolute right-2 top-2 h-3 w-3 rounded-full bg-white/80" />
                  <span className="absolute bottom-3 left-3 h-2 w-2 rounded-full bg-white/60" />
                </ProfileBubbleMotionShell>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7085b0]">
                    Bubble · Profile
                  </p>
                  <h1 className="mt-1 break-words text-[1.45rem] font-black leading-[1.05] tracking-[-0.035em] text-[#20365d]">
                    {nicknameDisplay}
                  </h1>
                  {profileCardEquippedStyle ? (
                    <>
                      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b9cc4]">
                        {cosmeticTierPreviewActive ? "Demo cosmetic" : "Equipped on bubble"}
                      </p>
                      <p className="mt-0.5 text-[0.95rem] font-bold leading-snug text-[#1e355d]">
                        {equippedStyleName}
                      </p>
                      <ProfileRarityChipMotion
                        rarity={profileCardEquippedStyle.rarity}
                        className={`profile-rarity-chip mt-2 inline-flex ${profileRarityChipClass}`}
                      >
                        {profileCardEquippedStyle.rarity}
                      </ProfileRarityChipMotion>
                    </>
                  ) : null}
                  <p className="mt-2 text-xs text-[#7b8fb8]">
                    {walletDisplay}
                    {bootstrappedWalletAddress &&
                    bootstrappedWalletAddress !== connectedWalletAddress
                      ? ` • synced to ${shortenWalletAddress(bootstrappedWalletAddress)}`
                      : ""}
                  </p>
                </div>
                {qualificationBadge ? (
                  <span
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${qualificationBadge.className}`}
                  >
                    {qualificationBadge.label}
                  </span>
                ) : null}
              </div>

              {profilePrimaryAction ? (
                <button
                  type="button"
                  onClick={profilePrimaryAction.onClick}
                  disabled={profilePrimaryAction.disabled}
                  className="gloss-pill mt-4 w-full rounded-xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-3.5 text-sm font-black text-[#1f3561] shadow-[0_12px_28px_rgba(72,105,175,0.2)] disabled:opacity-60"
                >
                  {profilePrimaryAction.label}
                </button>
              ) : null}

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-white/72 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7b8fb8]">XP</p>
                  <p className="mt-1 text-lg font-black tracking-[-0.03em] text-[#233b67]">{totalXp}</p>
                </div>
                <div className="rounded-2xl bg-white/72 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7b8fb8]">Streak</p>
                  <p className="mt-1 text-lg font-black tracking-[-0.03em] text-[#233b67]">{currentStreak}</p>
                </div>
                <div className="rounded-2xl bg-white/72 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7b8fb8]">Frame</p>
                  <p className="mt-1 min-h-[2rem] break-words text-[13px] font-black leading-[1.08] tracking-[-0.03em] text-[#233b67]">
                    {currentFrameLabel}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-[1.35rem] bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-[#5d729d]">
                    {nextFrame
                      ? `${nextFrame.label} is ${nextFrame.xpToReach} XP away`
                      : profileSummary
                        ? "Your bubble is resting at its current frame"
                        : "Progression wakes up once your profile is synced"}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7b8fb8]">
                    {nextFrame ? `${progressToNextFramePercent}%` : "Live"}
                  </p>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#e9efff]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#8fdcff] via-[#c8d3ff] to-[#ffcae8] transition-[width] duration-300"
                    style={{ width: `${progressToNextFramePercent}%` }}
                  />
                </div>
              </div>

              <div
                className={`mt-4 grid gap-2 ${
                  showDropRadar ? "grid-cols-[1.2fr_0.8fr]" : "grid-cols-1"
                }`}
              >
                <div
                  data-testid="daily-mission-card"
                  className="flex min-h-[16.5rem] flex-col justify-between rounded-[1.35rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(255,255,255,0.7))] p-3 shadow-[0_16px_36px_rgba(109,145,219,0.12)]"
                >
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7387b2]">
                      Daily mission
                    </p>
                    <h3 className="mt-2 text-base font-black tracking-[-0.03em] text-[#20365d]">Today</h3>
                    <p className="mt-2 text-sm text-[#5f749f]">{dailyMissionHint}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="min-w-0 rounded-xl bg-white/72 px-2 py-2 text-center">
                        <p className="block truncate text-[8px] leading-none uppercase tracking-[0.02em] text-[#7b8fb8]">
                          Streak
                        </p>
                        <p className="mt-1 text-sm font-black text-[#233b67]">{currentStreak}</p>
                      </div>
                      <div className="min-w-0 rounded-xl bg-white/72 px-2 py-2 text-center">
                        <p className="block truncate text-[8px] leading-none uppercase tracking-[0.02em] text-[#7b8fb8]">
                          XP
                        </p>
                        <p className="mt-1 text-sm font-black text-[#233b67]">{totalXp}</p>
                      </div>
                      <div className="min-w-0 rounded-xl bg-white/72 px-2 py-2 text-center">
                        <p className="block truncate text-[8px] leading-none uppercase tracking-[0.02em] text-[#7b8fb8]">
                          Rare
                        </p>
                        <p className="mt-1 text-sm font-black text-[#233b67]">
                          {isRareRewardAccessActive ? "On" : "Off"}
                        </p>
                      </div>
                    </div>
                  </div>
                  {dailyMissionPrimaryAction?.kind === "link" ? (
                    <Link
                      href={dailyMissionPrimaryAction.href}
                      className="gloss-pill mt-4 block rounded-xl bg-gradient-to-r from-[#a7efff] to-[#c0ccff] px-4 py-3.5 text-center text-sm font-black text-[#1f3561] shadow-[0_12px_28px_rgba(72,105,175,0.2)]"
                    >
                      {dailyMissionPrimaryAction.label}
                    </Link>
                  ) : (
                    <div className="mt-4 h-[3.625rem]" aria-hidden="true" />
                  )}
                </div>

                {showDropRadar ? (
                  <div className="rounded-[1.35rem] bg-gradient-to-br from-[#ffeab8] via-[#ffdced] to-[#dde6ff] px-4 py-4 text-sm font-semibold text-[#433763] shadow-[0_16px_36px_rgba(109,145,219,0.14)]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7c6f98]">
                      Drop radar
                    </span>
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#674f95]">
                      {dropRadarPercent}%
                    </span>
                  </div>
                  <div className="mt-3 flex flex-col items-center text-center">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6b5d8f]">
                      {dropRadarHeadline}
                    </p>
                    <div
                      className="drop-radar-dial relative mt-2 h-20 w-20 shrink-0 rounded-full"
                      style={
                        {
                          background: `conic-gradient(from 210deg, rgba(96,208,255,0.95) ${dropRadarPercent}%, rgba(255,255,255,0.55) ${dropRadarPercent}% 100%)`,
                        } as CSSProperties
                      }
                    >
                      <span className="drop-radar-sweep" />
                      <span className="drop-radar-ping" />
                      <span className="absolute inset-[6px] grid place-items-center rounded-full bg-white/82 text-[12px] font-black text-[#5a4a83]">
                        RAD
                      </span>
                    </div>
                    <p className="mt-3 text-[13px] font-black leading-4 text-[#3f3163]">
                      {dropRadarStateLabel}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                    <div className="min-w-0 rounded-lg bg-white/64 px-1 py-1.5">
                      <p className="block truncate text-[7px] leading-none uppercase tracking-[0.02em] text-[#7c6f98]">
                        Streak
                      </p>
                      <p className="text-xs font-black text-[#4d3f74]">{currentStreak}</p>
                    </div>
                    <div className="min-w-0 rounded-lg bg-white/64 px-1 py-1.5">
                      <p className="block truncate text-[7px] leading-none uppercase tracking-[0.02em] text-[#7c6f98]">
                        XP
                      </p>
                      <p className="text-xs font-black text-[#4d3f74]">{totalXp}</p>
                    </div>
                    <div className="min-w-0 rounded-lg bg-white/64 px-1 py-1.5">
                      <p className="block truncate text-[7px] leading-none uppercase tracking-[0.02em] text-[#7c6f98]">
                        Rare
                      </p>
                      <p className="text-xs font-black text-[#4d3f74]">{isRareRewardAccessActive ? "ON" : "OFF"}</p>
                    </div>
                  </div>
                  {hasUnlockedCollection && rewardsInventoryHref ? (
                    <Link
                      href={rewardsInventoryHref}
                      className="gloss-pill mt-3 block rounded-xl bg-white/78 px-3 py-2 text-center text-xs font-semibold text-[#4a3b74]"
                    >
                      Open vault
                    </Link>
                  ) : null}
                  </div>
                ) : null}
              </div>
            </section>

            {showFullBubbleDropMenu ? (
            <>
            {showHeroSection && !profileId ? (
              <section className={`bubble-card lounge-hero overflow-hidden p-5 bg-gradient-to-br ${heroAccentClass}`}>
              <div className="absolute -right-10 top-0 h-36 w-36 rounded-full bg-white/30 blur-3xl" />
              <div className="absolute -bottom-12 left-0 h-32 w-32 rounded-full bg-white/20 blur-3xl" />
              <div className="hero-portal-glow absolute right-[-1.5rem] top-[-0.6rem] h-44 w-44 rounded-full" />
              <div className="hero-portal-ring absolute right-[0.9rem] top-[1.1rem] h-24 w-24 rounded-full border border-white/35" />
              <div className="hero-portal-ring hero-portal-ring-delay absolute right-[0.2rem] top-[0.4rem] h-32 w-32 rounded-full border border-white/20" />
              <div className="relative">
                {!effectiveIsConnected ? (
                  <>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
                        {heroStatusLabel}
                      </p>
                      <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
                        {heroPortalCopy}
                      </p>
                    </div>
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h2 className="text-[1.75rem] font-black leading-[1.05] tracking-[-0.05em]">
                          {heroTitle}
                        </h2>
                        <p className="mt-3 max-w-[28rem] text-sm leading-6 opacity-80">
                          {heroBody}
                        </p>
                      </div>
                      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-[2rem] bg-white/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-xl">
                        <div className="absolute inset-3 rounded-full border border-white/28" />
                        <div className="hero-portal-core h-10 w-10 rounded-full bg-gradient-to-br from-white/90 to-white/45" />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
                        {heroStatusLabel}
                      </p>
                      <h2 className="mt-2 text-[1.75rem] font-black leading-[1.05] tracking-[-0.05em]">
                        {heroTitle}
                      </h2>
                      <p className="mt-3 max-w-[28rem] text-sm leading-6 opacity-80">{heroBody}</p>
                    </div>
                    <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-[2rem] bg-white/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-xl">
                      <div className="absolute inset-3 rounded-full border border-white/28" />
                      <div
                        className={`hero-portal-core h-10 w-10 rounded-full ${
                          isRareRewardAccessActive
                            ? "bg-gradient-to-br from-[#fff1a8] via-[#ffd8e8] to-[#b5dfff] shadow-[0_0_30px_rgba(255,215,146,0.95)]"
                            : "bg-gradient-to-br from-white/90 to-white/45"
                        }`}
                      />
                      <span className="absolute bottom-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#29456f]/70">
                        {heroPortalCopy}
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {homeStatusPills.map((pill) => (
                    <span
                      key={pill}
                      className="rounded-full bg-white/60 px-3 py-1.5 text-[11px] font-semibold tracking-[0.04em] text-[#28456f] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
                    >
                      {pill}
                    </span>
                  ))}
                </div>

                {!effectiveIsConnected ? (
                  <p className="mt-5 rounded-[1.1rem] border border-white/40 bg-white/35 px-4 py-3 text-center text-sm font-semibold leading-snug text-[#28456f]">
                    <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#5d729d]">
                      Do this next
                    </span>
                    <span className="mt-2 block">
                      Connect your wallet first, then use the{" "}
                      <strong className="text-[#1f3561]">profile card</strong> action above to sign in.
                    </span>
                  </p>
                ) : null}
                {showHeroSecondaryAction && secondaryHeroActionLabel && secondaryHeroActionHandler ? (
                  <button
                    type="button"
                    onClick={secondaryHeroActionHandler}
                    disabled={secondaryHeroActionDisabled}
                    className="mt-3 rounded-[1.1rem] bg-white/56 px-4 py-3 text-left text-sm font-semibold text-[#28456f] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] transition-transform duration-150 hover:-translate-y-[1px] disabled:opacity-60"
                  >
                    {secondaryHeroActionLabel}
                  </button>
                ) : null}

                {walletFlowTitle && walletFlowState.message ? (
                  <div className={`mt-3 rounded-[1.2rem] border px-4 py-3 ${walletFlowCardStyle}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">
                      {walletFlowTitle}
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-6">{walletFlowState.message}</p>
                  </div>
                ) : null}

                {showConnectRecovery ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={onConnectWallet}
                      disabled={isWalletFlowBusy || isSubmittingAction}
                    className="action-chip gloss-pill rounded-[1.1rem] bg-white/72 px-4 py-3 text-left text-sm font-semibold text-[#28456f] disabled:opacity-60"
                    >
                    Retry{" "}
                    {preferredConnectorUsesCoinbaseWallet
                      ? "Coinbase Wallet"
                      : preferredConnectorUsesBaseAccount
                        ? "Base connection"
                        : "in-app Base"}
                    </button>
                    {fallbackWalletConnector ? (
                      <button
                        type="button"
                        onClick={onConnectCoinbaseWallet}
                        disabled={isWalletFlowBusy || isSubmittingAction}
                        className="action-chip rounded-[1.1rem] bg-white/52 px-4 py-3 text-left text-sm font-semibold text-[#355889] disabled:opacity-60"
                      >
                        {fallbackConnectorUsesCoinbaseWallet
                          ? "Try Coinbase Wallet fallback"
                          : "Try alternate Base route"}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {showSignInRecovery ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={onSignInWithBase}
                      disabled={isWalletFlowBusy || isSubmittingAction}
                      className="action-chip gloss-pill rounded-[1.1rem] bg-white/72 px-4 py-3 text-left text-sm font-semibold text-[#28456f] disabled:opacity-60"
                    >
                      Retry Base sign-in
                    </button>
                  </div>
                ) : null}
              </div>
              </section>
            ) : null}

            {hasEnteredBubbleDropApp ? (
              <section
                data-testid="daily-checkin-card"
                className="bubble-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(245,251,255,0.76))] p-5 shadow-[0_18px_38px_rgba(109,145,219,0.12)]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7387b2]">
                  Daily Check-in
                </p>
                <h2 className="mt-3 max-w-[18rem] text-[2rem] font-black leading-[0.98] tracking-[-0.05em] text-[#20365d]">
                  Mark today in Base
                </h2>
                <p className="mt-3 max-w-[24rem] text-sm leading-6 text-[#5f749f]">
                  Use this separate button to mark the day before your run.
                </p>
                {dailyCheckInCardAction ? (
                  <button
                    type="button"
                    onClick={dailyCheckInCardAction.onClick}
                    disabled={dailyCheckInCardAction.disabled}
                    className="gloss-pill mt-6 w-full rounded-xl bg-gradient-to-r from-[#d7f5ff] via-[#dbe6ff] to-[#d8d2ff] px-4 py-4 text-center text-base font-black text-[#51688f] shadow-[0_12px_28px_rgba(72,105,175,0.12)] disabled:opacity-100"
                  >
                    {dailyCheckInCardAction.label}
                  </button>
                ) : (
                  <div className="mt-6 h-[3.875rem]" aria-hidden="true" />
                )}
              </section>
            ) : null}

            <section className="bubble-card p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7b8fb8]">
                  Bubble world
                </p>
                <div className="flex flex-wrap items-center gap-0.5">
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-white/82 px-1.5 py-0.5 text-[9px] font-semibold text-[#48608f]">
                    <WorldIcon kind="season" className="ui-icon" />
                    <span>Season</span>
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-white/82 px-1.5 py-0.5 text-[9px] font-semibold text-[#48608f]">
                    <WorldIcon kind="hunt" className="ui-icon" />
                    <span>Hunt</span>
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-white/82 px-1.5 py-0.5 text-[9px] font-semibold text-[#48608f]">
                    <WorldIcon kind="style" className="ui-icon" />
                    <span>Style</span>
                  </span>
                </div>
              </div>

              <div className="mt-2.5 flex flex-col gap-1">
                <Link
                  href={seasonHref}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(176,200,235,0.65)] bg-white/78 px-2.5 py-1.5 text-left shadow-[0_3px_10px_rgba(110,145,217,0.07)] transition-[transform,box-shadow] [-webkit-tap-highlight-color:transparent] hover:-translate-y-px hover:shadow-[0_5px_14px_rgba(110,145,217,0.1)] active:translate-y-0"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#cff4ff] to-[#d8e4ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                    <WorldIcon kind="season" className="!h-3.5 !w-3.5 text-[#385a91]" />
                  </div>
                  <span className="min-w-0 flex-1 text-xs font-bold tracking-tight text-[#20365d]">
                    Season
                  </span>
                </Link>
                <Link
                  href={leaderboardHref}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(176,200,235,0.65)] bg-white/78 px-2.5 py-1.5 text-left shadow-[0_3px_10px_rgba(110,145,217,0.07)] transition-[transform,box-shadow] [-webkit-tap-highlight-color:transparent] hover:-translate-y-px hover:shadow-[0_5px_14px_rgba(110,145,217,0.1)] active:translate-y-0"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#e6d8ff] to-[#ddd2f5] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                    <WorldIcon kind="board" className="!h-3.5 !w-3.5 text-[#385a91]" />
                  </div>
                  <span className="min-w-0 flex-1 text-xs font-bold tracking-tight text-[#20365d]">
                    Board
                  </span>
                </Link>
                <Link
                  href={referralsHref}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(176,200,235,0.65)] bg-white/78 px-2.5 py-1.5 text-left shadow-[0_3px_10px_rgba(110,145,217,0.07)] transition-[transform,box-shadow] [-webkit-tap-highlight-color:transparent] hover:-translate-y-px hover:shadow-[0_5px_14px_rgba(110,145,217,0.1)] active:translate-y-0"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#d8ffe9] to-[#cef5e8] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                    <WorldIcon kind="referrals" className="!h-3.5 !w-3.5 text-[#2d6b5a]" />
                  </div>
                  <span className="min-w-0 flex-1 text-xs font-bold tracking-tight text-[#20365d]">
                    Referrals
                  </span>
                </Link>
                <Link
                  href={partnerTokensHref}
                  onClick={() =>
                    captureAnalyticsEvent("bubbledrop_partner_transparency_opened", {
                      profile_id: profileId,
                    })
                  }
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(176,200,235,0.65)] bg-white/78 px-2.5 py-1.5 text-left shadow-[0_3px_10px_rgba(110,145,217,0.07)] transition-[transform,box-shadow] [-webkit-tap-highlight-color:transparent] hover:-translate-y-px hover:shadow-[0_5px_14px_rgba(110,145,217,0.1)] active:translate-y-0"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#ffe1ec] to-[#e8e0ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                    <WorldIcon kind="tokens" className="!h-3.5 !w-3.5 text-[#385a91]" />
                  </div>
                  <span className="min-w-0 flex-1 text-xs font-bold tracking-tight text-[#20365d]">
                    Tokens
                  </span>
                </Link>
              </div>
            </section>

            <section className="bubble-card p-4">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7b8fb8]">
                  Glass
                </p>
                <div className="flex items-center gap-1">
                  {(["soft", "medium", "strong"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setGlassMode(mode)}
                      className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                        glassMode === mode
                          ? "bg-[#dce9ff] text-[#2f4f84]"
                          : "bg-white/80 text-[#5f739b]"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            </>
            ) : null}

            {actionMessage ? (
              <section className="sticky bottom-3 z-20">
                <p className="bubble-card rounded-[1.2rem] px-4 py-3 text-sm font-semibold text-[#3f5887]">
                  {actionMessage}
                </p>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}



