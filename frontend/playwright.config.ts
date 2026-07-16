import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./smoke",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3002",
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
      command: "npx next dev --hostname 127.0.0.1 --port 3002",
      url: "http://127.0.0.1:3002",
      reuseExistingServer: false,
      env: {
        BACKEND_URL: "http://127.0.0.1:4010",
        FRONTEND_ORIGIN: "http://127.0.0.1:3002",
        NEXT_PUBLIC_SMOKE_TEST_MODE: "1",
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
      grepInvert: /@security/,
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
});
