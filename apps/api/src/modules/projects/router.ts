import { Router } from "express";
import { z } from "zod";
import type {
  AssetMetadata,
  ScriptGenerationRequest,
} from "@shopclip/shared";
import {
  ProjectBriefSchema,
  ProjectPrepUpdateSchema,
} from "@shopclip/shared";
import { buildMockDashboard } from "../dashboard/mockDashboard.js";
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
import { registerReferenceAnalysisRoute } from "./referenceAnalysisRouteService.js";
import { registerSceneRoutes } from "./sceneRouteService.js";
import {
  sendInvalidRequest,
  sendNotFound,
} from "./httpResponseUtils.js";
import { MemoryProjectStore } from "./memoryStore.js";
import type { ProjectSnapshot, ProjectStore } from "./projectStore.js";
import { deleteStoredAssetObjects } from "./projectAssetUtils.js";
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

const OptionalNonEmptyStringSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.string().trim().min(1).optional(),
);

const ReferenceAnalyzeRequestSchema = z
  .object({
    projectId: OptionalNonEmptyStringSchema,
    sourceAssetId: OptionalNonEmptyStringSchema,
    sourceUrl: OptionalNonEmptyStringSchema,
    sourcePlatform: z.string().trim().min(1),
    sourceDeclaration: z.string().trim().min(1),
    title: z.string().trim().min(1),
    author: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1),
    publicStats: z
      .object({
        likes: z.number().int().nonnegative().default(0),
        comments: z.number().int().nonnegative().default(0),
        shares: z.number().int().nonnegative().default(0),
        views: z.number().int().nonnegative().default(0),
      })
      .default({ likes: 0, comments: 0, shares: 0, views: 0 }),
    status: z.enum(["registered", "analyzing", "ready", "failed"]).default("registered"),
    errorMessage: z.string().trim().min(1).optional(),
  })
  .superRefine((reference, context) => {
    if (!reference.sourceUrl && !reference.sourceAssetId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either sourceUrl or sourceAssetId is required.",
        path: ["sourceUrl"],
      });
    }
  });

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

  router.post("/projects", async (request, response) => {
    const parsedBrief = ProjectBriefSchema.safeParse(request.body);
    if (!parsedBrief.success) {
      sendInvalidRequest(
        response,
        "INVALID_PROJECT_BRIEF",
        "Project brief is missing required fields or has invalid values.",
      );
      return;
    }

    response.status(201).json({
      project: await store.createProject(parsedBrief.data),
    });
  });

  router.get("/projects", async (_request, response) => {
    response.json({
      projects: await store.listProjects(),
    });
  });

  router.get("/projects/:projectId", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.json({ project });
  });

  router.patch("/projects/:projectId/prep", async (request, response) => {
    const parsedUpdate = ProjectPrepUpdateSchema.safeParse(request.body ?? {});
    if (!parsedUpdate.success) {
      sendInvalidRequest(
        response,
        "INVALID_PROJECT_PREP",
        "Project preparation settings are invalid.",
      );
      return;
    }

    const project = await store.updateProjectPrepKeywords(
      request.params.projectId,
      parsedUpdate.data.keywords,
    );
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.json({ project });
  });

  router.patch("/projects/:projectId", async (request, response) => {
    const parsedBrief = ProjectBriefSchema.safeParse(request.body ?? {});
    if (!parsedBrief.success) {
      sendInvalidRequest(
        response,
        "INVALID_PROJECT_BRIEF",
        "Project brief update failed validation.",
      );
      return;
    }

    const project = await store.updateProjectBrief(request.params.projectId, parsedBrief.data);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.json({ project });
  });

  router.delete("/projects/:projectId", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    try {
      await deleteStoredAssetObjects(storageProvider, project.assets);
    } catch (error) {
      response.status(502).json({
        error: {
          code: "STORAGE_DELETE_FAILED",
          message: error instanceof Error ? error.message : "Storage delete failed.",
        },
      });
      return;
    }

    const deleted = await store.deleteProject(project.id);
    if (!deleted) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.json({
      deletedProject: {
        id: project.id,
        title: project.title,
        productName: project.productName,
        status: project.status,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        assetCount: project.assets.length,
        coverAssetId: project.assets.find(
          (asset) => asset.type === "image" || asset.mimeType?.startsWith("image/"),
        )?.id,
        coverAssetUrl: project.assets.find(
          (asset) => asset.type === "image" || asset.mimeType?.startsWith("image/"),
        )?.url,
        sceneCount: project.scenes.length,
      },
      deletedAssets: project.assets,
    });
  });

  router.get("/projects/:projectId/dashboard", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.json(buildMockDashboard(project));
  });

  registerAssetRoutes({
    cosAssetSearch,
    externalAssetDownloader,
    router,
    storageProvider,
    store,
  });

  router.post("/references/analyze", async (request, response) => {
    const parsedReference = ReferenceAnalyzeRequestSchema.safeParse(request.body);
    if (!parsedReference.success) {
      sendInvalidRequest(
        response,
        "INVALID_REFERENCE_ANALYZE_REQUEST",
        "Reference video analysis request failed validation.",
      );
      return;
    }

    const registration = await registerReferenceAnalysisRoute({
      input: parsedReference.data,
      referenceDownloader,
      storageProvider,
      store,
    });
    if (registration.kind === "project-not-found") {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }
    if (registration.kind === "source-asset-not-found") {
      sendNotFound(
        response,
        "REFERENCE_SOURCE_ASSET_NOT_FOUND",
        "Reference source asset was not found.",
      );
      return;
    }
    if (registration.kind === "source-asset-project-mismatch") {
      sendInvalidRequest(
        response,
        "REFERENCE_SOURCE_ASSET_PROJECT_MISMATCH",
        "Reference source asset does not belong to this project.",
      );
      return;
    }
    if (registration.kind === "source-asset-not-video") {
      sendInvalidRequest(
        response,
        "REFERENCE_SOURCE_ASSET_NOT_VIDEO",
        "Reference source asset must be a video asset.",
      );
      return;
    }
    if (registration.kind === "registration-failed") {
      response.status(500).json({
        error: {
          code: "REFERENCE_ANALYSIS_REGISTRATION_FAILED",
          message: registration.message,
        },
      });
      return;
    }
    if (registration.kind === "analysis-failed") {
      response.status(500).json({
        error: {
          code: "REFERENCE_ANALYSIS_FAILED",
          message: "Reference video could not be registered for analysis.",
        },
      });
      return;
    }

    response.status(202).json({ reference: registration.reference });
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
