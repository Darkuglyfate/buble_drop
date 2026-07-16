import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const CSRF_COOKIE_NAME = "bubbledrop-csrf";
export const CSRF_HEADER_NAME = "x-bubbledrop-csrf";

const csrfCookieAttributes = {
  httpOnly: false,
  path: "/",
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
};

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function setCsrfCookie(response: NextResponse, token: string): void {
  response.cookies.set(CSRF_COOKIE_NAME, token, csrfCookieAttributes);
}

export function clearCsrfCookie(response: NextResponse): void {
  response.cookies.set(CSRF_COOKIE_NAME, "", {
    ...csrfCookieAttributes,
    expires: new Date(0),
    maxAge: 0,
  });
}

export function rejectInvalidCsrf(request: NextRequest): NextResponse | null {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value ?? "";
  const headerToken = request.headers.get(CSRF_HEADER_NAME)?.trim() ?? "";
  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);

  if (
    !cookieToken ||
    !headerToken ||
    cookieBuffer.length !== headerBuffer.length ||
    !timingSafeEqual(cookieBuffer, headerBuffer)
  ) {
    return NextResponse.json({ message: "Invalid CSRF token." }, { status: 403 });
  }

  return null;
}
