"use client";

type UnifiedIconKind =
  | "back"
  | "refresh"
  | "season"
  | "board"
  | "referrals"
  | "tokens"
  | "vault"
  | "claim"
  | "nft"
  | "cosmetic"
  | "twitter"
  | "chart";

export function UnifiedIcon({
  kind,
  className = "",
}: {
  kind: UnifiedIconKind;
  className?: string;
}) {
  const mergedClassName = `h-4 w-4 ${className}`.trim();

  if (kind === "back") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <path d="M15.5 5.5L8.8 12L15.5 18.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "refresh") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <path d="M19 9.5A7.2 7.2 0 1 0 20 13.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M19.8 5.5V10H15.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
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
      </svg>
    );
  }
  if (kind === "tokens") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <ellipse cx="12" cy="13.6" rx="7" ry="5.8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8.2 11.7C9.1 10.7 10.5 10 12 10C13.5 10 14.9 10.7 15.8 11.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "vault") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <rect x="4" y="6" width="16" height="12" rx="2.6" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="10" cy="12" r="1.6" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (kind === "claim") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <path d="M7 12.2L10.3 15.5L17.2 8.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (kind === "nft") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="2.4" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 15L11 12L13 14L16 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "cosmetic") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <path d="M12 3.5L13.8 8.2L18.5 10L13.8 11.8L12 16.5L10.2 11.8L5.5 10L10.2 8.2L12 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "twitter") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
        <path d="M5 5L19 19M14.5 5H19L5 19H9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" className={mergedClassName} aria-hidden="true">
      <path d="M4 12H8L10.5 8L13.5 16L16 12H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
