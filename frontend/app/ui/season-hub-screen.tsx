"use client";

import { useBubbleDropQuery } from "../hooks/useBubbleDropQuery";
import {
  Badge,
  BackButton,
  Card,
  EmptyState,
  ErrorMessage,
  IconButton,
  ListItem,
  LoadingState,
  ScreenLayout,
  Section,
  Stack,
  Text,
} from "../components";
import { UnifiedIcon } from "./unified-icons";

type SeasonHubView = {
  season: {
    id: string;
    key: string;
    title: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  } | null;
  tokenCount: number;
  tokens: Array<{
    id: string;
    symbol: string;
    name: string;
  }>;
};

export function SeasonHubScreen() {
  const { data: hub, isLoading, error, refetch } = useBubbleDropQuery<SeasonHubView>(
    "/partner-token/season-hub",
  );

  return (
    <ScreenLayout>
      <Section
        kicker="Live season"
        title="Season hub"
        headingLevel="h1"
        description="Follow the current season window, track featured partners, and understand what can be awarded at season end."
        trailing={<BackButton />}
      />

      <Section
        title="Season snapshot"
        trailing={
          <IconButton
            label="Refresh season"
            variant="secondary"
            size="sm"
            disabled={isLoading}
            onClick={refetch}
          >
            <UnifiedIcon kind="refresh" />
          </IconButton>
        }
      >
        {hub?.season ? (
          <Card variant="muted" padding="sm">
            <Stack gap={1}>
              <Stack gap={1}>
                <Text variant="body" tone="accent" weight="semibold">
                  {hub.season.title}
                </Text>
                <Badge tone={hub.season.isActive ? "success" : "neutral"}>
                  {hub.season.isActive ? "Active" : "Upcoming"}
                </Badge>
              </Stack>
              <Text variant="caption" tone="muted">
                {hub.season.startDate} - {hub.season.endDate}
              </Text>
              <Text variant="caption" tone="muted">
                Featured partners: {hub.tokenCount}. Rewards are distributed by season outcome, not per single run.
              </Text>
            </Stack>
          </Card>
        ) : (
          <EmptyState message="A new BubbleDrop season has not been announced yet." />
        )}
      </Section>

      <Section title="Season tokens">
        <LoadingState message={isLoading ? "Loading the current token lineup..." : null} />
        {hub?.tokens.length ? (
          <Stack gap={2}>
            {hub.tokens.map((token) => (
              <ListItem key={token.id} title={token.name} subtitle={token.symbol} />
            ))}
          </Stack>
        ) : !isLoading ? (
          <EmptyState message="Featured season partners will appear here when the lineup is live." />
        ) : null}
      </Section>

      <ErrorMessage message={error ? "Season data is unavailable right now." : null} />
    </ScreenLayout>
  );
}
