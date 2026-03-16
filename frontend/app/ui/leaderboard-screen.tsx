"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BUBBLEDROP_API_BASE,
  useBubbleDropRuntime,
  withBubbleDropContext,
} from "../bubbledrop-runtime";
import { UnifiedIcon } from "./unified-icons";

type LeaderboardEntry = {
  rank: number;
  profileId: string;
  nickname: string;
  totalXp: number;
  currentStreak: number;
};

export function LeaderboardScreen() {
  const { profileId, walletAddress } = useBubbleDropRuntime();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const backendUrl = BUBBLEDROP_API_BASE;

  const loadLeaderboard = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${backendUrl}/profile/leaderboard?limit=20`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        setEntries([]);
        setErrorMessage("Unable to load leaderboard from backend.");
        return;
      }

      const payload = (await response.json()) as LeaderboardEntry[];
      setEntries(payload);
    } catch {
      setEntries([]);
      setErrorMessage("Backend connection failed while loading leaderboard.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPlayers = useMemo(() => entries.length, [entries]);

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
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#536ea4]">Season momentum</p>
              <h1 className="mt-1 text-xl font-bold text-[#27457b]">Leaderboard</h1>
            </div>
            <Link
              href={withBubbleDropContext("/", { profileId, walletAddress })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#425b8a]"
            >
              <UnifiedIcon kind="back" className="ui-icon ui-icon-active text-[#425b8a]" />
              Back
            </Link>
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
              onClick={() => void loadLeaderboard()}
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

          {isLoading ? (
            <p className="mt-3 text-sm text-[#6074a0]">Loading the latest standings...</p>
          ) : null}

          {!isLoading
            ? entries.map((entry) => (
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
          {!isLoading && entries.length === 0 && !errorMessage ? (
            <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-4 text-sm text-[#6074a0]">
              No ranking data is live yet. Check back after more players finish their runs.
            </div>
          ) : null}
        </section>

        {errorMessage ? (
          <section className="bubble-card p-4">
            <p className="rounded-xl bg-[#fff2f7] p-3 text-sm text-[#7f3a53]">
              {errorMessage === "Unable to load leaderboard from backend."
                ? "The leaderboard is unavailable right now."
                : "We couldn't refresh the leaderboard."}
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
