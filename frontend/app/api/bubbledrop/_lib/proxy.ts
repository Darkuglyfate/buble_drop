import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getBackendOrigin } from "./config";
import { rejectInvalidCsrf } from "./csrf";
import { rejectInvalidOrigin } from "./origin";
import {
  AUTH_SESSION_HEADER,
  clearAuthSessionCookie,
  getAuthSessionToken,
  parseBrowserAuthSession,
  setAuthSessionCookie,
} from "./session";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function unavailableResponse(): NextResponse {
  return NextResponse.json(
    { message: "BubbleDrop live data is unavailable right now." },
    { status: 503 },
  );
}

export function validateStateChangingRequest(
  request: NextRequest,
): NextResponse | null {
  if (!stateChangingMethods.has(request.method.toUpperCase())) {
    return null;
  }

  return rejectInvalidOrigin(request) ?? rejectInvalidCsrf(request);
}

function createTargetUrl(
  request: NextRequest,
  backendOrigin: string,
  pathSegments: string[],
): URL {
  const encodedPath = pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
  const targetUrl = new URL(encodedPath, `${backendOrigin}/`);
  const sourceUrl = new URL(request.url);
  sourceUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.append(key, value);
  });
  return targetUrl;
}

export async function fetchBackend(
  request: NextRequest,
  pathSegments: string[],
): Promise<Response | null> {
  const backendOrigin = getBackendOrigin();
  if (!backendOrigin) {
    return null;
  }

  const forwardedHeaders = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    forwardedHeaders.set("content-type", contentType);
  }

  const token = getAuthSessionToken(request);
  if (token && pathSegments.join("/") !== "auth/session/nonce") {
    forwardedHeaders.set(AUTH_SESSION_HEADER, token);
  }

  const method = request.method.toUpperCase();
  try {
    return await fetch(createTargetUrl(request, backendOrigin, pathSegments), {
      method,
      headers: forwardedHeaders,
      body: method === "GET" || method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

function copyBackendResponse(response: Response, body: string): NextResponse {
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  return new NextResponse(body, { status: response.status, headers });
}

async function filterVerifyResponse(response: Response): Promise<NextResponse> {
  const responseText = await response.text();
  if (!response.ok) {
    return copyBackendResponse(response, responseText);
  }

  let backendPayload: Record<string, unknown>;
  try {
    backendPayload = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Invalid backend auth response." }, { status: 502 });
  }

  const token = backendPayload.authSessionToken;
  const session = parseBrowserAuthSession({
    ...backendPayload,
    authenticated: true,
  });
  if (typeof token !== "string" || !token.trim() || !session) {
    return NextResponse.json({ message: "Invalid backend auth response." }, { status: 502 });
  }

  const browserResponse = NextResponse.json(session, { status: response.status });
  setAuthSessionCookie(browserResponse, token, session.expiresAt);
  return browserResponse;
}

export async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
): Promise<NextResponse> {
  const securityRejection = validateStateChangingRequest(request);
  if (securityRejection) {
    return securityRejection;
  }

  const backendResponse = await fetchBackend(request, pathSegments);
  if (!backendResponse) {
    return unavailableResponse();
  }

  if (pathSegments.join("/") === "auth/session/verify") {
    return filterVerifyResponse(backendResponse);
  }

  return copyBackendResponse(backendResponse, await backendResponse.text());
}

export async function getValidatedSessionStatus(
  request: NextRequest,
): Promise<NextResponse> {
  const token = getAuthSessionToken(request);
  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const backendResponse = await fetchBackend(request, ["auth", "session", "status"]);
  if (!backendResponse) {
    return unavailableResponse();
  }

  if (!backendResponse.ok) {
    if (backendResponse.status === 401 || backendResponse.status === 403) {
      const response = NextResponse.json({ authenticated: false }, { status: 401 });
      clearAuthSessionCookie(response);
      return response;
    }

    return copyBackendResponse(backendResponse, await backendResponse.text());
  }

  let payload: unknown;
  try {
    payload = await backendResponse.json();
  } catch {
    payload = null;
  }
  const session = parseBrowserAuthSession(payload);
  if (!session) {
    const response = NextResponse.json({ authenticated: false }, { status: 401 });
    clearAuthSessionCookie(response);
    return response;
  }

  const response = NextResponse.json(session);
  setAuthSessionCookie(response, token, session.expiresAt);
  return response;
}
