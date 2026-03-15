"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { captureAnalyticsEvent } from "../analytics";
import {
  BUBBLEDROP_API_BASE,
  useBubbleDropRuntime,
  withBubbleDropContext,
} from "../bubbledrop-runtime";

type PartnerTokenView = {
  id: string;
  name: string;
  contractAddress: string;
  twitterUrl: string;
  chartUrl: string | null;
  dexscreenerUrl: string | null;
  seasonTitle: string;
};

export function PartnerTokenTransparencyScreen() {
  const runtimeContext = useBubbleDropRuntime();
  const [tokens, setTokens] = useState<PartnerTokenView[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const backendUrl = BUBBLEDROP_API_BASE;
  const endpoint = backendUrl ? `${backendUrl}/partner-token/transparency` : null;

  useEffect(() => {
    const resolvedProfileId = runtimeContext.profileId;

    const loadTokens = async () => {
      if (!endpoint) {
        setErrorMessage("Partner token data is unavailable right now.");
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (!response.ok) {
          setTokens([]);
          setErrorMessage("Unable to load partner token transparency data from backend.");
          return;
        }

        const payload = (await response.json()) as PartnerTokenView[];
        setTokens(payload);
        captureAnalyticsEvent("bubbledrop_partner_transparency_viewed", {
          profile_id: resolvedProfileId,
          token_count: payload.length,
        });
      } catch {
        setTokens([]);
        setErrorMessage("Backend connection failed while loading partner token data.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadTokens();
  }, [endpoint, runtimeContext.profileId]);

  const tokenCount = useMemo(() => tokens.length, [tokens]);

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
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#536ea4]">
                Partner spotlight
              </p>
              <h1 className="mt-1 text-xl font-bold text-[#27457b]">Partner token transparency</h1>
            </div>
            <Link
              href={withBubbleDropContext("/", {
                profileId: runtimeContext.profileId,
                walletAddress: runtimeContext.walletAddress,
              })}
              className="rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#425b8a]"
            >
              Back
            </Link>
          </div>
          <p className="mt-3 text-sm text-[#5d76a5]">
            Explore the featured partner tokens for this season, with quick access to official links and market context.
          </p>
        </section>

        <section className="bubble-card p-4">
          <h2 className="text-sm font-semibold text-[#30466f]">Season token overview</h2>
          <div className="mt-3 rounded-xl bg-white/80 p-3">
            <p className="text-xs text-[#6074a0]">Loaded tokens</p>
            <p className="mt-1 text-lg font-semibold text-[#2f4a7f]">{tokenCount}</p>
          </div>
        </section>

        <section className="bubble-card p-4">
          <h2 className="text-sm font-semibold text-[#30466f]">Token list</h2>

          {isLoading ? (
            <p className="mt-3 text-sm text-[#6074a0]">Loading featured partner tokens...</p>
          ) : null}

          {!isLoading && tokens.length === 0 && !errorMessage ? (
            <div className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-4 text-sm text-[#6074a0]">
              No featured partner tokens are live right now.
            </div>
          ) : null}

          {!isLoading
            ? tokens.map((token) => {
                const marketUrl = token.chartUrl || token.dexscreenerUrl;
                return (
                  <article key={token.id} className="mt-3 rounded-xl border border-[#dce6ff] bg-white/80 p-3">
                    <p className="text-sm font-semibold text-[#2f4a7f]">{token.name}</p>
                    <p className="mt-1 text-xs text-[#6074a0]">Season: {token.seasonTitle}</p>

                    <div className="mt-3 space-y-2 text-xs">
                      <div className="rounded-lg bg-[#f5f8ff] p-2">
                        <p className="font-semibold text-[#4b618e]">Contract</p>
                        <p className="mt-1 break-all text-[#4f648f]">{token.contractAddress}</p>
                      </div>
                      <a
                        href={token.twitterUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg bg-[#eef4ff] p-2 font-semibold text-[#36568d]"
                      >
                        Open X / Twitter
                      </a>
                      {marketUrl ? (
                        <a
                          href={marketUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() =>
                            captureAnalyticsEvent(
                              "bubbledrop_partner_market_link_opened",
                              {
                                profile_id: runtimeContext.profileId,
                                token_id: token.id,
                                token_name: token.name,
                              },
                            )
                          }
                          className="block rounded-lg bg-gradient-to-r from-[#d8f2ff] to-[#e5dbff] p-2 font-semibold text-[#3b4e85]"
                        >
                          Open chart / DexScreener
                        </a>
                      ) : (
                        <div className="rounded-lg bg-[#f6f8ff] p-2 text-[#6c7fa6]">
                          Market links have not been shared for this token yet.
                        </div>
                      )}
                    </div>
                  </article>
                );
              })
            : null}
        </section>

        {errorMessage ? (
          <section className="bubble-card p-4">
            <p className="rounded-xl bg-[#fff2f7] p-3 text-sm text-[#7f3a53]">
              {errorMessage ===
              "Unable to load partner token transparency data from backend."
                ? "Partner token details are unavailable right now."
                : "We couldn't refresh the partner token view."}
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
