"use client";

export const AUTHENTICATED_SESSION_MARKER = "bff-cookie-session";

export type BubbleDropFrontendSignInSession = {
  authenticated: true;
  address: string;
  chainId: number;
  issuedAt: string;
  expiresAt: string;
  mode: "siwe" | "smoke";
};

const SIGN_IN_STORAGE_KEY = "bubbledrop.frontend.base-sign-in";
const CSRF_COOKIE_NAME = "bubbledrop-csrf";
const CSRF_HEADER_NAME = "x-bubbledrop-csrf";
const CSRF_ROUTE = "/api/bubbledrop/auth/session/csrf";
const STATUS_ROUTE = "/api/bubbledrop/auth/session/status";
const LOGOUT_ROUTE = "/api/bubbledrop/auth/session/logout";
const MAX_SESSION_AGE_MS = 12 * 60 * 60 * 1000;
const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
let csrfBootstrapPromise: Promise<string> | null = null;

export function createSmokeSignInSession(
  address: string,
  chainId: number,
): BubbleDropFrontendSignInSession {
  return {
    authenticated: true,
    address: address.trim().toLowerCase(),
    chainId,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + MAX_SESSION_AGE_MS).toISOString(),
    mode: "smoke",
  };
}

export function getSmokeSignInSessionFromCurrentUrl():
  | BubbleDropFrontendSignInSession
  | null {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_SMOKE_TEST_MODE !== "1" ||
    typeof window === "undefined"
  ) {
    return null;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const address =
    searchParams.get("smokeWalletAddress")?.trim().toLowerCase() ?? "";
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
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    if (
      "authSessionToken" in parsed ||
      "message" in parsed ||
      "signature" in parsed ||
      parsed.authenticated !== true ||
      typeof parsed.address !== "string" ||
      typeof parsed.chainId !== "number" ||
      typeof parsed.issuedAt !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      (parsed.mode !== "siwe" && parsed.mode !== "smoke")
    ) {
      window.sessionStorage.removeItem(SIGN_IN_STORAGE_KEY);
      return null;
    }

    const expiresAtMs = Date.parse(parsed.expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      window.sessionStorage.removeItem(SIGN_IN_STORAGE_KEY);
      return null;
    }

    return parsed as BubbleDropFrontendSignInSession;
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
  return (
    session?.authenticated === true &&
    Number.isFinite(Date.parse(session.expiresAt)) &&
    Date.parse(session.expiresAt) > Date.now()
  );
}

export function getAuthenticatedSessionMarker(
  session: BubbleDropFrontendSignInSession | null,
): string | null {
  return hasVerifiedAuthSession(session) ? AUTHENTICATED_SESSION_MARKER : null;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

async function bootstrapBubbleDropCsrfToken(): Promise<string> {
  const response = await fetch(CSRF_ROUTE, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to initialize BubbleDrop request security");
  }

  const payload = (await response.json()) as { csrfToken?: unknown };
  const cookieToken = readCookie(CSRF_COOKIE_NAME);
  if (
    typeof payload.csrfToken !== "string" ||
    !cookieToken ||
    payload.csrfToken !== cookieToken
  ) {
    throw new Error("BubbleDrop request security did not initialize correctly");
  }

  return cookieToken;
}

export async function ensureBubbleDropCsrfToken(): Promise<string> {
  const existingToken = readCookie(CSRF_COOKIE_NAME);
  if (existingToken) {
    return existingToken;
  }

  const activeBootstrap =
    csrfBootstrapPromise ?? (csrfBootstrapPromise = bootstrapBubbleDropCsrfToken());
  try {
    return await activeBootstrap;
  } finally {
    if (csrfBootstrapPromise === activeBootstrap) {
      csrfBootstrapPromise = null;
    }
  }
}

export function createAuthenticatedJsonHeaders(
  _sessionMarker?: string | null,
): Record<string, string> {
  void _sessionMarker;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const csrfToken = readCookie(CSRF_COOKIE_NAME);
  if (csrfToken) {
    headers[CSRF_HEADER_NAME] = csrfToken;
  }
  return headers;
}

export async function fetchBubbleDropMutation(
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  const method = init.method?.toUpperCase() ?? "GET";
  if (!mutationMethods.has(method)) {
    throw new Error("BubbleDrop mutation helper requires a state-changing method");
  }

  const csrfToken = await ensureBubbleDropCsrfToken();
  const headers = new Headers(init.headers);
  headers.set(CSRF_HEADER_NAME, csrfToken);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return fetch(input, { ...init, method, headers });
}

export async function refreshBubbleDropSessionStatus(): Promise<BubbleDropFrontendSignInSession | null> {
  await ensureBubbleDropCsrfToken();
  const response = await fetch(STATUS_ROUTE, { cache: "no-store" });
  if (!response.ok) {
    clearBubbleDropFrontendSignInSession();
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const session: BubbleDropFrontendSignInSession = {
    authenticated: true,
    address: typeof payload.walletAddress === "string" ? payload.walletAddress : "",
    chainId: typeof payload.chainId === "number" ? payload.chainId : Number.NaN,
    issuedAt: typeof payload.issuedAt === "string" ? payload.issuedAt : "",
    expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : "",
    mode: "siwe",
  };
  if (!session.address || !Number.isInteger(session.chainId) || !hasVerifiedAuthSession(session)) {
    clearBubbleDropFrontendSignInSession();
    return null;
  }

  storeBubbleDropFrontendSignInSession(session);
  return session;
}

export async function logoutBubbleDropSession(): Promise<void> {
  const response = await fetchBubbleDropMutation(LOGOUT_ROUTE, { method: "POST" });
  if (!response.ok) {
    throw new Error(`BubbleDrop logout failed with HTTP ${response.status}`);
  }

  clearBubbleDropFrontendSignInSession();
}
