"use client";

import { useBubbleDropQuery } from "../hooks/useBubbleDropQuery";
import {
  BackButton,
  EmptyState,
  ErrorMessage,
  IconButton,
  ListItem,
  LoadingState,
  Row,
  ScreenLayout,
  Section,
  Stack,
  Text,
} from "../components";
import { UnifiedIcon } from "./unified-icons";

type LeaderboardEntry = {
  rank: number;
  profileId: string;
  nickname: string;
  totalXp: number;
  currentStreak: number;
};

export function LeaderboardScreen() {
  const { data: entries, isLoading, error, refetch } = useBubbleDropQuery<LeaderboardEntry[]>(
    "/profile/leaderboard?limit=20",
  );

  const totalPlayers = entries?.length ?? 0;
  const hasEntries = totalPlayers > 0;

  return (
    <ScreenLayout>
      <Section
        kicker="Season momentum"
        title="Leaderboard"
        headingLevel="h1"
        description="See who is building the strongest BubbleDrop streaks and XP runs right now."
        trailing={<BackButton />}
      />

      <Section
        title="Top players"
        trailing={
          <IconButton
            label="Refresh leaderboard"
            variant="secondary"
            size="sm"
            disabled={isLoading}
            onClick={refetch}
          >
            <UnifiedIcon kind="refresh" />
          </IconButton>
        }
      >
        <Text variant="caption" tone="muted">
          {hasEntries ? `${totalPlayers} players loaded` : "Live ranking updates appear here"}
        </Text>

        <LoadingState message={isLoading ? "Loading the latest standings..." : null} />

        {!isLoading && hasEntries ? (
          <Stack gap={2}>
            {entries!.map((entry) => (
              <ListItem
                key={entry.profileId}
                title={`#${entry.rank} ${entry.nickname}`}
                subtitle={`Streak: ${entry.currentStreak}`}
                trailing={
                  <Text variant="body" tone="accent" weight="bold">
                    {entry.totalXp} XP
                  </Text>
                }
              />
            ))}
          </Stack>
        ) : null}

        {!isLoading && !hasEntries && !error ? (
          <EmptyState message="No ranking data is live yet. Check back after more players finish their runs." />
        ) : null}
      </Section>

      <ErrorMessage message={error ? "The leaderboard is unavailable right now." : null} />
    </ScreenLayout>
  );
}
