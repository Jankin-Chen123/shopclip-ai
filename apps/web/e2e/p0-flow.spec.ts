import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import { generateStoryboardFromPreparedAssets, importLocalAssets } from "./helpers";

const evidenceDir = resolve(process.cwd(), "../../projects/shopclip-ai/evidence");

const evidencePath = (filename: string) => resolve(evidenceDir, filename);

test.describe("P0 browser flow", () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
  });

  test("completes project setup, asset upload, storyboard, render trace, preview, and export", async ({
    page,
  }) => {
    await page.goto("/#project");

    await expect(page.getByRole("heading", { name: "Product setup" })).toBeVisible();

    await page.getByLabel("Existing project ID").fill(`missing-${Date.now()}`);
    await page.getByRole("button", { name: "Load" }).click();
    await expect(page.getByRole("alert")).toContainText("Project was not found.");
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p0-00-recoverable-error-state.png"),
    });

    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByLabel("Product name")).toHaveValue("GlowGrip Phone Stand");
    await expect(page.getByText("Project loaded")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p0-01-project-created.png"),
    });

    await importLocalAssets(page, {
      name: "GlowGrip packshot.png",
      mimeType: "image/png",
      buffer: Buffer.from("demo-image"),
    });
    await expect(page.getByRole("heading", { name: "GlowGrip packshot.png" }).first()).toBeVisible();

    await generateStoryboardFromPreparedAssets(page);
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p0-02-assets-and-storyboard.png"),
    });

    await expect(page.getByRole("heading", { name: "Storyboard re-edit" })).toBeVisible();
    await expect(page.getByLabel("9 by 16 preview")).toBeVisible();
    await page.getByLabel("Subtitle").fill("Fold it flat, then lock in a clean desk shot.");
    await expect(page.getByText("1 unsaved")).toBeVisible();
    await page.getByRole("button", { name: "Save local edit" }).click();
    await expect(page.getByText("Stable")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p0-03-studio-edit.png"),
    });

    await page.getByRole("button", { name: "Delivery", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Video preview and download" })).toBeVisible();
    await page.getByRole("button", { name: "Start render" }).click();
    await expect(page.getByText("completed").first()).toBeVisible();
    await expect(page.getByText("preview-created")).toBeVisible();
    await expect(page.getByText(/\/demo-exports\//)).toBeVisible();

    await page.getByRole("button", { name: "Export demo video" }).click();
    await expect(page.getByText(/Export ready:/)).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p0-04-delivery-export.png"),
    });
  });
});
