import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import { createDefaultProject, importLocalAssets } from "./helpers";

const require = createRequire(new URL("../../api/package.json", import.meta.url));
const ffmpegPath = (require("@ffmpeg-installer/ffmpeg") as { path: string }).path;
const evidenceDir = resolve(process.cwd(), "../../projects/shopclip-ai/evidence");
const evidencePath = (filename: string) => resolve(evidenceDir, filename);

const runFfmpeg = (args: string[]) =>
  new Promise<void>((resolveRun, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(new Error(`ffmpeg fixture generation failed with ${code}: ${stderr.slice(0, 800)}`));
    });
  });

const createReferenceVideoPayload = async () => {
  const workdir = await mkdtemp(resolve(tmpdir(), "shopclip-e2e-reference-"));
  const videoPath = resolve(workdir, "self-shot-reference-demo.mp4");
  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x180:rate=10",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:duration=9",
    "-t",
    "9",
    "-c:v",
    "mpeg4",
    "-q:v",
    "5",
    "-c:a",
    "aac",
    videoPath,
  ]);
  return {
    buffer: await readFile(videoPath),
    cleanup: () => rm(workdir, { force: true, recursive: true }),
  };
};

test.describe("Part 015 structured references", () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
  });

  test("analyzes a public reference URL without creating a project first", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/#inspiration");
    await expect(page.getByRole("heading", { name: "Viral video breakdown" })).toBeVisible();

    await page.getByLabel("Source URL").fill("https://example.test/video/global-viral-cup");
    await page.getByLabel("Reference title").fill("Global viral cup proof");
    const analyzeButton = page.getByRole("button", { name: "Analyze reference" });
    await expect(analyzeButton).toBeEnabled();
    await analyzeButton.click();

    await expect(page.getByRole("heading", { name: "Global viral cup proof" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText("ready").first()).toBeVisible({ timeout: 45_000 });
    await page.getByRole("button", { name: /script library/ }).click();

    await expect(page).toHaveURL(/#assets$/);
    await page.goto("/#create");
    const scriptGeneration = page.getByRole("region", { name: "Script generation" });
    await expect(scriptGeneration.getByLabel("Reference video")).toContainText(
      "Global viral cup proof",
    );
    await page.screenshot({
      fullPage: true,
      path: evidencePath("part-015-global-reference-no-project.png"),
    });
  });

  test("analyzes an uploaded self-owned reference video and exposes it as a script reference", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await createDefaultProject(page);

    const referenceVideo = await createReferenceVideoPayload();
    try {
      await importLocalAssets(page, {
        name: "Self shot reference demo.mp4",
        mimeType: "video/mp4",
        buffer: referenceVideo.buffer,
      });
      await page.getByRole("button", { name: "Video" }).click();
      await expect(page.getByRole("heading", { name: "Self shot reference demo.mp4" })).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByText("usage_demo")).toBeVisible({ timeout: 60_000 });
    } finally {
      await referenceVideo.cleanup();
    }

    await page.goto("/#inspiration");
    await expect(page.getByRole("heading", { name: "Viral video breakdown" })).toBeVisible();
    await page.getByLabel("Uploaded reference video").selectOption({
      label: "Self shot reference demo.mp4",
    });
    await page.getByLabel("Reference title").fill("Self-shot proof demo");
    await page.getByLabel("Platform").fill("merchant_upload");
    await page.getByRole("button", { name: "Analyze reference" }).click();

    const selfShotReference = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Self-shot proof demo" }) });
    await expect(selfShotReference).toBeVisible();
    await expect(selfShotReference.getByText("Usable")).toBeVisible({ timeout: 60_000 });
    await selfShotReference.getByRole("button", { name: "Add to script library" }).click();

    await page.goto("/#create");
    const scriptGeneration = page.getByRole("region", { name: "Script generation" });
    await expect(scriptGeneration.getByLabel("Reference video")).toContainText(
      "Self-shot proof demo",
    );
    await page.screenshot({
      fullPage: true,
      path: evidencePath("part-015-uploaded-reference-video.png"),
    });
  });
});
