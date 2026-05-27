import { expect, type FilePayload, type Page } from "@playwright/test";

export const importLocalAssets = async (
  page: Page,
  files: string | string[] | FilePayload | FilePayload[],
) => {
  await page.getByRole("link", { name: /Asset library/ }).click();
  await page.getByRole("button", { name: "Import assets" }).first().click();
  await page.getByLabel("Image, video, audio, or text files").setInputFiles(files);
  await page
    .getByRole("dialog", { name: "Import assets" })
    .getByRole("button", { name: "Import assets" })
    .click();
};

export const generateStoryboardFromPreparedAssets = async (
  page: Page,
  draftScript = "Open with the shaky desk filming problem, show GlowGrip locking the phone in place, then close with a TikTok Shop CTA.",
) => {
  await page.goto("/#create");
  await page.getByRole("button", { name: "Import from library" }).first().click();
  await page.getByRole("button", { name: /Select / }).first().click();
  await page.getByRole("button", { name: "Import selected assets" }).click();

  await page.getByLabel("Write or paste your draft script").fill(draftScript);
  await page.getByRole("button", { name: "One-click generate" }).click();
  await expect(page.getByText(/Generated with deterministic fallback/)).toBeVisible();
  await page.getByRole("button", { name: "Generate storyboard" }).click();
  await expect(page.getByRole("heading", { name: "Storyboard re-edit" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Scene 1/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Scene 1 generated visual/ })).toBeVisible();
};
