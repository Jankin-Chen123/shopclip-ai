import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import { importLocalAssets } from "./helpers";

const evidenceDir = resolve(process.cwd(), "../../projects/shopclip-ai/evidence");
const evidencePath = (filename: string) => resolve(evidenceDir, filename);

test.describe("Part 015 structured references", () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
  });

  test("analyzes an uploaded self-owned reference video and exposes it as a script reference", async ({
    page,
  }) => {
    await page.goto("/#project");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByText("Project loaded")).toBeVisible();

    await importLocalAssets(page, {
      name: "Self shot reference demo.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("demo-video-reference"),
    });

    await page.goto("/#inspiration");
    await expect(page.getByRole("heading", { name: "Viral video breakdown" })).toBeVisible();
    await page.getByLabel("Uploaded reference video").selectOption({
      label: "Self shot reference demo.mp4",
    });
    await page.getByLabel("Reference title").fill("Self-shot proof demo");
    await page.getByLabel("Platform").fill("merchant_upload");
    await page.getByRole("button", { name: "Analyze reference" }).click();

    await expect(page.getByRole("heading", { name: "Self-shot proof demo" })).toBeVisible();
    await expect(page.getByText("ready")).toBeVisible();
    await page.getByRole("button", { name: "Create template" }).click();
    await expect(page.getByText("1 template")).toBeVisible();

    await page.goto("/#create");
    const scriptGeneration = page.getByRole("region", { name: "Script generation" });
    await expect(scriptGeneration.getByLabel("Reference video")).toContainText(
      "Self-shot proof demo",
    );
    await expect(scriptGeneration.getByLabel("Viral template")).toContainText("viral template");
    await page.screenshot({
      fullPage: true,
      path: evidencePath("part-015-uploaded-reference-video.png"),
    });
  });
});
