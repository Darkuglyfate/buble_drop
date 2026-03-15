"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type LeaderboardEntry = {
  rank: number;
  profileId: string;
  nickname: string;
  totalXp: number;
  currentStreak: number;
};

function getBackendUrl(): string | null {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  return backendUrl && backendUrl.trim() ? backendUrl.trim() : null;
}

function getProfileIdFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = new URLSearchParams(window.location.search).get("profileId");
  return value && value.trim() ? value.trim() : null;
}

function withProfileQuery(path: string, profileId: string | null): string {
  if (!profileId) {
    return path;
  }
  return `${path}?profileId=${encodeURIComponent(profileId)}`;
}

export function LeaderboardScreen() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const backendUrl = getBackendUrl();

  const loadLeaderboard = async () => {
    if (!backendUrl) {
      setErrorMessage("Set NEXT_PUBLIC_BACKEND_URL to load leaderboard.");
      return;
    }

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
    setProfileId(getProfileIdFromUrl());
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
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#536ea4]">MVP read surface</p>
              <h1 className="mt-1 text-xl font-bold text-[#27457b]">Leaderboard</h1>
            </div>
            <Link
              href={withProfileQuery("/", profileId)}
              className="rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#425b8a]"
            >
              Back
            </Link>
          </div>
          <p className="mt-3 text-sm text-[#5d76a5]">Read-only progression ranking from backend truth.</p>
        </section>

        <section className="bubble-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#30466f]">Top players</h2>
            <button
              type="button"
              onClick={() => void loadLeaderboard()}
              disabled={isLoading}
              className="rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#48608f] disabled:opacity-60"
            >
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <p className="mt-2 text-xs text-[#6074a0]">Loaded: {totalPlayers}</p>

          {isLoading ? <p className="mt-3 text-sm text-[#6074a0]">Loading leaderboard...</p> : null}

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
        </section>

        {errorMessage ? (
          <section className="bubble-card p-4">
            <p className="rounded-xl bg-[#fff2f7] p-3 text-sm text-[#7f3a53]">{errorMessage}</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
