"use client";

import Link from "next/link";
import { captureAnalyticsEvent } from "../../analytics";
import { withBubbleDropContext } from "../../bubbledrop-runtime";

type WorldIconKind =
  | "season"
  | "hunt"
  | "style"
  | "board"
  | "referrals"
  | "tokens";

function WorldMenuIcon({ kind, className }: { kind: WorldIconKind; className?: string }) {
  const iconClassName = "h-3.5 w-3.5 text-[#4f6796]";
  const mergedClassName = className
    ? `${iconClassName} ${className}`
    : iconClassName;

  if (kind === "season") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 3.8V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16 3.8V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7 10.5H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "hunt") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="11" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M15.8 15.8L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "style") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <path
          d="M12 3.5L13.8 8.2L18.5 10L13.8 11.8L12 16.5L10.2 11.8L5.5 10L10.2 8.2L12 3.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "board") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <path d="M12 4.5L14.3 9.2L19.5 9.9L15.7 13.5L16.6 18.7L12 16.2L7.4 18.7L8.3 13.5L4.5 9.9L9.7 9.2L12 4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "referrals") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="16.5" cy="10.5" r="2.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4.8 17.8C5.5 15.7 7.1 14.6 9 14.6C10.9 14.6 12.5 15.7 13.2 17.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M14.6 17.5C15.1 16.2 16.1 15.4 17.3 15.4C18.1 15.4 18.8 15.7 19.4 16.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  // tokens
  return (
    <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
      <ellipse cx="12" cy="13.6" rx="7" ry="5.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.2 11.7C9.1 10.7 10.5 10 12 10C13.5 10 14.9 10.7 15.8 11.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9.2" cy="13.2" r="0.8" fill="currentColor" />
      <circle cx="14.8" cy="13.2" r="0.8" fill="currentColor" />
    </svg>
  );
}

export type BubbleWorldMenuProps = {
  profileId: string | null;
  walletAddress: string | null;
};

export function BubbleWorldMenu({ profileId, walletAddress }: BubbleWorldMenuProps) {
  const seasonHref = withBubbleDropContext("/season", { profileId, walletAddress });
  const leaderboardHref = withBubbleDropContext("/leaderboard", { profileId, walletAddress });
  const referralsHref = withBubbleDropContext("/referrals", { profileId, walletAddress });
  const partnerTokensHref = withBubbleDropContext("/partner-tokens", { profileId, walletAddress });

  return (
    <section className="bubble-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7b8fb8]">
          Bubble world
        </p>
        <div className="flex flex-wrap items-center gap-0.5">
          <span className="inline-flex items-center gap-0.5 rounded-full bg-white/82 px-1.5 py-0.5 text-[9px] font-semibold text-[#48608f]">
            <WorldMenuIcon kind="season" className="ui-icon" />
            <span>Season</span>
          </span>
          <span className="inline-flex items-center gap-0.5 rounded-full bg-white/82 px-1.5 py-0.5 text-[9px] font-semibold text-[#48608f]">
            <WorldMenuIcon kind="hunt" className="ui-icon" />
            <span>Hunt</span>
          </span>
          <span className="inline-flex items-center gap-0.5 rounded-full bg-white/82 px-1.5 py-0.5 text-[9px] font-semibold text-[#48608f]">
            <WorldMenuIcon kind="style" className="ui-icon" />
            <span>Style</span>
          </span>
        </div>
      </div>

      <div className="mt-2.5 flex flex-col gap-1">
        <Link
          href={seasonHref}
          className="flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(176,200,235,0.65)] bg-white/78 px-2.5 py-1.5 text-left shadow-[0_3px_10px_rgba(110,145,217,0.07)] transition-[transform,box-shadow] [-webkit-tap-highlight-color:transparent] hover:-translate-y-px hover:shadow-[0_5px_14px_rgba(110,145,217,0.1)] active:translate-y-0"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#cff4ff] to-[#d8e4ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <WorldMenuIcon kind="season" className="!h-3.5 !w-3.5 text-[#385a91]" />
          </div>
          <span className="min-w-0 flex-1 text-xs font-bold tracking-tight text-[#20365d]">
            Season
          </span>
        </Link>
        <Link
          href={leaderboardHref}
          className="flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(176,200,235,0.65)] bg-white/78 px-2.5 py-1.5 text-left shadow-[0_3px_10px_rgba(110,145,217,0.07)] transition-[transform,box-shadow] [-webkit-tap-highlight-color:transparent] hover:-translate-y-px hover:shadow-[0_5px_14px_rgba(110,145,217,0.1)] active:translate-y-0"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#e6d8ff] to-[#ddd2f5] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <WorldMenuIcon kind="board" className="!h-3.5 !w-3.5 text-[#385a91]" />
          </div>
          <span className="min-w-0 flex-1 text-xs font-bold tracking-tight text-[#20365d]">
            Board
          </span>
        </Link>
        <Link
          href={referralsHref}
          className="flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(176,200,235,0.65)] bg-white/78 px-2.5 py-1.5 text-left shadow-[0_3px_10px_rgba(110,145,217,0.07)] transition-[transform,box-shadow] [-webkit-tap-highlight-color:transparent] hover:-translate-y-px hover:shadow-[0_5px_14px_rgba(110,145,217,0.1)] active:translate-y-0"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#d8ffe9] to-[#cef5e8] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <WorldMenuIcon kind="referrals" className="!h-3.5 !w-3.5 text-[#2d6b5a]" />
          </div>
          <span className="min-w-0 flex-1 text-xs font-bold tracking-tight text-[#20365d]">
            Referrals
          </span>
        </Link>
        <Link
          href={partnerTokensHref}
          onClick={() =>
            captureAnalyticsEvent("bubbledrop_partner_transparency_opened", {
              profile_id: profileId,
            })
          }
          className="flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(176,200,235,0.65)] bg-white/78 px-2.5 py-1.5 text-left shadow-[0_3px_10px_rgba(110,145,217,0.07)] transition-[transform,box-shadow] [-webkit-tap-highlight-color:transparent] hover:-translate-y-px hover:shadow-[0_5px_14px_rgba(110,145,217,0.1)] active:translate-y-0"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#ffe1ec] to-[#e8e0ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <WorldMenuIcon kind="tokens" className="!h-3.5 !w-3.5 text-[#385a91]" />
          </div>
          <span className="min-w-0 flex-1 text-xs font-bold tracking-tight text-[#20365d]">
            Tokens
          </span>
        </Link>
      </div>
    </section>
  );
}
