import { defineConfig } from "@playwright/test";

const channel = process.env.PLAYWRIGHT_CHANNEL ?? "msedge";

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    channel,
    headless: true,
    trace: "retain-on-failure",
    viewport: {
      height: 900,
      width: 1440,
    },
  },
});
