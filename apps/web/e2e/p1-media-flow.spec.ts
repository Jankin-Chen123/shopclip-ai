import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const evidenceDir = resolve(process.cwd(), "../../projects/shopclip-ai/evidence");

const evidencePath = (filename: string) => resolve(evidenceDir, filename);

test.describe("P1 media and retry flow", () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
  });

  test("renders selected media settings, exposes failure, and retries successfully", async ({
    page,
  }) => {
    await page.goto("/#project");

    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByText("Project loaded")).toBeVisible();
    await page.getByRole("link", { name: /Asset library/ }).click();
    await page.locator(".asset-library-toolbar").getByRole("button", { name: "Import images" }).click();
    await page.getByLabel("Local image files").setInputFiles({
      name: "GlowGrip packshot.png",
      mimeType: "image/png",
      buffer: Buffer.from("demo-image"),
    });
    await page.getByRole("button", { name: "Import selected" }).click();
    await page.getByRole("link", { name: /Create/ }).click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByRole("button", { name: "Generate storyboard" }).click();

    await page.getByRole("button", { name: "Delivery" }).click();
    await page.getByLabel("TTS voice").selectOption("energetic-seller");
    await page.getByLabel("Subtitle style").selectOption("high-contrast");
    await page.getByLabel("BGM track").selectOption("creator-pop");
    await page.getByLabel("Simulate failed render").check();
    await page.getByRole("button", { name: "Start render" }).click();

    await expect(page.getByText("failed").first()).toBeVisible();
    await expect(page.getByText("preview-render-failed")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-08-failed-render-retry-state.png"),
    });

    await page.getByRole("button", { name: "Retry failed render" }).click();
    await expect(page.getByText("completed").first()).toBeVisible();
    await expect(page.getByText(/voice=energetic-seller/)).toBeVisible();
    await expect(page.getByText(/BGM creator-pop/)).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-08-media-render-success.png"),
    });
  });
});
