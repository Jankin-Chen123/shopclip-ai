import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const evidenceDir = resolve(currentDir, "../../../projects/shopclip-ai/evidence");

const evidencePath = (filename: string) => resolve(evidenceDir, filename);

test.describe("External stock asset flow", () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
  });

  test("configures a stock provider, searches in the modal, and imports a result", async ({
    page,
  }) => {
    await page.goto("/#settings");
    await expect(
      page.getByRole("heading", { name: "Third-party stock libraries" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add third-party library" }).click();
    await expect(page.locator(".stock-provider-card").filter({ hasText: "Demo Stock" })).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-13-external-provider-settings.png"),
    });

    await page.goto("/#assets");
    await expect(page.getByRole("heading", { name: "Search external stock assets" })).toBeVisible();
    await page.getByLabel("Search image library").fill("desk product");
    await page.getByRole("button", { name: "Search stock" }).click();

    await expect(page.getByRole("dialog", { name: "Search third-party assets" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Demo stock desk product packshot" }),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-13-external-search-modal.png"),
    });

    await page.getByRole("button", { name: "Import to project" }).first().click();

    await expect(page.locator(".asset-grid")).toContainText("Demo stock desk product packshot");
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-13-external-asset-import.png"),
    });
  });

  test("shows Chinese stock settings and search modal without mojibake", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("shopclip-language", "zh");
    });

    await page.goto("/#settings");
    await expect(page.getByRole("heading", { name: "第三方素材库" })).toBeVisible();
    await expect(page.getByRole("button", { name: "添加第三方素材库" })).toBeVisible();

    await page.goto("/#assets");
    await expect(page.getByRole("heading", { name: "搜索可直接导入的外部素材" })).toBeVisible();
    await page.getByLabel("搜索图片素材库").fill("desk product");
    await page.getByRole("button", { name: "搜索第三方素材" }).click();

    await expect(page.getByRole("dialog", { name: "搜索第三方素材" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Demo stock desk product packshot" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "导入项目" }).first()).toBeVisible();

    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-13-external-search-modal-zh.png"),
    });
  });
});
