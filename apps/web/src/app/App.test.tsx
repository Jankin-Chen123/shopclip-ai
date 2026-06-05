import type {
  AssetMetadata,
  ExternalAssetResult,
  ProjectSummary,
  ReferenceVideo,
  SmartEditPlan,
  StoryboardScene,
  ViralTemplate,
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
import {
  AssetsPanel,
  hasSearchableStockProviderCredential,
  parseReferenceScriptPreview,
} from "../features/assets/AssetsPanel";
import {
  InspirationPanel,
  replaceInspirationSessionHistoryResult,
} from "../features/inspiration/InspirationPanel";
import {
  SmartEditPanel,
  applySmartEditCommandHistoryRedo,
  applySmartEditCommandHistoryUndo,
  copySmartEditSegmentsToClipboard,
  createSmartEditCommandHistory,
  duplicateSmartEditSegmentOnTimeline,
  duplicateSmartEditSegmentsOnTimeline,
  moveSmartEditSegmentOnTimeline,
  moveSmartEditSegmentOnTimelineWithMode,
  moveSmartEditTrackClipOnTimeline,
  pasteSmartEditClipboardAtPlayhead,
  pasteSmartEditSegmentsAtPlayhead,
  splitSmartEditSegmentOnTimeline,
} from "../features/edit/SmartEditPanel";
import { ProjectSetup } from "../features/projects/ProjectSetup";
import { ReferenceLibraryPanel } from "../features/references/ReferenceLibraryPanel";
import { RenderPanel, defaultVideoSettings } from "../features/render/RenderPanel";
import { ScriptPanel } from "../features/script/ScriptPanel";
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
  hasActivePendingReferenceAnalysis,
  importAndStructureFiles,
  getCreationAssetLibraryRefreshCategory,
  getCreationUsableAssets,
  getPreparedAssetsByBucket,
  getReferenceScriptAssets,
  hasUsableStockProviderCredential,
  isRenderTaskPollingActive,
  mergeReferences,
  pruneAssetPrepSnapshotDeletedAssets,
} from "./App";
import { copy } from "./i18n";
import { listReferenceVideos, regenerateScene, resolveApiDownloadUrl } from "../lib/api";
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

const makeReferenceVideo = (reference: Partial<ReferenceVideo>): ReferenceVideo => ({
  id: "reference-1",
  sourceUrl: "https://example.test/reference.mp4",
  sourcePlatform: "tiktok",
  sourceDeclaration: "Public reference URL; save structured analysis only.",
  title: "Reference clip",
  category: "Kitchen appliances",
  publicStats: {
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
  },
  status: "ready",
  createdAt: "2026-05-30T00:00:00.000Z",
  updatedAt: "2026-05-30T00:00:00.000Z",
  ...reference,
});

const makeViralTemplate = (template: Partial<ViralTemplate>): ViralTemplate => ({
  templateId: "template-1",
  name: "Identity hook fast demo",
  category: "Water cup",
  strategy: "Open with a precise buyer identity, prove the product quickly, then close with CTA.",
  factorSet: ["identity hook", "fast demo", "detail proof"],
  narrativeStructure: ["hook", "demo", "trust", "cta"],
  shotRequirements: ["0-2s product reveal", "close-up proof shot"],
  copywritingRules: ["Use short spoken lines", "Keep claims tied to owned material"],
  riskRules: ["Do not reuse public source footage"],
  sourceReferenceIds: ["reference-1"],
  ...template,
});

