"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { EquippedStyleSnapshot } from "../equipped-style-sync";
import {
  ProfileBubbleMotionShell,
  ProfileRarityChipMotion,
} from "../profile-rarity-motion";

type QualificationBadge = {
  label: string;
  className: string;
} | null;

type ProfilePrimaryAction = {
  kind: "button";
  label: string;
  onClick: () => void;
  disabled: boolean;
} | null;

type DailyMissionPrimaryAction = {
  kind: "link";
  label: string;
  href: string;
} | null;

type DailyCheckInCardAction = {
  label: string;
  disabled: boolean;
  onClick: () => void;
} | null;

export type ProfileCardProps = {
  showWelcomeBeforeSync: boolean;
  cosmeticTierPreviewActive: boolean;
  cosmeticPreviewIndex: number;
  cosmeticPreviewDemosLength: number;
  cosmeticPreviewRarity: string;
  onStopCosmeticPreview: () => void;
  profileCardEquippedStyle: EquippedStyleSnapshot | null;
  profileEmblemRarityClass: string;
  profileEmblemCategoryClass: string;
  profileStyleShellClass: string;
  profileRarityChipClass: string;
  isProfileBubblePressed: boolean;
  onProfileBubblePointerDown: () => void;
  onProfileBubblePointerUp: () => void;
  onProfileBubblePointerLeave: () => void;
  onProfileBubblePointerCancel: () => void;
  profileBubbleTone: { base: string; highlight: string; glow: string };
  nicknameDisplay: string;
  equippedStyleName: string;
  walletDisplay: string;
  bootstrappedWalletAddress: string;
  connectedWalletAddress: string | null;
  qualificationBadge: QualificationBadge;
  profilePrimaryAction: ProfilePrimaryAction;
  totalXp: number;
  currentStreak: number;
  currentFrameLabel: string;
  nextFrame: { label: string; minLifetimeXp: number; xpToReach: number } | null | undefined;
  profileSummary: unknown | null;
  progressToNextFramePercent: number;
  showDropRadar: boolean;
  dailyMissionHint: string;
  isRareRewardAccessActive: boolean;
  dailyMissionPrimaryAction: DailyMissionPrimaryAction;
  dropRadarPercent: number;
  dropRadarHeadline: string;
  dropRadarStateLabel: string;
  hasUnlockedCollection: boolean;
  rewardsInventoryHref: string;
  dailyCheckInCardAction: DailyCheckInCardAction;
  hasEnteredBubbleDropApp: boolean;
};

function shortenWalletAddress(value: string | null): string {
  if (!value) {
    return "No wallet yet";
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function ProfileCard({
  showWelcomeBeforeSync,
  cosmeticTierPreviewActive,
  cosmeticPreviewIndex,
  cosmeticPreviewDemosLength,
  cosmeticPreviewRarity,
  onStopCosmeticPreview,
  profileCardEquippedStyle,
  profileEmblemRarityClass,
  profileEmblemCategoryClass,
  profileStyleShellClass,
  profileRarityChipClass,
  isProfileBubblePressed,
  onProfileBubblePointerDown,
  onProfileBubblePointerUp,
  onProfileBubblePointerLeave,
  onProfileBubblePointerCancel,
  profileBubbleTone,
  nicknameDisplay,
  equippedStyleName,
  walletDisplay,
  bootstrappedWalletAddress,
  connectedWalletAddress,
  qualificationBadge,
  profilePrimaryAction,
  totalXp,
  currentStreak,
  currentFrameLabel,
  nextFrame,
  profileSummary,
  progressToNextFramePercent,
  showDropRadar,
  dailyMissionHint,
  isRareRewardAccessActive,
  dailyMissionPrimaryAction,
  dropRadarPercent,
  dropRadarHeadline,
  dropRadarStateLabel,
  hasUnlockedCollection,
  rewardsInventoryHref,
  dailyCheckInCardAction,
  hasEnteredBubbleDropApp,
}: ProfileCardProps) {
  return (
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
              Rarity demo {cosmeticPreviewIndex + 1}/{cosmeticPreviewDemosLength} ·{" "}
              {cosmeticPreviewRarity}
            </p>
            <p className="text-center text-[10px] text-[#62759a]">
              Pauses 5s each ·{" "}
              <button
                type="button"
                className="font-semibold text-[#3d5a9e] underline decoration-[#b8c8e8] underline-offset-2"
                onClick={onStopCosmeticPreview}
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
            onPointerDown={onProfileBubblePointerDown}
            onPointerUp={onProfileBubblePointerUp}
            onPointerLeave={onProfileBubblePointerLeave}
            onPointerCancel={onProfileBubblePointerCancel}
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
            Onchain on Base • You pay gas for this step
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
    </>
  );
}
