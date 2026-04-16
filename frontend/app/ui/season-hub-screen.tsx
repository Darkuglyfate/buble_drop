"use client";

import { useBubbleDropQuery } from "../hooks/useBubbleDropQuery";
import { UnifiedIcon } from "./unified-icons";
import { BackButton, ErrorMessage, ScreenLayout } from "./shared";

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
      <section className="bubble-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#536ea4]">Live season</p>
            <h1 className="mt-1 text-xl font-bold text-[#27457b]">Season hub</h1>
          </div>
          <BackButton />
        </div>
        <p className="mt-3 text-sm text-[#5d76a5]">
          Follow the current season window, track featured partners, and understand what can be
          awarded at season end.
        </p>
      </section>

      <section className="bubble-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#30466f]">
            <UnifiedIcon kind="season" className="ui-icon text-[#48608f]" />
            Season snapshot
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

        {hub?.season ? (
          <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#2f4a7f]">{hub.season.title}</p>
              <span
                className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                  hub.season.isActive
                    ? "bg-[#e7fbf0] text-[#2f6f53]"
                    : "bg-[#f2f5ff] text-[#61739b]"
                }`}
              >
                {hub.season.isActive ? "Active" : "Upcoming"}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#6074a0]">
              {hub.season.startDate} - {hub.season.endDate}
            </p>
            <p className="mt-1 text-xs text-[#6074a0]">
              Featured partners: {hub.tokenCount}. Rewards are distributed by season outcome, not
              per single run.
            </p>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-4 text-sm text-[#6074a0]">
            A new BubbleDrop season has not been announced yet.
          </div>
        )}
      </section>

      <section className="bubble-card p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#c8ecff] to-[#e8d8ff]">
          <UnifiedIcon kind="tokens" className="ui-icon ui-icon-active text-[#3b4e85]" />
        </div>
        <p className="mt-4 text-3xl font-black uppercase tracking-[0.26em] text-[#27457b]">
          SOON
        </p>
        <p className="mt-3 text-sm text-[#5d76a5]">
          Season tokens are coming soon. Featured partner lineup will be announced here before
          the season ends.
        </p>
      </section>

      <ErrorMessage message={error} />
    </ScreenLayout>
  );
}