describe("App", () => {
  it("exports the scaffold app component", () => {
    expect(App).toBeTypeOf("function");
  });

  it("renders the P1 workspace flow landmarks", () => {
    const markup = renderToStaticMarkup(
      <App
        initialProjectHistory={[
          makeProjectSummary({
            id: "project-history-2",
            title: "Lamp holiday clip",
            productName: "Desk Halo Lamp",
            assetCount: 3,
            sceneCount: 4,
          }),
        ]}
      />,
    );

    expect(markup).toContain("Asset library");
    expect(markup).toContain("Inspiration");
    expect(markup).toContain("Project");
    expect(markup).toContain("Project portfolio");
    expect(markup).not.toContain("Open project workspace");
    expect(markup).not.toContain("page-card");
    expect(markup).not.toContain("page-hero");
    expect(markup).not.toContain("Product setup");
    expect(markup).not.toContain("Studio editor");
  });

  it("renders the loaded project detail with overview, materials, scripts, and video library tabs", () => {
    const markup = renderToStaticMarkup(
      <App
        initialLanguage="en"
        initialPage="project"
        initialProjectDetailTab="videos"
        initialProject={{
          id: "project-detail-1",
          title: "Headphone launch",
          productName: "Havit H630BT",
          audience: "commuters",
          sellingPoints: ["active noise reduction", "long battery"],
          tone: "confident",
          style: "fast desk demo",
          targetDurationSeconds: 15,
          prepKeywords: ["noise cancelling"],
          status: "ready",
          createdAt: "2026-06-02T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
          assets: [
            makeAsset({
              id: "asset-headphone-1",
              name: "Headphone hero",
              type: "image",
              url: "/assets/headphone.png",
            }),
          ],
          assetSlices: [],
          assetProcessingEvents: [],
          assetProcessingJobs: [],
          referenceVideos: [],
          viralTemplates: [],
          scripts: [],
          scenes: [],
          renderTasks: [],
        }}
      />,
    );

    expect(markup).toContain("Project ID");
    expect(markup).toContain("1 asset");
    expect(markup).toContain("0 scripts");
    expect(markup).toContain("0 videos");
    expect(markup).toContain("Project overview");
    expect(markup).toContain("Project materials");
    expect(markup).toContain("Script library");
    expect(markup).toContain("Video library");
    expect(markup).toContain("Generate video");
  });

  it("renders concept-inspired creation workspace chrome", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="en" initialPage="project" />);

    expect(markup).toContain("creation-shell");
    expect(markup).toContain("project-portfolio");
    expect(markup).not.toContain("concept-top-cta");
    expect(markup).not.toContain("language-switcher");
    expect(markup).not.toContain("AI co-pilot");
    expect(markup).not.toContain("Quality radar");
    expect(markup).not.toContain("concept-wave");
    expect(markup).not.toContain("creation-assistant");
    expect(markup).toContain("Project portfolio");
    expect(markup).toContain("Search product name or brand");
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
    expect(markup).toContain("No reference");
    expect(markup).not.toContain("Agentic");
    expect(markup).not.toContain("Viral video breakdown");
  });

  it("hides reference and template selectors when script production mode uses no reference", () => {
    const markup = renderToStaticMarkup(
      <ScriptPanel
        copy={copy.en.script}
        disabled={false}
        isLoading={false}
        isStoryboardGenerating={false}
        onGenerateScript={() => undefined}
        onGenerateStoryboard={() => undefined}
        onProductionModeChange={() => undefined}
        onReferenceChange={() => undefined}
        onScriptDraftChange={() => undefined}
        onTemplateChange={() => undefined}
        productionMode="automatic"
        referenceScriptAssets={[
          makeAsset({
            id: "asset-reference-script",
            name: "Cup reference breakdown",
            metadata: { kind: "reference_script_asset", referenceId: "reference-1" },
          }),
        ]}
        scriptDraft=""
        templates={[makeViralTemplate({})]}
      />,
    );

    expect(markup).toContain("No reference");
    expect(markup).toContain("Viral remix");
    expect(markup).toContain("Inspiration template");
    expect(markup).not.toContain("Reference video");
    expect(markup).not.toContain("Viral template");
    expect(markup).not.toContain("Agentic");
  });

  it("shows only script-library reference assets for viral remix mode", () => {
    const markup = renderToStaticMarkup(
      <ScriptPanel
        copy={copy.en.script}
        disabled={false}
        isLoading={false}
        isStoryboardGenerating={false}
        onGenerateScript={() => undefined}
        onGenerateStoryboard={() => undefined}
        onProductionModeChange={() => undefined}
        onReferenceChange={() => undefined}
        onScriptDraftChange={() => undefined}
        onTemplateChange={() => undefined}
        productionMode="viral-remix"
        referenceScriptAssets={[
          makeAsset({
            id: "asset-reference-script",
            name: "Cup reference breakdown",
            metadata: { kind: "reference_script_asset", referenceId: "reference-1" },
          }),
        ]}
        scriptDraft=""
        selectedReferenceId="reference-1"
        templates={[makeViralTemplate({ name: "Template should be hidden" })]}
      />,
    );

    expect(markup).toContain("Reference video");
    expect(markup).toContain("Cup reference breakdown");
    expect(markup).not.toContain("Viral template");
    expect(markup).not.toContain("Template should be hidden");
  });

  it("shows only template assets for inspiration template mode", () => {
    const markup = renderToStaticMarkup(
      <ScriptPanel
        copy={copy.en.script}
        disabled={false}
        isLoading={false}
        isStoryboardGenerating={false}
        onGenerateScript={() => undefined}
        onGenerateStoryboard={() => undefined}
        onProductionModeChange={() => undefined}
        onReferenceChange={() => undefined}
        onScriptDraftChange={() => undefined}
        onTemplateChange={() => undefined}
        productionMode="template"
        referenceScriptAssets={[
          makeAsset({
            id: "asset-reference-script",
            name: "Reference should be hidden",
            metadata: { kind: "reference_script_asset", referenceId: "reference-1" },
          }),
        ]}
        scriptDraft=""
        selectedTemplateId="template-1"
        templates={[makeViralTemplate({ name: "Cup proof template" })]}
      />,
    );

    expect(markup).toContain("Viral template");
    expect(markup).toContain("Cup proof template");
    expect(markup).not.toContain("Reference video");
    expect(markup).not.toContain("Reference should be hidden");
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
              videoUrl:
                "https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/long-provider-url.mp4?Signature=secret",
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
    expect(markup).toContain('<video controls="" playsInline="" preload="metadata" src="https://cos.example.test/export.mp4">');
    expect(markup).toContain("Technical details");
    expect(markup).not.toContain(
      "<span>https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com",
    );
    expect(markup).not.toContain("Signature=secret");
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

  it("reports non-JSON gateway errors without leaking JSON parser noise", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html><body><h1>504 Gateway Time-out</h1></body></html>", {
            status: 504,
            statusText: "Gateway Time-out",
            headers: { "content-type": "text/html" },
          }),
      ),
    );

    await expect(listReferenceVideos()).rejects.toThrow(
      /HTTP 504 Gateway Time-out.*HTML error page/,
    );
    await expect(listReferenceVideos()).rejects.not.toThrow(/Unexpected token/);
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

  it("keeps only ready reference script assets available for viral remix selection", () => {
    const assets = getReferenceScriptAssets([
      makeAsset({
        id: "script-asset-ready",
        name: "Ready reference script",
        metadata: { kind: "reference_script_asset", referenceId: "reference-ready" },
      }),
      makeAsset({
        id: "script-asset-processing",
        status: "processing",
        metadata: { kind: "reference_script_asset", referenceId: "reference-processing" },
      }),
      makeAsset({
        id: "regular-script",
        metadata: { kind: "merchant_script_asset", referenceId: "reference-other" },
      }),
    ]);

    expect(assets.map((asset) => asset.id)).toEqual(["script-asset-ready"]);
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

  it("keeps the script asset library focused on script reuse actions", () => {
    const markup = renderToStaticMarkup(
      <AssetsPanel
        assetDraft={{
          type: "reference",
          name: "Cup hook script",
          mimeType: "text/plain",
          sizeBytes: 1200,
          tags: ["script", "copy"],
        }}
        assets={[
          makeAsset({
            id: "asset-script",
            type: "reference",
            name: "Cup hook script",
            mimeType: "text/plain",
            tags: ["script", "copy"],
          }),
        ]}
        copy={copy.en.assets}
        disabled={false}
        hasProject
        hasSearched={false}
        isLoading={false}
        isSearching={false}
        language="en"
        activeCategory="script"
        onAssetDraftChange={() => undefined}
        onDeleteAssets={() => undefined}
        onExtractTemplateFromScripts={() => undefined}
        onImportFiles={() => undefined}
        onProcessAsset={() => undefined}
        onSearchAssets={() => undefined}
        onSearchQueryChange={() => undefined}
        onUploadAsset={() => undefined}
        searchQuery=""
        searchResults={[]}
      />,
    );

    expect(markup).toContain("Script library");
    expect(markup).not.toContain("asset-library-toolbar");
    expect(markup).not.toContain("Search script library");
    expect(markup).not.toContain("Search external stock assets");
    expect(markup).not.toContain("Run structured analysis for Cup hook script");

    const extractIndex = markup.indexOf("Extract template");
    const deleteIndex = markup.indexOf("Delete selected");

    expect(extractIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(extractIndex);
  });

  it("renders templates as a first-class asset library section", () => {
    const markup = renderToStaticMarkup(
      <AssetsPanel
        assetDraft={{
          type: "reference",
          name: "Script reference",
          mimeType: "text/plain",
          sizeBytes: 220000,
          tags: ["script", "copy"],
        }}
        assets={[]}
        copy={copy.en.assets}
        disabled={false}
        hasProject={false}
        hasSearched={false}
        isLoading={false}
        isSearching={false}
        language="en"
        activeCategory="template"
        onAssetDraftChange={() => undefined}
        onImportFiles={() => undefined}
        onSearchAssets={() => undefined}
        onSearchQueryChange={() => undefined}
        onUploadAsset={() => undefined}
        searchQuery=""
        searchResults={[]}
        templates={[makeViralTemplate({})]}
      />,
    );

    expect(markup).toContain("Template library");
    expect(markup).toContain("Identity hook fast demo");
    expect(markup).toContain("Open with a precise buyer identity");
    expect(markup).toContain("hook → demo → trust → cta");
    expect(markup).not.toContain("Import assets");
    expect(markup).not.toContain("Search external stock assets");
  });

  it("renders smart edit timeline controls without mojibake separators and constrains duration inputs", () => {
    const markup = renderToStaticMarkup(
      <SmartEditPanel
        assets={[
          makeAsset({
            id: "asset-image",
            name: "Cup hero.png",
            type: "image",
            url: "https://cdn.example.test/cup.png",
          }),
        ]}
        assetSlices={[]}
        copy={copy.en.smartEdit}
        disabled={false}
        instructions=""
        isEditing={false}
        isRefreshing={false}
        mediaSettings={{
          bgmTrack: "creator-pop",
          subtitleStyle: "clean-lower-third",
          subtitlesEnabled: true,
          ttsVoice: "clear-host",
        }}
        result={{
          exportUrl: "https://cdn.example.test/export.mp4",
          previewUrl: "https://cdn.example.test/export.mp4",
          renderTaskId: "render-smart-edit",
          segmentOutputs: [],
          traceEvents: [],
          plan: {
            id: "plan-1",
            projectId: "project-1",
            strategy: "Use a compact product edit.",
            targetDurationSeconds: 8,
            createdAt: "2026-06-02T00:00:00.000Z",
            audio: {
              bgmTrack: "creator-pop",
              targetLanguage: "zh-CN",
              voice: "clear-host",
            },
            segments: [
              {
                id: "segment-1",
                sceneId: "scene-1",
                order: 1,
                enabled: true,
                durationSeconds: 4,
                transition: "cut",
                subtitle: "Cute cup hook",
                voiceover: "Cute cup hook",
                source: {
                  assetId: "asset-image",
                  imageUrl: "https://cdn.example.test/cup.png",
                  kind: "image-asset",
                },
                assetTags: ["hero"],
                rationale: "Use the hero image.",
              },
            ],
          },
        }}
        selectedSegmentId="segment-1"
        targetLanguage="zh-CN"
        traceEvents={[]}
        onInstructionsChange={() => undefined}
        onMediaSettingsChange={() => undefined}
        onPlanChange={() => undefined}
        onRefreshSegment={() => undefined}
        onSelectedSegmentChange={() => undefined}
        onStartSmartEdit={() => undefined}
        onTargetLanguageChange={() => undefined}
      />,
    );

    expect(markup).toContain('min="0.25"');
    expect(markup).toContain('max="120"');
    expect(markup).toContain("Hide caption in export");
    expect(markup).toContain("Hide track");
    expect(markup).toContain("Selected segment live preview");
    expect(markup).toContain('src="https://cdn.example.test/cup.png"');
    expect(markup).toContain('alt="Cup hero.png"');
    expect(markup).toContain("Cute cup hook");
    expect(markup).not.toContain("路");
  });

  it("renders a track stack with target and source time ranges for smart edit review", () => {
    const markup = renderToStaticMarkup(
      <SmartEditPanel
        assets={[
          makeAsset({
            id: "asset-video",
            name: "Cup demo.mp4",
            type: "video",
            url: "https://cdn.example.test/cup-demo.mp4",
          }),
        ]}
        assetSlices={[
          {
            id: "slice-demo",
            assetId: "asset-video",
            label: "Demo pour",
            startSecond: 1.25,
            endSecond: 3.25,
            tags: ["demo"],
            searchText: "cup pour demo",
          },
        ]}
        copy={copy.en.smartEdit}
        disabled={false}
        instructions=""
        isEditing={false}
        isRefreshing={false}
        mediaSettings={{
          bgmTrack: "tech-pulse",
          subtitleStyle: "clean-lower-third",
          subtitlesEnabled: true,
          ttsVoice: "clear-host",
        }}
        result={{
          exportUrl: "https://cdn.example.test/export.mp4",
          previewUrl: "https://cdn.example.test/export.mp4",
          renderTaskId: "render-smart-edit",
          segmentOutputs: [],
          traceEvents: [],
          plan: {
            id: "plan-1",
            projectId: "project-1",
            strategy: "Use a compact product edit.",
            targetDurationSeconds: 8,
            createdAt: "2026-06-02T00:00:00.000Z",
            audio: {
              bgmTrack: "tech-pulse",
              targetLanguage: "zh-CN",
              voice: "clear-host",
            },
            segments: [
              {
                id: "segment-1",
                sceneId: "scene-1",
                order: 1,
                enabled: true,
                durationSeconds: 4,
                transition: "crossfade",
                subtitle: "Pour test hook",
                voiceover: "Pour test hook",
                source: {
                  assetId: "asset-video",
                  kind: "video-slice",
                  sceneClipAudioUrl: "https://cdn.example.test/scene-1-audio.m4a",
                  sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-1-video.mp4",
                  sliceId: "slice-demo",
                  startSecond: 1.25,
                  endSecond: 3.25,
                },
                assetTags: ["demo"],
                rationale: "Use the product pour slice.",
              },
            ],
          },
        }}
        selectedSegmentId="segment-1"
        targetLanguage="zh-CN"
        traceEvents={[]}
        onInstructionsChange={() => undefined}
        onMediaSettingsChange={() => undefined}
        onPlanChange={() => undefined}
        onRefreshSegment={() => undefined}
        onSelectedSegmentChange={() => undefined}
        onStartSmartEdit={() => undefined}
        onTargetLanguageChange={() => undefined}
      />,
    );

    expect(markup).toContain("Track stack");
    expect(markup).toContain("Video track");
    expect(markup).toContain("Source audio track");
    expect(markup).toContain("Caption track");
    expect(markup).toContain("Voice track");
    expect(markup).toContain("BGM track");
    expect(markup).toContain("00:00.0-00:04.0");
    expect(markup).toContain("source 00:01.3-00:03.3");
    expect(markup).toContain("Cup demo.mp4");
    expect(markup).toContain("Scene 1 audio");
    expect(markup).toContain("source audio material");
    expect(markup).toContain("role=\"button\"");
    expect(markup).toContain("tech-pulse");
  });

  it("moves a smart edit segment horizontally while snapping away from overlaps", () => {
    const plan: SmartEditPlan = {
      id: "plan-1",
      projectId: "project-1",
      strategy: "Use a compact product edit.",
      targetDurationSeconds: 8,
      createdAt: "2026-06-02T00:00:00.000Z",
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [
        {
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          enabled: true,
          durationSeconds: 4,
          timelineStartSecond: 0,
          playbackRate: 1,
          sourceAudioMuted: false,
          captionHidden: false,
          captionStartOffsetSeconds: 0,
          voiceoverStartOffsetSeconds: 0,
          transition: "cut",
          subtitle: "Hook",
          voiceover: "Hook",
          source: {
            assetId: "asset-image",
            imageUrl: "https://cdn.example.test/cup.png",
            kind: "image-asset",
          },
          assetTags: ["hero"],
          rationale: "Use the hero image.",
        },
        {
          id: "segment-2",
          sceneId: "scene-2",
          order: 2,
          enabled: true,
          durationSeconds: 4,
          timelineStartSecond: 4,
          playbackRate: 1,
          sourceAudioMuted: false,
          captionHidden: false,
          captionStartOffsetSeconds: 0,
          voiceoverStartOffsetSeconds: 0,
          transition: "fade",
          subtitle: "CTA",
          voiceover: "CTA",
          source: {
            assetId: "asset-image",
            imageUrl: "https://cdn.example.test/cup.png",
            kind: "image-asset",
          },
          assetTags: ["hero"],
          rationale: "Use the hero image.",
        },
      ],
    };

    const nextPlan = moveSmartEditSegmentOnTimeline(plan, "segment-2", -1.25);

    expect(nextPlan.segments.map((segment) => segment.timelineStartSecond)).toEqual([0, 4]);
    expect(nextPlan.targetDurationSeconds).toBe(8);
    expect(nextPlan.timeline?.elements.find((element) => element.id === "segment-2-video")?.startSecond).toBe(4);
    expect(nextPlan.timeline?.durationSeconds).toBe(8);

    const snappedToPlayheadPlan = moveSmartEditSegmentOnTimeline(plan, "segment-2", 1.95, 6);

    expect(snappedToPlayheadPlan.segments.map((segment) => segment.timelineStartSecond)).toEqual([0, 6]);
    expect(snappedToPlayheadPlan.timeline?.durationSeconds).toBe(10);
  });

  it("supports insert and overwrite timeline edit modes for segment moves", () => {
    const baseSegment = {
      assetTags: ["hero"],
      captionHidden: false,
      captionStartOffsetSeconds: 0,
      durationSeconds: 3,
      enabled: true,
      playbackRate: 1,
      rationale: "Use the hero image.",
      source: {
        assetId: "asset-image",
        imageUrl: "https://cdn.example.test/cup.png",
        kind: "image-asset" as const,
      },
      sourceAudioMuted: false,
      transition: "cut" as const,
      voiceoverStartOffsetSeconds: 0,
    };
    const plan: SmartEditPlan = {
      id: "plan-1",
      projectId: "project-1",
      strategy: "Use a compact product edit.",
      targetDurationSeconds: 9,
      createdAt: "2026-06-02T00:00:00.000Z",
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [
        {
          ...baseSegment,
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          subtitle: "Hook",
          timelineStartSecond: 0,
          voiceover: "Hook",
        },
        {
          ...baseSegment,
          id: "segment-2",
          sceneId: "scene-2",
          order: 2,
          subtitle: "Demo",
          timelineStartSecond: 3,
          voiceover: "Demo",
        },
        {
          ...baseSegment,
          id: "segment-3",
          sceneId: "scene-3",
          order: 3,
          subtitle: "CTA",
          timelineStartSecond: 6,
          voiceover: "CTA",
        },
      ],
    };

    const insertPlan = moveSmartEditSegmentOnTimelineWithMode(
      plan,
      "segment-3",
      -4,
      "insert",
    );

    expect(insertPlan.segments.map((segment) => segment.id)).toEqual([
      "segment-1",
      "segment-3",
      "segment-1-insert-split-move-segment-3",
      "segment-2",
    ]);
    expect(insertPlan.segments.map((segment) => segment.timelineStartSecond)).toEqual([0, 2, 5, 6]);
    expect(insertPlan.segments.map((segment) => segment.durationSeconds)).toEqual([2, 3, 1, 3]);
    expect(insertPlan.segments.map((segment) => segment.enabled)).toEqual([true, true, true, true]);
    expect(insertPlan.timeline?.durationSeconds).toBe(9);

    const overwritePlan = moveSmartEditSegmentOnTimelineWithMode(
      plan,
      "segment-3",
      -4,
      "overwrite",
    );

    expect(overwritePlan.segments.map((segment) => segment.timelineStartSecond)).toEqual([0, 3, 2]);
    expect(overwritePlan.segments.map((segment) => segment.enabled)).toEqual([false, false, true]);
    expect(overwritePlan.timeline?.elements.map((element) => element.segmentId)).toEqual([
      "segment-3",
      "segment-3",
      "segment-3",
    ]);
  });

  it("moves track-level source audio with its segment and offsets caption material independently", () => {
    const plan: SmartEditPlan = {
      id: "plan-1",
      projectId: "project-1",
      strategy: "Use a compact product edit.",
      targetDurationSeconds: 8,
      createdAt: "2026-06-02T00:00:00.000Z",
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [
        {
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          enabled: true,
          durationSeconds: 4,
          timelineStartSecond: 0,
          playbackRate: 1,
          sourceAudioMuted: false,
          captionHidden: false,
          captionStartOffsetSeconds: 0.2,
          voiceoverStartOffsetSeconds: 0,
          transition: "cut",
          subtitle: "Hook",
          voiceover: "Hook",
          source: {
            kind: "generated-scene-clip",
            sceneClipAudioUrl: "https://cdn.example.test/scene-1.m4a",
            sceneClipUrl: "https://cdn.example.test/scene-1.mp4",
            sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-1-video.mp4",
            startSecond: 0,
            endSecond: 4,
          },
          assetTags: ["hero"],
          rationale: "Use the rendered scene clip.",
        },
        {
          id: "segment-2",
          sceneId: "scene-2",
          order: 2,
          enabled: true,
          durationSeconds: 4,
          timelineStartSecond: 4,
          playbackRate: 1,
          sourceAudioMuted: false,
          captionHidden: false,
          captionStartOffsetSeconds: 0,
          voiceoverStartOffsetSeconds: 0,
          transition: "cut",
          subtitle: "Demo",
          voiceover: "Demo",
          source: {
            kind: "generated-scene-clip",
            sceneClipAudioUrl: "https://cdn.example.test/scene-2.m4a",
            sceneClipUrl: "https://cdn.example.test/scene-2.mp4",
            sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-2-video.mp4",
            startSecond: 0,
            endSecond: 4,
          },
          assetTags: ["demo"],
          rationale: "Use the rendered scene clip.",
        },
      ],
    };

    const movedSourceAudioPlan = moveSmartEditTrackClipOnTimeline(
      plan,
      { segmentId: "segment-2", trackId: "sourceAudio" },
      2,
    );

    expect(movedSourceAudioPlan.segments.map((segment) => segment.timelineStartSecond)).toEqual([0, 4]);
    expect(movedSourceAudioPlan.segments[1]?.sourceAudioStartOffsetSeconds).toBe(2);
    expect(
      movedSourceAudioPlan.timeline?.elements.find((element) => element.id === "segment-2-audio")?.startSecond,
    ).toBe(6);
    expect(
      movedSourceAudioPlan.timeline?.elements.find((element) => element.id === "segment-2-video")?.startSecond,
    ).toBe(4);

    const movedCaptionPlan = moveSmartEditTrackClipOnTimeline(
      plan,
      { segmentId: "segment-1", trackId: "caption" },
      0.7,
    );

    expect(movedCaptionPlan.segments[0]?.timelineStartSecond).toBe(0);
    expect(movedCaptionPlan.segments[0]?.captionStartOffsetSeconds).toBe(0.9);
    expect(
      movedCaptionPlan.timeline?.elements.find((element) => element.id === "segment-1-text")?.startSecond,
    ).toBe(0.9);

    const trimmedCaptionPlan = moveSmartEditTrackClipOnTimeline(
      {
        ...plan,
        segments: [
          {
            ...plan.segments[0]!,
            captionDurationSeconds: 1.5,
          },
          plan.segments[1]!,
        ],
      },
      { segmentId: "segment-1", trackId: "caption" },
      0.4,
    );

    expect(
      trimmedCaptionPlan.timeline?.elements.find((element) => element.id === "segment-1-text")?.durationSeconds,
    ).toBe(1.5);
  });

  it("preserves persistent smart edit timeline elements when moving a track clip", () => {
    const plan: SmartEditPlan = {
      id: "plan-1",
      projectId: "project-1",
      strategy: "Use independently edited timeline elements.",
      targetDurationSeconds: 7,
      createdAt: "2026-06-05T00:00:00.000Z",
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [
        {
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          enabled: true,
          durationSeconds: 4,
          timelineStartSecond: 0,
          playbackRate: 1,
          sourceAudioMuted: false,
          captionHidden: false,
          captionStartOffsetSeconds: 0,
          voiceoverStartOffsetSeconds: 0,
          transition: "cut",
          subtitle: "Segment caption",
          voiceover: "Segment voice",
          source: {
            kind: "generated-scene-clip",
            sceneClipAudioUrl: "https://cdn.example.test/scene-1.m4a",
            sceneClipUrl: "https://cdn.example.test/scene-1.mp4",
            sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-1-video.mp4",
            startSecond: 0,
            endSecond: 4,
          },
          assetTags: ["hero"],
          rationale: "Use the rendered scene clip.",
        },
      ],
      timeline: {
        scale: 1,
        durationSeconds: 7,
        tracks: [
          { hidden: false, id: "video-main", kind: "video", label: "Video", locked: false, muted: false },
          { hidden: false, id: "text-copy", kind: "text", label: "Text", locked: false, muted: false },
        ],
        elements: [
          {
            detachedAudio: false,
            durationSeconds: 4,
            hidden: false,
            id: "persisted-video",
            kind: "video",
            label: "Persisted video",
            muted: false,
            playbackRate: 1,
            sceneId: "scene-1",
            segmentId: "segment-1",
            sourceUrl: "https://cdn.example.test/scene-1-video.mp4",
            startSecond: 1,
            trackId: "video-main",
            trimStartSecond: 0,
          },
          {
            detachedAudio: false,
            durationSeconds: 1.5,
            hidden: false,
            id: "persisted-caption",
            kind: "text",
            label: "Edited caption",
            muted: false,
            playbackRate: 1,
            sceneId: "scene-1",
            segmentId: "segment-1",
            startSecond: 2,
            text: "Edited caption",
            trackId: "text-copy",
            trimStartSecond: 0,
          },
        ],
      },
    };

    const moved = moveSmartEditTrackClipOnTimeline(
      plan,
      { segmentId: "segment-1", trackId: "caption" },
      0.5,
    );

    expect(moved.timeline?.elements.map((element) => element.id)).toEqual([
      "persisted-video",
      "persisted-caption",
    ]);
    expect(moved.timeline?.elements.find((element) => element.id === "persisted-caption")).toMatchObject({
      durationSeconds: 1.5,
      startSecond: 2.5,
      text: "Edited caption",
    });
    expect(moved.segments[0]?.captionStartOffsetSeconds).toBe(1.5);
  });

  it("splits persistent smart edit timeline elements at the playhead", () => {
    const plan: SmartEditPlan = {
      id: "plan-1",
      projectId: "project-1",
      strategy: "Use independently edited timeline elements.",
      targetDurationSeconds: 7,
      createdAt: "2026-06-05T00:00:00.000Z",
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [
        {
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          enabled: true,
          durationSeconds: 4,
          timelineStartSecond: 1,
          playbackRate: 1,
          sourceAudioMuted: false,
          captionHidden: false,
          captionStartOffsetSeconds: 0,
          voiceoverStartOffsetSeconds: 0,
          transition: "cut",
          subtitle: "Segment caption",
          voiceover: "Segment voice",
          source: {
            kind: "generated-scene-clip",
            sceneClipAudioUrl: "https://cdn.example.test/scene-1.m4a",
            sceneClipUrl: "https://cdn.example.test/scene-1.mp4",
            sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-1-video.mp4",
            startSecond: 0,
            endSecond: 4,
          },
          assetTags: ["hero"],
          rationale: "Use the rendered scene clip.",
        },
      ],
      timeline: {
        scale: 1,
        durationSeconds: 7,
        tracks: [
          { hidden: false, id: "video-main", kind: "video", label: "Video", locked: false, muted: false },
          { hidden: false, id: "audio-source", kind: "audio", label: "Source audio", locked: false, muted: false },
          { hidden: false, id: "text-copy", kind: "text", label: "Text", locked: false, muted: false },
        ],
        elements: [
          {
            detachedAudio: false,
            durationSeconds: 4,
            hidden: false,
            id: "persisted-video",
            kind: "video",
            label: "Persisted video",
            muted: false,
            playbackRate: 1,
            sceneId: "scene-1",
            segmentId: "segment-1",
            sourceUrl: "https://cdn.example.test/scene-1-video.mp4",
            startSecond: 1,
            trackId: "video-main",
            trimEndSecond: 4,
            trimStartSecond: 0,
          },
          {
            detachedAudio: true,
            durationSeconds: 4,
            hidden: false,
            id: "persisted-source-audio",
            kind: "audio",
            label: "Persisted source audio",
            muted: false,
            playbackRate: 1,
            sceneId: "scene-1",
            segmentId: "segment-1",
            sourceUrl: "https://cdn.example.test/scene-1.m4a",
            startSecond: 1,
            trackId: "audio-source",
            trimEndSecond: 4,
            trimStartSecond: 0,
          },
          {
            detachedAudio: false,
            durationSeconds: 1.5,
            hidden: false,
            id: "persisted-caption",
            kind: "text",
            label: "Edited caption",
            muted: false,
            playbackRate: 1,
            sceneId: "scene-1",
            segmentId: "segment-1",
            startSecond: 2.5,
            text: "Edited caption",
            trackId: "text-copy",
            trimStartSecond: 0,
          },
          {
            detachedAudio: false,
            durationSeconds: 0.75,
            hidden: false,
            id: "right-caption",
            kind: "text",
            label: "Right caption",
            muted: false,
            playbackRate: 1,
            sceneId: "scene-1",
            segmentId: "segment-1",
            startSecond: 4,
            text: "Right caption",
            trackId: "text-copy",
            trimStartSecond: 0,
          },
        ],
      },
    };

    const split = splitSmartEditSegmentOnTimeline(plan, "segment-1", 2.5, "token-1");

    expect(split?.segments.map((segment) => segment.id)).toEqual([
      "segment-1",
      "segment-1-split-token-1",
    ]);
    expect(split?.segments.map((segment) => segment.durationSeconds)).toEqual([2.5, 1.5]);
    expect(split?.segments.map((segment) => segment.timelineStartSecond)).toEqual([1, 3.5]);
    expect(split?.timeline?.elements.map((element) => element.id)).toEqual([
      "persisted-video",
      "persisted-video-split-token-1",
      "persisted-source-audio",
      "persisted-source-audio-split-token-1",
      "persisted-caption",
      "persisted-caption-split-token-1",
      "right-caption",
    ]);
    expect(split?.timeline?.elements.find((element) => element.id === "persisted-video")).toMatchObject({
      durationSeconds: 2.5,
      segmentId: "segment-1",
      startSecond: 1,
      trimEndSecond: 2.5,
      trimStartSecond: 0,
    });
    expect(split?.timeline?.elements.find((element) => element.id === "persisted-video-split-token-1")).toMatchObject({
      durationSeconds: 1.5,
      segmentId: "segment-1-split-token-1",
      startSecond: 3.5,
      trimEndSecond: 4,
      trimStartSecond: 2.5,
    });
    expect(split?.timeline?.elements.find((element) => element.id === "persisted-caption")).toMatchObject({
      durationSeconds: 1,
      segmentId: "segment-1",
      startSecond: 2.5,
    });
    expect(split?.timeline?.elements.find((element) => element.id === "persisted-caption-split-token-1")).toMatchObject({
      durationSeconds: 0.5,
      segmentId: "segment-1-split-token-1",
      startSecond: 3.5,
      text: "Edited caption",
    });
    expect(split?.timeline?.elements.find((element) => element.id === "right-caption")).toMatchObject({
      segmentId: "segment-1-split-token-1",
      startSecond: 4,
    });
  });

  it("duplicates persistent smart edit timeline elements with their segment clip", () => {
    const plan: SmartEditPlan = {
      id: "plan-1",
      projectId: "project-1",
      strategy: "Use independently edited timeline elements.",
      targetDurationSeconds: 7,
      createdAt: "2026-06-05T00:00:00.000Z",
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [
        {
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          enabled: true,
          durationSeconds: 4,
          timelineStartSecond: 1,
          playbackRate: 1,
          sourceAudioMuted: false,
          captionHidden: false,
          captionStartOffsetSeconds: 0,
          voiceoverStartOffsetSeconds: 0,
          transition: "cut",
          subtitle: "Segment caption",
          voiceover: "Segment voice",
          source: {
            kind: "generated-scene-clip",
            sceneClipAudioUrl: "https://cdn.example.test/scene-1.m4a",
            sceneClipUrl: "https://cdn.example.test/scene-1.mp4",
            sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-1-video.mp4",
            startSecond: 0,
            endSecond: 4,
          },
          assetTags: ["hero"],
          rationale: "Use the rendered scene clip.",
        },
      ],
      timeline: {
        scale: 1,
        durationSeconds: 7,
        tracks: [
          { hidden: false, id: "video-main", kind: "video", label: "Video", locked: false, muted: false },
          { hidden: false, id: "text-copy", kind: "text", label: "Text", locked: false, muted: false },
        ],
        elements: [
          {
            detachedAudio: false,
            durationSeconds: 4,
            hidden: false,
            id: "persisted-video",
            kind: "video",
            label: "Persisted video",
            muted: false,
            playbackRate: 1,
            sceneId: "scene-1",
            segmentId: "segment-1",
            sourceUrl: "https://cdn.example.test/scene-1-video.mp4",
            startSecond: 1,
            trackId: "video-main",
            trimStartSecond: 0,
          },
          {
            detachedAudio: false,
            durationSeconds: 1.5,
            hidden: false,
            id: "persisted-caption",
            kind: "text",
            label: "Edited caption",
            muted: false,
            playbackRate: 1,
            sceneId: "scene-1",
            segmentId: "segment-1",
            startSecond: 2,
            text: "Edited caption",
            trackId: "text-copy",
            trimStartSecond: 0,
          },
        ],
      },
    };

    const duplicated = duplicateSmartEditSegmentOnTimeline(plan, "segment-1", "copy-1");

    expect(duplicated.segments.map((segment) => segment.id)).toEqual([
      "segment-1",
      "segment-1-copy-1",
    ]);
    expect(duplicated.timeline?.elements.map((element) => element.id)).toEqual([
      "persisted-video",
      "persisted-caption",
      "persisted-video-copy-1",
      "persisted-caption-copy-1",
    ]);
    expect(duplicated.timeline?.elements.find((element) => element.id === "persisted-video-copy-1")).toMatchObject({
      label: "Persisted video (copy)",
      segmentId: "segment-1-copy-1",
      startSecond: 5,
      trackId: "video-main",
    });
    expect(duplicated.timeline?.elements.find((element) => element.id === "persisted-caption-copy-1")).toMatchObject({
      durationSeconds: 1.5,
      segmentId: "segment-1-copy-1",
      startSecond: 6,
      text: "Edited caption",
    });
  });

  it("copies and pastes persistent smart edit timeline elements at the playhead", () => {
    const plan: SmartEditPlan = {
      id: "plan-1",
      projectId: "project-1",
      strategy: "Use independently edited timeline elements.",
      targetDurationSeconds: 5,
      createdAt: "2026-06-05T00:00:00.000Z",
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [
        {
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          enabled: true,
          durationSeconds: 3,
          timelineStartSecond: 1,
          playbackRate: 1,
          sourceAudioMuted: false,
          captionHidden: false,
          captionStartOffsetSeconds: 0,
          voiceoverStartOffsetSeconds: 0,
          transition: "cut",
          subtitle: "Segment caption",
          voiceover: "Segment voice",
          source: {
            kind: "generated-scene-clip",
            sceneClipAudioUrl: "https://cdn.example.test/scene-1.m4a",
            sceneClipUrl: "https://cdn.example.test/scene-1.mp4",
            sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-1-video.mp4",
            startSecond: 0,
            endSecond: 3,
          },
          assetTags: ["hero"],
          rationale: "Use the rendered scene clip.",
        },
      ],
      timeline: {
        scale: 1,
        durationSeconds: 5,
        tracks: [
          { hidden: false, id: "video-main", kind: "video", label: "Video", locked: false, muted: false },
          { hidden: false, id: "text-copy", kind: "text", label: "Text", locked: false, muted: false },
        ],
        elements: [
          {
            detachedAudio: false,
            durationSeconds: 3,
            hidden: false,
            id: "persisted-video",
            kind: "video",
            label: "Persisted video",
            muted: false,
            playbackRate: 1,
            sceneId: "scene-1",
            segmentId: "segment-1",
            sourceUrl: "https://cdn.example.test/scene-1-video.mp4",
            startSecond: 1,
            trackId: "video-main",
            trimStartSecond: 0,
          },
          {
            detachedAudio: false,
            durationSeconds: 1,
            hidden: false,
            id: "persisted-caption",
            kind: "text",
            label: "Edited caption",
            muted: false,
            playbackRate: 1,
            sceneId: "scene-1",
            segmentId: "segment-1",
            startSecond: 2,
            text: "Edited caption",
            trackId: "text-copy",
            trimStartSecond: 0,
          },
        ],
      },
    };
    const clipboard = copySmartEditSegmentsToClipboard(plan, ["segment-1"]);

    const pasted = pasteSmartEditClipboardAtPlayhead(plan, clipboard, 8, "paste-1");

    expect(pasted.timeline?.elements.find((element) => element.id === "persisted-video-paste-1-1")).toMatchObject({
      label: "Persisted video (copy)",
      segmentId: "segment-1-paste-1-1",
      startSecond: 8,
    });
    expect(pasted.timeline?.elements.find((element) => element.id === "persisted-caption-paste-1-1")).toMatchObject({
      durationSeconds: 1,
      segmentId: "segment-1-paste-1-1",
      startSecond: 9,
      text: "Edited caption",
    });
  });

  it("duplicates a smart edit segment into an editable timeline clip", () => {
    const plan: SmartEditPlan = {
      id: "plan-1",
      projectId: "project-1",
      strategy: "Use a compact product edit.",
      targetDurationSeconds: 4,
      createdAt: "2026-06-02T00:00:00.000Z",
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [
        {
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          enabled: true,
          durationSeconds: 4,
          timelineStartSecond: 1,
          playbackRate: 1.5,
          sourceAudioMuted: true,
          captionHidden: false,
          captionStartOffsetSeconds: 0.4,
          voiceoverStartOffsetSeconds: 0.7,
          transition: "fade",
          subtitle: "Hook",
          voiceover: "Hook",
          source: {
            assetId: "asset-image",
            imageUrl: "https://cdn.example.test/cup.png",
            kind: "image-asset",
          },
          assetTags: ["hero"],
          rationale: "Use the hero image.",
        },
      ],
    };

    const nextPlan = duplicateSmartEditSegmentOnTimeline(plan, "segment-1", "copy-1");

    expect(nextPlan.segments).toHaveLength(2);
    expect(nextPlan.segments[1]).toMatchObject({
      id: "segment-1-copy-1",
      order: 2,
      sceneId: "scene-1",
      durationSeconds: 4,
      timelineStartSecond: 5,
      playbackRate: 1.5,
      sourceAudioMuted: true,
      captionStartOffsetSeconds: 0.4,
      voiceoverStartOffsetSeconds: 0.7,
      transition: "fade",
      subtitle: "Hook (copy)",
      voiceover: "Hook",
    });
    expect(nextPlan.timeline?.elements.find((element) => element.id === "segment-1-copy-1-video")?.startSecond).toBe(5);
    expect(nextPlan.timeline?.durationSeconds).toBe(9);
    expect(nextPlan.targetDurationSeconds).toBe(9);
  });

  it("duplicates multiple selected smart edit segments in timeline order", () => {
    const baseSegment = {
      assetTags: ["hero"],
      captionHidden: false,
      captionStartOffsetSeconds: 0,
      durationSeconds: 3,
      enabled: true,
      playbackRate: 1,
      rationale: "Use the hero image.",
      source: {
        assetId: "asset-image",
        imageUrl: "https://cdn.example.test/cup.png",
        kind: "image-asset" as const,
      },
      sourceAudioMuted: false,
      transition: "cut" as const,
      voiceoverStartOffsetSeconds: 0,
    };
    const plan: SmartEditPlan = {
      id: "plan-1",
      projectId: "project-1",
      strategy: "Use a compact product edit.",
      targetDurationSeconds: 9,
      createdAt: "2026-06-02T00:00:00.000Z",
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [
        {
          ...baseSegment,
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          subtitle: "Hook",
          timelineStartSecond: 0,
          voiceover: "Hook",
        },
        {
          ...baseSegment,
          id: "segment-2",
          sceneId: "scene-2",
          order: 2,
          subtitle: "Demo",
          timelineStartSecond: 3,
          voiceover: "Demo",
        },
        {
          ...baseSegment,
          id: "segment-3",
          sceneId: "scene-3",
          order: 3,
          subtitle: "CTA",
          timelineStartSecond: 6,
          voiceover: "CTA",
        },
      ],
    };

    const nextPlan = duplicateSmartEditSegmentsOnTimeline(
      plan,
      ["segment-1", "segment-3"],
      "batch-1",
    );

    expect(nextPlan.segments.map((segment) => segment.id)).toEqual([
      "segment-1",
      "segment-1-batch-1-1",
      "segment-2",
      "segment-3",
      "segment-3-batch-1-2",
    ]);
    expect(nextPlan.segments.map((segment) => segment.order)).toEqual([1, 2, 3, 4, 5]);
    expect(nextPlan.segments.map((segment) => segment.timelineStartSecond)).toEqual([0, 9, 3, 6, 15]);
    expect(nextPlan.timeline?.durationSeconds).toBe(18);
    expect(nextPlan.targetDurationSeconds).toBe(18);
  });

  it("pastes selected smart edit segments at the playhead while preserving relative offsets", () => {
    const baseSegment = {
      assetTags: ["hero"],
      captionHidden: false,
      captionStartOffsetSeconds: 0,
      durationSeconds: 2,
      enabled: true,
      playbackRate: 1,
      rationale: "Use the hero image.",
      source: {
        assetId: "asset-image",
        imageUrl: "https://cdn.example.test/cup.png",
        kind: "image-asset" as const,
      },
      sourceAudioMuted: false,
      transition: "cut" as const,
      voiceoverStartOffsetSeconds: 0,
    };
    const plan: SmartEditPlan = {
      id: "plan-1",
      projectId: "project-1",
      strategy: "Use a compact product edit.",
      targetDurationSeconds: 8,
      createdAt: "2026-06-02T00:00:00.000Z",
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [
        {
          ...baseSegment,
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          subtitle: "Hook",
          timelineStartSecond: 1,
          voiceover: "Hook",
        },
        {
          ...baseSegment,
          id: "segment-2",
          sceneId: "scene-2",
          order: 2,
          subtitle: "Demo",
          timelineStartSecond: 4,
          voiceover: "Demo",
        },
      ],
    };

    const nextPlan = pasteSmartEditSegmentsAtPlayhead(
      plan,
      ["segment-1", "segment-2"],
      10,
      "paste-1",
    );

    expect(nextPlan.segments.map((segment) => segment.id)).toEqual([
      "segment-1",
      "segment-2",
      "segment-1-paste-1-1",
      "segment-2-paste-1-2",
    ]);
    expect(nextPlan.segments.map((segment) => segment.timelineStartSecond)).toEqual([1, 4, 10, 13]);
    expect(nextPlan.timeline?.elements.find((element) => element.id === "segment-1-paste-1-1-video")?.startSecond).toBe(10);
    expect(nextPlan.timeline?.elements.find((element) => element.id === "segment-2-paste-1-2-video")?.startSecond).toBe(13);
    expect(nextPlan.targetDurationSeconds).toBe(15);
  });

  it("applies insert and overwrite modes when pasting selected smart edit segments", () => {
    const baseSegment = {
      assetTags: ["hero"],
      captionHidden: false,
      captionStartOffsetSeconds: 0,
      durationSeconds: 2,
      enabled: true,
      playbackRate: 1,
      rationale: "Use the hero image.",
      source: {
        assetId: "asset-image",
        imageUrl: "https://cdn.example.test/cup.png",
        kind: "image-asset" as const,
      },
      sourceAudioMuted: false,
      transition: "cut" as const,
      voiceoverStartOffsetSeconds: 0,
    };
    const plan: SmartEditPlan = {
      id: "plan-1",
      projectId: "project-1",
      strategy: "Use a compact product edit.",
      targetDurationSeconds: 8,
      createdAt: "2026-06-02T00:00:00.000Z",
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [
        {
          ...baseSegment,
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          subtitle: "Hook",
          timelineStartSecond: 0,
          voiceover: "Hook",
        },
        {
          ...baseSegment,
          id: "segment-2",
          sceneId: "scene-2",
          order: 2,
          subtitle: "Demo",
          timelineStartSecond: 2,
          voiceover: "Demo",
        },
        {
          ...baseSegment,
          id: "segment-3",
          sceneId: "scene-3",
          order: 3,
          subtitle: "CTA",
          timelineStartSecond: 4,
          voiceover: "CTA",
        },
      ],
    };

    const insertPlan = pasteSmartEditSegmentsAtPlayhead(
      plan,
      ["segment-1"],
      1,
      "insert-1",
      "insert",
    );

    expect(insertPlan.segments.map((segment) => segment.id)).toEqual([
      "segment-1",
      "segment-1-insert-1-1",
      "segment-1-insert-split-insert-1",
      "segment-2",
      "segment-3",
    ]);
    expect(insertPlan.segments.map((segment) => segment.timelineStartSecond)).toEqual([0, 1, 3, 4, 6]);
    expect(insertPlan.segments.map((segment) => segment.durationSeconds)).toEqual([1, 2, 1, 2, 2]);
    expect(insertPlan.segments.map((segment) => segment.enabled)).toEqual([true, true, true, true, true]);

    const overwritePlan = pasteSmartEditSegmentsAtPlayhead(
      plan,
      ["segment-1"],
      2,
      "overwrite-1",
      "overwrite",
    );

    expect(overwritePlan.segments.map((segment) => segment.timelineStartSecond)).toEqual([0, 2, 4, 2]);
    expect(overwritePlan.segments.map((segment) => segment.enabled)).toEqual([true, false, true, true]);
  });

  it("copies smart edit segments into a clipboard snapshot and pastes it later", () => {
    const baseSegment = {
      assetTags: ["hero"],
      captionHidden: false,
      captionStartOffsetSeconds: 0,
      durationSeconds: 2,
      enabled: true,
      playbackRate: 1,
      rationale: "Use the hero image.",
      source: {
        assetId: "asset-image",
        imageUrl: "https://cdn.example.test/cup.png",
        kind: "image-asset" as const,
      },
      sourceAudioMuted: false,
      transition: "cut" as const,
      voiceoverStartOffsetSeconds: 0,
    };
    const plan: SmartEditPlan = {
      id: "plan-1",
      projectId: "project-1",
      strategy: "Use a compact product edit.",
      targetDurationSeconds: 8,
      createdAt: "2026-06-02T00:00:00.000Z",
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [
        {
          ...baseSegment,
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          subtitle: "Hook",
          timelineStartSecond: 2,
          voiceover: "Hook",
        },
        {
          ...baseSegment,
          id: "segment-2",
          sceneId: "scene-2",
          order: 2,
          subtitle: "Demo",
          timelineStartSecond: 5,
          voiceover: "Demo",
        },
      ],
    };

    const clipboard = copySmartEditSegmentsToClipboard(plan, ["segment-1", "segment-2"]);
    const nextPlan = pasteSmartEditClipboardAtPlayhead(plan, clipboard, 12, "clip-1");

    expect(clipboard?.items.map((item) => item.segment.id)).toEqual(["segment-1", "segment-2"]);
    expect(clipboard?.items.map((item) => item.startSecond)).toEqual([2, 5]);
    expect(nextPlan.segments.map((segment) => segment.id)).toEqual([
      "segment-1",
      "segment-2",
      "segment-1-clip-1-1",
      "segment-2-clip-1-2",
    ]);
    expect(nextPlan.segments.map((segment) => segment.timelineStartSecond)).toEqual([2, 5, 12, 15]);
    expect(nextPlan.targetDurationSeconds).toBe(17);
  });

  it("tracks labeled smart edit commands for undo and redo UI", () => {
    const firstPlan = {
      id: "plan-1",
      projectId: "project-1",
      strategy: "Use a compact product edit.",
      targetDurationSeconds: 4,
      createdAt: "2026-06-02T00:00:00.000Z",
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [
        {
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          enabled: true,
          durationSeconds: 4,
          timelineStartSecond: 0,
          transition: "cut",
          subtitle: "Hook",
          voiceover: "Hook",
          source: {
            assetId: "asset-video",
            kind: "video-slice",
          },
          assetTags: ["demo"],
          rationale: "Use the product demo.",
        },
      ],
    } satisfies SmartEditPlan;
    const secondPlan = {
      ...firstPlan,
      targetDurationSeconds: 5,
      segments: [{ ...firstPlan.segments[0]!, durationSeconds: 5 }],
    } satisfies SmartEditPlan;
    const thirdPlan = {
      ...secondPlan,
      segments: [{ ...secondPlan.segments[0]!, transform: { scale: 1.2, rotateDegrees: 0, offsetXPercent: 0, offsetYPercent: 0, opacity: 1 } }],
    } satisfies SmartEditPlan;

    const history = createSmartEditCommandHistory()
      .record(firstPlan, secondPlan, "Trim clip")
      .record(secondPlan, thirdPlan, "Adjust visual transform");

    expect(history.undoLabel()).toBe("Undo Adjust visual transform");
    expect(history.redoLabel()).toBe("Redo");
    const undone = applySmartEditCommandHistoryUndo(history, thirdPlan);
    expect(undone?.plan).toBe(secondPlan);
    expect(undone?.history.undoLabel()).toBe("Undo Trim clip");
    expect(undone?.history.redoLabel()).toBe("Redo Adjust visual transform");
    const redone = applySmartEditCommandHistoryRedo(undone!.history, secondPlan);
    expect(redone?.plan).toBe(thirdPlan);
    expect(redone?.history.undoLabel()).toBe("Undo Adjust visual transform");
  });

  it("renders smart edit as an editor workspace with status, settings, and grouped inspector", () => {
    const markup = renderToStaticMarkup(
      <SmartEditPanel
        assets={[
          makeAsset({
            id: "asset-video",
            name: "Cup demo.mp4",
            type: "video",
            url: "https://cdn.example.test/cup-demo.mp4",
          }),
        ]}
        assetSlices={[]}
        copy={copy.en.smartEdit}
        disabled={false}
        instructions="Keep the hook fast and preserve the pour proof."
        isEditing={false}
        isRefreshing={false}
        mediaSettings={{
          bgmTrack: "tech-pulse",
          subtitleStyle: "clean-lower-third",
          subtitlesEnabled: true,
          ttsVoice: "clear-host",
        }}
        result={{
          exportUrl: "https://cdn.example.test/export.mp4",
          previewUrl: "https://cdn.example.test/export.mp4",
          renderTaskId: "render-smart-edit",
          segmentOutputs: [],
          traceEvents: [],
          plan: {
            id: "plan-1",
            projectId: "project-1",
            strategy: "Use a compact product edit.",
            targetDurationSeconds: 8,
            createdAt: "2026-06-02T00:00:00.000Z",
            audio: {
              bgmTrack: "tech-pulse",
              targetLanguage: "zh-CN",
              voice: "clear-host",
            },
            segments: [
              {
                id: "segment-1",
                sceneId: "scene-1",
                order: 1,
                enabled: true,
                durationSeconds: 4,
                transition: "cut",
                subtitle: "Hook with the pour",
                voiceover: "Hook with the pour",
                source: {
                  assetId: "asset-video",
                  kind: "video-slice",
                  startSecond: 1,
                  endSecond: 5,
                },
                transform: {
                  scale: 1.1,
                  rotateDegrees: -2,
                  offsetXPercent: 6,
                  offsetYPercent: -4,
                  opacity: 0.9,
                },
                effects: {
                  blur: 0.8,
                  sharpen: 0.3,
                  fadeInSeconds: 0.2,
                  fadeOutSeconds: 0.4,
                },
                visualEffects: [
                  {
                    id: "effect-brightness",
                    type: "brightness",
                    enabled: true,
                    params: {
                      amount: 0.15,
                      radius: 4,
                    },
                  },
                  {
                    id: "effect-vignette",
                    type: "vignette",
                    enabled: false,
                    params: {
                      amount: 0.65,
                      radius: 4,
                    },
                  },
                ],
                visualMask: {
                  id: "mask-focus",
                  type: "ellipse",
                  inverted: true,
                  xPercent: 50,
                  yPercent: 45,
                  widthPercent: 70,
                  heightPercent: 60,
                },
                visualKeyframes: [
                  {
                    id: "kf-start",
                    easing: "linear",
                    timeSecond: 0,
                    transform: {
                      scale: 1.1,
                      rotateDegrees: -2,
                      offsetXPercent: 6,
                      offsetYPercent: -4,
                      opacity: 0.9,
                    },
                  },
                  {
                    id: "kf-closeup",
                    easing: "linear",
                    timeSecond: 0.8,
                    transform: {
                      scale: 1.35,
                      rotateDegrees: -1,
                      offsetXPercent: 12,
                      offsetYPercent: -6,
                      opacity: 0.75,
                    },
                    effects: {
                      blur: 0,
                      sharpen: 0.5,
                      fadeInSeconds: 0,
                      fadeOutSeconds: 0,
                    },
                  },
                ],
                assetTags: ["demo"],
                rationale: "Use the product pour slice.",
              },
              {
                id: "segment-2",
                sceneId: "scene-2",
                order: 2,
                enabled: false,
                durationSeconds: 5,
                transition: "fade",
                subtitle: "Disabled outro",
                voiceover: "Disabled outro",
                source: {
                  assetId: "asset-video",
                  kind: "video-slice",
                },
                assetTags: ["outro"],
                rationale: "Optional outro.",
              },
            ],
          },
        }}
        selectedSegmentId="segment-1"
        targetLanguage="zh-CN"
        traceEvents={[]}
        onInstructionsChange={() => undefined}
        onMediaSettingsChange={() => undefined}
        onPlanChange={() => undefined}
        onRefreshSegment={() => undefined}
        onSelectedSegmentChange={() => undefined}
        onStartSmartEdit={() => undefined}
        onTargetLanguageChange={() => undefined}
      />,
    );

    expect(markup).toContain("smart-edit-status-strip");
    expect(markup).toContain("Enabled cut");
    expect(markup).toContain("4s");
    expect(markup).toContain("Selected segment");
    expect(markup).toContain("1 / 2");
    expect(markup).toContain("Source");
    expect(markup).toContain("Cup demo.mp4");
    expect(markup).toContain("Audio");
    expect(markup).toContain("tech-pulse");
    expect(markup).toContain("Edit settings");
    expect(markup).toContain("Timing and source");
    expect(markup).toContain("Visual transform");
    expect(markup).toContain("Scale");
    expect(markup).toContain("Rotation");
    expect(markup).toContain("Visual effects");
    expect(markup).toContain("Blur");
    expect(markup).toContain("Fade out");
    expect(markup).toContain("Effect stack");
    expect(markup).toContain("Add effect");
    expect(markup).toContain("Brightness");
    expect(markup).toContain("Vignette");
    expect(markup).toContain("Disabled");
    expect(markup).toContain("Visual mask");
    expect(markup).toContain("Mask type");
    expect(markup).toContain("Invert mask");
    expect(markup).toContain("Visual keyframes");
    expect(markup).toContain("Add keyframe");
    expect(markup).toContain("0.8s");
    expect(markup).toContain("Scale 1.35");
    expect(markup).toContain("Copy and voice");
    expect(markup).toContain("Segment state");
    expect(markup).toContain("Selected");
  });

  it("parses reference script assets into readable preview sections", () => {
    const preview = parseReferenceScriptPreview(
      makeAsset({
        name: "Cheap cup reference ideas",
        embeddingText: [
          "Reference: Cheap cup proof",
          "Category: Water cup",
          "Source: tiktok https://example.test/video",
          "Hook: Opens with a student budget identity.",
          "Pacing: Fast hook, compact demo, detail proof, CTA.",
          "Formula: Identity hook + price surprise + proof + CTA.",
          "Audience: students, budget buyers",
          "Viral factors: identity_label, price_anchor",
          "Reusable storyboard:",
          "1. hook 0-2s",
          "Summary: Calls out budget buyers.",
          "Copy: Bought it for cheap, but it looks premium.",
          "Visual: Close-up cup on desk.",
          "2. demo 2-8s",
          "Summary: Shows lid and straw in use.",
          "Copy: It fits my daily bag.",
          "Visual: Handheld product demo.",
          "Recreation visual: Use merchant-owned close-ups.",
          "Recreation copywriting: Keep every line short.",
          "Shooting guide: Use the method only; do not remix source footage.",
          "Comment insights: Buyers ask about cleaning.",
        ].join("\n"),
        metadata: {
          kind: "reference_script_asset",
          referenceId: "reference-1",
        },
      }),
    );

    expect(preview?.title).toBe("Cheap cup proof");
    expect(preview?.category).toBe("Water cup");
    expect(preview?.hook).toContain("student budget");
    expect(preview?.audience).toEqual(["students", "budget buyers"]);
    expect(preview?.storyboard).toHaveLength(2);
    expect(preview?.storyboard[0]).toMatchObject({
      role: "hook",
      timeRange: "0-2s",
      summary: "Calls out budget buyers.",
      copy: "Bought it for cheap, but it looks premium.",
      visual: "Close-up cup on desk.",
    });
    expect(preview?.reuseGuide.shootingGuide).toContain("do not remix");
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

  it("keeps asset preview details scrollable when metadata is long", () => {
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    expect(styles).toMatch(
      /\.external-preview-content\s*\{[^}]*max-height:\s*min\(620px,\s*calc\(100dvh - 210px\)\);[^}]*overflow:\s*hidden;/s,
    );
    expect(styles).toMatch(
      /\.external-preview-details\s*\{[^}]*max-height:\s*min\(620px,\s*calc\(100dvh - 210px\)\);[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s,
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

  it("renders only the reference video breakdown panel on the inspiration page", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="en" initialPage="inspiration" />);

    expect(markup).toContain("Viral video breakdown");
    expect(markup).toContain("Analyze reference");
    expect(markup).not.toContain("What do you want to create today?");
    expect(markup).not.toContain("Generate material");
    expect(markup).not.toContain("Session history");
    expect(markup).not.toContain("Use skills");
    expect(markup).not.toContain("Agent mode");
    expect(markup).not.toContain("Auto</button>");
    expect(markup).not.toContain("Current routing");
  });

  it("allows public reference analysis without a loaded project when the draft is complete", () => {
    const markup = renderToStaticMarkup(
      <ReferenceLibraryPanel
        disabled={false}
        initialDraft={{
          category: "Kitchen appliances",
          sourceDeclaration: "Public reference URL; save structured analysis only.",
          sourcePlatform: "tiktok",
          sourceUrl: "https://example.test/reference.mp4",
          title: "Reference clip",
        }}
        isLoading={false}
        language="en"
        onAnalyzeReference={() => undefined}
        onCreateTemplate={() => undefined}
        onUseReference={() => undefined}
        references={[makeReferenceVideo({})]}
        sourceAssets={[]}
        templates={[]}
      />,
    );

    expect(markup).toMatch(
      /<button class="button button-primary" type="button"><span class="button-icon">[\s\S]*?<span>Analyze reference<\/span><\/button>/,
    );
    expect(markup).toContain("Add to script library");
    expect(markup).toContain("Delete");
    expect(markup).toContain("Select Reference clip");
    expect(markup).toContain("Delete selected");
    expect(markup).not.toContain("Create template");
  });

  it("renders reference breakdown history with batch selection controls", () => {
    const markup = renderToStaticMarkup(
      <ReferenceLibraryPanel
        disabled={false}
        isLoading={false}
        language="en"
        onAnalyzeReference={() => undefined}
        onCreateTemplate={() => undefined}
        onDeleteReferences={() => undefined}
        onUseReference={() => undefined}
        references={[
          makeReferenceVideo({ id: "reference-1", title: "Cup hook reference" }),
          makeReferenceVideo({ id: "reference-2", title: "Bottle demo reference" }),
        ]}
        sourceAssets={[]}
        templates={[makeViralTemplate({})]}
      />,
    );

    expect(markup).toContain("Select Cup hook reference");
    expect(markup).toContain("Select Bottle demo reference");
    expect(markup).toContain("Delete selected");
    expect(markup).not.toContain("Create template");
  });

  it("renders ready reference rows with merchant-friendly fields only", () => {
    const markup = renderToStaticMarkup(
      <ReferenceLibraryPanel
        disabled={false}
        isLoading={false}
        language="en"
        onAnalyzeReference={() => undefined}
        onCreateTemplate={() => undefined}
        onUseReference={() => undefined}
        references={[
          makeReferenceVideo({
            analysis: {
              referenceId: "reference-1",
              sourceUrl: "https://example.test/reference.mp4",
              sourcePlatform: "tiktok",
              sourceDeclaration: "Public reference URL; save structured analysis only.",
              title: "Reference clip",
              publicStats: { likes: 0, comments: 0, shares: 0, views: 0 },
              durationSeconds: 12,
              category: "Kitchen appliances",
              hookScore: 0.9,
              hookAnalysis: "Technical hook analysis should not be exposed.",
              pacingAnalysis: "Technical pacing analysis should not be exposed.",
              emotionalArc: ["curiosity"],
              targetAudience: ["busy shoppers"],
              contentFormula: "Aesthetic product hook + sequential 3-second per feature demo.",
              keyViralFactors: [
                "Mute-friendly design with prominent text overlays for every key benefit",
                "Visually appealing cute cartoon prints with high shareability",
              ],
              commerceNarrativeSegments: [
                {
                  role: "hook",
                  startSecond: 0,
                  endSecond: 2,
                  summary: "Opens with a visual product reveal.",
                  copywriting: "Look at this cup",
                  visualPrompt: "Cup reveal",
                },
                {
                  role: "demo",
                  startSecond: 2,
                  endSecond: 8,
                  summary: "Shows the product in use.",
                  copywriting: "Use it daily",
                  visualPrompt: "Cup demo",
                },
              ],
              recreationBlueprint: {
                visual: "Use merchant-owned visuals.",
                copywriting: "Keep copy concise.",
                shootingGuide: "Do not remix the source video.",
              },
              commentInsights: [],
              derivedTemplates: [],
            },
            status: "ready",
          }),
        ]}
        sourceAssets={[]}
        templates={[]}
      />,
    );

    expect(markup).toContain("Usable");
    expect(markup).toContain("Reusable ideas have been extracted");
    expect(markup).toContain("Opening hook");
    expect(markup).toContain("Product demo");
    expect(markup).not.toContain("ready");
    expect(markup).not.toContain("Aesthetic product hook");
    expect(markup).not.toContain("Mute-friendly design");
  });

  it("replaces unreadable reference titles with a clear fallback label", () => {
    const markup = renderToStaticMarkup(
      <ReferenceLibraryPanel
        disabled={false}
        isLoading={false}
        language="en"
        onAnalyzeReference={() => undefined}
        onCreateTemplate={() => undefined}
        onUseReference={() => undefined}
        references={[makeReferenceVideo({ title: "????????????????#?? #??? #??????" })]}
        sourceAssets={[]}
        templates={[]}
      />,
    );

    expect(markup).toContain("Reference video");
    expect(markup).not.toContain("????????");
  });

  it("shows immediate feedback while a public reference breakdown is being submitted", () => {
    const markup = renderToStaticMarkup(
      <ReferenceLibraryPanel
        disabled={false}
        initialDraft={{
          category: "Kitchen appliances",
          sourceDeclaration: "Public reference URL; save structured analysis only.",
          sourcePlatform: "tiktok",
          sourceUrl: "https://example.test/reference.mp4",
          title: "Reference clip",
        }}
        isLoading
        language="en"
        onAnalyzeReference={() => undefined}
        onCreateTemplate={() => undefined}
        onUseReference={() => undefined}
        references={[
          makeReferenceVideo({
            createdAt: new Date().toISOString(),
            status: "analyzing",
            updatedAt: new Date().toISOString(),
          }),
        ]}
        sourceAssets={[]}
        templates={[]}
      />,
    );

    expect(markup).toContain("Submitting...");
    expect(markup).toContain("Reference breakdown is running");
    expect(markup).toContain("understanding the scenes");
    expect(markup).toContain("Progress");
    expect(markup).toContain("Reading video");
    expect(markup).toContain("1 processing");
    expect(markup).toContain("Processing");
    expect(markup).not.toContain("Download &amp; store");
    expect(markup).not.toContain("analyzing");
  });

  it("separates stale reference breakdowns from active running jobs", () => {
    const markup = renderToStaticMarkup(
      <ReferenceLibraryPanel
        disabled={false}
        isLoading={false}
        language="en"
        onAnalyzeReference={() => undefined}
        onCreateTemplate={() => undefined}
        onUseReference={() => undefined}
        references={[
          makeReferenceVideo({
            status: "analyzing",
            updatedAt: "2026-05-30T00:00:00.000Z",
          }),
        ]}
        sourceAssets={[]}
        templates={[]}
      />,
    );

    expect(markup).not.toContain("Reference breakdown is running");
    expect(markup).toContain("Some videos stopped updating");
    expect(markup).toContain("1 need retry");
    expect(markup).toContain("Needs retry");
    expect(markup).toContain("Retry breakdown");
    expect(markup).not.toContain("stalled");
  });

  it("explains why reference breakdown submit is disabled before required fields are complete", () => {
    const markup = renderToStaticMarkup(
      <ReferenceLibraryPanel
        disabled={false}
        initialDraft={{
          category: "",
          sourceDeclaration: "Public reference URL; save structured analysis only.",
          sourcePlatform: "tiktok",
          sourceUrl: "",
          title: "",
        }}
        isLoading={false}
        language="en"
        onAnalyzeReference={() => undefined}
        onCreateTemplate={() => undefined}
        onUseReference={() => undefined}
        references={[]}
        sourceAssets={[]}
        templates={[]}
      />,
    );

    expect(markup).toContain("Complete required fields");
    expect(markup).toContain("source video");
    expect(markup).toContain("reference title");
    expect(markup).toContain("category");
    expect(markup).toContain("disabled");
  });

  it("surfaces failed reference breakdowns with retry guidance", () => {
    const markup = renderToStaticMarkup(
      <ReferenceLibraryPanel
        disabled={false}
        isLoading={false}
        language="en"
        onAnalyzeReference={() => undefined}
        onCreateTemplate={() => undefined}
        onUseReference={() => undefined}
        references={[
          makeReferenceVideo({
            errorMessage: "Download failed with HTTP 403.",
            status: "failed",
          }),
        ]}
        sourceAssets={[]}
        templates={[]}
      />,
    );

    expect(markup).toContain("Some videos need a new link");
    expect(markup).toContain("Use a direct link that still plays");
    expect(markup).toContain("This video link cannot be read now");
    expect(markup).toContain("1 need attention");
    expect(markup).toContain("Needs new link");
    expect(markup).toContain("Retry breakdown");
    expect(markup).not.toContain("HTTP 403");
    expect(markup).not.toContain("Download failed");
  });

  it("lets freshly polled reference status override stale project snapshot status", () => {
    const staleProjectReference = makeReferenceVideo({
      id: "reference-stale",
      status: "analyzing",
      updatedAt: "2026-05-30T00:00:00.000Z",
    });
    const freshLibraryReference = makeReferenceVideo({
      id: "reference-stale",
      status: "ready",
      updatedAt: "2026-05-30T00:01:00.000Z",
    });

    const mergedReferences = mergeReferences([staleProjectReference], [freshLibraryReference]);

    expect(mergedReferences).toHaveLength(1);
    expect(mergedReferences[0]?.status).toBe("ready");
    expect(hasActivePendingReferenceAnalysis(mergedReferences)).toBe(false);
  });

  it("detects active pending reference analysis only for recent registered or analyzing statuses", () => {
    const nowMs = Date.parse("2026-05-30T00:05:00.000Z");

    expect(
      hasActivePendingReferenceAnalysis(
        [
          makeReferenceVideo({ id: "reference-ready", status: "ready" }),
          makeReferenceVideo({ id: "reference-failed", status: "failed" }),
        ],
        nowMs,
      ),
    ).toBe(false);
    expect(
      hasActivePendingReferenceAnalysis(
        [
          makeReferenceVideo({
            status: "analyzing",
            updatedAt: "2026-05-30T00:04:00.000Z",
          }),
        ],
        nowMs,
      ),
    ).toBe(true);
    expect(
      hasActivePendingReferenceAnalysis(
        [
          makeReferenceVideo({
            status: "analyzing",
            updatedAt: "2026-05-29T23:00:00.000Z",
          }),
        ],
        nowMs,
      ),
    ).toBe(false);
    expect(
      hasActivePendingReferenceAnalysis(
        [
          makeReferenceVideo({
            status: "registered",
            updatedAt: "not-a-date",
          }),
        ],
        nowMs,
      ),
    ).toBe(true);
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

  it("uploads imported image and video files then triggers real structure processing", async () => {
    const calls: string[] = [];
    const imageFile = new File(["image-bytes"], "hero.png", { type: "image/png" });
    const textFile = new File(["script copy"], "brief.txt", { type: "text/plain" });

    const result = await importAndStructureFiles({
      files: [imageFile, textFile],
      language: "en",
      projectId: "project-import",
      createAssetUploadIntentFn: async (_projectId, asset) => {
        calls.push(`intent:${asset.name}`);
        return {
          asset: makeAsset({
            id: `asset-${asset.name}`,
            name: asset.name,
            type: asset.type,
            mimeType: asset.mimeType,
            status: "uploaded",
          }),
          upload: {
            provider: "mock-cos",
            bucket: "test",
            region: "ap-guangzhou",
            objectKey: `projects/project-import/raw/${asset.name}/source`,
            uploadUrl: "https://cos.test/upload",
            publicUrl: "https://cos.test/read",
            method: "PUT",
            headers: {},
            expiresAt: "2026-05-30T00:10:00.000Z",
          },
          processingJob: {
            id: "job-intent",
            assetId: `asset-${asset.name}`,
            status: "processing",
            steps: ["upload"],
            message: "Queued.",
            createdAt: "2026-05-30T00:00:00.000Z",
          },
        };
      },
      uploadAssetFileToStorageFn: async (assetId, file) => {
        calls.push(`upload:${file.name}`);
        return {
          asset: makeAsset({
            id: assetId,
            name: file.name,
            type: file.type.startsWith("image/") ? "image" : "reference",
            mimeType: file.type,
            status: "ready",
          }),
          storage: {
            provider: "mock-cos",
            objectKey: `projects/project-import/raw/${assetId}/source`,
            publicUrl: "https://cos.test/read",
          },
        };
      },
      processAssetStructureFn: async (assetId) => {
        calls.push(`process:${assetId}`);
        return {
          asset: makeAsset({
            id: assetId,
            name: "hero.png",
            type: "image",
            mimeType: "image/png",
            status: "ready",
            metadata: {
              structuredAssetObjectKey: `projects/project-import/derived/${assetId}/metadata/structured-asset.json`,
            },
          }),
          events: [],
          job: {
            id: "job-process",
            assetId,
            status: "ready",
            steps: ["probe", "sample_frames", "publish_artifacts", "understand"],
            message: "Structured.",
            createdAt: "2026-05-30T00:00:00.000Z",
          },
          slices: [
            {
              id: "slice-hero",
              assetId,
              label: "hero image",
              tags: ["hero"],
              searchText: "hero image",
            },
          ],
        };
      },
    });

    expect(calls).toEqual([
      "intent:hero.png",
      "upload:hero.png",
      "process:asset-hero.png",
      "intent:brief.txt",
      "upload:brief.txt",
    ]);
    expect(result.assets.find((asset) => asset.id === "asset-hero.png")?.metadata).toMatchObject({
      structuredAssetObjectKey:
        "projects/project-import/derived/asset-hero.png/metadata/structured-asset.json",
    });
    expect(result.assetSlices).toHaveLength(1);
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
    expect(markup).toContain("Templates");
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

  it("classifies only image, video, audio, script assets, and keeps templates separate", () => {
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
    expect(assetMatchesCategory(makeAsset({ tags: ["template"] }), "template")).toBe(false);
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
