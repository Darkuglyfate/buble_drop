"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { captureAnalyticsEvent } from "../analytics";
import {
  BUBBLEDROP_API_BASE,
  useBubbleDropRuntime,
  withBubbleDropContext,
} from "../bubbledrop-runtime";

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
  const { profileId, walletAddress } = useBubbleDropRuntime();
  const [hub, setHub] = useState<SeasonHubView | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const backendUrl = BUBBLEDROP_API_BASE;

  const loadSeasonHub = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${backendUrl}/partner-token/season-hub`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        setHub(null);
        setErrorMessage("Unable to load season hub from backend.");
        return;
      }

      const payload = (await response.json()) as SeasonHubView;
      setHub(payload);
    } catch {
      setHub(null);
      setErrorMessage("Backend connection failed while loading season hub.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSeasonHub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#536ea4]">Live season</p>
              <h1 className="mt-1 text-xl font-bold text-[#27457b]">Season hub</h1>
            </div>
            <Link
              href={withBubbleDropContext("/", { profileId, walletAddress })}
              className="rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#425b8a]"
            >
              Back
            </Link>
          </div>
          <p className="mt-3 text-sm text-[#5d76a5]">
            Follow the current season, track featured tokens, and open the details that matter.
          </p>
        </section>

        <section className="bubble-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#30466f]">Season snapshot</h2>
            <button
              type="button"
              onClick={() => void loadSeasonHub()}
              disabled={isLoading}
              className="rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#48608f] disabled:opacity-60"
            >
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
              <p className="mt-1 text-xs text-[#6074a0]">Tokens: {hub.tokenCount}</p>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-4 text-sm text-[#6074a0]">
              A new BubbleDrop season has not been announced yet.
            </div>
          )}
        </section>

        <section className="bubble-card p-4">
          <h2 className="text-sm font-semibold text-[#30466f]">Season tokens</h2>
          {isLoading ? (
            <p className="mt-3 text-sm text-[#6074a0]">Loading the current token lineup...</p>
          ) : null}
          {hub?.tokens.length ? (
            hub.tokens.map((token) => (
              <article key={token.id} className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#2f4a7f]">{token.name}</p>
                    <p className="mt-1 text-xs text-[#6074a0]">{token.symbol}</p>
                  </div>
                  <Link
                    href={withBubbleDropContext(`/token/${token.id}`, {
                      profileId,
                      walletAddress,
                    })}
                    onClick={() =>
                      captureAnalyticsEvent("bubbledrop_token_detail_opened", {
                        profile_id: profileId,
                        token_id: token.id,
                        token_name: token.name,
                      })
                    }
                    className="rounded-lg bg-[#eef4ff] px-3 py-2 text-xs font-semibold text-[#36568d]"
                  >
                    Details
                  </Link>
                </div>
              </article>
            ))
          ) : (
            !isLoading ? (
              <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-4 text-sm text-[#6074a0]">
                Featured season tokens will appear here when the lineup is live.
              </div>
            ) : null
          )}
        </section>

        {errorMessage ? (
          <section className="bubble-card p-4">
            <p className="rounded-xl bg-[#fff2f7] p-3 text-sm text-[#7f3a53]">
              {errorMessage === "Unable to load season hub from backend."
                ? "Season data is unavailable right now."
                : "We couldn't refresh the season hub."}
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
