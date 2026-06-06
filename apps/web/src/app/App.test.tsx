import type {
  AssetMetadata,
  ExternalAssetResult,
  ProjectSummary,
  ReferenceVideo,
  RenderTask,
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
  addSmartEditTimelineTextElement,
  addSmartEditTimelineVoiceElement,
  importSmartEditSrtCaptionsToTimeline,
  applySmartEditCommandHistoryRedo,
  applySmartEditCommandHistoryUndo,
  copySmartEditSegmentsToClipboard,
  copySmartEditTimelineElementsToClipboard,
  createSmartEditCommandHistory,
  cutSmartEditTimelineElementsToClipboard,
  detachSmartEditSceneVideoToTimelineElement,
  detachSmartEditSourceAudioToTimelineElement,
  duplicateSmartEditSegmentOnTimeline,
  duplicateSmartEditSegmentsOnTimeline,
  duplicateSmartEditTimelineElementsOnTimeline,
  moveSmartEditSegmentOnTimeline,
  moveSmartEditSegmentOnTimelineWithMode,
  moveSmartEditTrackClipOnTimeline,
  moveSmartEditTimelineElementsOnTimeline,
  previewSmartEditTrackClipDrag,
  pasteSmartEditClipboardAtPlayhead,
  pasteSmartEditTimelineClipboardAtPlayhead,
  pasteSmartEditSegmentsAtPlayhead,
  removeSmartEditSegmentsFromTimeline,
  removeSmartEditTimelineElementsFromTimeline,
  removeSmartEditTimelineElementFromTimeline,
  selectSmartEditTrackIdsInMarquee,
  selectSmartEditTimelineElementIds,
  selectSmartEditTimelineElementIdsInBox,
  smartEditTimelineKeyboardNudgeSeconds,
  splitSmartEditSegmentOnTimeline,
  splitSmartEditTimelineElementAtPlayhead,
  trimSmartEditSegmentAtPlayhead,
  trimSmartEditTimelineElementAtPlayhead,
  resizeSmartEditTrackClipEdge,
  relinkSmartEditTimelineElementWithSceneMate,
  relinkSmartEditTimelineElements,
  slipSmartEditTimelineElementSource,
  unlinkSmartEditTimelineElementGroup,
  updateSmartEditTimelineElementsPlaybackRate,
  updateSmartEditTimelineElement,
  updateSmartEditTimelineTrack,
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
  needsSceneClipMaterialRefresh,
  isRenderTaskPollingActive,
  mergeReferences,
  pruneAssetPrepSnapshotDeletedAssets,
  selectLatestCompletedSmartEditTask,
  selectStudioBaseRenderTask,
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

const makeRenderTask = (renderTask: Partial<RenderTask>): RenderTask => ({
  id: "render-task-1",
  projectId: "project-1",
  status: "completed",
  progress: 100,
  provider: "volcengine-seedance",
  createdAt: "2026-06-05T00:00:00.000Z",
  updatedAt: "2026-06-05T00:00:00.000Z",
  ...renderTask,
});

const makeMinimalSmartEditPlan = (): SmartEditPlan => ({
  id: "smart-edit-plan-1",
  projectId: "project-1",
  strategy: "Test plan",
  targetDurationSeconds: 4,
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
      sourceAudioStartOffsetSeconds: 0,
      captionHidden: false,
      captionStartOffsetSeconds: 0,
      voiceoverStartOffsetSeconds: 0,
      transition: "cut",
      subtitle: "Caption",
      voiceover: "Voice",
      source: { kind: "generated-scene-clip", sceneClipUrl: "/scene.mp4" },
      assetTags: [],
      rationale: "Test",
    },
  ],
  audio: {
    bgmTrack: "creator-pop",
    targetLanguage: "zh-CN",
    voice: "clear-host",
  },
  createdAt: "2026-06-05T00:00:00.000Z",
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

  it("uses the latest source render task as the studio base instead of the latest smart edit export", () => {
    const sourceRender = makeRenderTask({
      id: "source-render",
      provider: "volcengine-seedance",
      videoSettings: { ratio: "9:16", resolution: "720p", generateAudio: true, watermark: false },
      sceneClips: [
        {
          sceneId: "scene-1",
          order: 1,
          subtitle: "Caption",
          status: "completed",
          progress: 100,
          videoUrl: "/scene.mp4",
          material: {
            status: "ready",
            videoOnlyUrl: "/scene-video.mp4",
            audioUrl: "/scene-audio.m4a",
            text: "Caption",
          },
        },
      ],
    });
    const smartEditExport = makeRenderTask({
      id: "smart-edit-export",
      provider: "smart-edit-ffmpeg",
      previewUrl: "/smart-edit.mp4",
      exportUrl: "/smart-edit.mp4",
      smartEditPlan: makeMinimalSmartEditPlan(),
      createdAt: "2026-06-05T00:05:00.000Z",
      updatedAt: "2026-06-05T00:05:00.000Z",
    });

    expect(selectStudioBaseRenderTask([sourceRender, smartEditExport])?.id).toBe(
      "source-render",
    );
    expect(selectLatestCompletedSmartEditTask([sourceRender, smartEditExport])?.id).toBe(
      "smart-edit-export",
    );
  });

  it("prefers source render tasks that can provide audio materials for the studio timeline", () => {
    const silentRender = makeRenderTask({
      id: "silent-source-render",
      provider: "volcengine-seedance",
      videoSettings: { ratio: "9:16", resolution: "720p", generateAudio: false, watermark: false },
      createdAt: "2026-06-05T00:10:00.000Z",
      updatedAt: "2026-06-05T00:10:00.000Z",
      sceneClips: [
        {
          sceneId: "scene-silent",
          order: 1,
          subtitle: "Silent",
          status: "completed",
          progress: 100,
          videoUrl: "/silent.mp4",
        },
      ],
    });
    const audioRender = makeRenderTask({
      id: "audio-source-render",
      provider: "volcengine-seedance",
      videoSettings: { ratio: "9:16", resolution: "720p", generateAudio: true, watermark: false },
      sceneClips: [
        {
          sceneId: "scene-audio",
          order: 1,
          subtitle: "Audio",
          status: "completed",
          progress: 100,
          videoUrl: "/audio.mp4",
        },
      ],
    });

    expect(selectStudioBaseRenderTask([audioRender, silentRender])?.id).toBe(
      "audio-source-render",
    );
  });

  it("detects completed source render tasks that still need scene clip materialization", () => {
    expect(
      needsSceneClipMaterialRefresh(
        makeRenderTask({
          sceneClips: [
            {
              sceneId: "scene-1",
              order: 1,
              subtitle: "Caption",
              status: "completed",
              progress: 100,
              videoUrl: "/scene.mp4",
            },
          ],
        }),
      ),
    ).toBe(true);

    expect(
      needsSceneClipMaterialRefresh(
        makeRenderTask({
          sceneClips: [
            {
              sceneId: "scene-1",
              order: 1,
              subtitle: "Caption",
              status: "completed",
              progress: 100,
              videoUrl: "/scene.mp4",
              material: {
                status: "ready",
                videoOnlyUrl: "/scene-video.mp4",
                audioUrl: "/scene-audio.m4a",
                text: "Caption",
              },
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("generates audio by default for model-rendered videos", () => {
    expect(defaultVideoSettings.generateAudio).toBe(true);
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
    expect(markup).toContain("Import SRT captions");
    expect(markup).toContain("Import captions");
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
                  sceneClipAudioWaveform: {
                    sampleRate: 8000,
                    durationSeconds: 4,
                    bucketDurationSeconds: 1,
                    buckets: [
                      { index: 0, startSecond: 0, durationSeconds: 1, rms: 0.12, peak: 0.25 },
                      { index: 1, startSecond: 1, durationSeconds: 1, rms: 0.48, peak: 1 },
                      { index: 2, startSecond: 2, durationSeconds: 1, rms: 0.31, peak: 0.7 },
                    ],
                  },
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
    expect(markup).toContain("Waveform RMS preview for Scene 1 audio");
    expect(markup).toContain("smart-edit-waveform-bar clipped");
    expect(markup).toContain("role=\"button\"");
    expect(markup).toContain("tech-pulse");
  });

  it("imports SRT captions as independent smart edit text timeline materials", () => {
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
          transition: "cut",
          subtitle: "Base caption",
          voiceover: "Base caption",
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

    const nextPlan = importSmartEditSrtCaptionsToTimeline(
      plan,
      `1
00:00:01,000 --> 00:00:02,500
First imported caption

2
00:00:03.000 --> 00:00:05.250
Second imported caption`,
      "import-test",
    );

    const imported = nextPlan.timeline?.elements.filter((element) =>
      element.id.startsWith("srt-import-test-"),
    );
    expect(imported).toHaveLength(2);
    expect(imported?.map((element) => element.trackId)).toEqual(["text-copy", "text-copy"]);
    expect(imported?.map((element) => element.startSecond)).toEqual([1, 3]);
    expect(imported?.map((element) => element.durationSeconds)).toEqual([1.5, 2.25]);
    expect(imported?.map((element) => element.text)).toEqual([
      "First imported caption",
      "Second imported caption",
    ]);
    expect(nextPlan.timeline?.durationSeconds).toBe(5.25);
    expect(nextPlan.targetDurationSeconds).toBe(5.25);
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

  it("trims persistent smart edit timeline elements to the left or right of the playhead", () => {
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
          subtitle: "Segment voice",
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
        durationSeconds: 6,
        tracks: [
          { id: "video-main", kind: "video", label: "Video" },
          { id: "audio-source", kind: "audio", label: "Source audio" },
          { id: "text-copy", kind: "text", label: "Text" },
        ],
        elements: [
          {
            id: "persisted-video",
            durationSeconds: 4,
            hidden: false,
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
            id: "persisted-source-audio",
            detachedAudio: true,
            durationSeconds: 4,
            hidden: false,
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
            id: "persisted-caption",
            durationSeconds: 3,
            hidden: false,
            kind: "text",
            label: "Edited caption",
            muted: false,
            playbackRate: 1,
            sceneId: "scene-1",
            segmentId: "segment-1",
            startSecond: 1.5,
            text: "Edited caption",
            trackId: "text-copy",
            trimStartSecond: 0,
          },
        ],
      },
    };

    const keepRight = trimSmartEditSegmentAtPlayhead(plan, "segment-1", 1.5, "right");

    expect(keepRight?.segments[0]).toMatchObject({
      durationSeconds: 2.5,
      id: "segment-1",
      timelineStartSecond: 2.5,
      source: {
        startSecond: 1.5,
        endSecond: 4,
      },
    });
    expect(keepRight?.timeline?.elements.find((element) => element.id === "persisted-video")).toMatchObject({
      durationSeconds: 2.5,
      startSecond: 2.5,
      trimEndSecond: 4,
      trimStartSecond: 1.5,
    });
    expect(
      keepRight?.timeline?.elements.find((element) => element.id === "persisted-source-audio"),
    ).toMatchObject({
      durationSeconds: 2.5,
      startSecond: 2.5,
      trimEndSecond: 4,
      trimStartSecond: 1.5,
    });
    expect(keepRight?.timeline?.elements.find((element) => element.id === "persisted-caption")).toMatchObject({
      durationSeconds: 2,
      startSecond: 2.5,
      text: "Edited caption",
    });

    const keepLeft = trimSmartEditSegmentAtPlayhead(plan, "segment-1", 1.5, "left");

    expect(keepLeft?.segments[0]).toMatchObject({
      durationSeconds: 1.5,
      id: "segment-1",
      timelineStartSecond: 1,
      source: {
        startSecond: 0,
        endSecond: 1.5,
      },
    });
    expect(keepLeft?.timeline?.elements.find((element) => element.id === "persisted-video")).toMatchObject({
      durationSeconds: 1.5,
      startSecond: 1,
      trimEndSecond: 1.5,
      trimStartSecond: 0,
    });
    expect(keepLeft?.timeline?.elements.find((element) => element.id === "persisted-caption")).toMatchObject({
      durationSeconds: 1,
      startSecond: 1.5,
      text: "Edited caption",
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

  it("copies and pastes independent smart edit timeline materials at the playhead", () => {
    const plan = addSmartEditTimelineTextElement(
      detachSmartEditSceneVideoToTimelineElement(
        {
          audio: {
            bgmTrack: "none",
            targetLanguage: "zh-CN",
            voice: "clear-host",
          },
          createdAt: "2026-06-06T00:00:00.000Z",
          id: "plan-copy-materials",
          projectId: "project-1",
          segments: [
            {
              assetTags: [],
              durationSeconds: 3,
              enabled: true,
              id: "segment-1",
              order: 1,
              rationale: "Copy independent material.",
              sceneId: "scene-1",
              source: {
                endSecond: 6,
                kind: "generated-scene-clip",
                sceneClipUrl: "https://cdn.example.test/scene.mp4",
                startSecond: 0,
              },
              subtitle: "Hook",
              timelineStartSecond: 1,
              transition: "cut",
              voiceover: "",
            },
          ],
          strategy: "Copy independent materials.",
          targetDurationSeconds: 8,
        } satisfies SmartEditPlan,
        "segment-1",
        "copy",
      ),
      4,
      "copy-caption",
    );

    const clipboard = copySmartEditTimelineElementsToClipboard(plan, [
      "video-segment-1-copy",
      "text-copy-caption",
    ]);
    const pasted = pasteSmartEditTimelineClipboardAtPlayhead(plan, clipboard, 10, "material-paste");

    expect(clipboard?.timelineItems?.map((item) => item.element.id)).toEqual([
      "video-segment-1-copy",
      "text-copy-caption",
    ]);
    expect(pasted.timeline?.elements.find((element) => element.id === "video-segment-1-copy-material-paste-1")).toMatchObject({
      label: "Scene 1 detached video (copy)",
      startSecond: 10,
    });
    expect(pasted.timeline?.elements.find((element) => element.id === "text-copy-caption-material-paste-2")).toMatchObject({
      label: "New text (copy)",
      startSecond: 13,
    });
    expect(pasted.targetDurationSeconds).toBe(15);
  });

  it("cuts independent smart edit timeline materials into the local clipboard", () => {
    const plan = addSmartEditTimelineTextElement(
      detachSmartEditSceneVideoToTimelineElement(
        {
          audio: {
            bgmTrack: "none",
            targetLanguage: "zh-CN",
            voice: "clear-host",
          },
          createdAt: "2026-06-06T00:00:00.000Z",
          id: "plan-cut-materials",
          projectId: "project-1",
          segments: [
            {
              assetTags: [],
              durationSeconds: 3,
              enabled: true,
              id: "segment-1",
              order: 1,
              rationale: "Cut independent material.",
              sceneId: "scene-1",
              source: {
                endSecond: 6,
                kind: "generated-scene-clip",
                sceneClipAudioUrl: "https://cdn.example.test/scene-audio.m4a",
                sceneClipUrl: "https://cdn.example.test/scene.mp4",
                sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-video.mp4",
                startSecond: 0,
              },
              subtitle: "Hook",
              timelineStartSecond: 1,
              transition: "cut",
              voiceover: "",
            },
          ],
          strategy: "Cut independent materials.",
          targetDurationSeconds: 8,
        } satisfies SmartEditPlan,
        "segment-1",
        "cut",
      ),
      4,
      "cut-caption",
    );

    const cut = cutSmartEditTimelineElementsToClipboard(plan, [
      "video-segment-1-cut",
      "text-cut-caption",
    ]);
    const pasted = pasteSmartEditTimelineClipboardAtPlayhead(
      cut.plan,
      cut.clipboard,
      6,
      "cut-paste",
      "free",
    );

    expect(cut.clipboard?.timelineItems?.map((item) => item.element.id)).toEqual([
      "source-audio-segment-1-cut",
      "video-segment-1-cut",
      "text-cut-caption",
    ]);
    expect(cut.plan.timeline?.elements.some((element) => element.id === "video-segment-1-cut")).toBe(false);
    expect(cut.plan.timeline?.elements.some((element) => element.id === "source-audio-segment-1-cut")).toBe(false);
    expect(cut.plan.timeline?.elements.some((element) => element.id === "text-cut-caption")).toBe(false);
    expect(pasted.timeline?.elements.find((element) => element.id === "source-audio-segment-1-cut-cut-paste-1")).toMatchObject({
      startSecond: 6,
    });
    expect(pasted.timeline?.elements.find((element) => element.id === "video-segment-1-cut-cut-paste-2")).toMatchObject({
      startSecond: 6,
    });
    expect(pasted.timeline?.elements.find((element) => element.id === "text-cut-caption-cut-paste-3")).toMatchObject({
      startSecond: 9,
    });
  });

  it("duplicates independent smart edit timeline materials directly after the selected block", () => {
    const plan = addSmartEditTimelineTextElement(
      detachSmartEditSceneVideoToTimelineElement(
        {
          audio: {
            bgmTrack: "none",
            targetLanguage: "zh-CN",
            voice: "clear-host",
          },
          createdAt: "2026-06-06T00:00:00.000Z",
          id: "plan-duplicate-materials",
          projectId: "project-1",
          segments: [
            {
              assetTags: [],
              durationSeconds: 3,
              enabled: true,
              id: "segment-1",
              order: 1,
              rationale: "Duplicate independent material.",
              sceneId: "scene-1",
              source: {
                endSecond: 6,
                kind: "generated-scene-clip",
                sceneClipAudioUrl: "https://cdn.example.test/scene-audio.m4a",
                sceneClipUrl: "https://cdn.example.test/scene.mp4",
                sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-video.mp4",
                startSecond: 0,
              },
              subtitle: "Hook",
              timelineStartSecond: 1,
              transition: "cut",
              voiceover: "",
            },
          ],
          strategy: "Duplicate independent materials.",
          targetDurationSeconds: 8,
        } satisfies SmartEditPlan,
        "segment-1",
        "duplicate",
      ),
      4,
      "duplicate-caption",
    );

    const duplicated = duplicateSmartEditTimelineElementsOnTimeline(
      plan,
      ["video-segment-1-duplicate", "text-duplicate-caption"],
      "material-dup",
      "free",
    );

    expect(duplicated.timeline?.elements.find((element) => element.id === "source-audio-segment-1-duplicate-material-dup-1")).toMatchObject({
      label: "Scene 1 linked audio (copy)",
      startSecond: 6,
    });
    expect(duplicated.timeline?.elements.find((element) => element.id === "video-segment-1-duplicate-material-dup-2")).toMatchObject({
      label: "Scene 1 detached video (copy)",
      startSecond: 6,
    });
    expect(duplicated.timeline?.elements.find((element) => element.id === "text-duplicate-caption-material-dup-3")).toMatchObject({
      label: "New text (copy)",
      startSecond: 9,
    });
    expect(duplicated.targetDurationSeconds).toBe(11);
  });

  it("updates playback speed for selected independent video and audio materials", () => {
    const plan = addSmartEditTimelineTextElement(
      detachSmartEditSceneVideoToTimelineElement(
        {
          audio: {
            bgmTrack: "none",
            targetLanguage: "zh-CN",
            voice: "clear-host",
          },
          createdAt: "2026-06-06T00:00:00.000Z",
          id: "plan-batch-speed-materials",
          projectId: "project-1",
          segments: [
            {
              assetTags: [],
              durationSeconds: 3,
              enabled: true,
              id: "segment-1",
              order: 1,
              rationale: "Batch speed independent material.",
              sceneId: "scene-1",
              source: {
                endSecond: 6,
                kind: "generated-scene-clip",
                sceneClipAudioUrl: "https://cdn.example.test/scene-audio.m4a",
                sceneClipUrl: "https://cdn.example.test/scene.mp4",
                sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-video.mp4",
                startSecond: 0,
              },
              subtitle: "Hook",
              timelineStartSecond: 1,
              transition: "cut",
              voiceover: "",
            },
          ],
          strategy: "Batch speed independent materials.",
          targetDurationSeconds: 8,
        } satisfies SmartEditPlan,
        "segment-1",
        "batch-speed",
      ),
      4,
      "batch-speed-caption",
    );

    const fastPlan = updateSmartEditTimelineElementsPlaybackRate(
      plan,
      ["video-segment-1-batch-speed", "text-batch-speed-caption"],
      8,
    );
    expect(fastPlan.timeline?.elements.find((element) => element.id === "video-segment-1-batch-speed")).toMatchObject({
      playbackRate: 4,
    });
    expect(fastPlan.timeline?.elements.find((element) => element.id === "source-audio-segment-1-batch-speed")).toMatchObject({
      playbackRate: 4,
    });
    expect(fastPlan.timeline?.elements.find((element) => element.id === "text-batch-speed-caption")).toMatchObject({
      playbackRate: 1,
    });

    const slowPlan = updateSmartEditTimelineElementsPlaybackRate(
      fastPlan,
      ["video-segment-1-batch-speed"],
      0.1,
    );
    expect(slowPlan.timeline?.elements.find((element) => element.id === "video-segment-1-batch-speed")).toMatchObject({
      playbackRate: 0.25,
    });
    expect(slowPlan.timeline?.elements.find((element) => element.id === "source-audio-segment-1-batch-speed")).toMatchObject({
      playbackRate: 0.25,
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

  it("adds an independent voice element to the smart edit timeline at the playhead", () => {
    const plan = {
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
          voiceover: "",
          source: {
            assetId: "asset-video",
            kind: "video-slice",
            startSecond: 0,
          },
        },
      ],
      targetDurationSeconds: 4,
    } satisfies SmartEditPlan;

    const nextPlan = addSmartEditTimelineVoiceElement(plan, 3.24, "test");

    expect(nextPlan.timeline?.tracks.some((track) => track.id === "voiceover")).toBe(true);
    expect(nextPlan.timeline?.elements.some((element) => element.id === "segment-1-video")).toBe(true);
    expect(nextPlan.timeline?.elements).toContainEqual(
      expect.objectContaining({
        durationSeconds: 2,
        hidden: false,
        id: "voice-test",
        kind: "audio",
        label: "New voiceover",
        muted: false,
        playbackRate: 1,
        startSecond: 3.2,
        text: "New voiceover",
        trackId: "voiceover",
        trimStartSecond: 0,
      }),
    );
    expect(nextPlan.timeline?.elements.find((element) => element.id === "voice-test")?.segmentId).toBeUndefined();
    expect(nextPlan.timeline?.durationSeconds).toBe(5.2);
    expect(nextPlan.targetDurationSeconds).toBe(5.2);
  });

  it("moves an independent voice element without requiring a storyboard segment", () => {
    const plan = addSmartEditTimelineVoiceElement(
      {
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
            voiceover: "",
            source: {
              assetId: "asset-video",
              kind: "video-slice",
              startSecond: 0,
            },
          },
        ],
        targetDurationSeconds: 4,
      } satisfies SmartEditPlan,
      1,
      "move",
    );

    const nextPlan = moveSmartEditTrackClipOnTimeline(
      plan,
      { id: "voice-move", trackId: "voice" },
      1.25,
    );

    expect(nextPlan.timeline?.elements.find((element) => element.id === "voice-move")).toMatchObject({
      startSecond: 2.3,
      trackId: "voiceover",
    });
    expect(nextPlan.timeline?.durationSeconds).toBe(4.3);
    expect(nextPlan.targetDurationSeconds).toBe(4.3);
  });

  it("snaps and prevents overlap when moving independent smart edit text materials", () => {
    const basePlan = {
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [],
      targetDurationSeconds: 0,
    } satisfies SmartEditPlan;
    const planWithFirstCaption = addSmartEditTimelineTextElement(basePlan, 1, "first");
    const plan = addSmartEditTimelineTextElement(planWithFirstCaption, 4, "second");

    const snappedPlan = moveSmartEditTrackClipOnTimeline(
      plan,
      { id: "text-second", trackId: "caption" },
      -1.15,
      "magnetic",
      2.95,
    );

    expect(snappedPlan.timeline?.elements.find((element) => element.id === "text-second")).toMatchObject({
      startSecond: 3,
      trackId: "text-copy",
    });

    const nonOverlappingPlan = moveSmartEditTrackClipOnTimeline(
      plan,
      { id: "text-second", trackId: "caption" },
      -2.4,
      "magnetic",
    );

    expect(nonOverlappingPlan.timeline?.elements.find((element) => element.id === "text-second")).toMatchObject({
      startSecond: 3,
    });

    const clampedPlan = moveSmartEditTrackClipOnTimeline(
      plan,
      { id: "text-first", trackId: "caption" },
      -5,
      "magnetic",
    );

    expect(clampedPlan.timeline?.elements.find((element) => element.id === "text-first")).toMatchObject({
      startSecond: 0,
    });
  });

  it("applies insert and overwrite modes when moving independent smart edit text materials", () => {
    const basePlan = {
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [],
      targetDurationSeconds: 0,
    } satisfies SmartEditPlan;
    const planWithFirstCaption = addSmartEditTimelineTextElement(basePlan, 1, "first");
    const planWithSecondCaption = addSmartEditTimelineTextElement(planWithFirstCaption, 4, "second");
    const plan = addSmartEditTimelineTextElement(planWithSecondCaption, 7, "third");

    const insertPlan = moveSmartEditTrackClipOnTimeline(
      plan,
      { id: "text-third", trackId: "caption" },
      -5.5,
      "insert",
    );

    expect(insertPlan.timeline?.elements.find((element) => element.id === "text-third")).toMatchObject({
      startSecond: 1.5,
    });
    expect(insertPlan.timeline?.elements.find((element) => element.id === "text-first")).toMatchObject({
      startSecond: 3,
    });
    expect(insertPlan.timeline?.elements.find((element) => element.id === "text-second")).toMatchObject({
      startSecond: 6,
    });

    const overwritePlan = moveSmartEditTrackClipOnTimeline(
      plan,
      { id: "text-third", trackId: "caption" },
      -3.5,
      "overwrite",
    );

    expect(overwritePlan.timeline?.elements.find((element) => element.id === "text-third")).toMatchObject({
      startSecond: 3.5,
    });
    expect(overwritePlan.timeline?.elements.some((element) => element.id === "text-second")).toBe(false);
    expect(overwritePlan.timeline?.elements.some((element) => element.id === "text-first")).toBe(true);
  });

  it("updates independent audio material speed on the smart edit timeline", () => {
    const plan = addSmartEditTimelineVoiceElement(
      {
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
            voiceover: "",
            source: {
              assetId: "asset-video",
              kind: "video-slice",
              startSecond: 0,
            },
          },
        ],
        targetDurationSeconds: 4,
      } satisfies SmartEditPlan,
      1,
      "speed",
    );

    const fastPlan = updateSmartEditTimelineElement(plan, "voice-speed", {
      playbackRate: 8,
    });
    expect(fastPlan.timeline?.elements.find((element) => element.id === "voice-speed")).toMatchObject({
      playbackRate: 4,
    });

    const slowPlan = updateSmartEditTimelineElement(fastPlan, "voice-speed", {
      playbackRate: 0.1,
    });
    expect(slowPlan.timeline?.elements.find((element) => element.id === "voice-speed")).toMatchObject({
      playbackRate: 0.25,
    });
  });

  it("detaches generated scene source audio into an independent timeline material", () => {
    const plan = {
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
          transition: "cut",
          subtitle: "Hook subtitle",
          voiceover: "",
          playbackRate: 1.5,
          sourceAudioStartOffsetSeconds: 0.5,
          sourceAudioDurationSeconds: 2.5,
          sourceAudioVolume: 0.7,
          sourceAudioFadeInSeconds: 0.3,
          sourceAudioFadeOutSeconds: 0.4,
          sourceAudioVolumeKeyframes: [
            { id: "volume-0", timeSecond: 0, volume: 0.5 },
            { id: "volume-1", timeSecond: 1.2, volume: 0.9 },
          ],
          source: {
            assetId: "asset-video",
            kind: "generated-scene-clip",
            sceneClipAudioUrl: "https://cdn.example.com/scene-1-audio.m4a",
            sceneClipAudioWaveform: {
              bucketDurationSeconds: 0.25,
              buckets: [
                { index: 0, peak: 0.4, rms: 0.2 },
                { index: 1, peak: 0.8, rms: 0.5 },
              ],
              durationSeconds: 3.8,
            },
            sceneClipUrl: "https://cdn.example.com/scene-1.mp4",
            sceneClipVideoOnlyUrl: "https://cdn.example.com/scene-1-video.mp4",
            startSecond: 0.25,
          },
        },
      ],
      targetDurationSeconds: 5,
    } satisfies SmartEditPlan;

    const nextPlan = detachSmartEditSourceAudioToTimelineElement(plan, "segment-1", "test");
    const updatedSegment = nextPlan.segments.find((segment) => segment.id === "segment-1");
    const detachedAudio = nextPlan.timeline?.elements.find((element) => element.id === "source-audio-segment-1-test");

    expect(updatedSegment?.sourceAudioMuted).toBe(true);
    expect(detachedAudio).toMatchObject({
      audioFadeInSeconds: 0.3,
      audioFadeOutSeconds: 0.4,
      audioVolume: 0.7,
      detachedAudio: true,
      durationSeconds: 2.5,
      hidden: false,
      id: "source-audio-segment-1-test",
      kind: "audio",
      muted: false,
      playbackRate: 1.5,
      sceneId: "scene-1",
      sourceUrl: "https://cdn.example.com/scene-1-audio.m4a",
      startSecond: 1.5,
      trackId: "audio-source",
      trimStartSecond: 0.25,
    });
    expect(detachedAudio?.segmentId).toBeUndefined();
    expect(detachedAudio?.audioWaveform).toEqual(plan.segments[0].source.sceneClipAudioWaveform);
    expect(detachedAudio?.audioVolumeKeyframes).toEqual([
      { easing: "linear", id: "volume-0", timeSecond: 0, volume: 0.5 },
      { easing: "linear", id: "volume-1", timeSecond: 1.2, volume: 0.9 },
    ]);
  });

  it("detaches generated scene video into an independent timeline material", () => {
    const plan = {
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
          transition: "cut",
          subtitle: "Hook subtitle",
          voiceover: "",
          playbackRate: 1.5,
          source: {
            assetId: "asset-video",
            endSecond: 5.25,
            kind: "generated-scene-clip",
            sceneClipAudioUrl: "https://cdn.example.com/scene-1-audio.m4a",
            sceneClipUrl: "https://cdn.example.com/scene-1.mp4",
            sceneClipVideoOnlyUrl: "https://cdn.example.com/scene-1-video.mp4",
            startSecond: 0.25,
          },
        },
      ],
      targetDurationSeconds: 5,
    } satisfies SmartEditPlan;

    const nextPlan = detachSmartEditSceneVideoToTimelineElement(plan, "segment-1", "test");
    const updatedSegment = nextPlan.segments.find((segment) => segment.id === "segment-1");
    const detachedVideo = nextPlan.timeline?.elements.find((element) => element.id === "video-segment-1-test");
    const detachedAudio = nextPlan.timeline?.elements.find((element) => element.id === "source-audio-segment-1-test");

    expect(updatedSegment?.enabled).toBe(false);
    expect(detachedVideo).toMatchObject({
      durationSeconds: 4,
      hidden: false,
      id: "video-segment-1-test",
      kind: "video",
      label: "Scene 1 detached video",
      muted: false,
      playbackRate: 1.5,
      sceneId: "scene-1",
      sourceDurationSeconds: 5,
      sourceUrl: "https://cdn.example.com/scene-1-video.mp4",
      startSecond: 1,
      trackId: "video-main",
      trimEndSecond: 5.25,
      trimStartSecond: 0.25,
    });
    expect(detachedVideo?.linkedGroupId).toBe("scene-material-segment-1-test");
    expect(detachedVideo?.segmentId).toBeUndefined();
    expect(detachedAudio).toMatchObject({
      detachedAudio: true,
      durationSeconds: 4,
      id: "source-audio-segment-1-test",
      kind: "audio",
      label: "Scene 1 linked audio",
      linkedGroupId: "scene-material-segment-1-test",
      playbackRate: 1.5,
      sourceUrl: "https://cdn.example.com/scene-1-audio.m4a",
      startSecond: 1,
      trackId: "audio-source",
      trimEndSecond: 5.25,
      trimStartSecond: 0.25,
    });
  });

  it("keeps linked detached scene video and audio together when moving, resizing, and deleting", () => {
    const plan = detachSmartEditSceneVideoToTimelineElement(
      {
        audio: {
          bgmTrack: "none",
          targetLanguage: "zh-CN",
          voice: "clear-host",
        },
        createdAt: "2026-06-06T00:00:00.000Z",
        id: "plan-linked",
        projectId: "project-1",
        segments: [
          {
            assetTags: [],
            durationSeconds: 4,
            enabled: true,
            id: "segment-1",
            order: 1,
            playbackRate: 1,
            rationale: "Use linked generated scene material.",
            sceneId: "scene-1",
            source: {
              endSecond: 4,
              kind: "generated-scene-clip",
              sceneClipAudioUrl: "https://cdn.example.test/scene-audio.m4a",
              sceneClipUrl: "https://cdn.example.test/scene.mp4",
              sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-video.mp4",
              startSecond: 0,
            },
            subtitle: "Hook",
            timelineStartSecond: 1,
            transition: "cut",
            voiceover: "",
          },
        ],
        strategy: "Edit linked generated scene materials.",
        targetDurationSeconds: 5,
      } satisfies SmartEditPlan,
      "segment-1",
      "linked",
    );

    const moved = moveSmartEditTrackClipOnTimeline(
      plan,
      { id: "video-segment-1-linked", trackId: "video" },
      1.2,
      "magnetic",
    );
    expect(moved.timeline?.elements.find((element) => element.id === "video-segment-1-linked")).toMatchObject({
      startSecond: 2.2,
    });
    expect(moved.timeline?.elements.find((element) => element.id === "source-audio-segment-1-linked")).toMatchObject({
      startSecond: 2.2,
    });

    const resized = resizeSmartEditTrackClipEdge(
      moved,
      { id: "source-audio-segment-1-linked", trackId: "sourceAudio" },
      "in",
      0.7,
    );
    expect(resized.timeline?.elements.find((element) => element.id === "video-segment-1-linked")).toMatchObject({
      durationSeconds: 3.3,
      startSecond: 2.9,
      trimStartSecond: 0.7,
    });
    expect(resized.timeline?.elements.find((element) => element.id === "source-audio-segment-1-linked")).toMatchObject({
      durationSeconds: 3.3,
      startSecond: 2.9,
      trimStartSecond: 0.7,
    });

    const removed = removeSmartEditTimelineElementFromTimeline(
      resized,
      "video-segment-1-linked",
    );
    expect(removed.timeline?.elements.some((element) => element.id === "video-segment-1-linked")).toBe(false);
    expect(removed.timeline?.elements.some((element) => element.id === "source-audio-segment-1-linked")).toBe(false);
  });

  it("unlinks and relinks detached scene video and audio materials", () => {
    const plan = detachSmartEditSceneVideoToTimelineElement(
      {
        audio: {
          bgmTrack: "none",
          targetLanguage: "zh-CN",
          voice: "clear-host",
        },
        createdAt: "2026-06-06T00:00:00.000Z",
        id: "plan-unlink",
        projectId: "project-1",
        segments: [
          {
            assetTags: [],
            durationSeconds: 4,
            enabled: true,
            id: "segment-1",
            order: 1,
            rationale: "Use generated scene material.",
            sceneId: "scene-1",
            source: {
              endSecond: 4,
              kind: "generated-scene-clip",
              sceneClipAudioUrl: "https://cdn.example.test/scene-audio.m4a",
              sceneClipUrl: "https://cdn.example.test/scene.mp4",
              sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-video.mp4",
              startSecond: 0,
            },
            subtitle: "Hook",
            timelineStartSecond: 1,
            transition: "cut",
            voiceover: "",
          },
        ],
        strategy: "Edit generated scene materials.",
        targetDurationSeconds: 5,
      } satisfies SmartEditPlan,
      "segment-1",
      "unlink",
    );

    const unlinked = unlinkSmartEditTimelineElementGroup(plan, "video-segment-1-unlink");
    expect(unlinked.timeline?.elements.every((element) => element.linkedGroupId === undefined)).toBe(true);

    const movedUnlinked = moveSmartEditTrackClipOnTimeline(
      unlinked,
      { id: "video-segment-1-unlink", trackId: "video" },
      1,
      "magnetic",
    );
    expect(movedUnlinked.timeline?.elements.find((element) => element.id === "video-segment-1-unlink")).toMatchObject({
      startSecond: 2,
    });
    expect(movedUnlinked.timeline?.elements.find((element) => element.id === "source-audio-segment-1-unlink")).toMatchObject({
      startSecond: 1,
    });

    const relinked = relinkSmartEditTimelineElementWithSceneMate(
      movedUnlinked,
      "video-segment-1-unlink",
      "again",
    );
    expect(
      relinked.timeline?.elements.filter((element) => element.linkedGroupId === "linked-material-again"),
    ).toHaveLength(2);

    const movedRelinked = moveSmartEditTrackClipOnTimeline(
      relinked,
      { id: "source-audio-segment-1-unlink", trackId: "sourceAudio" },
      0.5,
      "magnetic",
    );
    expect(movedRelinked.timeline?.elements.find((element) => element.id === "source-audio-segment-1-unlink")).toMatchObject({
      startSecond: 1.5,
    });
    expect(movedRelinked.timeline?.elements.find((element) => element.id === "video-segment-1-unlink")).toMatchObject({
      startSecond: 2.5,
    });

    expect(
      relinkSmartEditTimelineElements(movedUnlinked, ["video-segment-1-unlink"], "too-small"),
    ).toBe(movedUnlinked);
  });

  it("slips linked video and audio source ranges without moving timeline clips", () => {
    const plan = detachSmartEditSceneVideoToTimelineElement(
      {
        audio: {
          bgmTrack: "none",
          targetLanguage: "zh-CN",
          voice: "clear-host",
        },
        createdAt: "2026-06-06T00:00:00.000Z",
        id: "plan-slip",
        projectId: "project-1",
        segments: [
          {
            assetTags: [],
            durationSeconds: 3,
            enabled: true,
            id: "segment-1",
            order: 1,
            rationale: "Use a longer generated clip for source slip.",
            sceneId: "scene-1",
            source: {
              endSecond: 8,
              kind: "generated-scene-clip",
              sceneClipAudioUrl: "https://cdn.example.test/scene-audio.m4a",
              sceneClipUrl: "https://cdn.example.test/scene.mp4",
              sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-video.mp4",
              startSecond: 2,
            },
            subtitle: "Hook",
            timelineStartSecond: 1,
            transition: "cut",
            voiceover: "",
          },
        ],
        strategy: "Slip generated scene materials.",
        targetDurationSeconds: 6,
      } satisfies SmartEditPlan,
      "segment-1",
      "slip",
    );

    const slipped = slipSmartEditTimelineElementSource(
      plan,
      "video-segment-1-slip",
      1.4,
    );
    expect(slipped.timeline?.elements.find((element) => element.id === "video-segment-1-slip")).toMatchObject({
      durationSeconds: 3,
      startSecond: 1,
      trimEndSecond: 6.4,
      trimStartSecond: 3.4,
    });
    expect(slipped.timeline?.elements.find((element) => element.id === "source-audio-segment-1-slip")).toMatchObject({
      durationSeconds: 3,
      startSecond: 1,
      trimEndSecond: 6.4,
      trimStartSecond: 3.4,
    });

    const clamped = slipSmartEditTimelineElementSource(
      slipped,
      "source-audio-segment-1-slip",
      10,
    );
    expect(clamped.timeline?.elements.find((element) => element.id === "video-segment-1-slip")).toMatchObject({
      durationSeconds: 3,
      startSecond: 1,
      trimEndSecond: 8,
      trimStartSecond: 5,
    });
    expect(clamped.timeline?.elements.find((element) => element.id === "source-audio-segment-1-slip")).toMatchObject({
      trimEndSecond: 8,
      trimStartSecond: 5,
    });
  });

  it("moves and deletes multiple independent smart edit timeline materials as a batch", () => {
    const basePlan = addSmartEditTimelineTextElement(
      detachSmartEditSceneVideoToTimelineElement(
        {
          audio: {
            bgmTrack: "none",
            targetLanguage: "zh-CN",
            voice: "clear-host",
          },
          createdAt: "2026-06-06T00:00:00.000Z",
          id: "plan-batch-materials",
          projectId: "project-1",
          segments: [
            {
              assetTags: [],
              durationSeconds: 3,
              enabled: true,
              id: "segment-1",
              order: 1,
              rationale: "Use generated scene material.",
              sceneId: "scene-1",
              source: {
                endSecond: 6,
                kind: "generated-scene-clip",
                sceneClipAudioUrl: "https://cdn.example.test/scene-audio.m4a",
                sceneClipUrl: "https://cdn.example.test/scene.mp4",
                sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-video.mp4",
                startSecond: 0,
              },
              subtitle: "Hook",
              timelineStartSecond: 1,
              transition: "cut",
              voiceover: "",
            },
          ],
          strategy: "Batch edit generated materials.",
          targetDurationSeconds: 8,
        } satisfies SmartEditPlan,
        "segment-1",
        "batch",
      ),
      5,
      "batch-caption",
    );

    const moved = moveSmartEditTimelineElementsOnTimeline(
      basePlan,
      ["video-segment-1-batch", "text-batch-caption"],
      1.2,
    );
    expect(moved.timeline?.elements.find((element) => element.id === "video-segment-1-batch")).toMatchObject({
      startSecond: 2.2,
    });
    expect(moved.timeline?.elements.find((element) => element.id === "source-audio-segment-1-batch")).toMatchObject({
      startSecond: 2.2,
    });
    expect(moved.timeline?.elements.find((element) => element.id === "text-batch-caption")).toMatchObject({
      startSecond: 6.2,
    });

    const removed = removeSmartEditTimelineElementsFromTimeline(
      moved,
      ["video-segment-1-batch", "text-batch-caption"],
    );
    expect(removed.timeline?.elements.some((element) => element.id === "video-segment-1-batch")).toBe(false);
    expect(removed.timeline?.elements.some((element) => element.id === "source-audio-segment-1-batch")).toBe(false);
    expect(removed.timeline?.elements.some((element) => element.id === "text-batch-caption")).toBe(false);
  });

  it("selects independent timeline materials inside a track box range", () => {
    const plan = addSmartEditTimelineTextElement(
      addSmartEditTimelineTextElement(
        addSmartEditTimelineVoiceElement(
          {
            audio: {
              bgmTrack: "none",
              targetLanguage: "zh-CN",
              voice: "clear-host",
            },
            createdAt: "2026-06-06T00:00:00.000Z",
            id: "plan-box-select",
            projectId: "project-1",
            segments: [
              {
                assetTags: [],
                durationSeconds: 4,
                enabled: true,
                id: "segment-1",
                order: 1,
                rationale: "Box selection demo.",
                sceneId: "scene-1",
                source: { imageUrl: "https://cdn.example.test/image.png", kind: "image-asset" },
                subtitle: "Base",
                timelineStartSecond: 0,
                transition: "cut",
                voiceover: "",
              },
            ],
            strategy: "Select independent materials.",
            targetDurationSeconds: 8,
          } satisfies SmartEditPlan,
          1,
          "box-voice",
        ),
        2,
        "box-text-a",
      ),
      5,
      "box-text-b",
    );

    expect(
      selectSmartEditTimelineElementIdsInBox(plan, {
        endSecond: 4.2,
        startSecond: 1.5,
        trackIds: ["caption"],
      }),
    ).toEqual(["text-box-text-a"]);
    expect(
      selectSmartEditTimelineElementIdsInBox(plan, {
        endSecond: 3.4,
        startSecond: 0.4,
        trackIds: ["voice", "caption"],
      }),
    ).toEqual(["voice-box-voice", "text-box-text-a"]);
  });

  it("selects all editable independent smart edit timeline materials while skipping locked tracks", () => {
    const plan = updateSmartEditTimelineTrack(
      addSmartEditTimelineTextElement(
        addSmartEditTimelineVoiceElement(
          {
            audio: {
              bgmTrack: "none",
              targetLanguage: "zh-CN",
              voice: "clear-host",
            },
            createdAt: "2026-06-06T00:00:00.000Z",
            id: "plan-select-all-materials",
            projectId: "project-1",
            segments: [
              {
                assetTags: [],
                durationSeconds: 4,
                enabled: true,
                id: "segment-1",
                order: 1,
                rationale: "Keep derived storyboard materials out of timeline select-all.",
                sceneId: "scene-1",
                source: { imageUrl: "https://cdn.example.test/image.png", kind: "image-asset" },
                subtitle: "Derived caption",
                timelineStartSecond: 0,
                transition: "cut",
                voiceover: "",
              },
            ],
            strategy: "Select independent materials.",
            targetDurationSeconds: 8,
          } satisfies SmartEditPlan,
          1,
          "select-all-voice",
        ),
        2,
        "select-all-text",
      ),
      "voiceover",
      { locked: true },
    );

    expect(selectSmartEditTimelineElementIds(plan)).toEqual(["text-select-all-text"]);
  });

  it("selects track ids crossed by a cross-track marquee range", () => {
    expect(
      selectSmartEditTrackIdsInMarquee(
        [
          { bottom: 74, locked: false, top: 0, trackId: "video" },
          { bottom: 158, locked: false, top: 84, trackId: "caption" },
          { bottom: 242, locked: false, top: 168, trackId: "sourceAudio" },
          { bottom: 326, locked: true, top: 252, trackId: "voice" },
          { bottom: 410, locked: false, top: 336, trackId: "bgm" },
        ],
        { endY: 265, startY: 28 },
      ),
    ).toEqual(["video", "caption", "sourceAudio"]);
  });

  it("maps timeline keyboard arrow nudges to frame-level and coarse moves", () => {
    expect(smartEditTimelineKeyboardNudgeSeconds("ArrowRight", false)).toBe(0.1);
    expect(smartEditTimelineKeyboardNudgeSeconds("ArrowLeft", false)).toBe(-0.1);
    expect(smartEditTimelineKeyboardNudgeSeconds("ArrowRight", true)).toBe(1);
    expect(smartEditTimelineKeyboardNudgeSeconds("ArrowLeft", true)).toBe(-1);
    expect(smartEditTimelineKeyboardNudgeSeconds("ArrowUp", true)).toBeUndefined();
  });

  it("previews track clip drag positions for selected timeline materials", () => {
    const clips = [
      {
        durationSeconds: 2,
        id: "video-a",
        meta: "Video",
        range: "0.0s - 2.0s",
        startSecond: 1,
        title: "Video A",
        trackId: "video" as const,
      },
      {
        durationSeconds: 1.5,
        id: "audio-a",
        meta: "Audio",
        range: "2.0s - 3.5s",
        startSecond: 2,
        title: "Audio A",
        trackId: "sourceAudio" as const,
      },
      {
        durationSeconds: 1,
        id: "caption-a",
        meta: "Text",
        range: "5.0s - 6.0s",
        startSecond: 5,
        title: "Caption A",
        trackId: "caption" as const,
      },
    ];

    expect(
      previewSmartEditTrackClipDrag({
        currentClientX: 165,
        pixelsPerSecond: 40,
        selectedIds: ["video-a", "audio-a"],
        startClientX: 100,
        trackClip: clips[0],
        trackClips: clips,
      }),
    ).toEqual([
      {
        durationSeconds: 2,
        id: "video-a",
        startSecond: 2.6,
        trackId: "video",
      },
      {
        durationSeconds: 1.5,
        id: "audio-a",
        startSecond: 3.6,
        trackId: "sourceAudio",
      },
    ]);

    expect(
      previewSmartEditTrackClipDrag({
        currentClientX: 0,
        pixelsPerSecond: 40,
        selectedIds: [],
        startClientX: 100,
        trackClip: clips[0],
        trackClips: clips,
      }),
    ).toEqual([
      {
        durationSeconds: 2,
        id: "video-a",
        startSecond: 0,
        trackId: "video",
      },
    ]);
  });

  it("adds an independent text element to the smart edit timeline at the playhead", () => {
    const plan = {
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
          voiceover: "",
          source: {
            assetId: "asset-video",
            kind: "video-slice",
            startSecond: 0,
          },
        },
      ],
      targetDurationSeconds: 4,
    } satisfies SmartEditPlan;

    const nextPlan = addSmartEditTimelineTextElement(plan, 1.86, "caption");

    expect(nextPlan.timeline?.tracks.some((track) => track.id === "text-copy")).toBe(true);
    expect(nextPlan.timeline?.elements.some((element) => element.id === "segment-1-video")).toBe(true);
    expect(nextPlan.timeline?.elements).toContainEqual(
      expect.objectContaining({
        durationSeconds: 2,
        hidden: false,
        id: "text-caption",
        kind: "text",
        label: "New text",
        muted: false,
        playbackRate: 1,
        startSecond: 1.9,
        text: "New text",
        trackId: "text-copy",
        trimStartSecond: 0,
      }),
    );
    expect(nextPlan.timeline?.elements.find((element) => element.id === "text-caption")?.segmentId).toBeUndefined();
    expect(nextPlan.timeline?.durationSeconds).toBe(4);
    expect(nextPlan.targetDurationSeconds).toBe(4);
  });

  it("updates independent text material style on the smart edit timeline", () => {
    const plan = addSmartEditTimelineTextElement(
      {
        audio: {
          bgmTrack: "none",
          targetLanguage: "zh-CN",
          voice: "clear-host",
        },
        createdAt: "2026-06-05T00:00:00.000Z",
        id: "plan-1",
        projectId: "project-1",
        segments: [
          {
            assetTags: [],
            durationSeconds: 4,
            enabled: true,
            id: "segment-1",
            order: 1,
            sceneId: "scene-1",
            source: { imageUrl: "https://cdn.example.test/image.png", kind: "image-asset" },
            subtitle: "Base caption",
            transition: "cut",
            voiceover: "",
          },
        ],
        strategy: "Use timeline text styling.",
        targetDurationSeconds: 4,
      } satisfies SmartEditPlan,
      1,
      "style",
    );

    const nextPlan = updateSmartEditTimelineElement(plan, "text-style", {
      textColor: "#ffcc00",
      textFontSize: 96,
      textPositionYPercent: 4,
    });

    expect(nextPlan.timeline?.elements.find((element) => element.id === "text-style")).toMatchObject({
      textColor: "#ffcc00",
      textFontSize: 72,
      textPositionYPercent: 8,
      trackId: "text-copy",
    });
  });

  it("updates smart edit timeline track state and mirrors it to track elements", () => {
    const plan = addSmartEditTimelineTextElement(
      addSmartEditTimelineVoiceElement(
        {
          audio: {
            bgmTrack: "none",
            voice: "clear-host",
          },
          createdAt: "2026-06-06T00:00:00.000Z",
          id: "plan-track-state",
          projectId: "project-1",
          segments: [
            {
              assetTags: [],
              durationSeconds: 4,
              enabled: true,
              id: "segment-1",
              order: 1,
              rationale: "Track state demo.",
              sceneId: "scene-1",
              source: { imageUrl: "https://cdn.example.test/hero.png", kind: "image-asset" },
              subtitle: "Hook",
              timelineStartSecond: 0,
              transition: "cut",
              voiceover: "",
            },
          ],
          strategy: "Use timeline tracks.",
          targetDurationSeconds: 4,
        } satisfies SmartEditPlan,
        1,
        "voice-track",
      ),
      2,
      "text-track",
    );

    const hiddenTextTrack = updateSmartEditTimelineTrack(plan, "text-copy", { hidden: true });
    expect(hiddenTextTrack.timeline?.tracks.find((track) => track.id === "text-copy")?.hidden).toBe(
      true,
    );
    expect(
      hiddenTextTrack.timeline?.elements
        .filter((element) => element.trackId === "text-copy")
        .every((element) => element.hidden),
    ).toBe(true);

    const mutedVoiceTrack = updateSmartEditTimelineTrack(hiddenTextTrack, "voiceover", {
      locked: true,
      muted: true,
    });
    expect(mutedVoiceTrack.timeline?.tracks.find((track) => track.id === "voiceover")).toMatchObject({
      locked: true,
      muted: true,
    });
    expect(
      mutedVoiceTrack.timeline?.elements
        .filter((element) => element.trackId === "voiceover")
        .every((element) => element.muted),
    ).toBe(true);
    expect(updateSmartEditTimelineTrack(plan, "missing-track", { hidden: true })).toBe(plan);
  });

  it("splits an independent smart edit timeline element at the playhead", () => {
    const plan = addSmartEditTimelineVoiceElement(
      {
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
            voiceover: "",
            source: {
              assetId: "asset-video",
              kind: "video-slice",
              startSecond: 0,
            },
          },
        ],
        targetDurationSeconds: 4,
      } satisfies SmartEditPlan,
      1,
      "open-cut",
    );

    const split = splitSmartEditTimelineElementAtPlayhead(
      plan,
      "voice-open-cut",
      1.8,
      "knife",
    );

    const leftVoice = split?.timeline?.elements.find((element) => element.id === "voice-open-cut");
    const rightVoice = split?.timeline?.elements.find((element) => element.id === "voice-open-cut-split-knife");
    expect(leftVoice).toMatchObject({
      durationSeconds: 0.8,
      startSecond: 1,
    });
    expect(leftVoice?.segmentId).toBeUndefined();
    expect(rightVoice).toMatchObject({
      durationSeconds: 1.2,
      label: "New voiceover (split)",
      startSecond: 1.8,
    });
    expect(rightVoice?.segmentId).toBeUndefined();
    expect(split?.timeline?.durationSeconds).toBe(4);
    expect(split?.targetDurationSeconds).toBe(4);
  });

  it("trims an independent smart edit timeline element to the left or right of the playhead", () => {
    const plan = addSmartEditTimelineVoiceElement(
      {
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
            voiceover: "",
            source: {
              assetId: "asset-video",
              kind: "video-slice",
              startSecond: 0,
            },
          },
        ],
        targetDurationSeconds: 4,
      } satisfies SmartEditPlan,
      1,
      "trim",
    );

    const keepRight = trimSmartEditTimelineElementAtPlayhead(
      plan,
      "voice-trim",
      1.8,
      "right",
    );
    const keepLeft = trimSmartEditTimelineElementAtPlayhead(
      plan,
      "voice-trim",
      1.8,
      "left",
    );

    const rightTrimmedVoice = keepRight?.timeline?.elements.find((element) => element.id === "voice-trim");
    const leftTrimmedVoice = keepLeft?.timeline?.elements.find((element) => element.id === "voice-trim");
    expect(rightTrimmedVoice).toMatchObject({
      durationSeconds: 1.2,
      startSecond: 1.8,
      trimStartSecond: 0.8,
    });
    expect(rightTrimmedVoice?.segmentId).toBeUndefined();
    expect(leftTrimmedVoice).toMatchObject({
      durationSeconds: 0.8,
      startSecond: 1,
      trimStartSecond: 0,
    });
    expect(leftTrimmedVoice?.segmentId).toBeUndefined();
    expect(keepRight?.targetDurationSeconds).toBe(4);
    expect(keepLeft?.targetDurationSeconds).toBe(4);
  });

  it("resizes independent smart edit video and subtitle materials from timeline clip edges", () => {
    const basePlan = addSmartEditTimelineTextElement(
      detachSmartEditSceneVideoToTimelineElement(
        {
          audio: {
            bgmTrack: "none",
            targetLanguage: "zh-CN",
            voice: "clear-host",
          },
          createdAt: "2026-06-06T00:00:00.000Z",
          id: "plan-resize",
          projectId: "project-1",
          segments: [
            {
              assetTags: [],
              durationSeconds: 4,
              enabled: true,
              id: "segment-1",
              order: 1,
              rationale: "Use generated scene material.",
              sceneId: "scene-1",
              source: {
                endSecond: 4,
                kind: "video-slice",
                sceneClipUrl: "https://cdn.example.test/scene.mp4",
                sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-video.mp4",
                startSecond: 0,
              },
              subtitle: "Hook",
              timelineStartSecond: 1,
              transition: "cut",
              voiceover: "",
            },
          ],
          strategy: "Edit generated scene materials.",
          targetDurationSeconds: 5,
        } satisfies SmartEditPlan,
        "segment-1",
        "video-edge",
      ),
      2,
      "caption-edge",
    );

    const videoElementId = "video-segment-1-video-edge";
    const trimmedVideo = resizeSmartEditTrackClipEdge(
      basePlan,
      { id: videoElementId, trackId: "video" },
      "in",
      0.8,
    );
    expect(trimmedVideo.timeline?.elements.find((element) => element.id === videoElementId)).toMatchObject({
      durationSeconds: 3.2,
      startSecond: 1.8,
      trimEndSecond: 4,
      trimStartSecond: 0.8,
    });

    const extendedVideo = resizeSmartEditTrackClipEdge(
      trimmedVideo,
      { id: videoElementId, trackId: "video" },
      "out",
      0.6,
    );
    expect(extendedVideo.timeline?.elements.find((element) => element.id === videoElementId)).toMatchObject({
      durationSeconds: 3.8,
      trimEndSecond: 4.6,
      trimStartSecond: 0.8,
    });

    const resizedCaption = resizeSmartEditTrackClipEdge(
      extendedVideo,
      { id: "text-caption-edge", trackId: "caption" },
      "out",
      -0.7,
    );
    expect(resizedCaption.timeline?.elements.find((element) => element.id === "text-caption-edge")).toMatchObject({
      durationSeconds: 1.3,
      startSecond: 2,
      text: "New text",
    });
    expect(resizedCaption.targetDurationSeconds).toBeGreaterThanOrEqual(5);
  });

  it("ripples the timeline when deleting a smart edit segment", () => {
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
    const plan = addSmartEditTimelineVoiceElement(
      {
        audio: {
          bgmTrack: "none",
          targetLanguage: "zh-CN",
          voice: "clear-host",
        },
        createdAt: "2026-06-02T00:00:00.000Z",
        id: "plan-1",
        projectId: "project-1",
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
        strategy: "Use compact timeline clips.",
        targetDurationSeconds: 6,
      } satisfies SmartEditPlan,
      5.2,
      "tail",
    );

    const nextPlan = removeSmartEditSegmentsFromTimeline(
      plan,
      ["segment-2"],
      "ripple",
    );

    expect(nextPlan.segments.map((segment) => segment.id)).toEqual(["segment-1", "segment-3"]);
    expect(nextPlan.segments.map((segment) => segment.timelineStartSecond)).toEqual([0, 2]);
    expect(nextPlan.timeline?.elements.find((element) => element.id === "segment-3-video")?.startSecond).toBe(2);
    expect(nextPlan.timeline?.elements.find((element) => element.id === "voice-tail")?.startSecond).toBe(3.2);
    expect(nextPlan.timeline?.durationSeconds).toBe(5.2);
    expect(nextPlan.targetDurationSeconds).toBe(5.2);
  });

  it("ripples later timeline materials after trim-left and trim-right actions", () => {
    const plan = addSmartEditTimelineVoiceElement(
      {
        audio: {
          bgmTrack: "none",
          targetLanguage: "zh-CN",
          voice: "clear-host",
        },
        createdAt: "2026-06-02T00:00:00.000Z",
        id: "plan-1",
        projectId: "project-1",
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
              startSecond: 0,
            },
          },
          {
            id: "segment-2",
            sceneId: "scene-2",
            order: 2,
            enabled: true,
            durationSeconds: 2,
            timelineStartSecond: 4,
            transition: "cut",
            subtitle: "CTA",
            voiceover: "CTA",
            source: {
              assetId: "asset-video",
              kind: "video-slice",
              startSecond: 4,
            },
          },
        ],
        strategy: "Use compact timeline clips.",
        targetDurationSeconds: 7,
      } satisfies SmartEditPlan,
      6,
      "tail",
    );

    const keepRight = trimSmartEditSegmentAtPlayhead(
      plan,
      "segment-1",
      1.5,
      "right",
      "ripple",
    );
    const keepLeft = trimSmartEditSegmentAtPlayhead(
      plan,
      "segment-1",
      1.5,
      "left",
      "ripple",
    );

    expect(keepRight?.segments.map((segment) => segment.timelineStartSecond)).toEqual([0, 2.5]);
    expect(keepRight?.segments.map((segment) => segment.durationSeconds)).toEqual([2.5, 2]);
    expect(keepRight?.timeline?.elements.find((element) => element.id === "segment-1-video")).toMatchObject({
      startSecond: 0,
      trimStartSecond: 1.5,
    });
    expect(keepRight?.timeline?.elements.find((element) => element.id === "voice-tail")?.startSecond).toBe(4.5);
    expect(keepRight?.targetDurationSeconds).toBe(6.5);

    expect(keepLeft?.segments.map((segment) => segment.timelineStartSecond)).toEqual([0, 1.5]);
    expect(keepLeft?.segments.map((segment) => segment.durationSeconds)).toEqual([1.5, 2]);
    expect(keepLeft?.timeline?.elements.find((element) => element.id === "voice-tail")?.startSecond).toBe(3.5);
    expect(keepLeft?.targetDurationSeconds).toBe(5.5);
  });

  it("deletes an independent smart edit timeline material and ripples later clips", () => {
    const planWithVoice = addSmartEditTimelineVoiceElement(
      {
        audio: {
          bgmTrack: "none",
          targetLanguage: "zh-CN",
          voice: "clear-host",
        },
        createdAt: "2026-06-02T00:00:00.000Z",
        id: "plan-1",
        projectId: "project-1",
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
            voiceover: "",
            source: {
              assetId: "asset-video",
              kind: "video-slice",
              startSecond: 0,
            },
          },
        ],
        strategy: "Use timeline materials.",
        targetDurationSeconds: 4,
      } satisfies SmartEditPlan,
      1,
      "delete",
    );
    const planWithText = addSmartEditTimelineTextElement(planWithVoice, 3.5, "tail");

    const nextPlan = removeSmartEditTimelineElementFromTimeline(
      planWithText,
      "voice-delete",
      "ripple",
    );

    expect(nextPlan.timeline?.elements.some((element) => element.id === "voice-delete")).toBe(false);
    expect(nextPlan.timeline?.elements.find((element) => element.id === "text-tail")).toMatchObject({
      startSecond: 1.5,
      text: "New text",
    });
    expect(nextPlan.segments[0].timelineStartSecond).toBe(0);
    expect(nextPlan.targetDurationSeconds).toBe(4);
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
                sourceAudioVolume: 0.72,
                sourceAudioVolumeKeyframes: [
                  { id: "source-volume-start", timeSecond: 0, volume: 0.42 },
                  { id: "source-volume-peak", timeSecond: 1.4, volume: 0.95 },
                ],
                voiceoverVolume: 1.2,
                voiceoverVolumeKeyframes: [
                  { id: "voice-volume-start", timeSecond: 0.2, volume: 0.8 },
                  { id: "voice-volume-peak", timeSecond: 1.1, volume: 1.35 },
                ],
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
                    keyframes: [
                      {
                        id: "effect-brightness-kf-start",
                        easing: "linear",
                        param: "amount",
                        timeSecond: 0,
                        value: 0,
                      },
                      {
                        id: "effect-brightness-kf-peak",
                        easing: "linear",
                        param: "amount",
                        timeSecond: 1.2,
                        value: 0.35,
                      },
                    ],
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
    expect(markup).not.toContain("Visual effects");
    expect(markup).not.toContain("Effect stack");
    expect(markup).not.toContain("Add effect");
    expect(markup).not.toContain("Brightness");
    expect(markup).not.toContain("Vignette");
    expect(markup).toContain("Disabled");
    expect(markup).not.toContain("Add amount keyframe");
    expect(markup).not.toContain("Amount keyframes");
    expect(markup).not.toContain("Visual mask");
    expect(markup).not.toContain("Mask type");
    expect(markup).not.toContain("Invert mask");
    expect(markup).not.toContain("Visual keyframes");
    expect(markup).toContain("Audio volume envelopes");
    expect(markup).toContain("Source audio volume");
    expect(markup).toContain("Voice volume");
    expect(markup).toContain("Source audio volume keyframes");
    expect(markup).toContain("Voice volume keyframes");
    expect(markup).toContain("Add volume keyframe");
    expect(markup).toContain("1.4s");
    expect(markup).toContain("1.35");
    expect(markup).toContain("Add voice");
    expect(markup).toContain("Add text");
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
