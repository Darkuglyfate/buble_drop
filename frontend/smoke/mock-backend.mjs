import http from "node:http";

const port = Number(process.env.MOCK_BACKEND_PORT || 4010);
const validToken = "backend-secret-token";
let requests = [];
let statusMode = "valid";

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return body;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  const body = await readBody(request);

  if (url.pathname === "/__reset" && request.method === "POST") {
    requests = [];
    statusMode = "valid";
    return sendJson(response, 200, { ok: true });
  }

  if (url.pathname === "/__expire" && request.method === "POST") {
    statusMode = "expired";
    return sendJson(response, 200, { ok: true });
  }

  if (url.pathname === "/__fail-status" && request.method === "POST") {
    statusMode = "unavailable";
    return sendJson(response, 200, { ok: true });
  }

  if (url.pathname === "/__requests" && request.method === "GET") {
    return sendJson(response, 200, requests);
  }

  requests.push({
    method: request.method,
    path: url.pathname,
    headers: request.headers,
    body,
  });

  if (url.pathname === "/auth/session/verify" && request.method === "POST") {
    const now = Date.now();
    return sendJson(response, 200, {
      authenticated: true,
      walletAddress: "0x1000000000000000000000000000000000000001",
      chainId: 8453,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
      authSessionToken: validToken,
    });
  }

  if (url.pathname === "/auth/session/status" && request.method === "GET") {
    if (statusMode === "unavailable") {
      return sendJson(response, 503, { message: "Session service unavailable" });
    }

    if (
      statusMode === "valid" &&
      request.headers["x-bubbledrop-auth-session"] === validToken
    ) {
      const now = Date.now();
      return sendJson(response, 200, {
        authenticated: true,
        walletAddress: "0x1000000000000000000000000000000000000001",
        chainId: 8453,
        issuedAt: new Date(now - 1000).toISOString(),
        expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
      });
    }

    return sendJson(response, 401, { message: "Invalid auth session" });
  }

  if (url.pathname === "/profile/connect-wallet" && request.method === "POST") {
    const payload = JSON.parse(body || "{}");
    return sendJson(response, 200, {
      profileId: "smoke-profile",
      walletAddress: payload.walletAddress,
    });
  }

  return sendJson(response, 200, { ok: true });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`mock-backend listening on ${port}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
