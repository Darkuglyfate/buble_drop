"use client";

import Link from "next/link";
import {
  useBubbleDropRuntime,
  withBubbleDropContext,
} from "../bubbledrop-runtime";
import { UnifiedIcon } from "./unified-icons";

export function PartnerTokenTransparencyScreen() {
  const { profileId, walletAddress } = useBubbleDropRuntime();

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
              href={withBubbleDropContext("/", { profileId, walletAddress }, { skipIntro: true })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-[#425b8a]"
            >
              <UnifiedIcon kind="back" className="ui-icon ui-icon-active text-[#425b8a]" />
              Back
            </Link>
          </div>
        </section>

        <section className="bubble-card p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#c8ecff] to-[#e8d8ff]">
            <UnifiedIcon kind="tokens" className="ui-icon ui-icon-active text-[#3b4e85]" />
          </div>
          <p className="mt-5 text-4xl font-black uppercase tracking-[0.28em] text-[#27457b]">
            SOON
          </p>
          <p className="mt-4 text-sm text-[#5d76a5]">
            Partner tokens are coming soon. Stay tuned — we&apos;ll announce the featured partners
            for each season here.
          </p>
        </section>
      </main>
    </div>
  );
}
