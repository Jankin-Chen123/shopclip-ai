import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const evidenceDir = resolve(process.cwd(), "../../projects/shopclip-ai/evidence");

const evidencePath = (filename: string) => resolve(evidenceDir, filename);

test.describe("P1 dashboard flow", () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
  });

  test("loads mock performance metrics, funnel stages, and factor analysis", async ({ page }) => {
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

    await page.getByRole("button", { name: "Dashboard" }).click();
    await page.getByRole("button", { name: "Load dashboard" }).click();

    await expect(page.getByRole("heading", { name: "Mock analytics" })).toBeVisible();
    await expect(page.getByText("Watch-through")).toBeVisible();
    await expect(page.getByText("Watch 3s")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Creative factor analysis" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Hook clarity" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Subtitle readability" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Product focus" })).toBeVisible();

    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-09-dashboard.png"),
    });
  });
});
