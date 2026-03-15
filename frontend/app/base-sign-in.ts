"use client";

export const AUTH_SESSION_HEADER = "x-bubbledrop-auth-session";

export type BubbleDropFrontendSignInSession = {
  address: string;
  chainId: number;
  issuedAt: string;
  expiresAt: string | null;
  statement: string;
  message: string;
  signature: string | null;
  authSessionToken: string | null;
  mode: "siwe" | "smoke";
};

const SIGN_IN_STORAGE_KEY = "bubbledrop.frontend.base-sign-in";
const MAX_SESSION_AGE_MS = 12 * 60 * 60 * 1000;

export function createSmokeSignInSession(
  address: string,
  chainId: number,
): BubbleDropFrontendSignInSession {
  return {
    address,
    chainId,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + MAX_SESSION_AGE_MS).toISOString(),
    statement: "Smoke sign-in override active for BubbleDrop.",
    message: "Smoke sign-in override active for BubbleDrop.",
    signature: null,
    authSessionToken: `smoke-session:${address}:${chainId}`,
    mode: "smoke",
  };
}

export function getSmokeSignInSessionFromCurrentUrl():
  | BubbleDropFrontendSignInSession
  | null {
  if (
    process.env.NEXT_PUBLIC_SMOKE_TEST_MODE !== "1" ||
    typeof window === "undefined"
  ) {
    return null;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const address =
    searchParams.get("smokeWalletAddress")?.trim().toLowerCase() ??
    searchParams.get("walletAddress")?.trim().toLowerCase() ??
    "";
  if (!address) {
    return null;
  }

  const chainIdValue = Number(searchParams.get("smokeChainId") ?? "8453");
  if (!Number.isInteger(chainIdValue)) {
    return null;
  }

  return createSmokeSignInSession(address, chainIdValue);
}

export function loadBubbleDropFrontendSignInSession(): BubbleDropFrontendSignInSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(SIGN_IN_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as BubbleDropFrontendSignInSession;
    if (
      !parsed ||
      typeof parsed.address !== "string" ||
      typeof parsed.chainId !== "number" ||
      typeof parsed.issuedAt !== "string" ||
      (parsed.expiresAt !== null && typeof parsed.expiresAt !== "string") ||
      typeof parsed.message !== "string" ||
      typeof parsed.statement !== "string" ||
      (parsed.signature !== null && typeof parsed.signature !== "string") ||
      (parsed.authSessionToken !== null &&
        typeof parsed.authSessionToken !== "string") ||
      (parsed.mode !== "siwe" && parsed.mode !== "smoke")
    ) {
      window.sessionStorage.removeItem(SIGN_IN_STORAGE_KEY);
      return null;
    }

    const expiresAtMs = parsed.expiresAt ? Date.parse(parsed.expiresAt) : Number.NaN;
    if (
      !Number.isFinite(expiresAtMs) ||
      expiresAtMs <= Date.now() ||
      !parsed.authSessionToken
    ) {
      window.sessionStorage.removeItem(SIGN_IN_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    window.sessionStorage.removeItem(SIGN_IN_STORAGE_KEY);
    return null;
  }
}

export function storeBubbleDropFrontendSignInSession(
  session: BubbleDropFrontendSignInSession,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(SIGN_IN_STORAGE_KEY, JSON.stringify(session));
}

export function clearBubbleDropFrontendSignInSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(SIGN_IN_STORAGE_KEY);
}

export function signInSessionMatchesWallet(
  session: BubbleDropFrontendSignInSession | null,
  walletAddress: string | null,
  chainId: number | undefined,
): boolean {
  if (!session || !walletAddress || !chainId) {
    return false;
  }

  return (
    session.address === walletAddress.trim().toLowerCase() &&
    session.chainId === chainId
  );
}

export function hasVerifiedAuthSession(
  session: BubbleDropFrontendSignInSession | null,
): boolean {
  return !!session?.authSessionToken;
}

export function createAuthenticatedJsonHeaders(
  authSessionToken: string,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    [AUTH_SESSION_HEADER]: authSessionToken,
  };
}

