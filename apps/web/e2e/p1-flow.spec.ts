import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import { createDefaultProject, generateStoryboardFromPreparedAssets, importLocalAssets } from "./helpers";

const evidenceDir = resolve(process.cwd(), "../../projects/shopclip-ai/evidence");

const evidencePath = (filename: string) => resolve(evidenceDir, filename);

test.describe("P1 browser flow", () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
  });

  test("searches assets, recalls one into a scene, applies an agent suggestion, and regenerates one scene", async ({
    page,
  }) => {
    await createDefaultProject(page);
    await importLocalAssets(page, [
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

    await generateStoryboardFromPreparedAssets(page);

    await page.getByRole("link", { name: /Asset library/ }).click();
    await page.getByLabel("Search image library").fill("stable creator table");
    await page.getByRole("button", { name: "Search library" }).click();
    await expect(
      page.getByRole("heading", { name: "Hands free desk lifestyle demo.webp" }).first(),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-06-asset-search.png"),
    });

    await page.evaluate(() => {
      window.location.hash = "#studio";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await expect(page.getByRole("heading", { name: "Storyboard re-edit" })).toBeVisible();
    await page.getByLabel("Asset slot").selectOption({
      label: "Hands free desk lifestyle demo.webp",
    });
    await page.getByRole("button", { name: "Save local edit" }).click();
    await expect(page.getByText("Stable")).toBeVisible();

    await page.getByRole("button", { name: "Get suggestions" }).click();
    await expect(page.getByRole("button", { name: "Apply" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Apply" }).first().click();
    await expect(page.getByRole("textbox", { name: "Copy" })).toHaveValue(/GlowGrip Phone Stand/);

    await page.getByRole("button", { name: "Regenerate scene" }).click();
    await expect(page.getByRole("button", { name: "Apply" })).toHaveCount(0);
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-07-scene-agent-regeneration.png"),
    });
  });
});
