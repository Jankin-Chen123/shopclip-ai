import { Router } from "express";
import type {
  AssetMetadata,
  ScriptGenerationRequest,
} from "@shopclip/shared";
import { searchCosIntelligentAssets } from "../../providers/assets/cosIntelligentSearchProvider.js";
import type { CosIntelligentSearchInput } from "../../providers/assets/cosIntelligentSearchProvider.js";
import type { ReferenceDownloadProvider } from "../../providers/references/referenceDownloadProvider.js";
import { createSmartEditPlan } from "../../providers/ai/smartEditPlannerProvider.js";
import { generateInspiration } from "../../providers/ai/arkInspirationProvider.js";
import {
  generateFallbackScript,
  rewriteFallbackScript,
  structureModelScript,
} from "../../providers/ai/mockScriptProvider.js";
import {
  extractVideoReferenceFrames,
  type VideoFrameExtractor,
} from "../../providers/media/videoFrameExtractor.js";
import type { RenderExportPublisher } from "../../providers/renderer/renderExportPublisher.js";
import { composeSmartEditToStorage } from "../../providers/renderer/smartEditComposer.js";
import { materializeSceneClipsForSmartEdit } from "../../providers/renderer/sceneClipMaterializer.js";
import { CosStorageProvider } from "../../providers/storage/cosStorageProvider.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import {
  downloadExternalAsset,
  type ExternalAssetDownloader,
} from "./externalAssetImportUtils.js";
import { registerAssetRoutes } from "./assetRouteService.js";
import {
  registerRenderRoutes,
  type SceneClipComposer,
  type SceneClipMaterializer,
} from "./renderRouteService.js";
import { registerReferenceRoutes } from "./referenceRouteService.js";
import { registerReferenceAnalysisRoutes } from "./referenceAnalysisRouteService.js";
import { registerSceneRoutes } from "./sceneRouteService.js";
import { MemoryProjectStore } from "./memoryStore.js";
import type { ProjectSnapshot, ProjectStore } from "./projectStore.js";
import { registerProjectCoreRoutes } from "./projectCoreRouteService.js";
import { resolvePreparedScriptAssets } from "./projectAssetResolution.js";
import { registerScriptRoutes } from "./scriptRouteService.js";
import {
  scriptGenerationPrompt,
  type ScriptPromptContext,
} from "./scriptPromptContext.js";
import { resolveScriptPromptContext } from "./scriptPromptContextResolution.js";
import {
  type SmartEditComposer,
  type SmartEditPlanner,
} from "./smartEditJobService.js";
import { registerSmartEditRoutes } from "./smartEditRouteService.js";
import {
  generateStoryboardSceneImageUrl,
  renderStoryboardSceneImages,
} from "./storyboardImageService.js";

export { buildScriptAssetPromptLines, scriptGenerationPrompt } from "./scriptPromptContext.js";

const shouldForceMockProviders = (): boolean => process.env.SHOPCLIP_FORCE_MOCK_PROVIDERS === "1";

const hasConfiguredTextProviderEnvironment = (): boolean =>
  Boolean(
    process.env.AI_GENERAL_API_KEY?.trim() ||
    process.env.AI_TEXT_API_KEY?.trim() ||
    process.env.AI_GENERAL_MODEL_ID?.trim() ||
    process.env.AI_TEXT_MODEL_ID?.trim(),
  );

const rewriteScriptWithConfiguredProvider = async (
  project: ProjectSnapshot,
  request: ScriptGenerationRequest,
  assets: AssetMetadata[],
  promptContext: ScriptPromptContext = {},
) => {
  const providerMode = (process.env.AI_PROVIDER_MODE ?? "ark").toLowerCase();
  const explicitMockMode = providerMode === "mock";
  if (shouldForceMockProviders()) {
    return rewriteFallbackScript(project, { assets, request });
  }
  if (!request.apiConfig?.general && explicitMockMode) {
    return rewriteFallbackScript(project, { assets, request });
  }
  if (
    !request.apiConfig?.general &&
    (!["ark", "doubao", "real"].includes(providerMode) || !hasConfiguredTextProviderEnvironment())
  ) {
    throw new Error(
      `Real script generation is not configured. Set AI_PROVIDER_MODE=ark plus AI_GENERAL_API_KEY/ARK_API_KEY and AI_GENERAL_MODEL_ID, or explicitly set AI_PROVIDER_MODE=mock for demo fixtures.`,
    );
  }

  const generated = await generateInspiration({
    assetType: "text",
    prompt: scriptGenerationPrompt(project, request, assets, promptContext),
    apiConfig: request.apiConfig,
  });
  const material = generated.materials.find((candidate) => candidate.status === "ready");
  if (!generated.fallback.used && material?.content) {
    return {
      fallback: {
        used: false,
        provider: generated.provider,
      },
      scriptText: material.content,
    };
  }

  if (explicitMockMode) {
    return rewriteFallbackScript(project, { assets, request });
  }

  throw new Error(
    generated.fallback.reason
      ? `Real script generation failed: ${generated.fallback.reason}`
      : "Real script generation failed without returning usable content.",
  );
};

