"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import {
  Badge,
  Button,
  Card,
  Grid,
  Heading,
  NavLinkButton,
  Row,
  Section,
  Stack,
  StatTile,
  Text,
} from "../../components";
import type { EquippedStyleSnapshot } from "../equipped-style-sync";
import {
  ProfileBubbleMotionShell,
  ProfileRarityChipMotion,
} from "../profile-rarity-motion";

type QualificationBadge = {
  label: string;
  tone: "neutral" | "info" | "muted" | "rare" | "qualified";
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

// Preserved inline: the profile bubble motion emblem depends on a chain of
// CSS classes (profile-emblem, profile-bubble-main, rarity/category classes,
// sheen/orbit/swell spans) that drive the animation system. Wrapping it in a
// library container would strip those animations, so we keep this sub-tree.
function ProfileBubbleEmblem({
  profileCardEquippedStyle,
  profileEmblemRarityClass,
  profileEmblemCategoryClass,
  isProfileBubblePressed,
  onProfileBubblePointerDown,
  onProfileBubblePointerUp,
  onProfileBubblePointerLeave,
  onProfileBubblePointerCancel,
  profileBubbleTone,
}: Pick<
  ProfileCardProps,
  | "profileCardEquippedStyle"
  | "profileEmblemRarityClass"
  | "profileEmblemCategoryClass"
  | "isProfileBubblePressed"
  | "onProfileBubblePointerDown"
  | "onProfileBubblePointerUp"
  | "onProfileBubblePointerLeave"
  | "onProfileBubblePointerCancel"
  | "profileBubbleTone"
>) {
  return (
    <ProfileBubbleMotionShell
      rarity={profileCardEquippedStyle?.rarity ?? ("common" as const)}
      className={`profile-emblem profile-bubble-main ${profileEmblemRarityClass} ${profileEmblemCategoryClass} ${profileCardEquippedStyle ? "profile-emblem-equipped" : ""} ${
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
    </ProfileBubbleMotionShell>
  );
}

// Preserved inline: conic-gradient dial + drop-radar-sweep / drop-radar-ping
// spans are CSS-animated and the dial geometry is driven by dropRadarPercent
// through the conic-gradient — no library primitive supports this.
function DropRadarDial({ dropRadarPercent }: { dropRadarPercent: number }) {
  const dialStyle: CSSProperties = {
    background: `conic-gradient(from 210deg, rgba(96,208,255,0.95) ${dropRadarPercent}%, rgba(255,255,255,0.55) ${dropRadarPercent}% 100%)`,
  };
  return (
    <div className="drop-radar-dial" style={dialStyle}>
      <span className="drop-radar-sweep" />
      <span className="drop-radar-ping" />
    </div>
  );
}

// Preserved inline: pure presentational progress bar driven by percent.
// The Card library has no "filled progress bar" primitive.
function ProgressBar({ percent }: { percent: number }) {
  const trackStyle: CSSProperties = {
    height: "0.625rem",
    borderRadius: "9999px",
    background: "#e9efff",
    overflow: "hidden",
  };
  const fillStyle: CSSProperties = {
    height: "100%",
    width: `${percent}%`,
    borderRadius: "9999px",
    background:
      "linear-gradient(90deg, #8fdcff 0%, #c8d3ff 50%, #ffcae8 100%)",
    transition: "width 300ms ease",
  };
  return (
    <div style={trackStyle}>
      <div style={fillStyle} />
    </div>
  );
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
  const walletSubline = `${walletDisplay}${
    bootstrappedWalletAddress &&
    bootstrappedWalletAddress !== connectedWalletAddress
      ? ` • synced to ${shortenWalletAddress(bootstrappedWalletAddress)}`
      : ""
  }`;

  const nextFrameCopy = nextFrame
    ? `${nextFrame.label} is ${nextFrame.xpToReach} XP away`
    : profileSummary
      ? "Your bubble is resting at its current frame"
      : "Progression wakes up once your profile is synced";

  return (
    <>
      <Section padding="md">
        <Stack gap={4}>
          {showWelcomeBeforeSync ? (
            <Card variant="accent" padding="sm">
              <Stack gap={1}>
                <Text variant="overline" tone="accent">
                  Welcome
                </Text>
                <Text variant="body" tone="primary" weight="semibold">
                  Almost there — tap Sync profile in Daily mission below.
                </Text>
              </Stack>
            </Card>
          ) : null}

          {cosmeticTierPreviewActive ? (
            <Card variant="muted" padding="sm">
              <Stack gap={1} align="center">
                <Text variant="overline" tone="accent">
                  {`Rarity demo ${cosmeticPreviewIndex + 1}/${cosmeticPreviewDemosLength} · ${cosmeticPreviewRarity}`}
                </Text>
                <Row gap={1} align="center">
                  <Text variant="caption" tone="muted">
                    Pauses 5s each
                  </Text>
                  <Button variant="ghost" size="sm" onClick={onStopCosmeticPreview}>
                    Stop
                  </Button>
                </Row>
              </Stack>
            </Card>
          ) : null}

          <Row gap={3} align="start">
            <ProfileBubbleEmblem
              profileCardEquippedStyle={profileCardEquippedStyle}
              profileEmblemRarityClass={profileEmblemRarityClass}
              profileEmblemCategoryClass={profileEmblemCategoryClass}
              isProfileBubblePressed={isProfileBubblePressed}
              onProfileBubblePointerDown={onProfileBubblePointerDown}
              onProfileBubblePointerUp={onProfileBubblePointerUp}
              onProfileBubblePointerLeave={onProfileBubblePointerLeave}
              onProfileBubblePointerCancel={onProfileBubblePointerCancel}
              profileBubbleTone={profileBubbleTone}
            />
            <Stack gap={1} fullWidth>
              <Text variant="overline" tone="muted">
                Bubble · Profile
              </Text>
              <Heading level="h1">{nicknameDisplay}</Heading>
              {profileCardEquippedStyle ? (
                <>
                  <Text variant="overline" tone="muted">
                    {cosmeticTierPreviewActive ? "Demo cosmetic" : "Equipped on bubble"}
                  </Text>
                  <Text variant="body" tone="primary" weight="bold">
                    {equippedStyleName}
                  </Text>
                  {/* Preserved: ProfileRarityChipMotion relies on a rarity-class
                      chain for its motion halos. Wrapping in Badge would strip them. */}
                  <ProfileRarityChipMotion
                    rarity={profileCardEquippedStyle.rarity}
                    className={`profile-rarity-chip ${profileRarityChipClass}`}
                  >
                    {profileCardEquippedStyle.rarity}
                  </ProfileRarityChipMotion>
                </>
              ) : null}
              <Text variant="caption" tone="muted">
                {walletSubline}
              </Text>
            </Stack>
            {qualificationBadge ? (
              <Badge tone={qualificationBadge.tone}>{qualificationBadge.label}</Badge>
            ) : null}
          </Row>

          {profilePrimaryAction ? (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={profilePrimaryAction.disabled}
              onClick={profilePrimaryAction.onClick}
            >
              {profilePrimaryAction.label}
            </Button>
          ) : null}

          <Grid columns={3} gap={2}>
            <StatTile label="XP" value={totalXp} />
            <StatTile label="Streak" value={currentStreak} />
            <StatTile label="Frame" value={currentFrameLabel} />
          </Grid>

          <Card variant="muted" padding="sm">
            <Stack gap={2}>
              <Row justify="between" align="center" gap={3}>
                <Text variant="caption" tone="muted" weight="semibold">
                  {nextFrameCopy}
                </Text>
                <Text variant="overline" tone="muted">
                  {nextFrame ? `${progressToNextFramePercent}%` : "Live"}
                </Text>
              </Row>
              <ProgressBar percent={progressToNextFramePercent} />
            </Stack>
          </Card>

          <Grid columns={showDropRadar ? 2 : 1} gap={2}>
            <Card variant="muted" padding="sm">
              <Stack gap={3}>
                <Stack gap={2}>
                  <Text variant="overline" tone="muted">
                    Daily mission
                  </Text>
                  <Heading level="h3">Today</Heading>
                  <Text variant="body" tone="secondary">
                    {dailyMissionHint}
                  </Text>
                  <Grid columns={3} gap={2}>
                    <StatTile label="Streak" value={currentStreak} />
                    <StatTile label="XP" value={totalXp} />
                    <StatTile label="Rare" value={isRareRewardAccessActive ? "On" : "Off"} />
                  </Grid>
                </Stack>
                {dailyMissionPrimaryAction?.kind === "link" ? (
                  <NavLinkButton
                    href={dailyMissionPrimaryAction.href}
                    variant="primary"
                    size="md"
                    fullWidth
                  >
                    {dailyMissionPrimaryAction.label}
                  </NavLinkButton>
                ) : null}
              </Stack>
            </Card>

            {showDropRadar ? (
              <Card variant="accent" padding="sm">
                <Stack gap={2}>
                  <Row justify="between" align="start" gap={2}>
                    <Text variant="overline" tone="muted">
                      Drop radar
                    </Text>
                    <Badge tone="muted" size="sm">
                      {`${dropRadarPercent}%`}
                    </Badge>
                  </Row>
                  <Stack gap={2} align="center">
                    <Text variant="overline" tone="accent" weight="bold">
                      {dropRadarHeadline}
                    </Text>
                    <DropRadarDial dropRadarPercent={dropRadarPercent} />
                    <Text variant="body" tone="primary" weight="bold">
                      {dropRadarStateLabel}
                    </Text>
                  </Stack>
                  <Grid columns={3} gap={1}>
                    <StatTile label="Streak" value={currentStreak} />
                    <StatTile label="XP" value={totalXp} />
                    <StatTile label="Rare" value={isRareRewardAccessActive ? "On" : "Off"} />
                  </Grid>
                  {hasUnlockedCollection && rewardsInventoryHref ? (
                    <NavLinkButton
                      href={rewardsInventoryHref}
                      variant="secondary"
                      size="sm"
                      fullWidth
                    >
                      Open vault
                    </NavLinkButton>
                  ) : null}
                </Stack>
              </Card>
            ) : null}
          </Grid>
        </Stack>
      </Section>

      {hasEnteredBubbleDropApp ? (
        <Section
          kicker="Daily Check-in"
          title="Mark today in Base"
          headingLevel="h2"
          description="Onchain on Base • You pay gas for this step"
          padding="lg"
        >
          {dailyCheckInCardAction ? (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={dailyCheckInCardAction.disabled}
              onClick={dailyCheckInCardAction.onClick}
            >
              {dailyCheckInCardAction.label}
            </Button>
          ) : null}
        </Section>
      ) : null}
    </>
  );
}
