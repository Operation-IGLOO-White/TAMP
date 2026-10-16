import { defineConfig } from "@playwright/test";

const demo = process.env["PLAYWRIGHT_DEMO"] === "1";

export default defineConfig({
  testDir: "./tests",
  timeout: demo ? 120_000 : 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: !demo,
    launchOptions: demo ? { slowMo: 650 } : undefined,
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
