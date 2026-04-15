"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { captureAnalyticsEvent } from "../analytics";
import {
  BUBBLEDROP_API_BASE,
  useBubbleDropRuntime,
  withBubbleDropContext,
} from "../bubbledrop-runtime";
import { UnifiedIcon } from "./unified-icons";

type PartnerTokenDetailView = {
  id: string;
  symbol: string;
  name: string;
  contractAddress: string;
  twitterUrl: string;
  chartUrl: string | null;
  dexscreenerUrl: string | null;
  season: {
    id: string;
    key: string;
    title: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  };
  pinCount: number;
};

export function TokenDetailScreen({ tokenId }: { tokenId: string }) {
  const runtimeContext = useBubbleDropRuntime();
  const [token, setToken] = useState<PartnerTokenDetailView | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const backendUrl = BUBBLEDROP_API_BASE;

  const loadToken = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${backendUrl}/partner-token/token/${encodeURIComponent(tokenId)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        setToken(null);
        setErrorMessage("Unable to load token details from backend.");
        return;
      }

      const payload = (await response.json()) as PartnerTokenDetailView;
      setToken(payload);
      captureAnalyticsEvent("bubbledrop_token_detail_viewed", {
        profile_id: runtimeContext.profileId,
        token_id: payload.id,
        token_symbol: payload.symbol,
        season_key: payload.season.key,
      });
    } catch {
      setToken(null);
      setErrorMessage("Backend connection failed while loading token details.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenId, runtimeContext.profileId]);

  const marketUrl = token?.chartUrl || token?.dexscreenerUrl || null;

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
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#536ea4]">Partner token</p>
              <h1 className="mt-1 text-xl font-bold text-[#27457b]">Token detail</h1>
            </div>
            <Link
              href={withBubbleDropContext("/season", {
                profileId: runtimeContext.profileId,
                walletAddress: runtimeContext.walletAddress,
              })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#425b8a]"
            >
              <UnifiedIcon kind="back" className="ui-icon ui-icon-active text-[#425b8a]" />
              Back
            </Link>
          </div>
          <p className="mt-3 text-sm text-[#5d76a5]">
            View the token profile, season context, and official links for this featured drop.
          </p>
        </section>

        <section className="bubble-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#30466f]">
              <UnifiedIcon kind="tokens" className="ui-icon text-[#48608f]" />
              Token info
            </h2>
            <button
              type="button"
              onClick={() => void loadToken()}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#48608f] disabled:opacity-60"
            >
              <UnifiedIcon kind="refresh" className="ui-icon ui-icon-active text-[#48608f]" />
              {isLoading ? "Refreshing..." : "Update"}
            </button>
          </div>
          {isLoading ? (
            <p className="mt-3 text-sm text-[#6074a0]">Loading token details...</p>
          ) : null}

          {token ? (
            <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-3">
              <p className="text-sm font-semibold text-[#2f4a7f]">
                {token.name} ({token.symbol})
              </p>
              <p className="mt-2 break-all text-xs text-[#6074a0]">{token.contractAddress}</p>
              <p className="mt-2 text-xs text-[#6074a0]">Season: {token.season.title}</p>
              <p className="mt-1 text-xs text-[#6074a0]">Pins: {token.pinCount}</p>
              <a
                href={token.twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#eef4ff] p-2 text-center text-xs font-semibold text-[#36568d]"
              >
                <UnifiedIcon kind="twitter" className="ui-icon ui-icon-active text-[#36568d]" />
                Open X / Twitter
              </a>
              {marketUrl ? (
                <a
                  href={marketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    captureAnalyticsEvent("bubbledrop_token_market_link_opened", {
                      profile_id: runtimeContext.profileId,
                      token_id: token.id,
                      token_symbol: token.symbol,
                    })
                  }
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#d8f2ff] to-[#e5dbff] p-2 text-center text-xs font-semibold text-[#3b4e85]"
                >
                  <UnifiedIcon kind="chart" className="ui-icon ui-icon-active text-[#3b4e85]" />
                  Open chart / DexScreener
                </a>
              ) : (
                <div className="mt-2 rounded-lg bg-[#f6f8ff] p-2 text-center text-xs text-[#6c7fa6]">
                  Market links have not been added for this token yet.
                </div>
              )}
            </div>
          ) : (
            !isLoading ? (
              <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-4 text-sm text-[#6074a0]">
                Token details are not available yet.
              </div>
            ) : null
          )}
        </section>

        {errorMessage ? (
          <section className="bubble-card p-4">
            <p className="rounded-xl bg-[#fff2f7] p-3 text-sm text-[#7f3a53]">
              {errorMessage === "Unable to load token details from backend."
                ? "This token page is unavailable right now."
                : "We couldn't refresh this token page."}
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
