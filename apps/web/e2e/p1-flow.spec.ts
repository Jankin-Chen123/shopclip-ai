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
    await page.getByRole("button", { name: /Creative prep/ }).click();
    await page.getByRole("button", { name: "Upload metadata" }).click();

    await page.getByLabel("Asset name").fill("Hands free desk lifestyle demo");
    await page.getByLabel("MIME type").fill("image/webp");
    await page.getByLabel("Tags").fill("desk, benefit");
    await page.getByRole("button", { name: "Upload metadata" }).click();

    await page.getByRole("button", { name: "Generate storyboard" }).click();
    await expect(page.getByText("4 scenes", { exact: true })).toBeVisible();

    await page.getByLabel("Search assets").fill("stable creator table");
    await page.getByRole("button", { name: "Search library" }).click();
    await expect(
      page
        .getByLabel("Asset retrieval")
        .getByRole("heading", { name: "Hands free desk lifestyle demo" }),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-06-asset-search.png"),
    });

    await page.getByRole("button", { name: "Use in selected scene" }).first().click();
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
