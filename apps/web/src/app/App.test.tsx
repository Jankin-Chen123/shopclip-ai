import type { AssetMetadata } from "@shopclip/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AssetCategoryTabs, assetMatchesCategory } from "../features/assets/AssetCategoryTabs";
import { AssetsPanel } from "../features/assets/AssetsPanel";
import { App } from "./App";
import { copy } from "./i18n";

const makeAsset = (asset: Partial<AssetMetadata>): AssetMetadata => ({
  id: "asset-1",
  projectId: "project-1",
  type: "reference",
  status: "ready",
  url: "/asset",
  name: "Asset",
  mimeType: "text/plain",
  tags: [],
  ...asset,
});

describe("App", () => {
  it("exports the scaffold app component", () => {
    expect(App).toBeTypeOf("function");
  });

  it("renders the P1 workspace flow landmarks", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("Asset library");
    expect(markup).toContain("Inspiration");
    expect(markup).toContain("Create");
    expect(markup).toContain("Project");
    expect(markup).toContain("Studio");
    expect(markup).toContain("Project command center");
    expect(markup).not.toContain("page-card");
    expect(markup).not.toContain("page-hero");
    expect(markup).toContain("Product setup");
    expect(markup).not.toContain("Studio editor");
  });

  it("renders concept-inspired creation workspace chrome", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="en" initialPage="project" />);

    expect(markup).toContain("creation-stepper");
    expect(markup).toContain("creation-shell");
    expect(markup).toContain("concept-project-panel");
    expect(markup).toContain("concept-top-cta");
    expect(markup).not.toContain("language-switcher");
    expect(markup).not.toContain("AI co-pilot");
    expect(markup).not.toContain("Quality radar");
    expect(markup).not.toContain("concept-wave");
    expect(markup).not.toContain("creation-assistant");
    expect(markup).toContain("Step 01");
    expect(markup).toContain("creation-stepper-index\">05");
  });

  it("renders the simplified workspace shell in Chinese mode", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="zh" />);

    expect(markup).toContain("ShopClip AI");
    expect(markup).not.toContain("page-card");
    expect(markup).not.toContain("page-hero");
  });

  it("renders only localized asset categories on the asset library page", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="zh" initialPage="assets" />);

    expect(markup).toContain("图片");
    expect(markup).toContain("视频");
    expect(markup).toContain("音频");
    expect(markup).toContain("剧本");
    expect(markup).not.toContain("Canvas");
    expect(markup).not.toContain("Image editor");
    expect(markup).not.toContain("Documents");
  });

  it("keeps inspiration separate from the asset library", () => {
    const markup = renderToStaticMarkup(
      <AssetsPanel
        assetDraft={{
          type: "image",
          name: "GlowGrip packshot",
          mimeType: "image/png",
          sizeBytes: 220000,
          tags: ["product", "desk", "hero"],
        }}
        assets={[]}
        copy={copy.en.assets}
        disabled={false}
        hasProject={false}
        hasSearched={false}
        isLoading={false}
        isSearching={false}
        language="en"
        activeCategory="image"
        onAssetDraftChange={() => undefined}
        onImportFiles={() => undefined}
        onSearchAssets={() => undefined}
        onSearchQueryChange={() => undefined}
        onUploadAsset={() => undefined}
        searchQuery="desk stable creator table"
        searchResults={[]}
      />,
    );

    expect(markup).toContain("Import images");
    expect(markup).not.toContain("What do you want to create today?");
    expect(markup).not.toContain("Agent mode");
  });

  it("renders the concept-style asset library surface", () => {
    const markup = renderToStaticMarkup(
      <AssetsPanel
        assetDraft={{
          type: "image",
          name: "GlowGrip packshot",
          mimeType: "image/png",
          sizeBytes: 220000,
          tags: ["product", "desk", "hero"],
        }}
        assets={[makeAsset({ type: "image", name: "GlowGrip packshot", mimeType: "image/png" })]}
        copy={copy.en.assets}
        disabled={false}
        hasProject
        hasSearched={false}
        isLoading={false}
        isSearching={false}
        language="en"
        activeCategory="image"
        onAssetDraftChange={() => undefined}
        onImportFiles={() => undefined}
        onSearchAssets={() => undefined}
        onSearchQueryChange={() => undefined}
        onUploadAsset={() => undefined}
        searchQuery="desk"
        searchResults={[]}
      />,
    );

    expect(markup).toContain("asset-library-board");
    expect(markup).toContain("asset-import-card");
    expect(markup).toContain("asset-search-panel");
    expect(markup).toContain("Search external stock assets");
    expect(markup).toContain("Search stock");
    expect(markup).toContain("asset-card-preview");
    expect(markup).not.toContain("asset-library-hero");
    expect(markup).not.toContain("Import and organize visual references for your scenes.");
    expect(markup).toContain("Import images");
    expect(markup).toContain("Search image library");
    expect(markup).toContain("asset-grid");
    expect(markup).toContain("GlowGrip packshot");
    expect(markup).not.toContain("upload-zone");
    expect(markup).not.toContain("Size in bytes");
  });

  it("renders the external stock search entry as a modal trigger", () => {
    const markup = renderToStaticMarkup(
      <AssetsPanel
        assetDraft={{
          type: "image",
          name: "GlowGrip packshot",
          mimeType: "image/png",
          sizeBytes: 220000,
          tags: ["product", "desk", "hero"],
        }}
        assets={[]}
        copy={copy.en.assets}
        disabled={false}
        hasProject
        hasSearched={false}
        isLoading={false}
        isSearching={false}
        language="en"
        activeCategory="image"
        onAssetDraftChange={() => undefined}
        onImportExternalAsset={() => undefined}
        onImportFiles={() => undefined}
        onSearchExternalAssets={async () => []}
        onSearchAssets={() => undefined}
        onSearchQueryChange={() => undefined}
        onUploadAsset={() => undefined}
        searchQuery="desk"
        searchResults={[]}
        stockProviderConfigs={[{ source: "demo", enabled: true }]}
      />,
    );

    expect(markup).toContain("Search external stock assets");
    expect(markup).toContain("Search stock");
    expect(markup).not.toContain("External stock results");
  });

  it("renders Chinese external stock modal trigger without mojibake", () => {
    const markup = renderToStaticMarkup(
      <AssetsPanel
        assetDraft={{
          type: "image",
          name: "GlowGrip packshot",
          mimeType: "image/png",
          sizeBytes: 220000,
          tags: ["product", "desk", "hero"],
        }}
        assets={[]}
        copy={copy.zh.assets}
        disabled={false}
        hasProject
        hasSearched
        isLoading={false}
        isSearching={false}
        language="zh"
        activeCategory="image"
        onAssetDraftChange={() => undefined}
        onImportExternalAsset={() => undefined}
        onImportFiles={() => undefined}
        onSearchExternalAssets={async () => []}
        onSearchAssets={() => undefined}
        onSearchQueryChange={() => undefined}
        onUploadAsset={() => undefined}
        searchQuery="desk"
        searchResults={[]}
        stockProviderConfigs={[{ source: "demo", enabled: true }]}
      />,
    );

    expect(markup).toContain("搜索可直接导入的外部素材");
    expect(markup).toContain("搜索第三方素材");
    expect(markup).toContain("暂无图片素材");
    expect(markup).not.toContain("鐎电厧");
    expect(markup).not.toContain("缁楊兛");
  });

  it("renders an external stock entry when no project is loaded", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="en" initialPage="assets" />);

    expect(markup).toContain("Search external stock assets");
    expect(markup).toContain("No need to switch pages first");
    expect(markup).toContain("Search stock");
  });

  it("keeps external no-result feedback out of the main asset grid", () => {
    const markup = renderToStaticMarkup(
      <AssetsPanel
        assetDraft={{
          type: "image",
          name: "GlowGrip packshot",
          mimeType: "image/png",
          sizeBytes: 220000,
          tags: ["product", "desk", "hero"],
        }}
        assets={[]}
        copy={copy.en.assets}
        disabled={false}
        hasProject
        hasSearched
        isLoading={false}
        isSearching={false}
        language="en"
        activeCategory="image"
        onAssetDraftChange={() => undefined}
        onImportFiles={() => undefined}
        onSearchExternalAssets={async () => []}
        onSearchAssets={() => undefined}
        onSearchQueryChange={() => undefined}
        onUploadAsset={() => undefined}
        searchQuery="desk"
        searchResults={[]}
        stockProviderConfigs={[{ source: "demo", enabled: true }]}
      />,
    );

    expect(markup).toContain("Search external stock assets");
    expect(markup).not.toContain("No external stock results");
  });

  it("renders inspiration generation controls as a dedicated page", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="en" initialPage="inspiration" />);

    expect(markup).toContain("What do you want to create today?");
    expect(markup).toContain("Text");
    expect(markup).toContain("Image");
    expect(markup).toContain("Video");
    expect(markup).toContain("Generate material");
    expect(markup).toContain("Doubao-Seed-2.0-pro");
    expect(markup).toContain("Doubao-Seedance-2.0");
  });

  it("renders user API settings with separate model configuration areas", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="en" initialPage="settings" />);

    expect(markup).toContain("Settings");
    expect(markup).toContain("General model");
    expect(markup).toContain("Image generation model");
    expect(markup).toContain("Video generation model");
    expect(markup).toContain("API service address");
    expect(markup).toContain("Volcengine Ark");
    expect(markup).toContain("Select or type a model");
    expect(markup).toContain("Doubao-Seedream-5.0-lite");
    expect(markup).toContain("Third-party stock libraries");
    expect(markup).toContain("Add third-party library");
    expect(markup).toContain("Demo Stock");
    expect(markup).not.toContain("P1 grouped into 5 pages");
  });

  it("renders only the supported asset library categories in English", () => {
    const markup = renderToStaticMarkup(
      <AssetCategoryTabs activeCategory="image" language="en" onCategoryChange={() => undefined} />,
    );

    expect(markup).toContain("Images");
    expect(markup).toContain("Video");
    expect(markup).toContain("Audio");
    expect(markup).toContain("Scripts");
    expect(markup).not.toContain("Canvas");
    expect(markup).not.toContain("Image editor");
    expect(markup).not.toContain("Documents");
  });

  it("renders asset library categories in Chinese when Chinese is selected", () => {
    const markup = renderToStaticMarkup(
      <AssetCategoryTabs activeCategory="image" language="zh" onCategoryChange={() => undefined} />,
    );

    expect(markup).toContain("图片");
    expect(markup).toContain("视频");
    expect(markup).toContain("音频");
    expect(markup).toContain("剧本");
    expect(markup).not.toContain("Images");
    expect(markup).not.toContain("Video");
    expect(markup).not.toContain("Audio");
    expect(markup).not.toContain("Scripts");
  });

  it("classifies only image, video, audio, and script assets", () => {
    expect(assetMatchesCategory(makeAsset({ type: "image", mimeType: "image/png" }), "image")).toBe(
      true,
    );
    expect(assetMatchesCategory(makeAsset({ type: "video", mimeType: "video/mp4" }), "video")).toBe(
      true,
    );
    expect(assetMatchesCategory(makeAsset({ mimeType: "audio/mpeg" }), "audio")).toBe(true);
    expect(assetMatchesCategory(makeAsset({ tags: ["剧本"] }), "script")).toBe(true);
    expect(assetMatchesCategory(makeAsset({ mimeType: "application/pdf" }), "script")).toBe(false);
  });
});