export interface P0RouterOptions {
  cosAssetSearch?: (
    input: CosIntelligentSearchInput,
  ) => Promise<Awaited<ReturnType<typeof searchCosIntelligentAssets>>>;
  externalAssetDownloader?: ExternalAssetDownloader;
  store?: ProjectStore;
  storageProvider?: StorageProvider;
  renderExportPublisher?: RenderExportPublisher;
  referenceDownloader?: ReferenceDownloadProvider;
  sceneClipComposer?: SceneClipComposer;
  sceneClipMaterializer?: SceneClipMaterializer;
  smartEditComposer?: SmartEditComposer;
  smartEditPlanner?: SmartEditPlanner;
  videoFrameExtractor?: VideoFrameExtractor;
}

export const createP0Router = ({
  cosAssetSearch = searchCosIntelligentAssets,
  externalAssetDownloader = downloadExternalAsset,
  referenceDownloader,
  renderExportPublisher,
  sceneClipComposer,
  sceneClipMaterializer = materializeSceneClipsForSmartEdit,
  smartEditComposer = composeSmartEditToStorage,
  smartEditPlanner = createSmartEditPlan,
  store = new MemoryProjectStore(),
  storageProvider = new CosStorageProvider(),
  videoFrameExtractor = extractVideoReferenceFrames,
}: P0RouterOptions = {}): Router => {
  const router = Router();

  const resolvePreparedAssets = (
    project: ProjectSnapshot,
    request: ScriptGenerationRequest,
  ): Promise<{ assets: AssetMetadata[]; invalidAssetIds: string[] }> =>
    resolvePreparedScriptAssets({
      getAsset: (assetId) => store.getAsset(assetId),
      project,
      requestedAssetIds: request.assetIds,
    });

  const resolvePromptContextFromStore = (request: ScriptGenerationRequest) =>
    resolveScriptPromptContext({
      request,
      listAssets: async () => (await store.listAssets()).assets,
      listReferenceVideos: () => store.listReferenceVideos(),
      listViralTemplates: () => store.listViralTemplates(),
    });

  registerProjectCoreRoutes({
    router,
    storageProvider,
    store,
  });

  registerAssetRoutes({
    cosAssetSearch,
    externalAssetDownloader,
    router,
    storageProvider,
    store,
  });

  registerReferenceAnalysisRoutes({
    referenceDownloader,
    router,
    storageProvider,
    store,
  });

  registerReferenceRoutes({
    router,
    storageProvider,
    store,
  });
  registerScriptRoutes({
    generateFallbackScriptForProject: generateFallbackScript,
    renderStoryboardSceneImagesForScript: (project, script, request, assets) =>
      renderStoryboardSceneImages(project, script, request, assets, videoFrameExtractor),
    resolvePreparedAssets,
    resolvePromptContext: resolvePromptContextFromStore,
    rewriteScript: rewriteScriptWithConfiguredProvider,
    router,
    store,
    structureModelScriptForProject: structureModelScript,
  });
  registerRenderRoutes({
    renderExportPublisher,
    router,
    sceneClipComposer,
    sceneClipMaterializer,
    storageProvider,
    store,
  });
  registerSmartEditRoutes({
    router,
    smartEditComposer,
    smartEditPlanner,
    storageProvider,
    store,
  });
  registerSceneRoutes({
    generateImageUrl: (project, scene, imageRequest, assets) =>
      generateStoryboardSceneImageUrl(
        project,
        scene,
        imageRequest,
        assets,
        videoFrameExtractor,
      ),
    router,
    store,
  });

  return router;
};
