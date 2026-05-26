import type { AssetMetadata, ExternalAssetResult } from "@shopclip/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AssetCategoryTabs,
  assetMatchesCategory,
  externalAssetMatchesCategory,
} from "../features/assets/AssetCategoryTabs";
import { AssetPrepPanel } from "../features/assets/AssetPrepPanel";
import { AssetsPanel, hasSearchableStockProviderCredential } from "../features/assets/AssetsPanel";
import {
  SettingsPanel,
  createDefaultApiConfig,
  sanitizeApiConfig,
  sanitizeStockProviderConfigs,
} from "../features/settings/SettingsPanel";
import { App, createAssetInputFromFile, hasUsableStockProviderCredential } from "./App";
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
    expect(markup).not.toContain("concept-top-cta");
    expect(markup).not.toContain("language-switcher");
    expect(markup).not.toContain("AI co-pilot");
    expect(markup).not.toContain("Quality radar");
    expect(markup).not.toContain("concept-wave");
    expect(markup).not.toContain("creation-assistant");
    expect(markup).toContain("Step 01");
    expect(markup).toContain('creation-stepper-index">05');
  });

  it("routes the creation workflow through asset prep before script and storyboard", () => {
    const assetPrepMarkup = renderToStaticMarkup(<App initialLanguage="zh" initialPage="create" />);
    const storyboardMarkup = renderToStaticMarkup(
      <App initialLanguage="zh" initialPage="studio" />,
    );

    expect(assetPrepMarkup).toContain("步骤 02");
    expect(assetPrepMarkup).toContain("素材准备");
    expect(assetPrepMarkup).toContain("产品主图");
    expect(assetPrepMarkup).toContain("生成分镜");
    expect(assetPrepMarkup).not.toContain("脚本和分镜");

    expect(storyboardMarkup).toContain("步骤 03");
    expect(storyboardMarkup).toContain("脚本与分镜");
    expect(storyboardMarkup).toContain("分镜待生成");
    expect(storyboardMarkup).toContain("分镜重编辑");
  });

  it("does not preload existing library assets into asset prep", () => {
    const markup = renderToStaticMarkup(
      <AssetPrepPanel
        libraryAssets={[makeAsset({ name: "Existing library packshot", type: "image" })]}
        disabled={false}
        isGenerating={false}
        isImporting={false}
        language="zh"
        onBack={() => undefined}
        onGenerateStoryboard={() => undefined}
        onImportFiles={() => undefined}
      />,
    );

    expect(markup).toContain("素材准备");
    expect(markup).toContain("已上传 0/4");
    expect(markup).toContain("从素材库导入");
    expect(markup).not.toContain("Existing library packshot");
    expect(markup).not.toContain("继续上传");
  });

  it("renders free-editable product keyword controls in asset prep", () => {
    const markup = renderToStaticMarkup(
      <AssetPrepPanel
        disabled={false}
        isGenerating={false}
        isImporting={false}
        language="zh"
        onBack={() => undefined}
        onGenerateStoryboard={() => undefined}
        onImportFiles={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="编辑关键词：便携"');
    expect(markup).toContain('value="便携"');
    expect(markup).toContain('aria-label="删除关键词：便携"');
    expect(markup).toContain("添加关键词");
    expect(markup).toContain("关键词内容");
  });

  it("omits the top-right project CTA from asset, inspiration, and creation sections", () => {
    const pages = ["assets", "inspiration", "project"] as const;

    pages.forEach((page) => {
      const markup = renderToStaticMarkup(<App initialLanguage="en" initialPage={page} />);

      expect(markup).not.toContain("concept-top-cta");
      expect(markup).not.toContain("Create or load a project</div>");
    });
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

    expect(markup).toContain("Import assets");
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
    expect(markup).toContain("Import assets");
    expect(markup).toContain("Search image library");
    expect(markup).toContain("asset-grid");
    expect(markup).toContain("GlowGrip packshot");
    expect(markup).not.toContain("upload-zone");
    expect(markup).not.toContain("Size in bytes");
  });

  it("renders local asset previews with a detail action", () => {
    const markup = renderToStaticMarkup(
      <AssetsPanel
        assetDraft={{
          type: "image",
          name: "GlowGrip packshot",
          mimeType: "image/png",
          sizeBytes: 220000,
          tags: ["product", "desk", "hero"],
        }}
        assets={[
          makeAsset({
            id: "asset-packshot",
            type: "image",
            name: "GlowGrip packshot",
            mimeType: "image/png",
            sizeBytes: 242000,
            tags: ["product", "hero"],
            url: "/uploads/glowgrip-packshot.png",
          }),
        ]}
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
        searchQuery=""
        searchResults={[]}
      />,
    );

    expect(markup).toContain("/api/assets/asset-packshot/content");
    expect(markup).toContain('alt="GlowGrip packshot"');
    expect(markup).toContain("View details");
    expect(markup).toContain("Open details for GlowGrip packshot");
  });

  it("renders upload progress previews and delete controls without card status bars", () => {
    const markup = renderToStaticMarkup(
      <AssetsPanel
        assetDraft={{
          type: "image",
          name: "GlowGrip packshot",
          mimeType: "image/png",
          sizeBytes: 220000,
          tags: ["product", "desk", "hero"],
        }}
        assets={[
          makeAsset({
            id: "asset-uploading",
            type: "image",
            name: "Uploading packshot",
            mimeType: "image/png",
            status: "uploaded",
            url: "/uploads/uploading.png",
          }),
          makeAsset({
            id: "asset-ready",
            type: "image",
            name: "Ready packshot",
            mimeType: "image/png",
            status: "ready",
            url: "/uploads/ready.png",
          }),
        ]}
        copy={copy.en.assets}
        disabled={false}
        hasProject
        hasSearched={false}
        isLoading={false}
        isSearching={false}
        language="en"
        activeCategory="image"
        onAssetDraftChange={() => undefined}
        onDeleteAssets={() => undefined}
        onImportFiles={() => undefined}
        onSearchAssets={() => undefined}
        onSearchQueryChange={() => undefined}
        onUploadAsset={() => undefined}
        searchQuery=""
        searchResults={[]}
      />,
    );

    expect(markup).toContain("asset-uploading-spinner");
    expect(markup).not.toContain("/api/assets/asset-uploading/content");
    expect(markup).toContain("/api/assets/asset-ready/content");
    expect(markup).toContain("Select Uploading packshot");
    expect(markup).toContain("Delete Ready packshot");
    expect(markup).toContain("Delete selected");
    expect(markup).not.toContain("status-pill");
  });

  it("uses one import entry for every asset category", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="zh" initialPage="assets" />);

    expect(markup).toContain("导入素材");
    expect(markup).not.toContain("导入图片");
    expect(markup).not.toContain("导入视频");
    expect(markup).not.toContain("导入音频");
    expect(markup).not.toContain("导入剧本");
  });

  it("classifies uploaded files by MIME type and extension", () => {
    const imageAsset = createAssetInputFromFile(
      { name: "packshot.png", type: "image/png", size: 1000 } as File,
      "en",
    );
    const videoAsset = createAssetInputFromFile(
      { name: "demo.mp4", type: "video/mp4", size: 2000 } as File,
      "en",
    );
    const audioAsset = createAssetInputFromFile(
      { name: "voice.mp3", type: "audio/mpeg", size: 3000 } as File,
      "en",
    );
    const scriptAsset = createAssetInputFromFile(
      { name: "script.md", type: "", size: 4000 } as File,
      "en",
    );

    expect(imageAsset).toMatchObject({
      type: "image",
      name: "packshot.png",
      mimeType: "image/png",
    });
    expect(videoAsset).toMatchObject({ type: "video", name: "demo.mp4", mimeType: "video/mp4" });
    expect(audioAsset).toMatchObject({
      type: "reference",
      name: "voice.mp3",
      mimeType: "audio/mpeg",
    });
    expect(scriptAsset).toMatchObject({
      type: "reference",
      name: "script.md",
      mimeType: "text/markdown",
    });
    expect(audioAsset.tags).toContain("audio");
    expect(scriptAsset.tags).toContain("script");
  });

  it("places asset type tabs below the asset search toolbar", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="en" initialPage="assets" />);

    const searchPanelIndex = markup.indexOf("asset-search-panel");
    const tabsIndex = markup.indexOf("asset-browser-tabs");
    const externalEntryIndex = markup.indexOf("external-stock-entry");

    expect(searchPanelIndex).toBeGreaterThan(-1);
    expect(tabsIndex).toBeGreaterThan(searchPanelIndex);
    expect(externalEntryIndex).toBeGreaterThan(tabsIndex);
  });

  it("does not seed the asset search input with a default query", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="en" initialPage="assets" />);

    expect(markup).toContain('id="asset-search-image"');
    expect(markup).not.toContain("desk stable creator table");
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
        stockProviderConfigs={[{ source: "pexels", enabled: true, apiKey: "pexels-secret" }]}
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
        stockProviderConfigs={[{ source: "pexels", enabled: true, apiKey: "pexels-secret" }]}
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
        stockProviderConfigs={[]}
      />,
    );

    expect(markup).toContain("Search external stock assets");
    expect(markup).not.toContain("No external stock results");
  });

  it("renders inspiration generation controls as a dedicated page", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="en" initialPage="inspiration" />);

    expect(markup).toContain("What do you want to create today?");
    expect(markup).toContain("Image");
    expect(markup).toContain("Custom");
    expect(markup).not.toContain("Use skills");
    expect(markup).not.toContain("Agent mode");
    expect(markup).not.toContain("Auto</button>");
    expect(markup).toContain("Generate material");
    expect(markup).not.toContain("Current routing");
  });

  it("renders user API settings with separate model configuration areas", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="en" initialPage="settings" />);

    expect(markup).toContain("Settings");
    expect(markup).toContain("General model");
    expect(markup).toContain("Image generation model");
    expect(markup).toContain("Video generation model");
    expect(markup).toContain("API service address");
    expect(markup).toContain("API key source");
    expect(markup).toContain("Custom");
    expect(markup).toContain("Use official config");
    expect(markup).toContain("Volcengine Ark");
    expect(markup).toContain("Select a model or paste an endpoint ID");
    expect(markup).toContain("model-combobox");
    expect(markup).toContain("model-combobox-toggle");
    expect(markup).toContain("model-option");
    expect(markup).not.toContain("model-preset-select");
    expect(markup).toContain("doubao-seed-2-0-pro-260215");
    expect(markup).toContain("doubao-seed-2-0-lite-260428");
    expect(markup).toContain("doubao-seed-2-0-mini-260428");
    expect(markup).toContain("doubao-seedream-5-0-260128");
    expect(markup).toContain("doubao-seedream-4-5-251128");
    expect(markup).toContain("doubao-seedream-4-0-250828");
    expect(markup).toContain("doubao-seedance-1-5-pro-251215");
    expect(markup).toContain("Third-party stock libraries");
    expect(markup).toContain("Add third-party library");
    expect(markup).toContain("Pexels");
    expect(markup).not.toContain("Demo Stock");
    expect(markup).not.toContain("P1 grouped into 5 pages");
  });

  it("renders Freesound as a configurable stock provider", () => {
    const markup = renderToStaticMarkup(
      <SettingsPanel
        apiConfig={createDefaultApiConfig()}
        language="en"
        onApiConfigChange={() => undefined}
        onLanguageChange={() => undefined}
        onStockProviderConfigsChange={() => undefined}
        stockProviderConfigs={[{ source: "freesound", enabled: true, apiKey: "freesound-key" }]}
      />,
    );

    expect(markup).toContain("Freesound");
    expect(markup).toContain("Search Freesound audio effects");
  });

  it("renders stock provider API key source controls", () => {
    const markup = renderToStaticMarkup(
      <SettingsPanel
        apiConfig={createDefaultApiConfig()}
        language="en"
        onApiConfigChange={() => undefined}
        onLanguageChange={() => undefined}
        onStockProviderConfigsChange={() => undefined}
        stockProviderConfigs={[{ source: "pexels", credentialSource: "official", enabled: true }]}
      />,
    );

    expect(markup).toContain("Third-party stock libraries");
    expect(markup).toContain("Stock API key source");
    expect(markup).toContain("Use official config");
    expect(markup).not.toContain("Backend .env stock API key");
    expect(markup).toContain(
      "The backend uses the selected stock provider key from its .env file.",
    );
  });

  it("normalizes stock provider official credentials without browser API keys", () => {
    const normalized = sanitizeStockProviderConfigs([
      {
        source: "pexels",
        credentialSource: "official",
        apiKey: "browser-secret",
        enabled: true,
      },
      { source: "pixabay", apiKey: " pixabay-secret ", enabled: true },
    ]);

    expect(normalized).toEqual([
      { source: "pexels", credentialSource: "official", enabled: true, apiKey: undefined },
      { source: "pixabay", credentialSource: "custom", enabled: true, apiKey: "pixabay-secret" },
    ]);
  });

  it("treats official stock provider configs as searchable without browser API keys", () => {
    expect(
      hasUsableStockProviderCredential({
        source: "pexels",
        credentialSource: "official",
        enabled: true,
      }),
    ).toBe(true);
    expect(
      hasUsableStockProviderCredential({
        source: "pexels",
        credentialSource: "custom",
        enabled: true,
      }),
    ).toBe(false);
  });

  it("treats official stock provider configs as configured inside the search modal", () => {
    expect(
      hasSearchableStockProviderCredential({
        source: "pexels",
        credentialSource: "official",
        enabled: true,
      }),
    ).toBe(true);
    expect(
      hasSearchableStockProviderCredential({
        source: "pexels",
        credentialSource: "custom",
        enabled: true,
      }),
    ).toBe(false);
  });

  it("normalizes legacy Ark display-name models from stored settings into callable model ids", () => {
    const normalized = sanitizeApiConfig({
      general: {
        provider: "volcengine-ark",
        model: "Doubao-Seed-2.0-pro",
      },
      image: {
        provider: "volcengine-ark",
        model: "Doubao-Seedream-5.0-lite",
      },
      video: {
        provider: "volcengine-ark",
        model: "Doubao-Seedance-1.5-pro",
      },
    });

    expect(normalized.general?.model).toBe("doubao-seed-2-0-pro-260215");
    expect(normalized.image?.model).toBe("doubao-seedream-5-0-260128");
    expect(normalized.video?.model).toBe("doubao-seedance-1-5-pro-251215");
  });

  it("keeps model settings while defaulting credential source to custom", () => {
    const normalized = sanitizeApiConfig({
      general: {
        provider: "openai-compatible",
        apiBaseUrl: "https://api.example.test/v1",
        model: "custom-text-model",
      },
      image: {
        credentialSource: "official",
        provider: "volcengine-ark",
        model: "doubao-seedream-5-0-260128",
      },
    });

    expect(normalized.general?.credentialSource).toBe("custom");
    expect(normalized.image?.credentialSource).toBe("official");
    expect(normalized.image?.apiKey).toBeUndefined();
    expect(normalized.image?.model).toBe("doubao-seedream-5-0-260128");
  });

  it("hides custom model fields when official API configuration is selected", () => {
    const markup = renderToStaticMarkup(
      <SettingsPanel
        apiConfig={{
          general: { ...createDefaultApiConfig().general, credentialSource: "official" },
          image: { ...createDefaultApiConfig().image, credentialSource: "official" },
          video: { ...createDefaultApiConfig().video, credentialSource: "official" },
        }}
        language="en"
        onApiConfigChange={() => undefined}
        onLanguageChange={() => undefined}
        onStockProviderConfigsChange={() => undefined}
        stockProviderConfigs={[{ source: "pexels", credentialSource: "official", enabled: true }]}
      />,
    );

    expect(markup).not.toContain("API service address");
    expect(markup).not.toContain("General API key");
    expect(markup).not.toContain("Image API key");
    expect(markup).not.toContain("Video API key");
    expect(markup).not.toContain("Backend .env API key");
    expect(markup).not.toContain("Backend .env stock API key");
    expect(markup).toContain("Official config sends a server-side flag");
    expect(markup).toContain("The backend uses the selected stock provider key");
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

  it("classifies Freesound audio results into the audio category", () => {
    const audioResult: ExternalAssetResult = {
      id: "freesound:sound:12345",
      source: "freesound",
      externalId: "12345",
      type: "audio",
      title: "Cash register button click",
      thumbnailUrl: "",
      previewUrl: "https://cdn.freesound.org/previews/12/12345-hq.mp3",
      downloadUrl: "https://cdn.freesound.org/previews/12/12345-hq.mp3",
      externalUrl: "https://freesound.org/people/creator/sounds/12345/",
      authorName: "Freesound Creator",
      licenseLabel: "Creative Commons 0",
      canUseCommercially: true,
      requiresAttribution: false,
      tags: ["click"],
    };

    expect(externalAssetMatchesCategory(audioResult, "audio")).toBe(true);
    expect(externalAssetMatchesCategory(audioResult, "image")).toBe(false);
    expect(externalAssetMatchesCategory(audioResult, "video")).toBe(false);
  });
});
