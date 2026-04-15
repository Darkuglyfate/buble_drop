"use client";

import { useMemo } from "react";
import { useBubbleDropQuery } from "../hooks/useBubbleDropQuery";
import { UnifiedIcon } from "./unified-icons";
import { BackButton, ErrorMessage, LoadingState, ScreenLayout } from "./shared";

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

  const totalPlayers = useMemo(() => entries?.length ?? 0, [entries]);

  return (
    <ScreenLayout>
      <section className="bubble-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#536ea4]">Season momentum</p>
            <h1 className="mt-1 text-xl font-bold text-[#27457b]">Leaderboard</h1>
          </div>
          <BackButton />
        </div>
        <p className="mt-3 text-sm text-[#5d76a5]">
          See who is building the strongest BubbleDrop streaks and XP runs right now.
        </p>
      </section>

      <section className="bubble-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#30466f]">
            <UnifiedIcon kind="board" className="ui-icon text-[#48608f]" />
            Top players
          </h2>
          <button
            type="button"
            onClick={refetch}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#48608f] disabled:opacity-60"
          >
            <UnifiedIcon kind="refresh" className="ui-icon ui-icon-active text-[#48608f]" />
            {isLoading ? "Refreshing..." : "Update"}
          </button>
        </div>
        <p className="mt-2 text-xs text-[#6074a0]">
          {totalPlayers > 0
            ? `${totalPlayers} players loaded`
            : "Live ranking updates appear here"}
        </p>

        <LoadingState isLoading={isLoading} message="Loading the latest standings..." />

        {!isLoading
          ? entries?.map((entry) => (
              <article key={entry.profileId} className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#2f4a7f]">
                    #{entry.rank} {entry.nickname}
                  </p>
                  <p className="text-xs text-[#6074a0]">Streak: {entry.currentStreak}</p>
                </div>
                <p className="mt-1 text-sm font-bold text-[#3a5a94]">{entry.totalXp} XP</p>
              </article>
            ))
          : null}
        {!isLoading && (!entries || entries.length === 0) && !error ? (
          <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-4 text-sm text-[#6074a0]">
            No ranking data is live yet. Check back after more players finish their runs.
          </div>
        ) : null}
      </section>

      <ErrorMessage message={error} />
    </ScreenLayout>
  );
}
