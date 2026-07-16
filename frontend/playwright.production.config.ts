import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  metadata: {
    bubbleDropProductionArtifact: true,
    bubbleDropSecureCookies: true,
  },
  testDir: "./smoke",
  grep: /@security/,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "node smoke/mock-backend.mjs",
      url: "http://127.0.0.1:4010/__requests",
      reuseExistingServer: false,
    },
    {
      command:
        "npx next build && npx next start --hostname 127.0.0.1 --port 3002",
      url: "http://127.0.0.1:3002",
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        BACKEND_URL: "http://127.0.0.1:4010",
        FRONTEND_ORIGIN: "http://localhost:3002",
        NEXT_SMOKE_TEST_SERVER: "1",
        NEXT_PUBLIC_POSTHOG_KEY: "",
        NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
});
