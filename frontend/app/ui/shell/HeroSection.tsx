"use client";

import type { WalletFlowState } from "../../hooks/shell/useWalletFlow";

export type HeroSectionProps = {
  effectiveIsConnected: boolean;
  isRareRewardAccessActive: boolean;
  heroStatusLabel: string;
  heroTitle: string;
  heroBody: string;
  heroAccentClass: string;
  heroPortalCopy: string;
  homeStatusPills: string[];
  walletFlowTitle: string | null;
  walletFlowCardStyle: string;
  walletFlowState: WalletFlowState;
  showConnectRecovery: boolean;
  showSignInRecovery: boolean;
  isWalletFlowBusy: boolean;
  isSubmittingAction: boolean;
  preferredConnectorUsesCoinbaseWallet: boolean;
  preferredConnectorUsesBaseAccount: boolean;
  fallbackWalletConnector: unknown | null;
  fallbackConnectorUsesCoinbaseWallet: boolean;
  onConnectWallet: () => void;
  onConnectCoinbaseWallet: () => void;
  onSignInWithBase: () => void;
  showHeroSecondaryAction: boolean;
  secondaryHeroActionLabel: string | null;
  secondaryHeroActionDisabled: boolean;
  secondaryHeroActionHandler: (() => void) | null;
};

export function HeroSection({
  effectiveIsConnected,
  isRareRewardAccessActive,
  heroStatusLabel,
  heroTitle,
  heroBody,
  heroAccentClass,
  heroPortalCopy,
  homeStatusPills,
  walletFlowTitle,
  walletFlowCardStyle,
  walletFlowState,
  showConnectRecovery,
  showSignInRecovery,
  isWalletFlowBusy,
  isSubmittingAction,
  preferredConnectorUsesCoinbaseWallet,
  preferredConnectorUsesBaseAccount,
  fallbackWalletConnector,
  fallbackConnectorUsesCoinbaseWallet,
  onConnectWallet,
  onConnectCoinbaseWallet,
  onSignInWithBase,
  showHeroSecondaryAction,
  secondaryHeroActionLabel,
  secondaryHeroActionDisabled,
  secondaryHeroActionHandler,
}: HeroSectionProps) {
  return (
    <section className={`bubble-card lounge-hero overflow-hidden p-5 bg-gradient-to-br ${heroAccentClass}`}>
      <div className="absolute -right-10 top-0 h-36 w-36 rounded-full bg-white/30 blur-3xl" />
      <div className="absolute -bottom-12 left-0 h-32 w-32 rounded-full bg-white/20 blur-3xl" />
      <div className="hero-portal-glow absolute right-[-1.5rem] top-[-0.6rem] h-44 w-44 rounded-full" />
      <div className="hero-portal-ring absolute right-[0.9rem] top-[1.1rem] h-24 w-24 rounded-full border border-white/35" />
      <div className="hero-portal-ring hero-portal-ring-delay absolute right-[0.2rem] top-[0.4rem] h-32 w-32 rounded-full border border-white/20" />
      <div className="relative">
        {!effectiveIsConnected ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
                {heroStatusLabel}
              </p>
              <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
                {heroPortalCopy}
              </p>
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-[1.75rem] font-black leading-[1.05] tracking-[-0.05em]">
                  {heroTitle}
                </h2>
                <p className="mt-3 max-w-[28rem] text-sm leading-6 opacity-80">
                  {heroBody}
                </p>
              </div>
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-[2rem] bg-white/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-xl">
                <div className="absolute inset-3 rounded-full border border-white/28" />
                <div className="hero-portal-core h-10 w-10 rounded-full bg-gradient-to-br from-white/90 to-white/45" />
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
                {heroStatusLabel}
              </p>
              <h2 className="mt-2 text-[1.75rem] font-black leading-[1.05] tracking-[-0.05em]">
                {heroTitle}
              </h2>
              <p className="mt-3 max-w-[28rem] text-sm leading-6 opacity-80">{heroBody}</p>
            </div>
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-[2rem] bg-white/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-xl">
              <div className="absolute inset-3 rounded-full border border-white/28" />
              <div
                className={`hero-portal-core h-10 w-10 rounded-full ${
                  isRareRewardAccessActive
                    ? "bg-gradient-to-br from-[#fff1a8] via-[#ffd8e8] to-[#b5dfff] shadow-[0_0_30px_rgba(255,215,146,0.95)]"
                    : "bg-gradient-to-br from-white/90 to-white/45"
                }`}
              />
              <span className="absolute bottom-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#29456f]/70">
                {heroPortalCopy}
              </span>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {homeStatusPills.map((pill) => (
            <span
              key={pill}
              className="rounded-full bg-white/60 px-3 py-1.5 text-[11px] font-semibold tracking-[0.04em] text-[#28456f] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
            >
              {pill}
            </span>
          ))}
        </div>

        {!effectiveIsConnected ? (
          <p className="mt-5 rounded-[1.1rem] border border-white/40 bg-white/35 px-4 py-3 text-center text-sm font-semibold leading-snug text-[#28456f]">
            <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#5d729d]">
              Do this next
            </span>
            <span className="mt-2 block">
              Connect your wallet first, then use the{" "}
              <strong className="text-[#1f3561]">profile card</strong> action above to sign in.
            </span>
          </p>
        ) : null}
        {showHeroSecondaryAction && secondaryHeroActionLabel && secondaryHeroActionHandler ? (
          <button
            type="button"
            onClick={secondaryHeroActionHandler}
            disabled={secondaryHeroActionDisabled}
            className="mt-3 rounded-[1.1rem] bg-white/56 px-4 py-3 text-left text-sm font-semibold text-[#28456f] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] transition-transform duration-150 hover:-translate-y-[1px] disabled:opacity-60"
          >
            {secondaryHeroActionLabel}
          </button>
        ) : null}

        {walletFlowTitle && walletFlowState.message ? (
          <div className={`mt-3 rounded-[1.2rem] border px-4 py-3 ${walletFlowCardStyle}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">
              {walletFlowTitle}
            </p>
            <p className="mt-1 text-sm font-semibold leading-6">{walletFlowState.message}</p>
          </div>
        ) : null}

        {showConnectRecovery ? (
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={onConnectWallet}
              disabled={isWalletFlowBusy || isSubmittingAction}
            className="action-chip gloss-pill rounded-[1.1rem] bg-white/72 px-4 py-3 text-left text-sm font-semibold text-[#28456f] disabled:opacity-60"
            >
            Retry{" "}
            {preferredConnectorUsesCoinbaseWallet
              ? "Coinbase Wallet"
              : preferredConnectorUsesBaseAccount
                ? "Base connection"
                : "in-app Base"}
            </button>
            {fallbackWalletConnector ? (
              <button
                type="button"
                onClick={onConnectCoinbaseWallet}
                disabled={isWalletFlowBusy || isSubmittingAction}
                className="action-chip rounded-[1.1rem] bg-white/52 px-4 py-3 text-left text-sm font-semibold text-[#355889] disabled:opacity-60"
              >
                {fallbackConnectorUsesCoinbaseWallet
                  ? "Try Coinbase Wallet fallback"
                  : "Try alternate Base route"}
              </button>
            ) : null}
          </div>
        ) : null}

        {showSignInRecovery ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={onSignInWithBase}
              disabled={isWalletFlowBusy || isSubmittingAction}
              className="action-chip gloss-pill rounded-[1.1rem] bg-white/72 px-4 py-3 text-left text-sm font-semibold text-[#28456f] disabled:opacity-60"
            >
              Retry Base sign-in
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
