const { spawn } = require("node:child_process");
const { resolve } = require("node:path");

const webRoot = resolve(__dirname, "..");
const repoRoot = resolve(__dirname, "../../..");
const apiPort = process.env.PLAYWRIGHT_API_PORT ?? "4100";
const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "5173";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${webPort}`;
const playwrightCli = require.resolve("@playwright/test/cli");

const passthroughArgs = process.argv.slice(2).filter((arg, index) => index > 0 || arg !== "--");
const children = new Set();
let isStopping = false;

const spawnCommand = (command, env) => {
  const child = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
    },
    stdio: "inherit",
    windowsHide: true,
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
};

const killTree = (child) =>
  new Promise((resolveKill) => {
    if (!child.pid || child.killed) {
      resolveKill();
      return;
    }

    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      }).on("exit", resolveKill);
      return;
    }

    child.kill("SIGTERM");
    setTimeout(resolveKill, 500).unref();
  });

const stopServers = async () => {
  if (isStopping) {
    return;
  }
  isStopping = true;
  await Promise.all([...children].map(killTree));
};

const waitForUrl = async (url, timeoutMs = 30_000) => {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }

  throw lastError ?? new Error(`${url} did not become ready.`);
};

const runPlaywright = () =>
  new Promise((resolveRun) => {
    const child = spawn(
      process.execPath,
      [playwrightCli, "test", "--config", "e2e/playwright.config.ts", ...passthroughArgs],
      {
        cwd: webRoot,
        env: {
          ...process.env,
          PLAYWRIGHT_API_PORT: apiPort,
          PLAYWRIGHT_BASE_URL: baseURL,
          PLAYWRIGHT_WEB_PORT: webPort,
          SHOPCLIP_SKIP_WEBSERVER: "1",
        },
        stdio: "inherit",
        windowsHide: true,
      },
    );

    child.on("exit", (code, signal) => resolveRun(signal ? 1 : (code ?? 0)));
  });

const handleSignal = async () => {
  await stopServers();
  process.exit(130);
};

process.on("SIGINT", handleSignal);
process.on("SIGTERM", handleSignal);

(async () => {
  spawnCommand("corepack pnpm --filter @shopclip/api dev", {
    AI_PROVIDER_MODE: "mock",
    COS_PROVIDER_MODE: "mock",
    PORT: apiPort,
    PROJECT_STORE_MODE: "memory",
    REFERENCE_DOWNLOAD_PROVIDER_MODE: "mock",
    REFERENCE_PROVIDER_MODE: "mock",
    SHOPCLIP_FORCE_MOCK_PROVIDERS: "1",
    VIDEO_RENDER_PROVIDER_MODE: "mock",
    VISION_PROVIDER_MODE: "mock",
  });
  spawnCommand(`corepack pnpm --filter @shopclip/web dev -- --port ${webPort}`, {
    VITE_API_URL: `http://localhost:${apiPort}/api`,
  });

  let exitCode = 1;
  try {
    await waitForUrl(`http://localhost:${apiPort}/health`);
    await waitForUrl(baseURL);
    exitCode = await runPlaywright();
  } finally {
    await stopServers();
  }

  process.exit(exitCode);
})().catch(async (error) => {
  console.error(error);
  await stopServers();
  process.exit(1);
});
