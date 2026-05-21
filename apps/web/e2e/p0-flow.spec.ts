import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

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

    await expect(page.getByRole("heading", { name: "Project command center" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Product setup" })).toBeVisible();

    await page.getByLabel("Existing project ID").fill(`missing-${Date.now()}`);
    await page.getByRole("button", { name: "Load" }).click();
    await expect(page.getByRole("alert")).toContainText("Project was not found.");
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p0-00-recoverable-error-state.png"),
    });

    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByText(/GlowGrip Phone Stand/)).toBeVisible();
    await expect(page.getByText("Project loaded")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p0-01-project-created.png"),
    });

    await page.getByRole("button", { name: /Creative prep/ }).click();
    await expect(page.getByRole("heading", { name: "Asset library" })).toBeVisible();
    await page.getByRole("button", { name: "Upload metadata" }).click();
    await expect(page.getByText("GlowGrip packshot")).toBeVisible();
    await expect(page.getByText("ready", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Generate storyboard" }).click();
    await expect(page.getByText(/Generated with deterministic fallback/)).toBeVisible();
    await expect(page.getByText("4 scenes", { exact: true })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p0-02-assets-and-storyboard.png"),
    });

    await page.getByRole("button", { name: /Generation studio/ }).click();
    await expect(page.getByRole("heading", { name: "Studio editor" })).toBeVisible();
    await expect(page.getByLabel("9 by 16 preview")).toBeVisible();
    await page.getByLabel("Subtitle").fill("Fold it flat, then lock in a clean desk shot.");
    await expect(page.getByText("1 unsaved")).toBeVisible();
    await page.getByRole("button", { name: "Save local edit" }).click();
    await expect(page.getByText("Stable")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p0-03-studio-edit.png"),
    });

    await page.getByRole("button", { name: /Delivery room/ }).click();
    await expect(page.getByRole("heading", { name: "Render trace" })).toBeVisible();
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
