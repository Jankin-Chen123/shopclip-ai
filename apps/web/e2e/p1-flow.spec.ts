import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const evidenceDir = resolve(process.cwd(), "../../projects/shopclip-ai/evidence");

const evidencePath = (filename: string) => resolve(evidenceDir, filename);

test.describe("P1 browser flow", () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
  });

  test("searches assets, recalls one into a scene, applies an agent suggestion, and regenerates one scene", async ({
    page,
  }) => {
    await page.goto("/#project");

    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByText("Project loaded")).toBeVisible();
    await page.getByRole("link", { name: /Asset library/ }).click();
    await page.locator(".asset-library-toolbar").getByRole("button", { name: "Import images" }).click();
    await page.getByLabel("Local image files").setInputFiles([
      {
        name: "GlowGrip packshot.png",
        mimeType: "image/png",
        buffer: Buffer.from("demo-image"),
      },
      {
        name: "Hands free desk lifestyle demo.webp",
        mimeType: "image/webp",
        buffer: Buffer.from("demo-webp"),
      },
    ]);
    await page.getByRole("button", { name: "Import selected" }).click();

    await page.getByRole("link", { name: /Create/ }).click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByRole("button", { name: "Generate storyboard" }).click();
    await expect(page.getByText("4 scenes", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: /Asset library/ }).click();
    await page.getByLabel("Search image library").fill("stable creator table");
    await page.getByRole("button", { name: "Search library" }).click();
    const searchResult = page.getByRole("button", {
      name: /Hands free desk lifestyle demo.*Score/,
    });
    await expect(searchResult).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-06-asset-search.png"),
    });

    await searchResult.click();
    await expect(page.getByRole("heading", { name: "Studio editor" })).toBeVisible();
    await page.getByRole("button", { name: "Save local edit" }).click();
    await expect(page.getByText("Stable")).toBeVisible();

    await page.getByRole("button", { name: "Get suggestions" }).click();
    await expect(page.getByRole("heading", { name: "Tighten the hook" })).toBeVisible();
    await page.getByRole("button", { name: "Apply" }).first().click();
    await expect(page.getByRole("textbox", { name: "Subtitle" })).toHaveValue(
      "GlowGrip Phone Stand: folds flat",
    );

    await page.getByRole("button", { name: "Regenerate scene" }).click();
    await expect(page.getByRole("textbox", { name: "Subtitle" })).toHaveValue(/Regenerated:/);
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-07-scene-agent-regeneration.png"),
    });
  });
});
