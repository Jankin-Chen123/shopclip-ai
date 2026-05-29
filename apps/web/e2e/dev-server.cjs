const { spawn } = require("node:child_process");
const { resolve } = require("node:path");

const repoRoot = resolve(__dirname, "../../..");
const mode = process.argv[2];
const port = process.argv[3];
const apiPort = process.argv[4] ?? process.env.PLAYWRIGHT_API_PORT ?? "4100";

if (!mode || !port) {
  console.error("Usage: node e2e/dev-server.cjs <api|web> <port>");
  process.exit(1);
}

const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";
const isApi = mode === "api";
const args = isApi
  ? ["pnpm", "--filter", "@shopclip/api", "dev"]
  : ["pnpm", "--filter", "@shopclip/web", "dev", "--", "--port", port];

const child = spawn(corepack, args, {
  cwd: repoRoot,
  env: {
    ...process.env,
    ...(isApi
      ? {
          PORT: port,
          PROJECT_STORE_MODE: "memory",
        }
      : {
          VITE_API_URL: `http://localhost:${apiPort}/api`,
        }),
  },
  shell: process.platform === "win32",
  stdio: "inherit",
  windowsHide: true,
});

const stopChild = () => {
  if (!child.pid || child.killed) {
    process.exit(0);
  }

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    }).on("exit", () => process.exit(0));
    return;
  }

  child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 500).unref();
};

process.on("SIGINT", stopChild);
process.on("SIGTERM", stopChild);
process.on("SIGHUP", stopChild);

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(0);
  }
  process.exit(code ?? 0);
});
