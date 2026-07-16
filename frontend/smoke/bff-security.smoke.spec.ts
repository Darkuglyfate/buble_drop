import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const mockBackendOrigin = "http://127.0.0.1:4010";
const authCookieName = "bubbledrop-auth-session";
const csrfCookieName = "bubbledrop-csrf";
const csrfToken = "test-csrf-token";

function expectSecureCookies() {
  return test.info().config.metadata.bubbleDropSecureCookies === true;
}

function isProductionArtifactMode() {
  return test.info().config.metadata.bubbleDropProductionArtifact === true;
}

function appOrigin() {
  return expectSecureCookies()
    ? "http://localhost:3002"
    : "http://127.0.0.1:3002";
}

function cookieDomain() {
  return expectSecureCookies() ? "localhost" : "127.0.0.1";
}

async function resetMockBackend(request: APIRequestContext) {
  await request.post(`${mockBackendOrigin}/__reset`);
}

async function setCookie(
  context: BrowserContext,
  name: string,
  value: string,
  path: string,
) {
  await context.addCookies([
    {
      name,
      value,
      domain: cookieDomain(),
      path,
      httpOnly: name === authCookieName,
      sameSite: "Strict",
      secure: expectSecureCookies(),
    },
  ]);
}

async function verifySession(context: BrowserContext) {
  await setCookie(context, csrfCookieName, csrfToken, "/");
  return context.request.post("/api/bubbledrop/auth/session/verify", {
    headers: {
      "content-type": "application/json",
      origin: appOrigin(),
      "x-bubbledrop-csrf": csrfToken,
    },
    data: { message: "signed-message", signature: "0xsigned" },
  });
}

async function recordedRequests(request: APIRequestContext) {
  const response = await request.get(`${mockBackendOrigin}/__requests`);
  return response.json() as Promise<
    Array<{
      method: string;
      path: string;
      headers: Record<string, string>;
      body: string;
    }>
  >;
}

async function readWorkspaceFile(relativePath: string): Promise<string> {
  const { readFile } = (
    process as typeof process & {
      getBuiltinModule(name: "fs"): {
        promises: {
          readFile(path: string | URL, encoding: "utf8"): Promise<string>;
        };
      };
    }
  ).getBuiltinModule("fs").promises;

  return readFile(`${process.cwd()}/${relativePath}`, "utf8");
}

async function initializeStableSignedInSmokeState(page: Page) {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await page.addInitScript(
    ({ sessionIssuedAt, sessionExpiresAt }) => {
      window.localStorage.setItem("bubbledrop:intro-seen:v2", "1");
      window.sessionStorage.setItem(
        "bubbledrop.frontend.base-sign-in",
        JSON.stringify({
          authenticated: true,
          address: "0x1000000000000000000000000000000000000001",
          chainId: 8453,
          issuedAt: sessionIssuedAt,
          expiresAt: sessionExpiresAt,
          mode: "siwe",
        }),
      );
    },
    { sessionIssuedAt: issuedAt, sessionExpiresAt: expiresAt },
  );
}

