import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { loadLocalEnvFile } from "./env";

const touchedKeys = ["AI_PROVIDER_MODE", "AI_GENERAL_MODEL_ID", "AI_VIDEO_MODEL_ID", "ARK_API_KEY"];

describe("loadLocalEnvFile", () => {
  afterEach(() => {
    for (const key of touchedKeys) {
      delete process.env[key];
    }
  });

  it("loads server env values from a local .env file without overriding existing process env", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "shopclip-env-"));
    const envPath = join(tempDir, ".env");
    await writeFile(
      envPath,
      [
        "AI_PROVIDER_MODE=ark",
        "AI_GENERAL_MODEL_ID=ep-local-test",
        "ARK_API_KEY=local-secret",
      ].join("\n"),
      "utf8",
    );

    process.env.AI_PROVIDER_MODE = "mock";
    loadLocalEnvFile(envPath);

    expect(process.env.AI_PROVIDER_MODE).toBe("mock");
    expect(process.env.AI_GENERAL_MODEL_ID).toBe("ep-local-test");
    expect(process.env.ARK_API_KEY).toBe("local-secret");

    await rm(tempDir, { force: true, recursive: true });
  });

  it("can prefer local .env values over stale process env values", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "shopclip-env-"));
    const envPath = join(tempDir, ".env");
    await writeFile(envPath, "AI_VIDEO_MODEL_ID=ep-video-from-env-file", "utf8");

    process.env.AI_VIDEO_MODEL_ID = "doubao-seedance-1-5-pro";
    loadLocalEnvFile(envPath, { override: true });

    expect(process.env.AI_VIDEO_MODEL_ID).toBe("ep-video-from-env-file");

    await rm(tempDir, { force: true, recursive: true });
  });
});
