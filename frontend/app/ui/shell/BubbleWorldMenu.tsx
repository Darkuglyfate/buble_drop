"use client";

import { captureAnalyticsEvent } from "../../analytics";
import { withBubbleDropContext } from "../../bubbledrop-runtime";
import {
  Badge,
  NavLinkButton,
  Row,
  Section,
  Stack,
  Text,
} from "../../components";

type WorldIconKind =
  | "season"
  | "hunt"
  | "style"
  | "board"
  | "referrals"
  | "tokens";

function WorldMenuIcon({ kind }: { kind: WorldIconKind }) {
  const size = 14;
  if (kind === "season") {
    return (
      <svg viewBox="0 0 24 24" fill="none" width={size} height={size} aria-hidden="true">
        <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 3.8V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16 3.8V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7 10.5H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "hunt") {
    return (
      <svg viewBox="0 0 24 24" fill="none" width={size} height={size} aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="11" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M15.8 15.8L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "style") {
    return (
      <svg viewBox="0 0 24 24" fill="none" width={size} height={size} aria-hidden="true">
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
      <svg viewBox="0 0 24 24" fill="none" width={size} height={size} aria-hidden="true">
        <path d="M12 4.5L14.3 9.2L19.5 9.9L15.7 13.5L16.6 18.7L12 16.2L7.4 18.7L8.3 13.5L4.5 9.9L9.7 9.2L12 4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "referrals") {
    return (
      <svg viewBox="0 0 24 24" fill="none" width={size} height={size} aria-hidden="true">
        <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="16.5" cy="10.5" r="2.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4.8 17.8C5.5 15.7 7.1 14.6 9 14.6C10.9 14.6 12.5 15.7 13.2 17.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M14.6 17.5C15.1 16.2 16.1 15.4 17.3 15.4C18.1 15.4 18.8 15.7 19.4 16.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} aria-hidden="true">
      <ellipse cx="12" cy="13.6" rx="7" ry="5.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.2 11.7C9.1 10.7 10.5 10 12 10C13.5 10 14.9 10.7 15.8 11.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9.2" cy="13.2" r="0.8" fill="currentColor" />
      <circle cx="14.8" cy="13.2" r="0.8" fill="currentColor" />
    </svg>
  );
}

export type BubbleWorldMenuProps = {
  profileId: string | null;
  walletAddress: string | null;
};

export function BubbleWorldMenu({ profileId, walletAddress }: BubbleWorldMenuProps) {
  const seasonHref = withBubbleDropContext("/season", { profileId, walletAddress });
  const leaderboardHref = withBubbleDropContext("/leaderboard", { profileId, walletAddress });
  const referralsHref = withBubbleDropContext("/referrals", { profileId, walletAddress });
  const partnerTokensHref = withBubbleDropContext("/partner-tokens", { profileId, walletAddress });

  return (
    <Section
      padding="sm"
      trailing={
        <Row gap={1} wrap>
          <Badge tone="neutral" size="sm">
            <WorldMenuIcon kind="season" />
            <span>Season</span>
          </Badge>
          <Badge tone="neutral" size="sm">
            <WorldMenuIcon kind="hunt" />
            <span>Hunt</span>
          </Badge>
          <Badge tone="neutral" size="sm">
            <WorldMenuIcon kind="style" />
            <span>Style</span>
          </Badge>
        </Row>
      }
    >
      <Text variant="overline" tone="muted">
        Bubble world
      </Text>
      <Stack gap={2}>
        <NavLinkButton
          href={seasonHref}
          variant="secondary"
          size="sm"
          fullWidth
          icon={<WorldMenuIcon kind="season" />}
        >
          Season
        </NavLinkButton>
        <NavLinkButton
          href={leaderboardHref}
          variant="secondary"
          size="sm"
          fullWidth
          icon={<WorldMenuIcon kind="board" />}
        >
          Board
        </NavLinkButton>
        <NavLinkButton
          href={referralsHref}
          variant="secondary"
          size="sm"
          fullWidth
          icon={<WorldMenuIcon kind="referrals" />}
        >
          Referrals
        </NavLinkButton>
        <NavLinkButton
          href={partnerTokensHref}
          variant="secondary"
          size="sm"
          fullWidth
          icon={<WorldMenuIcon kind="tokens" />}
          onClick={() =>
            captureAnalyticsEvent("bubbledrop_partner_transparency_opened", {
              profile_id: profileId,
            })
          }
        >
          Tokens
        </NavLinkButton>
      </Stack>
    </Section>
  );
}