test.describe("@security BubbleDrop BFF", () => {
  test.beforeEach(async ({ request }) => {
    await resetMockBackend(request);
  });

  test("routes protected shell mutations through the central CSRF helper", async () => {
    const shellSource = await readWorkspaceFile("app/ui/bubbledrop-shell.tsx");

    expect(shellSource).not.toContain("createAuthenticatedJsonHeaders");
    expect(shellSource.match(/fetchBubbleDropMutation/g)).toHaveLength(3);
  });

  test("clears frontend session state only after logout succeeds", async () => {
    const sessionSource = await readWorkspaceFile("app/base-sign-in.ts");
    const walletFlowSource = await readWorkspaceFile(
      "app/hooks/shell/useWalletFlow.ts",
    );
    const logoutStart = sessionSource.indexOf(
      "export async function logoutBubbleDropSession",
    );
    const logoutEnd = sessionSource.indexOf("\n}", logoutStart);
    const logoutSource = sessionSource.slice(logoutStart, logoutEnd);

    expect(logoutSource).toContain("if (!response.ok)");
    expect(logoutSource.indexOf("clearBubbleDropFrontendSignInSession()"))
      .toBeGreaterThan(logoutSource.indexOf("if (!response.ok)"));
    expect(walletFlowSource).not.toContain("logoutBubbleDropSession().finally");
    expect(walletFlowSource).toContain("await logoutBubbleDropSession()");
  });

  test("bootstraps a readable host-only strict CSRF cookie", async ({ context }) => {
    const response = await context.request.get("/api/bubbledrop/auth/session/csrf");

    expect(response.status()).toBe(200);
    const cookie = (await context.cookies()).find(
      (candidate) => candidate.name === csrfCookieName,
    );
    expect(cookie).toMatchObject({
      httpOnly: false,
      sameSite: "Strict",
      path: "/",
      secure: expectSecureCookies(),
    });
    expect(cookie?.domain).toBe(cookieDomain());
  });

  test("filters the backend token and stores it only in the auth cookie", async ({
    context,
  }) => {
    const response = await verifySession(context);

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      authenticated: true,
      walletAddress: "0x1000000000000000000000000000000000000001",
      chainId: 8453,
      issuedAt: expect.any(String),
      expiresAt: expect.any(String),
    });
    const cookie = (await context.cookies()).find(
      (candidate) => candidate.name === authCookieName,
    );
    expect(cookie).toMatchObject({
      value: "backend-secret-token",
      httpOnly: true,
      sameSite: "Strict",
      path: "/api/bubbledrop",
      secure: expectSecureCookies(),
    });
    expect(cookie?.domain).toBe(cookieDomain());
  });

  test("ignores forged browser auth and injects only the cookie token", async ({
    context,
    request,
  }) => {
    await setCookie(context, authCookieName, "backend-secret-token", "/api/bubbledrop");
    await setCookie(context, csrfCookieName, csrfToken, "/");

    const response = await context.request.post("/api/bubbledrop/profile/connect-wallet", {
      headers: {
        "content-type": "application/json",
        origin: appOrigin(),
        "x-bubbledrop-auth-session": "forged-browser-token",
        "x-bubbledrop-csrf": csrfToken,
      },
      data: { walletAddress: "0x1000000000000000000000000000000000000001" },
    });

    expect(response.status()).toBe(200);
    const forwarded = (await recordedRequests(request)).at(-1);
    expect(forwarded?.headers["x-bubbledrop-auth-session"]).toBe(
      "backend-secret-token",
    );
    expect(forwarded?.headers.cookie).toBeUndefined();
  });

  test("rejects absent or wrong Origin before auth and proxied mutations", async ({
    context,
    request,
  }) => {
    await setCookie(context, csrfCookieName, csrfToken, "/");
    const calls = [
      context.request.post("/api/bubbledrop/auth/session/nonce", {
        headers: { "content-type": "application/json", "x-bubbledrop-csrf": csrfToken },
        data: { walletAddress: "0x1000000000000000000000000000000000000001", chainId: 8453 },
      }),
      context.request.post("/api/bubbledrop/auth/session/verify", {
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
          "x-bubbledrop-csrf": csrfToken,
        },
        data: { message: "signed-message", signature: "0xsigned" },
      }),
      context.request.patch("/api/bubbledrop/profile/avatar/select", {
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
          "x-bubbledrop-csrf": csrfToken,
        },
        data: { avatarId: "avatar-starter-blue" },
      }),
    ];

    for (const call of calls) {
      expect((await call).status()).toBe(403);
    }
    expect(await recordedRequests(request)).toEqual([]);
  });

  test("rejects absent or mismatched CSRF before state changes", async ({
    context,
    request,
  }) => {
    await setCookie(context, csrfCookieName, csrfToken, "/");
    const missing = await context.request.post("/api/bubbledrop/check-in/daily", {
      headers: { "content-type": "application/json", origin: appOrigin() },
      data: {},
    });
    const mismatched = await context.request.delete("/api/bubbledrop/profile/avatar", {
      headers: {
        "content-type": "application/json",
        origin: appOrigin(),
        "x-bubbledrop-csrf": "wrong-token",
      },
    });

    expect(missing.status()).toBe(403);
    expect(mismatched.status()).toBe(403);
    expect(await recordedRequests(request)).toEqual([]);
  });

  test("validates status with the backend and clears forged or expired cookies", async ({
    context,
    request,
  }) => {
    await setCookie(context, authCookieName, "backend-secret-token", "/api/bubbledrop");
    const valid = await context.request.get("/api/bubbledrop/auth/session/status");
    expect(valid.status()).toBe(200);
    expect(await valid.json()).toMatchObject({ authenticated: true });

    await request.post(`${mockBackendOrigin}/__expire`);
    const expired = await context.request.get("/api/bubbledrop/auth/session/status");
    expect(expired.status()).toBe(401);
    expect(
      (await context.cookies()).find((cookie) => cookie.name === authCookieName),
    ).toBeUndefined();

    await setCookie(context, authCookieName, "forged-cookie-token", "/api/bubbledrop");
    const forged = await context.request.get("/api/bubbledrop/auth/session/status");
    expect(forged.status()).toBe(401);
  });

  test("preserves a valid auth cookie when backend status is unavailable", async ({
    context,
    request,
  }) => {
    await setCookie(context, authCookieName, "backend-secret-token", "/api/bubbledrop");
    await request.post(`${mockBackendOrigin}/__fail-status`);

    const response = await context.request.get("/api/bubbledrop/auth/session/status");

    expect(response.status()).toBe(503);
    expect(
      (await context.cookies()).find((cookie) => cookie.name === authCookieName)?.value,
    ).toBe("backend-secret-token");
  });

  test("logout deletes the auth cookie with matching security attributes", async ({
    context,
  }) => {
    await setCookie(context, authCookieName, "backend-secret-token", "/api/bubbledrop");
    await setCookie(context, csrfCookieName, csrfToken, "/");
    const response = await context.request.post("/api/bubbledrop/auth/session/logout", {
      headers: { origin: appOrigin(), "x-bubbledrop-csrf": csrfToken },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ authenticated: false });
    const setCookieHeader = response
      .headersArray()
      .find((header) => header.name.toLowerCase() === "set-cookie")?.value;
    expect(setCookieHeader).toContain(`${authCookieName}=`);
    expect(setCookieHeader).toContain("Path=/api/bubbledrop");
    expect(setCookieHeader).toContain("HttpOnly");
    expect(setCookieHeader).toContain("SameSite=strict");
    expect(setCookieHeader).toMatch(/(?:Max-Age=0|Expires=Thu, 01 Jan 1970)/);
  });

  test("removes legacy token, message, and signature browser storage", async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        "bubbledrop.frontend.base-sign-in",
        JSON.stringify({
          address: "0x1000000000000000000000000000000000000001",
          chainId: 8453,
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          statement: "legacy",
          message: "secret signed message",
          signature: "0xsecret-signature",
          authSessionToken: "secret-backend-token",
          mode: "siwe",
        }),
      );
    });

    await page.goto("/");

    await expect
      .poll(() =>
        page.evaluate(() =>
          window.sessionStorage.getItem("bubbledrop.frontend.base-sign-in"),
        ),
      )
      .toBeNull();
  });

  test("hydrates the production-safe guest shell without React mismatches", async ({
    page,
  }) => {
    const hydrationErrors: string[] = [];
    await page.addInitScript(() => {
      window.localStorage.setItem("bubbledrop:intro-seen:v2", "1");
    });
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /hydration failed|hydrated but some attributes/i.test(message.text())
      ) {
        hydrationErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      if (/hydration failed|hydrated but some attributes/i.test(error.message)) {
        hydrationErrors.push(error.message);
      }
    });

    await page.goto("/?skipIntro=1");
    await expect(page.getByRole("heading", { name: "Guest bubble" })).toBeVisible();

    expect(hydrationErrors).toEqual([]);
  });

  test("completes CSRF bootstrap before status validation and profile auto-sync", async ({
    context,
    page,
  }) => {
    await setCookie(context, authCookieName, "backend-secret-token", "/api/bubbledrop");
    await initializeStableSignedInSmokeState(page);

    let markCsrfStarted: () => void = () => undefined;
    const csrfStarted = new Promise<void>((resolve) => {
      markCsrfStarted = resolve;
    });
    let releaseCsrf: () => void = () => undefined;
    const csrfReleased = new Promise<void>((resolve) => {
      releaseCsrf = resolve;
    });
    let markStatusStarted: () => void = () => undefined;
    const statusStarted = new Promise<void>((resolve) => {
      markStatusStarted = resolve;
    });
    let releaseStatus: () => void = () => undefined;
    const statusReleased = new Promise<void>((resolve) => {
      releaseStatus = resolve;
    });
    const statusRequests: string[] = [];
    const statusCodes: number[] = [];
    const profileSyncRequests: string[] = [];

    await page.route("**/api/bubbledrop/auth/session/csrf", async (route) => {
      markCsrfStarted();
      await csrfReleased;
      await route.continue();
    });
    await page.route("**/api/bubbledrop/auth/session/status", async (route) => {
      markStatusStarted();
      await statusReleased;
      await route.continue();
    });
    page.on("request", (browserRequest) => {
      const pathname = new URL(browserRequest.url()).pathname;
      if (pathname === "/api/bubbledrop/auth/session/status") {
        statusRequests.push(pathname);
      }
      if (pathname === "/api/bubbledrop/profile/connect-wallet") {
        profileSyncRequests.push(pathname);
      }
    });
    page.on("response", (browserResponse) => {
      if (
        new URL(browserResponse.url()).pathname ===
        "/api/bubbledrop/auth/session/status"
      ) {
        statusCodes.push(browserResponse.status());
      }
    });

    await page.goto(
      "/?smokeWalletAddress=0x1000000000000000000000000000000000000001&smokeChainId=8453&skipIntro=1",
    );
    await csrfStarted;

    try {
      await page.waitForTimeout(300);
      expect(statusRequests).toHaveLength(0);
      expect(profileSyncRequests).toHaveLength(0);
    } finally {
      releaseCsrf();
    }

    await statusStarted;
    try {
      await page.waitForTimeout(300);
      expect(profileSyncRequests).toHaveLength(0);
    } finally {
      releaseStatus();
    }

    await expect.poll(() => statusRequests.length).toBe(1);
    await expect.poll(() => statusCodes).toContain(200);
    if (isProductionArtifactMode()) {
      await expect(
        page.getByRole("heading", { name: "Guest bubble" }),
      ).toBeVisible();
      expect(profileSyncRequests).toHaveLength(0);
    } else {
      await expect.poll(() => profileSyncRequests.length).toBe(1);
      await expect(
        page.getByRole("button", { name: "Daily check-in (+20 XP)" }),
      ).toBeVisible();
    }
  });

  test("refreshes backend status and expires signed-in UI state", async ({
    context,
    page,
    request,
  }) => {
    await setCookie(context, authCookieName, "backend-secret-token", "/api/bubbledrop");
    await initializeStableSignedInSmokeState(page);
    const statusCodes: number[] = [];
    page.on("response", (browserResponse) => {
      if (
        new URL(browserResponse.url()).pathname ===
        "/api/bubbledrop/auth/session/status"
      ) {
        statusCodes.push(browserResponse.status());
      }
    });

    await page.goto(
      "/?smokeWalletAddress=0x1000000000000000000000000000000000000001&smokeChainId=8453&skipIntro=1",
    );
    await expect.poll(() => statusCodes.at(0)).toBe(200);
    const signedInAction = page.getByRole("button", {
      name: "Daily check-in (+20 XP)",
    });
    if (!isProductionArtifactMode()) {
      await expect(signedInAction).toBeVisible();
    }

    await request.post(`${mockBackendOrigin}/__expire`);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    await expect.poll(() => statusCodes).toContain(401);
    expect(statusCodes.indexOf(401)).toBeGreaterThan(statusCodes.indexOf(200));
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.sessionStorage.getItem("bubbledrop.frontend.base-sign-in"),
        ),
      )
      .toBeNull();
    await expect
      .poll(async () =>
        (await context.cookies()).find(
          (cookie) => cookie.name === authCookieName,
        ),
      )
      .toBeUndefined();
    if (!isProductionArtifactMode()) {
      await expect(
        page.getByRole("button", { name: "Sign in with Base" }),
      ).toBeVisible();
      await expect(signedInAction).toBeHidden();
    }
  });
});
