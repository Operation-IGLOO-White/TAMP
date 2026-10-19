import { defineConfig, devices } from "@playwright/test";

const headed = process.env["PLAYWRIGHT_DEMO"] === "1";

export default defineConfig({
  testDir: "./tests/fullstack",
  timeout: headed ? 180_000 : 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4174",
    headless: !headed,
    launchOptions: headed ? { slowMo: 450 } : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    env: { ...process.env, FRONTEND_PORT: "4174", VITE_API_TARGET: "http://127.0.0.1:5001" },
  },
  projects: [{ name: "fullstack-chromium", use: { browserName: "chromium" } }],
});
