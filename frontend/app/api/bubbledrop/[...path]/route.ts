import { NextRequest, NextResponse } from "next/server";

function getBackendOrigin(): string | null {
  const serverConfiguredOrigin = process.env.BACKEND_URL?.trim() || "";
  const publicConfiguredOrigin =
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "";

  if (serverConfiguredOrigin) {
    return serverConfiguredOrigin;
  }

  if (publicConfiguredOrigin) {
    return publicConfiguredOrigin;
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  return null;
}

async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
): Promise<NextResponse> {
  const backendOrigin = getBackendOrigin();
  if (!backendOrigin) {
    return NextResponse.json(
      { message: "BubbleDrop live data is unavailable right now." },
      { status: 503 },
    );
  }

  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(
    `${backendOrigin.replace(/\/$/, "")}/${pathSegments.join("/")}`,
  );
  sourceUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.append(key, value);
  });

  const forwardedHeaders = new Headers();
  const contentType = request.headers.get("content-type");
  const authSessionHeader = request.headers.get("x-bubbledrop-auth-session");

  if (contentType) {
    forwardedHeaders.set("content-type", contentType);
  }
  if (authSessionHeader) {
    forwardedHeaders.set("x-bubbledrop-auth-session", authSessionHeader);
  }

  const method = request.method.toUpperCase();
  const response = await fetch(targetUrl, {
    method,
    headers: forwardedHeaders,
    body:
      method === "GET" || method === "HEAD"
        ? undefined
        : await request.text(),
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  const responseContentType = response.headers.get("content-type");
  if (responseContentType) {
    responseHeaders.set("content-type", responseContentType);
  }

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: responseHeaders,
  });
}

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

