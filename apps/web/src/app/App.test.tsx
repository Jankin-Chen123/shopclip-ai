import type {
  AssetMetadata,
  ExternalAssetResult,
  ProjectSummary,
  StoryboardScene,
} from "@shopclip/shared";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AssetCategoryTabs,
  assetMatchesCategory,
  externalAssetMatchesCategory,
} from "../features/assets/AssetCategoryTabs";
import {
  AssetPrepPanel,
  createAssetPrepSnapshotFromUploads,
  filterPrepLibraryAssets,
  hydratePrepUploadsWithLibraryAssets,
} from "../features/assets/AssetPrepPanel";
import { AssetsPanel, hasSearchableStockProviderCredential } from "../features/assets/AssetsPanel";
import {
  InspirationPanel,
  replaceInspirationSessionHistoryResult,
} from "../features/inspiration/InspirationPanel";
import { ProjectSetup } from "../features/projects/ProjectSetup";
import { RenderPanel, defaultVideoSettings } from "../features/render/RenderPanel";
import { StudioWorkspace } from "../features/studio/StudioWorkspace";
import {
  SettingsPanel,
  createDefaultApiConfig,
  sanitizeApiConfig,
  sanitizeStockProviderConfigs,
} from "../features/settings/SettingsPanel";
import {
  App,
  createScriptGenerationRequestPayload,
  createAssetPrepSnapshotFromProjectAssets,
  createAssetInputFromFile,
  getCreationAssetLibraryRefreshCategory,
  getCreationUsableAssets,
  getPreparedAssetsByBucket,
  hasUsableStockProviderCredential,
  isRenderTaskPollingActive,
  pruneAssetPrepSnapshotDeletedAssets,
} from "./App";
import { copy } from "./i18n";
import { regenerateScene, resolveApiDownloadUrl } from "../lib/api";
import { createExportDownloadFilename, triggerBrowserDownload } from "../lib/download";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

