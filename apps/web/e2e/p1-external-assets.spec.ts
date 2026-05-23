import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const evidenceDir = resolve(currentDir, "../../../projects/shopclip-ai/evidence");

const evidencePath = (filename: string) => resolve(evidenceDir, filename);

const thumbnailSvg =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='960' height='540'%3E%3Crect width='960' height='540' fill='%23202b3a'/%3E%3Crect x='120' y='90' width='720' height='360' rx='24' fill='%2387ceeb'/%3E%3Ctext x='150' y='310' fill='white' font-size='54' font-family='Arial'%3EPexels stock%3C/text%3E%3C/svg%3E";
const highResSvg =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2400' height='1350'%3E%3Crect width='2400' height='1350' fill='%230f172a'/%3E%3Crect x='240' y='180' width='1920' height='990' rx='48' fill='%2322d3ee'/%3E%3Ctext x='360' y='760' fill='white' font-size='132' font-family='Arial'%3EOriginal quality preview%3C/text%3E%3C/svg%3E";
const videoCoverSvg =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080'%3E%3Crect width='1920' height='1080' fill='%23111827'/%3E%3Crect x='180' y='140' width='1560' height='800' rx='48' fill='%232563eb'/%3E%3Cpolygon points='820,380 820,700 1120,540' fill='white'/%3E%3Ctext x='520' y='900' fill='white' font-size='72' font-family='Arial'%3EProvider video cover%3C/text%3E%3C/svg%3E";

const makePexelsResult = (index: number, title: string) => ({
  id: `pexels:photo:desk-packshot-${index}`,
  source: "pexels",
  externalId: `desk-packshot-${index}`,
  type: "image",
  title,
  thumbnailUrl: thumbnailSvg,
  previewUrl: thumbnailSvg,
  downloadUrl: highResSvg,
  externalUrl: `https://www.pexels.com/photo/desk-packshot-${index}/`,
  authorName:
    index === 1
      ? "Pexels Creator With A Very Long Display Name For Wrapping Checks"
      : "Pexels Creator",
  licenseLabel: "Pexels License",
  licenseUrl: "https://www.pexels.com/license/",
  canUseCommercially: true,
  requiresAttribution: false,
  tags: ["desk", "product"],
});

const pexelsResults = [
  makePexelsResult(
    1,
    "Pexels desk product packshot with an intentionally long title that must wrap and clamp inside the card",
  ),
  makePexelsResult(2, "Pexels vertical shopping frame"),
  ...Array.from({ length: 12 }, (_, index) =>
    makePexelsResult(index + 3, `Pexels product shelf angle ${index + 3}`),
  ),
];

const pexelsVideoResult = {
  id: "pexels:video:provider-cover",
  source: "pexels",
  externalId: "provider-cover",
  type: "video",
  title: "Pexels video with provider cover",
  thumbnailUrl: videoCoverSvg,
  previewUrl: "https://videos.pexels.com/video-files/provider-cover/preview.mp4",
  downloadUrl: "https://videos.pexels.com/video-files/provider-cover/original.mp4",
  externalUrl: "https://www.pexels.com/video/provider-cover/",
  authorName: "Pexels Video Creator",
  licenseLabel: "Pexels License",
  licenseUrl: "https://www.pexels.com/license/",
  canUseCommercially: true,
  requiresAttribution: false,
  tags: ["video", "cover"],
} as const;

const pixabayVideoWithoutCoverResult = {
  id: "pixabay:video:no-cover",
  source: "pixabay",
  externalId: "no-cover",
  type: "video",
  title: "Pixabay video without provider cover",
  thumbnailUrl: "",
  previewUrl: "https://cdn.pixabay.com/video/no-cover/small.mp4",
  downloadUrl: "https://cdn.pixabay.com/video/no-cover/medium.mp4",
  externalUrl: "https://pixabay.com/videos/no-cover/",
  authorName: "Pixabay Video Creator",
  licenseLabel: "Pixabay Content License",
  licenseUrl: "https://pixabay.com/service/license-summary/",
  canUseCommercially: true,
  requiresAttribution: false,
  tags: ["video", "missing-cover"],
} as const;

const freesoundAudioResult = {
  id: "freesound:sound:cash-register",
  source: "freesound",
  externalId: "cash-register",
  type: "audio",
  title: "Cash register button click",
  thumbnailUrl: "",
  previewUrl: "https://cdn.freesound.org/previews/12/cash-register-hq.mp3",
  downloadUrl: "https://cdn.freesound.org/previews/12/cash-register-hq.mp3",
  externalUrl: "https://freesound.org/people/creator/sounds/cash-register/",
  authorName: "Freesound Creator",
  authorUrl: "https://freesound.org/people/creator/",
  licenseLabel: "Creative Commons 0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  canUseCommercially: true,
  requiresAttribution: false,
  tags: ["click", "cash register", "store"],
  durationSeconds: 1.2,
} as const;

