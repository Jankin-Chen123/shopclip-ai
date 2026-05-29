import { defineConfig } from "@playwright/test";

const channel = process.env.PLAYWRIGHT_CHANNEL ?? "msedge";
const apiPort = process.env.PLAYWRIGHT_API_PORT ?? "4100";
const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "5173";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${webPort}`;

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"]],
  webServer: process.env.SHOPCLIP_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: `node dev-server.cjs api ${apiPort}`,
          reuseExistingServer: true,
          timeout: 30_000,
          url: `http://localhost:${apiPort}/health`,
        },
        {
          command: `node dev-server.cjs web ${webPort} ${apiPort}`,
          reuseExistingServer: true,
          timeout: 30_000,
          url: baseURL,
        },
      ],
  use: {
    baseURL,
    channel,
    headless: true,
    trace: "retain-on-failure",
    viewport: {
      height: 900,
      width: 1440,
    },
  },
});