const makeProjectSummary = (project: Partial<ProjectSummary>): ProjectSummary => ({
  id: "project-history-1",
  title: "Desk launch clip",
  productName: "GlowGrip Phone Stand",
  status: "ready",
  createdAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:05:00.000Z",
  assetCount: 2,
  sceneCount: 4,
  ...project,
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

  it("omits standalone section title bars from asset and inspiration workspaces", () => {
    const assetMarkup = renderToStaticMarkup(<App initialLanguage="zh" initialPage="assets" />);
    const inspirationMarkup = renderToStaticMarkup(
      <App initialLanguage="zh" initialPage="inspiration" />,
    );

    expect(assetMarkup).not.toContain('class="topbar"><div class="section-title"');
    expect(inspirationMarkup).not.toContain('class="topbar"><div class="section-title"');
  });

  it("renders historical projects in the project setup panel", () => {
    const markup = renderToStaticMarkup(
      <ProjectSetup
        brief={{
          title: "New clip",
          productName: "New product",
          audience: "Creators",
          sellingPoints: ["fast setup"],
          tone: "confident",
          style: "fast desk demo",
          targetDurationSeconds: 15,
        }}
        copy={copy.en.project}
        disabled={false}
        isHistoryLoading={false}
        isLoading={false}
        onBriefChange={() => undefined}
        onCreateProject={() => undefined}
        onDeleteProjectFromHistory={() => undefined}
        onLoadProject={() => undefined}
        onLoadProjectFromHistory={() => undefined}
        onProjectIdToLoadChange={() => undefined}
        projectHistory={[
          makeProjectSummary({
            id: "project-history-2",
            title: "Lamp holiday clip",
            productName: "Desk Halo Lamp",
            assetCount: 3,
            sceneCount: 4,
          }),
        ]}
        projectIdToLoad=""
      />,
    );

    expect(markup).toContain("Historical projects");
    expect(markup).toContain("Lamp holiday clip");
    expect(markup).toContain("Desk Halo Lamp");
    expect(markup).toContain("3 assets");
    expect(markup).toContain("4 scenes");
    expect(markup).toContain('aria-label="Delete history project Lamp holiday clip"');
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
    expect(assetPrepMarkup).not.toContain("脚本与分镜");

    expect(storyboardMarkup).toContain("步骤 03");
    expect(storyboardMarkup).toContain("分镜编辑");
    expect(storyboardMarkup).not.toContain("脚本与分镜");
    expect(storyboardMarkup).toContain("分镜待生成");
    expect(storyboardMarkup).toContain("分镜重编辑");
  });

  it("renders script generation controls inside step 02 asset prep", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="en" initialPage="create" />);

    expect(markup).toContain("Script generation");
    expect(markup).toContain("Write or paste your draft script");
    expect(markup).toContain("One-click generate");
    expect(markup).toContain("Generate storyboard");
  });

  it("renders video generation settings in the render panel", () => {
    const markup = renderToStaticMarkup(
      <RenderPanel
        copy={copy.en.render}
        disabled={false}
        forceRenderFailure={false}
        isExporting={false}
        isRendering={false}
        mediaSettings={{
          bgmTrack: "creator-pop",
          subtitleStyle: "clean-lower-third",
          subtitlesEnabled: true,
          ttsVoice: "clear-host",
        }}
        onExport={() => undefined}
        onForceFailureChange={() => undefined}
        onMediaSettingsChange={() => undefined}
        onRefreshRender={() => undefined}
        onRetryRender={() => undefined}
        onStartRender={() => undefined}
        onVideoSettingsChange={() => undefined}
        traceEvents={[]}
        videoSettings={defaultVideoSettings}
      />,
    );

    expect(markup).toContain("Video generation settings");
    expect(markup).toContain("Aspect ratio");
    expect(markup).toContain("Resolution");
    expect(markup).toContain("Generate audio");
    expect(markup).toContain("Watermark");
    expect(markup).toContain("Seed");
  });

  it("renders per-scene video previews in the render panel", () => {
    const markup = renderToStaticMarkup(
      <RenderPanel
        copy={copy.en.render}
        disabled={false}
        forceRenderFailure={false}
        isExporting={false}
        isRendering={false}
        mediaSettings={{
          bgmTrack: "creator-pop",
          subtitleStyle: "clean-lower-third",
          subtitlesEnabled: true,
          ttsVoice: "clear-host",
        }}
        onExport={() => undefined}
        onForceFailureChange={() => undefined}
        onMediaSettingsChange={() => undefined}
        onRefreshRender={() => undefined}
        onRetryRender={() => undefined}
        onStartRender={() => undefined}
        onVideoSettingsChange={() => undefined}
        renderTask={{
          id: "render-1",
          projectId: "project-1",
          status: "completed",
          progress: 100,
          provider: "volcengine-seedance",
          previewUrl: "https://cdn.example.test/scene-1.mp4",
          exportUrl: "https://cdn.example.test/scene-1.mp4",
          sceneClips: [
            {
              sceneId: "scene-1",
              order: 1,
              subtitle: "Hook",
              status: "completed",
              progress: 100,
              videoUrl: "https://cdn.example.test/scene-1.mp4",
              coverUrl: "https://cdn.example.test/scene-1.mp4",
            },
          ],
          createdAt: "2026-05-28T00:00:00.000Z",
          updatedAt: "2026-05-28T00:00:00.000Z",
        }}
        traceEvents={[]}
        videoSettings={defaultVideoSettings}
      />,
    );

    expect(markup).toContain("Scene clip previews");
    expect(markup).toContain("<video");
    expect(markup).toContain("https://cdn.example.test/scene-1.mp4");
  });

  it("keeps step 04 user-facing output free of raw provider URLs and trace noise", () => {
    const markup = renderToStaticMarkup(
      <RenderPanel
        copy={copy.en.render}
        disabled={false}
        forceRenderFailure={false}
        isExporting={false}
        isRendering={false}
        mediaSettings={{
          bgmTrack: "creator-pop",
          subtitleStyle: "clean-lower-third",
          subtitlesEnabled: true,
          ttsVoice: "clear-host",
        }}
        onExport={() => undefined}
        onForceFailureChange={() => undefined}
        onMediaSettingsChange={() => undefined}
        onRefreshRender={() => undefined}
        onRetryRender={() => undefined}
        onStartRender={() => undefined}
        onVideoSettingsChange={() => undefined}
        renderTask={{
          id: "render-1",
          projectId: "project-1",
          status: "completed",
          progress: 100,
          provider: "volcengine-seedance",
          previewUrl: "https://cdn.example.test/scene-1.mp4",
          exportUrl: "https://cos.example.test/export.mp4",
          sceneClips: [
            {
              sceneId: "scene-1",
              order: 1,
              subtitle: "Hook",
              status: "completed",
              progress: 100,
              videoUrl: "https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/long-provider-url.mp4?Signature=secret",
            },
          ],
          createdAt: "2026-05-28T00:00:00.000Z",
          updatedAt: "2026-05-28T00:00:00.000Z",
        }}
        traceEvents={[
          {
            id: "trace-1",
            renderTaskId: "render-1",
            status: "completed",
            step: "seedance-scene-task-submitted",
            message: "Seedance scene 1 task submitted: cgt-1.",
            createdAt: "2026-05-28T00:00:00.000Z",
          },
        ]}
        videoSettings={defaultVideoSettings}
      />,
    );

    expect(markup).toContain("Ready to download");
    expect(markup).toContain("Technical details");
    expect(markup).not.toContain(
      "<span>https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com",
    );
    expect(markup).not.toContain("seedance-scene-task-submitted");
  });

  it("auto-polls active render tasks but stops after completion or failure", () => {
    expect(isRenderTaskPollingActive({ id: "render-1", status: "queued" } as RenderTask)).toBe(
      true,
    );
    expect(isRenderTaskPollingActive({ id: "render-1", status: "running" } as RenderTask)).toBe(
      true,
    );
    expect(isRenderTaskPollingActive({ id: "render-1", status: "completed" } as RenderTask)).toBe(
      false,
    );
    expect(isRenderTaskPollingActive({ id: "render-1", status: "failed" } as RenderTask)).toBe(
      false,
    );
  });

  it("includes model API settings in one-click script generation requests", () => {
    const apiConfig = {
      general: {
        provider: "openai-compatible",
        apiBaseUrl: "https://api.example.test/v1",
        model: "custom-text-model",
        apiKey: "user-api-key",
      },
    };

    expect(
      createScriptGenerationRequestPayload(
        {
          assetIds: ["asset-product-main"],
          keywords: ["便携"],
          materials: [
            {
              assetId: "asset-product-main",
              name: "产品主图",
              type: "image",
            },
          ],
        },
        "强调通勤便携。",
        apiConfig,
      ),
    ).toMatchObject({
      assetIds: ["asset-product-main"],
      draftScript: "强调通勤便携。",
      keywords: ["便携"],
      apiConfig,
    });
  });

  it("uses official server model settings for one-click script generation when no browser API key is set", () => {
    const payload = createScriptGenerationRequestPayload(
      {
        assetIds: ["asset-product-main"],
        keywords: ["portable"],
        materials: [
          {
            assetId: "asset-product-main",
            name: "Product main image",
            type: "image",
          },
        ],
      },
      "",
      createDefaultApiConfig(),
    );

    expect(payload.apiConfig?.general).toMatchObject({
      credentialSource: "official",
      provider: "volcengine-ark",
    });
    expect(payload.apiConfig?.general?.apiKey).toBeUndefined();
    expect(payload.apiConfig?.image).toMatchObject({
      credentialSource: "official",
      provider: "volcengine-ark",
    });
    expect(payload.apiConfig?.image?.apiKey).toBeUndefined();
  });

  it("sends current scene fields and API settings when regenerating one scene image", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        scene: {
          id: "scene-1",
          projectId: "project-1",
          order: 1,
          durationSeconds: 4,
          subtitle: "Current edited subtitle",
          voiceover: "Current edited voiceover",
          visualPrompt: "Current edited visual prompt",
          assetId: "asset-1",
          status: "generated",
        },
        traceEvent: {
          id: "trace-1",
          taskId: "scene:scene-1",
          step: "scene-regenerated",
          status: "completed",
          message: "Image regenerated.",
          timestamp: "2026-05-28T00:00:00.000Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await regenerateScene("scene-1", {
      scene: {
        durationSeconds: 4,
        subtitle: "Current edited subtitle",
        voiceover: "Current edited voiceover",
        visualPrompt: "Current edited visual prompt",
        assetId: "asset-1",
      },
      apiConfig: createDefaultApiConfig(),
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.scene).toMatchObject({
      durationSeconds: 4,
      subtitle: "Current edited subtitle",
      voiceover: "Current edited voiceover",
      visualPrompt: "Current edited visual prompt",
      assetId: "asset-1",
    });
    expect(body.apiConfig).toMatchObject(createDefaultApiConfig());
  });

  it("resolves relative API export URLs against the configured API origin", () => {
    expect(resolveApiDownloadUrl("/api/render-exports/project/final/export.mp4")).toBe(
      "http://localhost:4000/api/render-exports/project/final/export.mp4",
    );
    expect(resolveApiDownloadUrl("https://cdn.example.test/export.mp4")).toBe(
      "https://cdn.example.test/export.mp4",
    );
  });

  it("triggers a browser download for exported demo videos", () => {
    const anchor = {
      click: vi.fn(),
      download: "",
      href: "",
      rel: "",
      remove: vi.fn(),
      style: {},
      target: "",
    };
    const fakeDocument = {
      body: {
        appendChild: vi.fn(),
      },
      createElement: vi.fn(() => anchor),
    } as unknown as Document;

    expect(
      triggerBrowserDownload(
        "https://cdn.example.test/final.mp4",
        createExportDownloadFilename("project-1"),
        fakeDocument,
      ),
    ).toBe(true);

    expect(anchor.href).toBe("https://cdn.example.test/final.mp4");
    expect(anchor.download).toBe("shopclip-project-1-export.mp4");
    expect(anchor.target).toBe("_blank");
    expect(fakeDocument.body.appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
  });

  it("places the step 03 scene list before the centered preview workspace", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="en" initialPage="studio" />);

    expect(markup.indexOf('class="scene-track"')).toBeGreaterThan(-1);
    expect(markup.indexOf('class="phone-preview"')).toBeGreaterThan(-1);
    expect(markup.indexOf('class="scene-track"')).toBeLessThan(
      markup.indexOf('class="phone-preview"'),
    );
  });

  it("renders generated storyboard scene images in the step 03 preview frame", () => {
    const scenes = [
      {
        id: "scene-1",
        projectId: "project-1",
        order: 1,
        durationSeconds: 4,
        subtitle: "Open with the desk problem",
        voiceover: "Open with the desk problem",
        visualPrompt: "Vertical product image",
        imageUrl: "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E",
        status: "generated",
      },
    ] as unknown as StoryboardScene[];
    const markup = renderToStaticMarkup(
      <StudioWorkspace
        assets={[]}
        copy={copy.en.studio}
        dirtySceneIds={new Set()}
        isBusy={false}
        onApplySuggestion={() => undefined}
        onDeleteScene={() => undefined}
        onDismissSuggestion={() => undefined}
        onLoadSuggestions={() => undefined}
        onRegenerateScene={() => undefined}
        onSceneChange={() => undefined}
        onSceneMove={() => undefined}
        onSceneSave={() => undefined}
        onSelectedSceneChange={() => undefined}
        scenes={scenes}
        selectedSceneId="scene-1"
        suggestions={[]}
      />,
    );

    expect(markup).toContain('class="preview-image"');
    expect(markup).toContain('src="data:image/svg+xml');
    expect(markup).toContain('alt="Scene 1 generated visual: Open with the desk problem"');
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

  it("does not replace an explicitly empty prep keyword snapshot with defaults", () => {
    const markup = renderToStaticMarkup(
      <AssetPrepPanel
        disabled={false}
        initialSnapshot={{ assetIds: [], keywords: [], materials: [] }}
        isGenerating={false}
        isImporting={false}
        language="zh"
        onBack={() => undefined}
        onGenerateStoryboard={() => undefined}
        onImportFiles={() => undefined}
      />,
    );

    expect(markup).not.toContain('value="便携"');
    expect(markup).not.toContain('value="可折叠"');
  });

  it("keeps loaded project prep keywords in the script generation snapshot", () => {
    const snapshot = createAssetPrepSnapshotFromProjectAssets(
      [makeAsset({ id: "asset-packshot", name: "Packshot.png", type: "image" })],
      ["portable", "stable"],
    );

    expect(snapshot.assetIds).toEqual(["asset-packshot"]);
    expect(snapshot.keywords).toEqual(["portable", "stable"]);
  });

  it("keeps other projects' private assets out of the creation prep library", () => {
    const assets = getCreationUsableAssets("project-1", [
      makeAsset({ id: "current-project-asset", projectId: "project-1" }),
      makeAsset({ id: "global-library-asset", projectId: undefined }),
      makeAsset({ id: "other-project-asset", projectId: "project-2" }),
    ]);

    expect(assets.map((asset) => asset.id)).toEqual([
      "current-project-asset",
      "global-library-asset",
    ]);
  });

  it("hydrates pending prep uploads with imported library assets for immediate previews", () => {
    const hydrated = hydratePrepUploadsWithLibraryAssets(
      {
        hero: [
          {
            id: "Packshot.png-200000-1",
            mimeType: "image/png",
            name: "Packshot.png",
            size: 200_000,
            source: "file",
          },
        ],
      },
      [
        makeAsset({
          id: "asset-packshot",
          name: "Packshot.png",
          type: "image",
          mimeType: "image/png",
          sizeBytes: 200_000,
        }),
      ],
    );

    expect(hydrated.hero?.[0]?.asset?.id).toBe("asset-packshot");
    expect(hydrated.hero?.[0]?.source).toBe("library");
  });

  it("renders searchable library import with preview and selected import controls", () => {
    const markup = renderToStaticMarkup(
      <AssetPrepPanel
        defaultOpenLibraryBucketId="hero"
        disabled={false}
        isGenerating={false}
        isImporting={false}
        language="zh"
        libraryAssets={[
          makeAsset({
            id: "asset-packshot",
            name: "GlowGrip packshot.png",
            type: "image",
            mimeType: "image/png",
            tags: ["hero", "产品"],
          }),
        ]}
        onBack={() => undefined}
        onGenerateStoryboard={() => undefined}
        onImportFiles={() => undefined}
      />,
    );

    expect(markup).toContain("搜索素材库");
    expect(markup).toContain("预览");
    expect(markup).toContain("选择");
    expect(markup).toContain("导入选中素材");
    expect(markup).toContain("GlowGrip packshot.png");
    expect(markup).toContain("/api/assets/asset-packshot/content");
  });

  it("filters prep library assets by name, MIME type, and tags", () => {
    const assets = [
      makeAsset({
        id: "asset-packshot",
        name: "GlowGrip packshot.png",
        type: "image",
        mimeType: "image/png",
        tags: ["hero", "产品"],
      }),
      makeAsset({
        id: "asset-video",
        name: "Desk demo.mp4",
        type: "video",
        mimeType: "video/mp4",
        tags: ["motion"],
      }),
    ];

    expect(filterPrepLibraryAssets(assets, "image", "hero").map((asset) => asset.id)).toEqual([
      "asset-packshot",
    ]);
    expect(filterPrepLibraryAssets(assets, "video", "mp4").map((asset) => asset.id)).toEqual([
      "asset-video",
    ]);
    expect(filterPrepLibraryAssets(assets, "image", "missing")).toEqual([]);
  });

  it("keeps prep library filtering aligned with visible asset library categories", () => {
    const assets = [
      makeAsset({
        id: "asset-reference-image",
        name: "Reference mood board",
        type: "reference",
        mimeType: "image/png",
      }),
      makeAsset({
        id: "asset-packshot",
        name: "Visible packshot.png",
        type: "image",
        mimeType: "image/png",
      }),
    ];

    expect(filterPrepLibraryAssets(assets, "image", "").map((asset) => asset.id)).toEqual([
      "asset-packshot",
    ]);
  });

  it("renders imported library image and video assets as inline prep thumbnails", () => {
    const markup = renderToStaticMarkup(
      <AssetPrepPanel
        disabled={false}
        isGenerating={false}
        isImporting={false}
        language="zh"
        preparedLibraryAssetsByBucket={{
          hero: [
            makeAsset({
              id: "asset-packshot",
              name: "GlowGrip packshot.png",
              type: "image",
              mimeType: "image/png",
            }),
          ],
          demo: [
            makeAsset({
              id: "asset-demo",
              name: "GlowGrip demo.mp4",
              type: "video",
              mimeType: "video/mp4",
            }),
          ],
        }}
        onBack={() => undefined}
        onGenerateStoryboard={() => undefined}
        onImportFiles={() => undefined}
      />,
    );

    expect(markup).toContain('class="asset-prep-thumb-media"');
    expect(markup).toContain('alt="GlowGrip packshot.png"');
    expect(markup).toContain("/api/assets/asset-packshot/content");
    expect(markup).toContain('aria-label="GlowGrip demo.mp4"');
    expect(markup).toContain("/api/assets/asset-demo/content");
  });

  it("restores file-sourced prep materials when returning to asset prep", () => {
    const markup = renderToStaticMarkup(
      <AssetPrepPanel
        disabled={false}
        initialSnapshot={{
          assetIds: [],
          keywords: ["portable"],
          materials: [
            {
              bucketId: "hero",
              mimeType: "image/png",
              name: "Uploaded packshot.png",
              sizeBytes: 1024,
              source: "file",
              tags: [],
              type: "image",
            },
          ],
        }}
        isGenerating={false}
        isImporting={false}
        language="zh"
        onBack={() => undefined}
        onGenerateStoryboard={() => undefined}
        onImportFiles={() => undefined}
      />,
    );

    expect(markup).toContain("已上传 1/4");
    expect(markup).toContain("Uploaded packshot.png");
  });

  it("creates a prep snapshot from the latest edited keywords and uploads", () => {
    const snapshot = createAssetPrepSnapshotFromUploads(
      {
        hero: [
          {
            id: "asset-packshot",
            asset: makeAsset({
              id: "asset-packshot",
              name: "GlowGrip packshot.png",
              type: "image",
              mimeType: "image/png",
              tags: ["hero"],
            }),
            mimeType: "image/png",
            name: "GlowGrip packshot.png",
            size: 242000,
            source: "library",
          },
        ],
        brand: [
          {
            id: "script-draft",
            mimeType: "text/plain",
            name: "Campaign draft.txt",
            size: 1024,
            source: "file",
          },
        ],
      },
      [" portable ", "", "creator table"],
    );

    expect(snapshot).toEqual({
      assetIds: ["asset-packshot"],
      keywords: ["portable", "creator table"],
      materials: [
        expect.objectContaining({
          assetId: "asset-packshot",
          bucketId: "hero",
          name: "GlowGrip packshot.png",
          source: "library",
          tags: ["hero"],
          type: "image",
        }),
        expect.objectContaining({
          assetId: undefined,
          bucketId: "brand",
          name: "Campaign draft.txt",
          source: "file",
          tags: [],
          type: undefined,
        }),
      ],
    });
  });

  it("maps loaded project assets into asset prep buckets for historical projects", () => {
    expect(
      getPreparedAssetsByBucket([
        makeAsset({
          id: "asset-packshot",
          name: "GlowGrip packshot.png",
          type: "image",
          mimeType: "image/png",
        }),
        makeAsset({
          id: "asset-detail",
          name: "GlowGrip detail.png",
          type: "image",
          mimeType: "image/png",
        }),
        makeAsset({
          id: "asset-demo",
          name: "GlowGrip demo.mp4",
          type: "video",
          mimeType: "video/mp4",
        }),
        makeAsset({
          id: "asset-script",
          name: "Campaign copy.txt",
          type: "reference",
          mimeType: "text/plain",
          tags: ["script"],
        }),
      ]),
    ).toEqual({
      hero: [
        expect.objectContaining({
          id: "asset-packshot",
        }),
      ],
      scene: [
        expect.objectContaining({
          id: "asset-detail",
        }),
      ],
      demo: [
        expect.objectContaining({
          id: "asset-demo",
        }),
      ],
      brand: [
        expect.objectContaining({
          id: "asset-script",
        }),
      ],
    });
  });

  it("creates an asset prep snapshot from loaded project assets", () => {
    const snapshot = createAssetPrepSnapshotFromProjectAssets([
      makeAsset({
        id: "asset-packshot",
        name: "GlowGrip packshot.png",
        type: "image",
        mimeType: "image/png",
      }),
      makeAsset({
        id: "asset-demo",
        name: "GlowGrip demo.mp4",
        type: "video",
        mimeType: "video/mp4",
      }),
    ]);

    expect(snapshot.assetIds).toEqual(["asset-packshot", "asset-demo"]);
    expect(snapshot.materials).toEqual([
      expect.objectContaining({
        assetId: "asset-packshot",
        bucketId: "hero",
        name: "GlowGrip packshot.png",
        source: "library",
      }),
      expect.objectContaining({
        assetId: "asset-demo",
        bucketId: "demo",
        name: "GlowGrip demo.mp4",
        source: "library",
      }),
    ]);
  });

  it("removes deleted assets from the current asset prep snapshot", () => {
    const snapshot = pruneAssetPrepSnapshotDeletedAssets(
      {
        assetIds: ["asset-packshot", "asset-demo", "asset-detail"],
        keywords: ["便携"],
        materials: [
          {
            assetId: "asset-packshot",
            bucketId: "hero",
            name: "GlowGrip packshot.png",
            source: "library",
            tags: ["hero"],
            type: "image",
          },
          {
            assetId: "asset-demo",
            bucketId: "demo",
            name: "GlowGrip demo.mp4",
            source: "library",
            tags: ["demo"],
            type: "video",
          },
          {
            bucketId: "brand",
            name: "品牌语气",
            source: "library",
            tags: ["brand"],
            type: "text",
          },
        ],
      },
      new Set(["asset-demo"]),
    );

    expect(snapshot.assetIds).toEqual(["asset-packshot", "asset-detail"]);
    expect(snapshot.keywords).toEqual(["便携"]);
    expect(snapshot.materials).toEqual([
      expect.objectContaining({ assetId: "asset-packshot" }),
      expect.objectContaining({ name: "品牌语气" }),
    ]);
  });

  it("requests all asset library categories for creation asset prep", () => {
    expect(getCreationAssetLibraryRefreshCategory("create")).toBe("all");
    expect(getCreationAssetLibraryRefreshCategory("assets")).toBeUndefined();
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

  it("renders searched asset matches inside the main preview grid", () => {
    const markup = renderToStaticMarkup(
      <AssetsPanel
        assetDraft={{
          type: "image",
          name: "GlowGrip packshot",
          mimeType: "image/png",
          sizeBytes: 220000,
          tags: ["product", "desk", "hero"],
        }}
        assets={[makeAsset({ id: "asset-all", type: "image", name: "All assets packshot" })]}
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
        onSearchAssets={() => undefined}
        onSearchQueryChange={() => undefined}
        onUploadAsset={() => undefined}
        searchQuery="dog"
        searchResults={[
          {
            asset: makeAsset({
              id: "asset-cos-hit",
              type: "image",
              name: "Golden retriever match",
              mimeType: "image/png",
            }),
            slices: [],
            score: 87,
            reasons: ["cos-intelligent-search"],
          },
        ]}
      />,
    );

    expect(markup).toContain("asset-grid");
    expect(markup).toContain("Golden retriever match");
    expect(markup).not.toContain("All assets packshot");
    expect(markup).not.toContain("Project asset results");
    expect(markup).not.toContain("asset-search-result");
  });

  it("shows an empty search state in the main preview grid when no assets match", () => {
    const markup = renderToStaticMarkup(
      <AssetsPanel
        assetDraft={{
          type: "image",
          name: "GlowGrip packshot",
          mimeType: "image/png",
          sizeBytes: 220000,
          tags: ["product", "desk", "hero"],
        }}
        assets={[makeAsset({ id: "asset-all", type: "image", name: "All assets packshot" })]}
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
        onSearchAssets={() => undefined}
        onSearchQueryChange={() => undefined}
        onUploadAsset={() => undefined}
        searchQuery="dog"
        searchResults={[]}
      />,
    );

    expect(markup).toContain("No images matched dog");
    expect(markup).not.toContain("Project asset results");
    expect(markup).not.toContain("All assets packshot");
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

  it("keeps asset card action controls compact so previews get more space", () => {
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    expect(styles).toMatch(/\.asset-card\s*\{[^}]*gap:\s*8px;[^}]*padding:\s*8px;/s);
    expect(styles).toMatch(/\.asset-card-actions\s*\{[^}]*gap:\s*6px;/s);
    expect(styles).toMatch(
      /\.asset-selection-control,\s*\.asset-card-delete\s*\{[^}]*width:\s*26px;[^}]*height:\s*26px;/s,
    );
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
    const wordAsset = createAssetInputFromFile(
      {
        name: "Brand campaign brief.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 5000,
      } as File,
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
    expect(wordAsset).toMatchObject({
      type: "reference",
      name: "Brand campaign brief.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(audioAsset.tags).toContain("audio");
    expect(scriptAsset.tags).toContain("script");
    expect(wordAsset.tags).toContain("script");
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
        hasSearched={false}
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
    expect(markup).toContain("selected assets import directly to Tencent COS");
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

  it("renders clickable inspiration session history with previous model artifacts", () => {
    const markup = renderToStaticMarkup(
      <InspirationPanel
        apiConfig={createDefaultApiConfig()}
        language="en"
        initialHistory={[
          {
            savedAt: "2026-05-26T15:00:00.000Z",
            result: {
              id: "inspiration-result-1",
              prompt: "Minimal desk setup product hero image",
              assetType: "image",
              model: "seedream-demo",
              provider: "mock",
              fallback: { used: false },
              materials: [
                {
                  id: "material-1",
                  type: "image",
                  title: "Hero image",
                  content: "A clean product hero concept",
                  status: "ready",
                  url: "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E",
                },
              ],
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("inspiration-workspace");
    expect(markup).toContain("inspiration-history-sidebar");
    expect(markup).toContain("inspiration-history-list vertical");
    expect(markup).toContain("Session history");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("1 session");
    expect(markup).toContain("Minimal desk setup product hero image");
    expect(markup).toContain("1 image artifact");
    expect(markup).toContain("Previous conversations and generated artifacts");
    expect(markup).not.toContain("Generated material");
  });

  it("keeps inspiration session history as a full-height right rail", () => {
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    expect(styles).toMatch(
      /\.inspiration-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(340px,\s*410px\);[^}]*min-height:\s*calc\(100dvh - 108px\);/s,
    );
    expect(styles).toMatch(
      /\.inspiration-history-sidebar\s*\{[^}]*height:\s*100%;[^}]*max-height:\s*calc\(100dvh - 108px\);/s,
    );
    expect(styles).toMatch(/\.inspiration-session-history\s*\{[^}]*min-height:\s*100%;/s);
  });

  it("renders inspiration artifacts without output type labels when history is open", () => {
    const markup = renderToStaticMarkup(
      <InspirationPanel
        apiConfig={createDefaultApiConfig()}
        initialHistoryOpen
        language="en"
        initialHistory={[
          {
            savedAt: "2026-05-26T15:00:00.000Z",
            result: {
              id: "inspiration-result-2",
              prompt: "Minimal desk setup product hero image",
              assetType: "image",
              model: "seedream-demo",
              provider: "mock",
              fallback: { used: false },
              materials: [
                {
                  id: "material-2",
                  type: "image",
                  title: "Hero image",
                  content: "A clean product hero concept",
                  status: "ready",
                  url: "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E",
                },
              ],
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("Generated material");
    expect(markup).toContain("image-result-grid");
    expect(markup).not.toContain("Image output");
  });

  it("updates an inspiration history entry when a generated artifact changes", () => {
    const history = replaceInspirationSessionHistoryResult(
      [
        {
          savedAt: "2026-05-26T15:00:00.000Z",
          result: {
            id: "video-result-1",
            prompt: "Create a product launch video",
            assetType: "video",
            model: "seedance-demo",
            provider: "mock",
            fallback: { used: false },
            materials: [
              {
                id: "video-material-1",
                type: "video",
                title: "Processing video",
                content: "Task is still running",
                status: "processing",
                taskId: "task-1",
                progress: 10,
              },
            ],
          },
        },
      ],
      {
        id: "video-result-1",
        prompt: "Create a product launch video",
        assetType: "video",
        model: "seedance-demo",
        provider: "mock",
        fallback: { used: false },
        materials: [
          {
            id: "video-material-1",
            type: "video",
            title: "Ready video",
            content: "Video is ready",
            status: "ready",
            url: "https://example.test/video.mp4",
            progress: 100,
          },
        ],
      },
    );

    expect(history[0]?.savedAt).toBe("2026-05-26T15:00:00.000Z");
    expect(history[0]?.result.materials[0]?.status).toBe("ready");
    expect(history[0]?.result.materials[0]?.url).toBe("https://example.test/video.mp4");
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
    expect(assetMatchesCategory(makeAsset({ mimeType: "application/pdf" }), "script")).toBe(true);
    expect(
      assetMatchesCategory(
        makeAsset({
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        "script",
      ),
    ).toBe(true);
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

  it("classifies text external results into the script category", () => {
    const textResult: ExternalAssetResult = {
      id: "pexels:text:script-1",
      source: "pexels",
      externalId: "script-1",
      type: "text",
      title: "Launch script",
      thumbnailUrl: "",
      previewUrl: "https://www.pexels.com/script/preview.txt",
      downloadUrl: "https://www.pexels.com/script/download.txt",
      externalUrl: "https://www.pexels.com/script/script-1/",
      authorName: "Script Creator",
      licenseLabel: "Pexels License",
      canUseCommercially: true,
      requiresAttribution: false,
      tags: ["script"],
    };

    expect(externalAssetMatchesCategory(textResult, "script")).toBe(true);
    expect(externalAssetMatchesCategory(textResult, "image")).toBe(false);
    expect(externalAssetMatchesCategory(textResult, "video")).toBe(false);
    expect(externalAssetMatchesCategory(textResult, "audio")).toBe(false);
  });
});