test.describe("External stock asset flow", () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
  });

  test("configures a stock provider, searches in the modal, selects cards, and bulk imports locally", async ({
    page,
  }) => {
    await page.route("**/api/assets/external-search", async (route) => {
      const requestBody = route.request().postDataJSON() as { page?: number; perPage?: number };
      const currentPage = requestBody.page ?? 1;
      const perPage = requestBody.perPage ?? 12;
      const start = (currentPage - 1) * perPage;
      const externalResults = pexelsResults.slice(start, start + perPage);

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          query: "desk product",
          page: currentPage,
          perPage,
          hasMore: start + perPage < pexelsResults.length,
          externalResults,
        }),
      });
    });

    await page.goto("/#settings");
    await expect(
      page.getByRole("heading", { name: "Third-party stock libraries" }),
    ).toBeVisible();
    await expect(page.getByLabel("Stock site")).toContainText("Freesound");
    await page.getByLabel("Stock API key").fill("pexels-test-key");
    await page.getByRole("button", { name: "Add third-party library" }).click();
    await expect(page.locator(".stock-provider-card").filter({ hasText: "Pexels" })).toBeVisible();
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
      page.getByRole("heading", {
        name: /Pexels desk product packshot with an intentionally long title/,
      }),
    ).toBeVisible();
    await expect(page.locator(".external-asset-preview img").first()).toHaveAttribute(
      "src",
      highResSvg,
    );
    await expect(page.getByRole("button", { name: "Import to project" })).toHaveCount(0);
    await expect
      .poll(() =>
        page.locator(".external-search-results-shell").evaluate((element) => {
          return element.scrollHeight > element.clientHeight;
        }),
      )
      .toBe(true);
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-13-external-search-modal.png"),
    });

    await page.getByRole("button", { name: /Preview Pexels desk product packshot/ }).click();
    const previewDialog = page.getByRole("dialog", { name: /Pexels desk product packshot/ });
    await expect(previewDialog).toBeVisible();
    await expect(
      previewDialog.getByText("Pexels Creator With A Very Long Display Name For Wrapping Checks"),
    ).toBeVisible();
    await expect(previewDialog.getByText("Pexels License")).toBeVisible();
    await expect(previewDialog.locator(".external-preview-media img")).toHaveAttribute(
      "src",
      highResSvg,
    );
    await page.getByRole("button", { name: "Close asset preview" }).click();

    await page.locator(".external-search-results-shell").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(
      page.getByRole("heading", { name: "Pexels product shelf angle 14" }),
    ).toBeVisible();
    await expect(page.getByText("All results loaded")).toBeVisible();

    await page
      .getByRole("button", { name: /Select Pexels desk product packshot/ })
      .click();
    await page.getByRole("button", { name: /Select Pexels vertical shopping frame/ }).click();
    await expect(page.getByText("2 selected")).toBeVisible();

    await page.getByRole("button", { name: "Import selected" }).click();

    await expect(page.getByText(/2 assets added to the local import queue/)).toBeVisible();
    await expect(page.getByText("Queued", { exact: true })).toHaveCount(2);
    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-13-external-asset-import.png"),
    });
  });

  test("shows Chinese stock settings and search modal without mojibake", async ({ page }) => {
    await page.route("**/api/assets/external-search", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          query: "desk product",
          page: 1,
          perPage: 12,
          hasMore: false,
          externalResults: pexelsResults.slice(0, 2),
        }),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem("shopclip-language", "zh");
      window.localStorage.setItem(
        "shopclip-stock-provider-config",
        JSON.stringify([{ source: "pexels", enabled: true, apiKey: "pexels-test-key" }]),
      );
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
      page.getByRole("heading", {
        name: /Pexels desk product packshot with an intentionally long title/,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: /选择 Pexels desk product packshot/ }).click();
    await expect(page.getByText("已选择 1 个素材")).toBeVisible();
    await page.getByRole("button", { name: "一键导入" }).click();
    await expect(page.getByText(/已将 1 个素材加入素材库暂存区/)).toBeVisible();

    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-13-external-search-modal-zh.png"),
    });
  });

  test("uses provider covers and fallback images for video result cards", async ({ page }) => {
    await page.route("**/api/assets/external-search", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          query: "desk video",
          page: 1,
          perPage: 12,
          hasMore: false,
          externalResults: [pexelsVideoResult, pixabayVideoWithoutCoverResult],
        }),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem(
        "shopclip-stock-provider-config",
        JSON.stringify([{ source: "pexels", enabled: true, apiKey: "pexels-test-key" }]),
      );
    });

    await page.goto("/#assets");
    await page.getByRole("button", { name: "Video" }).click();
    await page.getByLabel("Search video library").fill("desk video");
    await page.getByRole("button", { name: "Search stock" }).click();

    await expect(page.getByRole("dialog", { name: "Search third-party assets" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pexels video with provider cover" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pixabay video without provider cover" }),
    ).toBeVisible();
    await expect(page.locator(".external-asset-preview img").first()).toHaveAttribute(
      "src",
      videoCoverSvg,
    );
    await expect(page.locator(".external-asset-preview img").nth(1)).toHaveAttribute(
      "src",
      /No video cover/,
    );
    await expect(page.locator(".external-video-preview")).toHaveCount(0);
  });

  test("switches third-party search type in the modal without changing the query", async ({
    page,
  }) => {
    const seenTypes: string[] = [];
    const seenQueries: string[] = [];

    await page.route("**/api/assets/external-search", async (route) => {
      const requestBody = route.request().postDataJSON() as { query: string; type?: string };
      seenQueries.push(requestBody.query);
      seenTypes.push(requestBody.type ?? "all");

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          query: requestBody.query,
          page: 1,
          perPage: 12,
          hasMore: false,
          externalResults:
            requestBody.type === "video"
              ? [pexelsVideoResult]
              : requestBody.type === "audio"
                ? [freesoundAudioResult]
                : [pexelsResults[0]],
        }),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem(
        "shopclip-stock-provider-config",
        JSON.stringify([
          { source: "pexels", enabled: true, apiKey: "pexels-test-key" },
          { source: "freesound", enabled: true, apiKey: "freesound-test-key" },
        ]),
      );
    });

    await page.goto("/#assets");
    await page.getByLabel("Search image library").fill("desk product");
    await page.getByRole("button", { name: "Search stock" }).click();

    const dialog = page.getByRole("dialog", { name: "Search third-party assets" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("heading", { name: /Pexels desk product packshot/ })).toBeVisible();

    await dialog.getByRole("button", { name: "Video" }).click();
    await expect(page.getByRole("heading", { name: "Pexels video with provider cover" })).toBeVisible();

    await dialog.getByRole("button", { name: "Audio" }).click();
    await expect(page.getByRole("heading", { name: "Cash register button click" })).toBeVisible();

    expect(seenTypes).toEqual(["image", "video", "audio"]);
    expect(seenQueries).toEqual(["desk product", "desk product", "desk product"]);
    await expect(dialog.getByLabel("External stock search query")).toHaveValue("desk product");
  });

  test("searches Freesound audio, previews playback, and queues selected audio imports", async ({
    page,
  }) => {
    await page.route("**/api/assets/external-search", async (route) => {
      const requestBody = route.request().postDataJSON() as { type?: string };
      expect(requestBody.type).toBe("audio");

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          query: "cash register",
          page: 1,
          perPage: 12,
          hasMore: false,
          externalResults: [freesoundAudioResult],
        }),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem(
        "shopclip-stock-provider-config",
        JSON.stringify([{ source: "freesound", enabled: true, apiKey: "freesound-test-key" }]),
      );
    });

    await page.goto("/#assets");
    await page.getByRole("button", { name: "Audio" }).click();
    await page.getByLabel("Search audio library").fill("cash register");
    await page.getByRole("button", { name: "Search stock" }).click();

    await expect(page.getByRole("dialog", { name: "Search third-party assets" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cash register button click" })).toBeVisible();
    await expect(page.locator(".external-audio-preview")).toBeVisible();
    await expect(page.locator(".external-provider-summary").getByText("Freesound")).toBeVisible();

    await page.getByRole("button", { name: "Preview Cash register button click" }).click();
    const previewDialog = page.getByRole("dialog", { name: "Cash register button click" });
    await expect(previewDialog).toBeVisible();
    await expect(previewDialog.locator("audio")).toHaveAttribute(
      "src",
      freesoundAudioResult.previewUrl,
    );
    await expect(previewDialog.getByText("1.2s")).toBeVisible();
    await page.getByRole("button", { name: "Close asset preview" }).click();

    await page.getByRole("button", { name: "Select Cash register button click" }).click();
    await expect(page.getByText("1 selected")).toBeVisible();
    await page.getByRole("button", { name: "Import selected" }).click();
    await expect(page.getByText(/1 asset added to the local import queue/)).toBeVisible();
  });

  test("reminds users when no third-party stock library is configured", async ({ page }) => {
    await page.goto("/#assets");
    await page.getByRole("button", { name: "Search stock" }).click();

    await expect(page.getByRole("dialog", { name: "Search third-party assets" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Add a third-party stock library first" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Search", exact: true })).toBeDisabled();

    await page.screenshot({
      fullPage: true,
      path: evidencePath("p1-13-external-no-provider.png"),
    });
  });
});
