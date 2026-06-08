import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import { createDefaultProject, generateStoryboardFromPreparedAssets, importLocalAssets } from "./helpers";

const evidenceDir = resolve(process.cwd(), "../../projects/shopclip-ai/evidence");

const evidencePath = (filename: string) => resolve(evidenceDir, filename);

test.describe("P1 media and retry flow", () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
  });

  test("renders selected media settings, exposes failure, and retries successfully", async ({
    page,
  }) => {
    await createDefaultProject(page);
    await importLocalAssets(page, {
      name: "GlowGrip packshot.png",
      mimeType: "image/png",
      buffer: Buffer.from("demo-image"),
    });
    await generateStoryboardFromPreparedAssets(page);
    await page.getByLabel("Duration").fill("4");
    await page.getByRole("button", { name: "Save local edit" }).click();
    await expect(page.getByText("Stable")).toBeVisible();

    await page.getByRole("button", { name: "Delivery", exact: true }).click();
    await page.getByText("Advanced settings").click();
    await page.getByLabel("TTS voice").selectOption("energetic-seller");
    await page.getByLabel("Subtitle style").selectOption("high-contrast");
    await page.getByLabel("BGM track").selectOption("creator-pop");
    await page.getByLabel("Simulate failed render").check();
    await page.getByRole("button", { name: "Start render" }).click();

    await expect(page.getByText("Needs retry").first()).toBeVisible();
    await expect(page.getByText("Preview unavailable")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry failed render" })).toBeEnabled();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-08-failed-render-retry-state.png"),
    });

    await page.getByRole("button", { name: "Retry failed render" }).click();
    await expect(page.getByText("Ready to download").first()).toBeVisible();
    await expect(page.getByText(/Voice energetic-seller/)).toBeVisible();
    await expect(page.getByText(/BGM creator-pop/)).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-08-media-render-success.png"),
    });
  });
});
