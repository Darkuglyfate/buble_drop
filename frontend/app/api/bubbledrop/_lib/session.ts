import "server-only";
import { NextRequest, NextResponse } from "next/server";

export const AUTH_SESSION_COOKIE_NAME = "bubbledrop-auth-session";
export const AUTH_SESSION_HEADER = "x-bubbledrop-auth-session";

export type BrowserAuthSession = {
  authenticated: true;
  walletAddress: string;
  chainId: number;
  issuedAt: string;
  expiresAt: string;
};

const authCookieAttributes = {
  httpOnly: true,
  path: "/api/bubbledrop",
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
};

export function getAuthSessionToken(request: NextRequest): string | null {
  return request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value?.trim() || null;
}

export function setAuthSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: string,
): void {
  response.cookies.set(AUTH_SESSION_COOKIE_NAME, token, {
    ...authCookieAttributes,
    expires: new Date(expiresAt),
  });
}

export function clearAuthSessionCookie(response: NextResponse): void {
  response.cookies.set(AUTH_SESSION_COOKIE_NAME, "", {
    ...authCookieAttributes,
    expires: new Date(0),
    maxAge: 0,
  });
}

export function parseBrowserAuthSession(value: unknown): BrowserAuthSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<BrowserAuthSession>;
  const issuedAtMs =
    typeof candidate.issuedAt === "string" ? Date.parse(candidate.issuedAt) : Number.NaN;
  const expiresAtMs =
    typeof candidate.expiresAt === "string" ? Date.parse(candidate.expiresAt) : Number.NaN;
  if (
    candidate.authenticated !== true ||
    typeof candidate.walletAddress !== "string" ||
    typeof candidate.chainId !== "number" ||
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= Date.now()
  ) {
    return null;
  }

  return {
    authenticated: true,
    walletAddress: candidate.walletAddress,
    chainId: candidate.chainId,
    issuedAt: candidate.issuedAt as string,
    expiresAt: candidate.expiresAt as string,
  };
}
