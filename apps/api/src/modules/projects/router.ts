import { Router, raw, type Response } from "express";
import { z } from "zod";
import type {
  AssetMetadata,
  ScriptGenerationRequest,
  SceneRenderClip,
  TraceEvent,
} from "@shopclip/shared";
import {
  ExternalAssetSearchRequestSchema,
  InspirationGenerateRequestSchema,
  ProjectBriefSchema,
  ProjectPrepUpdateSchema,
  ExternalAssetResultSchema,
  RenderRequestSchema,
  SmartEditRequestSchema,
  SmartEditSegmentRefreshRequestSchema,
  SceneRegenerationRequestSchema,
  SceneUpdateSchema,
  ScriptGenerationRequestSchema,
  ScriptResultSchema,
} from "@shopclip/shared";

import { createAssetSlices, inferAssetTags } from "../assets/tagging.js";
import {
  CreateAssetRequestSchema,
  CreateAssetUploadIntentRequestSchema,
  ConfirmAssetUploadRequestSchema,
  DeleteAssetsRequestSchema,
} from "../assets/validation.js";
import { buildMockDashboard } from "../dashboard/mockDashboard.js";
import { processAssetStructure } from "../assets/assetProcessingService.js";
import { buildViralTemplateFromReferences } from "../references/referenceTemplateService.js";
import { mergeAssetSearchResults } from "../retrieval/hybridAssetSearch.js";
import { searchAssets } from "../retrieval/search.js";
import { recallAssetsForScene } from "../scenes/assetRecallService.js";
import {
  mapCosImageMatchesToAssetResults,
  searchCosIntelligentAssets,
} from "../../providers/assets/cosIntelligentSearchProvider.js";
import type { CosIntelligentSearchInput } from "../../providers/assets/cosIntelligentSearchProvider.js";
import {
  createExternalAssetProvidersFromConfig,
  searchExternalAssets,
} from "../../providers/assets/externalAssetProviders.js";
import type { ReferenceDownloadProvider } from "../../providers/references/referenceDownloadProvider.js";
import { generateEditingSuggestions } from "../../providers/ai/editingAgentProvider.js";
import { createSmartEditPlan } from "../../providers/ai/smartEditPlannerProvider.js";
import { generateInspiration } from "../../providers/ai/arkInspirationProvider.js";
import { extractScriptTemplateWithGeneralModel } from "../../providers/ai/scriptTemplateExtractionProvider.js";
import {
  generateFallbackScript,
  rewriteFallbackScript,
  structureModelScript,
} from "../../providers/ai/mockScriptProvider.js";
import {
  extractVideoReferenceFrames,
  type VideoFrameExtractor,
} from "../../providers/media/videoFrameExtractor.js";
import {
  createSeedanceRenderProvider,
  createQueuedRenderWithConfiguredVideoProvider,
} from "../../providers/renderer/seedanceRenderer.js";
import {
  createCosRenderExportPublisher,
  type RenderExportPublisher,
} from "../../providers/renderer/renderExportPublisher.js";
import { composeSmartEditToStorage } from "../../providers/renderer/smartEditComposer.js";
import { materializeSceneClipsForSmartEdit } from "../../providers/renderer/sceneClipMaterializer.js";
import { CosStorageProvider } from "../../providers/storage/cosStorageProvider.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import {
  downloadExternalAsset,
  type ExternalAssetDownloader,
} from "./externalAssetImportUtils.js";
import { enqueueExternalAssetImport } from "./externalAssetImportJob.js";
import {
  confirmAssetUpload,
  enqueueAssetUploadIntent,
  uploadAssetThroughServer,
} from "./assetUploadService.js";
import {
  isSeedanceSceneDurationError,
  resolveProjectExport,
  retryFailedRenderTask,
} from "./renderTaskService.js";
import {
  deleteReferenceWithOwnedAssets,
  ensureReferenceScriptAsset,
} from "./referenceAssetService.js";
import { registerReferenceAnalysisRoute } from "./referenceAnalysisRouteService.js";
import {
  regenerateSceneWithImage,
  updateSceneWithAssetValidation,
} from "./sceneRouteService.js";
import { filterAssetLibrary, getAssetCategory } from "./assetLibraryUtils.js";
import {
  sendInvalidRequest,
  sendNotFound,
  sendScriptGenerationFailure,
} from "./httpResponseUtils.js";
import { MemoryProjectStore } from "./memoryStore.js";
import type { ProjectSnapshot, ProjectStore } from "./projectStore.js";
import {
  deleteStoredAssetObjects,
} from "./projectAssetUtils.js";
import {
  getMetadataRecord,
  isScriptLibraryAsset,
} from "./referenceAssetUtils.js";
import {
  resolvePreparedScriptAssets,
  resolveScriptTemplateAssets,
} from "./projectAssetResolution.js";
import {
  prepareScriptGenerationInputs,
  type ScriptPreparationHttpError,
} from "./scriptRequestPreparation.js";
import {
  scriptGenerationPrompt,
  type ScriptPromptContext,
} from "./scriptPromptContext.js";
import {
  runSmartEditJob,
  runSmartEditSegmentRefreshJob,
  type SmartEditComposer,
  type SmartEditPlanner,
} from "./smartEditJobService.js";
import {
  generateStoryboardSceneImageUrl,
  renderStoryboardSceneImages,
} from "./storyboardImageService.js";
import {
  generateFallbackStoryboardForScript,
  storeGeneratedStoryboardScript,
  type StoryboardRouteHttpError,
} from "./storyboardRouteService.js";

export { buildScriptAssetPromptLines, scriptGenerationPrompt } from "./scriptPromptContext.js";

const LibraryDisplayNameUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
});

const shouldForceMockProviders = (): boolean => process.env.SHOPCLIP_FORCE_MOCK_PROVIDERS === "1";

const ProcessAssetRequestSchema = z
  .object({
    mode: z.enum(["full", "metadata-only"]).default("full"),
    forceRegenerate: z.boolean().default(false),
  })
  .default({ mode: "full", forceRegenerate: false });

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

const TemplateCreateRequestSchema = z.object({
  category: z.string().trim().min(1),
  referenceIds: z.array(z.string().trim().min(1)).min(1),
  templateName: z.string().trim().min(1),
});

const ScriptAssetTemplateCreateRequestSchema = z.object({
  assetIds: z.array(z.string().trim().min(1)).min(1).max(20),
  category: OptionalNonEmptyStringSchema,
  templateName: OptionalNonEmptyStringSchema,
  apiConfig: InspirationGenerateRequestSchema.shape.apiConfig,
});

const ReferenceScriptAssetRequestSchema = z
  .object({
    projectId: OptionalNonEmptyStringSchema,
  })
  .default({});

const hasConfiguredTextProviderEnvironment = (): boolean =>
  Boolean(
    process.env.AI_GENERAL_API_KEY?.trim() ||
    process.env.AI_TEXT_API_KEY?.trim() ||
    process.env.AI_GENERAL_MODEL_ID?.trim() ||
    process.env.AI_TEXT_MODEL_ID?.trim(),
  );

interface ScriptPromptContextResolution {
  context: ScriptPromptContext;
  error?: {
    code: string;
    message: string;
    status: 400 | 404;
  };
}

const getReferenceIdFromAsset = (asset: AssetMetadata): string | undefined => {
  const metadata = getMetadataRecord(asset);
  return metadata.kind === "reference_script_asset" && typeof metadata.referenceId === "string"
    ? metadata.referenceId
    : undefined;
};

const findReferenceScriptAsset = async (
  store: ProjectStore,
  referenceId: string,
): Promise<AssetMetadata | undefined> => {
  const library = await store.listAssets();
  return library.assets.find((asset) => getReferenceIdFromAsset(asset) === referenceId);
};

const resolveScriptPromptContext = async (
  store: ProjectStore,
  request: ScriptGenerationRequest,
): Promise<ScriptPromptContextResolution> => {
  const context: ScriptPromptContext = {};

  if (request.referenceId) {
    const reference = (await store.listReferenceVideos()).find(
      (candidate) => candidate.id === request.referenceId,
    );
    if (!reference) {
      return {
        context,
        error: {
          code: "REFERENCE_NOT_FOUND",
          message: "Reference video was not found.",
          status: 404,
        },
      };
    }
    if (request.productionMode === "viral-remix" && reference.status !== "ready") {
      return {
        context,
        error: {
          code: "REFERENCE_NOT_READY",
          message: "Reference video must finish analysis before viral remix script generation.",
          status: 400,
        },
      };
    }
    if (request.productionMode === "viral-remix" && !reference.analysis) {
      return {
        context,
        error: {
          code: "REFERENCE_ANALYSIS_REQUIRED",
          message: "Reference video analysis is required for viral remix script generation.",
          status: 400,
        },
      };
    }
    context.reference = reference;
    context.referenceScriptAsset = await findReferenceScriptAsset(store, reference.id);
  }

  if (request.templateId) {
    const template = (await store.listViralTemplates()).find(
      (candidate) => candidate.templateId === request.templateId,
    );
    if (!template) {
      return {
        context,
        error: {
          code: "VIRAL_TEMPLATE_NOT_FOUND",
          message: "Viral template was not found.",
          status: 404,
        },
      };
    }
    context.template = template;
  }

  if (request.productionMode === "viral-remix" && !context.reference) {
    return {
      context,
      error: {
        code: "REFERENCE_REQUIRED",
        message: "Viral remix script generation requires a selected reference video.",
        status: 400,
      },
    };
  }

  if (request.productionMode === "template" && !context.template) {
    return {
      context,
      error: {
        code: "VIRAL_TEMPLATE_REQUIRED",
        message: "Template script generation requires a selected viral template.",
        status: 400,
      },
    };
  }

  return { context };
};

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

export type SceneClipComposer = (
  projectId: string,
  clips: SceneRenderClip[],
) => Promise<string | undefined>;
export type SceneClipMaterializer = typeof materializeSceneClipsForSmartEdit;

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
  const publishRenderExport =
    renderExportPublisher ??
    sceneClipComposer ??
    createCosRenderExportPublisher({ storageProvider });
  const materializeCompletedSceneClips = async (
    projectId: string,
    renderTaskId: string,
    sceneClips: SceneRenderClip[] | undefined,
  ): Promise<{
    sceneClips: SceneRenderClip[] | undefined;
    traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">>;
  }> => {
    const hasMissingCompletedMaterials = sceneClips?.some(
      (clip) => clip.status === "completed" && clip.videoUrl && !clip.material,
    );
    if (!hasMissingCompletedMaterials) {
      return { sceneClips, traceEvents: [] };
    }

    const materialized = await sceneClipMaterializer(projectId, renderTaskId, sceneClips, {
      storageProvider,
    });
    const readyCount =
      materialized?.filter((clip) => clip.material?.status === "ready").length ?? 0;
    const failedCount =
      materialized?.filter((clip) => clip.material?.status === "failed").length ?? 0;
    return {
      sceneClips: materialized,
      traceEvents: [
        {
          status: failedCount > 0 ? "retrying" : "completed",
          step: failedCount > 0 ? "scene-clip-materialize-partial" : "scene-clip-materialize",
          message:
            failedCount > 0
              ? `Prepared ${readyCount} scene clips for smart editing; ${failedCount} clip material separations failed.`
              : `Prepared ${readyCount} scene clips as video, audio, and text materials for smart editing.`,
        },
      ],
    };
  };

  const resolvePreparedAssets = (
    project: ProjectSnapshot,
    request: ScriptGenerationRequest,
  ): Promise<{ assets: AssetMetadata[]; invalidAssetIds: string[] }> =>
    resolvePreparedScriptAssets({
      getAsset: (assetId) => store.getAsset(assetId),
      project,
      requestedAssetIds: request.assetIds,
    });

  const sendScriptPreparationError = (
    response: Response,
    error: ScriptPreparationHttpError,
  ): void => {
    if (error.status === 404) {
      sendNotFound(response, error.code, error.message);
    } else {
      sendInvalidRequest(response, error.code, error.message);
    }
  };

  const sendStoryboardRouteError = (
    response: Response,
    error: StoryboardRouteHttpError,
  ): void => {
    if (error.status === 404) {
      sendNotFound(response, error.code, error.message);
    } else {
      sendInvalidRequest(response, error.code, error.message);
    }
  };

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

  router.get("/assets", async (request, response) => {
    const category = getAssetCategory(request.query.category);
    const library = filterAssetLibrary(await store.listAssets(), category);

    response.json({
      category,
      assets: library.assets,
      assetSlices: library.assetSlices,
    });
  });

  router.get("/projects/:projectId/assets", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const category = getAssetCategory(request.query.category);
    const library = filterAssetLibrary(project, category);

    response.json({
      projectId: project.id,
      category,
      assets: library.assets,
      assetSlices: library.assetSlices,
    });
  });

  router.post("/assets", async (request, response) => {
    const parsedAsset = CreateAssetRequestSchema.safeParse(request.body);
    if (!parsedAsset.success) {
      sendInvalidRequest(response, "INVALID_ASSET", "Asset metadata failed P0 image validation.");
      return;
    }

    const storedAsset = await store.addAsset(
      undefined,
      {
        type: parsedAsset.data.type,
        status: "ready",
        url: parsedAsset.data.url ?? `/demo-assets/library/${parsedAsset.data.name}`,
        name: parsedAsset.data.name,
        mimeType: parsedAsset.data.mimeType,
        sizeBytes: parsedAsset.data.sizeBytes,
        source: parsedAsset.data.source ?? "merchant_upload",
        storageProvider: parsedAsset.data.storageProvider,
        objectKey: parsedAsset.data.objectKey,
        thumbnailKey: parsedAsset.data.thumbnailKey,
        embeddingText: parsedAsset.data.embeddingText,
        metadata: parsedAsset.data.metadata,
        tags: inferAssetTags(parsedAsset.data),
      },
      createAssetSlices,
    );

    response.status(201).json({ asset: storedAsset });
  });

  router.post("/projects/:projectId/assets", async (request, response) => {
    const parsedAsset = CreateAssetRequestSchema.safeParse(request.body);
    if (!parsedAsset.success) {
      sendInvalidRequest(response, "INVALID_ASSET", "Asset metadata failed P0 image validation.");
      return;
    }

    const storedAsset = await store.addAsset(
      request.params.projectId,
      {
        type: parsedAsset.data.type,
        status: "ready",
        url:
          parsedAsset.data.url ??
          `/demo-assets/${request.params.projectId}/${parsedAsset.data.name}`,
        name: parsedAsset.data.name,
        mimeType: parsedAsset.data.mimeType,
        sizeBytes: parsedAsset.data.sizeBytes,
        source: parsedAsset.data.source ?? "merchant_upload",
        storageProvider: parsedAsset.data.storageProvider,
        objectKey: parsedAsset.data.objectKey,
        thumbnailKey: parsedAsset.data.thumbnailKey,
        embeddingText: parsedAsset.data.embeddingText,
        metadata: parsedAsset.data.metadata,
        tags: inferAssetTags(parsedAsset.data),
      },
      createAssetSlices,
    );

    if (!storedAsset) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.status(201).json({ asset: storedAsset });
  });

  router.post("/projects/:projectId/assets/upload-intent", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const parsedAsset = CreateAssetUploadIntentRequestSchema.safeParse(request.body);
    if (!parsedAsset.success) {
      sendInvalidRequest(
        response,
        "INVALID_ASSET_UPLOAD_INTENT",
        "Asset upload request failed validation.",
      );
      return;
    }

    let queuedUpload;
    try {
      queuedUpload = await enqueueAssetUploadIntent({
        asset: parsedAsset.data,
        projectId: request.params.projectId,
        storageProvider,
        store,
      });
    } catch (error) {
      response.status(503).json({
        error: {
          code: "STORAGE_PROVIDER_NOT_CONFIGURED",
          message: error instanceof Error ? error.message : "Storage provider is not configured.",
        },
      });
      return;
    }

    if (
      queuedUpload === "asset-create-failed" ||
      queuedUpload === "processing-job-create-failed"
    ) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.status(201).json(queuedUpload);
  });

  router.post("/assets/upload-intent", async (request, response) => {
    const parsedAsset = CreateAssetUploadIntentRequestSchema.safeParse(request.body);
    if (!parsedAsset.success) {
      sendInvalidRequest(
        response,
        "INVALID_ASSET_UPLOAD_INTENT",
        "Asset upload request failed validation.",
      );
      return;
    }

    let queuedUpload;
    try {
      queuedUpload = await enqueueAssetUploadIntent({
        asset: parsedAsset.data,
        storageProvider,
        store,
      });
    } catch (error) {
      response.status(503).json({
        error: {
          code: "STORAGE_PROVIDER_NOT_CONFIGURED",
          message: error instanceof Error ? error.message : "Storage provider is not configured.",
        },
      });
      return;
    }

    if (queuedUpload === "asset-create-failed") {
      response.status(500).json({
        error: {
          code: "ASSET_CREATE_FAILED",
          message: "Global asset could not be created.",
        },
      });
      return;
    }
    if (queuedUpload === "processing-job-create-failed") {
      response.status(500).json({
        error: {
          code: "ASSET_PROCESSING_JOB_CREATE_FAILED",
          message: "Global asset processing job could not be created.",
        },
      });
      return;
    }

    response.status(201).json(queuedUpload);
  });

  router.post("/assets/:assetId/confirm-upload", async (request, response) => {
    const parsedConfirmation = ConfirmAssetUploadRequestSchema.safeParse(request.body ?? {});
    if (!parsedConfirmation.success) {
      sendInvalidRequest(
        response,
        "INVALID_UPLOAD_CONFIRMATION",
        "Asset upload confirmation failed validation.",
      );
      return;
    }

    const confirmedUpload = await confirmAssetUpload({
      assetId: request.params.assetId,
      confirmation: parsedConfirmation.data,
      store,
    });
    if (confirmedUpload === "job-not-found") {
      sendNotFound(
        response,
        "ASSET_PROCESSING_JOB_NOT_FOUND",
        "Asset processing job was not found.",
      );
      return;
    }
    if (confirmedUpload === "asset-not-found") {
      sendNotFound(response, "ASSET_NOT_FOUND", "Asset was not found.");
      return;
    }

    response.json(confirmedUpload);
  });

  router.post("/assets/:assetId/process", async (request, response) => {
    const parsedRequest = ProcessAssetRequestSchema.safeParse(request.body ?? {});
    if (!parsedRequest.success) {
      sendInvalidRequest(
        response,
        "INVALID_ASSET_PROCESS_REQUEST",
        "Asset processing request failed validation.",
      );
      return;
    }

    const result = await processAssetStructure({
      assetId: request.params.assetId,
      input: parsedRequest.data,
      store,
      storageProvider,
    });
    if (!result) {
      sendNotFound(response, "ASSET_NOT_FOUND", "Asset was not found.");
      return;
    }

    response.status(202).json(result);
  });

  router.get("/asset-processing-jobs/:jobId", async (request, response) => {
    const job = await store.getAssetProcessingJob(request.params.jobId);
    if (!job) {
      sendNotFound(
        response,
        "ASSET_PROCESSING_JOB_NOT_FOUND",
        "Asset processing job was not found.",
      );
      return;
    }

    response.json({
      processingJob: job,
      job,
      events: await store.listAssetProcessingEvents(job.id),
    });
  });

  router.post(
    "/assets/:assetId/upload",
    raw({
      limit: process.env.ASSET_UPLOAD_BODY_LIMIT ?? "25mb",
      type: "*/*",
    }),
    async (request, response) => {
      const asset = await store.getAsset(request.params.assetId);
      if (!asset) {
        sendNotFound(response, "ASSET_NOT_FOUND", "Asset was not found.");
        return;
      }
      if (!asset.objectKey) {
        sendInvalidRequest(
          response,
          "ASSET_OBJECT_KEY_REQUIRED",
          "Asset has no object key for server-side upload.",
        );
        return;
      }
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        sendInvalidRequest(response, "ASSET_FILE_REQUIRED", "Asset file bytes are required.");
        return;
      }

      const contentType =
        typeof request.headers["content-type"] === "string"
          ? request.headers["content-type"]
          : (asset.mimeType ?? "application/octet-stream");
      let uploadedAsset;
      try {
        uploadedAsset = await uploadAssetThroughServer({
          asset,
          body: request.body,
          contentType,
          storageProvider,
          store,
        });
      } catch (error) {
        response.status(502).json({
          error: {
            code: "STORAGE_UPLOAD_FAILED",
            message: error instanceof Error ? error.message : "Storage upload failed.",
          },
        });
        return;
      }

      if (uploadedAsset === "asset-not-found") {
        sendNotFound(response, "ASSET_NOT_FOUND", "Asset was not found.");
        return;
      }

      response.json({
        asset: uploadedAsset.asset,
        processingJob: uploadedAsset.processingJob,
        storage: uploadedAsset.storage,
      });
    },
  );

  router.get("/assets/:assetId/content", async (request, response) => {
    const asset = await store.getAsset(request.params.assetId);
    if (!asset) {
      sendNotFound(response, "ASSET_NOT_FOUND", "Asset was not found.");
      return;
    }

    if (!asset.objectKey) {
      response.redirect(302, asset.url);
      return;
    }

    let readUrl;
    try {
      readUrl = storageProvider.createReadUrl({
        objectKey: asset.objectKey,
      });
    } catch (error) {
      response.status(502).json({
        error: {
          code: "STORAGE_READ_URL_FAILED",
          message:
            error instanceof Error ? error.message : "Storage read URL could not be created.",
        },
      });
      return;
    }

    response.setHeader("Cache-Control", "private, max-age=300");
    response.redirect(302, readUrl.url);
  });

  router.delete("/assets", async (request, response) => {
    const parsedDelete = DeleteAssetsRequestSchema.safeParse(request.body);
    if (!parsedDelete.success) {
      sendInvalidRequest(
        response,
        "INVALID_ASSET_DELETE_REQUEST",
        "assetIds must contain at least one asset id.",
      );
      return;
    }

    const assets = (
      await Promise.all(parsedDelete.data.assetIds.map((assetId) => store.getAsset(assetId)))
    ).filter((asset): asset is AssetMetadata => Boolean(asset));
    if (assets.length !== parsedDelete.data.assetIds.length) {
      sendNotFound(response, "ASSET_NOT_FOUND", "One or more assets were not found.");
      return;
    }

    try {
      await deleteStoredAssetObjects(storageProvider, assets);
    } catch (error) {
      response.status(502).json({
        error: {
          code: "STORAGE_DELETE_FAILED",
          message: error instanceof Error ? error.message : "Storage delete failed.",
        },
      });
      return;
    }

    const deletedAssets = await store.deleteAssets(parsedDelete.data.assetIds);
    response.json({
      deletedAssets,
    });
  });

  router.post("/assets/import-external", async (request, response) => {
    const parsedExternalAsset = ExternalAssetResultSchema.safeParse(request.body);
    if (!parsedExternalAsset.success) {
      sendInvalidRequest(
        response,
        "INVALID_EXTERNAL_ASSET",
        "External asset metadata failed validation.",
      );
      return;
    }

    const queuedImport = await enqueueExternalAssetImport(undefined, parsedExternalAsset.data, {
      externalAssetDownloader,
      storageProvider,
      store,
    });
    if (!queuedImport) {
      response.status(502).json({
        error: {
          code: "EXTERNAL_ASSET_IMPORT_QUEUE_FAILED",
          message: "External asset import could not be queued.",
        },
      });
      return;
    }

    response.status(202).json(queuedImport);
  });

  router.post("/projects/:projectId/assets/import-external", async (request, response) => {
    const parsedExternalAsset = ExternalAssetResultSchema.safeParse(request.body);
    if (!parsedExternalAsset.success) {
      sendInvalidRequest(
        response,
        "INVALID_EXTERNAL_ASSET",
        "External asset metadata failed validation.",
      );
      return;
    }

    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const queuedImport = await enqueueExternalAssetImport(
      request.params.projectId,
      parsedExternalAsset.data,
      {
        externalAssetDownloader,
        storageProvider,
        store,
      },
    );
    if (!queuedImport) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.status(202).json(queuedImport);
  });

  router.get("/assets/search", async (request, response) => {
    const projectId =
      typeof request.query.projectId === "string" ? request.query.projectId.trim() : "";
    const project = projectId ? await store.getProject(projectId) : undefined;
    if (projectId && !project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }
    const globalLibrary = project ? undefined : await store.listAssets();

    const query = typeof request.query.q === "string" ? request.query.q : "";
    const tags =
      typeof request.query.tags === "string"
        ? request.query.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [];
    const level =
      request.query.level === "slice" || request.query.level === "asset"
        ? request.query.level
        : undefined;
    const sceneRole =
      typeof request.query.sceneRole === "string" ? request.query.sceneRole : undefined;

    const searchLibrary = project ?? {
      id: "global-asset-library",
      title: "Global asset library",
      productName: "Global asset library",
      audience: "merchant",
      sellingPoints: ["shared assets"],
      tone: "neutral",
      style: "library",
      targetDurationSeconds: 15,
      prepKeywords: [],
      status: "ready" as const,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      assets: globalLibrary?.assets ?? [],
      assetSlices: globalLibrary?.assetSlices ?? [],
      assetProcessingEvents: [],
      assetProcessingJobs: [],
      referenceVideos: [],
      viralTemplates: [],
      scripts: [],
      scenes: [],
      renderTasks: [],
    };
    let cosMatches: Awaited<ReturnType<NonNullable<P0RouterOptions["cosAssetSearch"]>>>;
    if (query.trim()) {
      try {
        cosMatches = await cosAssetSearch({ query, limit: 24, matchThreshold: 70 });
      } catch (error) {
        console.warn(
          "[assets/search] COS intelligent search failed; returning empty COS results.",
          error,
        );
        cosMatches = [];
      }
    }
    const cosResults = cosMatches
      ? mapCosImageMatchesToAssetResults(cosMatches, searchLibrary)
      : undefined;
    const textResults = searchAssets(searchLibrary, { query, tags, level, sceneRole });
    const shouldUseHybridResults = Boolean(level || sceneRole);
    const results =
      cosMatches !== undefined && !shouldUseHybridResults
        ? (cosResults ?? [])
        : mergeAssetSearchResults(textResults, cosResults);

    response.json({
      ...(projectId ? { projectId } : {}),
      query,
      tags,
      results,
      externalResults: [],
    });
  });

  router.post("/assets/external-search", async (request, response) => {
    const parsedSearch = ExternalAssetSearchRequestSchema.safeParse(request.body);
    if (!parsedSearch.success) {
      sendInvalidRequest(
        response,
        "INVALID_EXTERNAL_ASSET_SEARCH",
        "External asset search request failed validation.",
      );
      return;
    }

    const { query, page, perPage, providers, type } = parsedSearch.data;
    const providerInstances = createExternalAssetProvidersFromConfig(providers);
    const externalResults =
      providers.length > 0
        ? await searchExternalAssets({ query, page, perPage, type }, providerInstances)
        : [];

    response.json({
      query,
      page,
      perPage,
      hasMore: externalResults.length >= perPage,
      externalResults,
    });
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

  router.get("/references", async (request, response) => {
    const projectId =
      typeof request.query.projectId === "string" ? request.query.projectId : undefined;
    response.json({
      references: await store.listReferenceVideos(projectId),
    });
  });

  router.delete("/references/:referenceId", async (request, response) => {
    let deletedReference;
    try {
      deletedReference = await deleteReferenceWithOwnedAssets({
        referenceId: request.params.referenceId,
        storageProvider,
        store,
      });
    } catch (error) {
      response.status(502).json({
        error: {
          code: "STORAGE_DELETE_FAILED",
          message: error instanceof Error ? error.message : "Storage delete failed.",
        },
      });
      return;
    }
    if (deletedReference.kind === "not-found") {
      sendNotFound(response, "REFERENCE_NOT_FOUND", "Reference video was not found.");
      return;
    }

    response.json(deletedReference.result);
  });

  router.post("/references/:referenceId/script-asset", async (request, response) => {
    const parsedRequest = ReferenceScriptAssetRequestSchema.safeParse(request.body ?? {});
    if (!parsedRequest.success) {
      sendInvalidRequest(
        response,
        "INVALID_REFERENCE_SCRIPT_ASSET_REQUEST",
        "Reference script asset request failed validation.",
      );
      return;
    }

    const scriptAsset = await ensureReferenceScriptAsset({
      projectId: parsedRequest.data.projectId,
      referenceId: request.params.referenceId,
      store,
    });
    if (scriptAsset.kind === "project-not-found") {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }
    if (scriptAsset.kind === "reference-not-found") {
      sendNotFound(response, "REFERENCE_NOT_FOUND", "Reference video was not found.");
      return;
    }
    if (scriptAsset.kind === "reference-not-ready") {
      sendInvalidRequest(
        response,
        "REFERENCE_NOT_READY",
        "Reference video must finish analysis before it can be added to the script library.",
      );
      return;
    }
    if (scriptAsset.kind === "create-failed") {
      response.status(500).json({
        error: {
          code: "REFERENCE_SCRIPT_ASSET_CREATE_FAILED",
          message: "Reference script asset could not be created.",
        },
      });
      return;
    }

    response.status(scriptAsset.created ? 201 : 200).json({ asset: scriptAsset.asset });
  });

  router.get("/references/templates", async (request, response) => {
    const category =
      typeof request.query.category === "string" ? request.query.category : undefined;
    response.json({
      templates: await store.listViralTemplates(category),
    });
  });

  router.post("/references/templates", async (request, response) => {
    const parsedTemplate = TemplateCreateRequestSchema.safeParse(request.body);
    if (!parsedTemplate.success) {
      sendInvalidRequest(
        response,
        "INVALID_REFERENCE_TEMPLATE_REQUEST",
        "Reference template request failed validation.",
      );
      return;
    }

    const references = (await store.listReferenceVideos()).filter((reference) =>
      parsedTemplate.data.referenceIds.includes(reference.id),
    );
    if (references.length !== parsedTemplate.data.referenceIds.length) {
      sendNotFound(response, "REFERENCE_NOT_FOUND", "One or more reference videos were not found.");
      return;
    }
    if (references.some((reference) => reference.status !== "ready")) {
      sendInvalidRequest(
        response,
        "REFERENCE_NOT_READY",
        "Reference videos must finish analysis before template extraction.",
      );
      return;
    }

    const template = await store.addViralTemplate(
      buildViralTemplateFromReferences({
        category: parsedTemplate.data.category,
        references,
        templateName: parsedTemplate.data.templateName,
      }),
    );

    response.status(201).json({ template });
  });

  router.post("/references/templates/from-script-assets", async (request, response) => {
    const parsedTemplate = ScriptAssetTemplateCreateRequestSchema.safeParse(request.body ?? {});
    if (!parsedTemplate.success) {
      sendInvalidRequest(
        response,
        "INVALID_SCRIPT_ASSET_TEMPLATE_REQUEST",
        "Script asset template request failed validation.",
      );
      return;
    }

    const templateAssets = await resolveScriptTemplateAssets({
      getAsset: (assetId) => store.getAsset(assetId),
      isScriptAsset: isScriptLibraryAsset,
      requestedAssetIds: parsedTemplate.data.assetIds,
    });
    if (templateAssets.kind === "not-found") {
      sendNotFound(response, "SCRIPT_ASSET_NOT_FOUND", "One or more script assets were not found.");
      return;
    }
    if (templateAssets.kind === "invalid-type") {
      sendInvalidRequest(
        response,
        "SCRIPT_ASSET_REQUIRED",
        "Template extraction only supports script material assets.",
      );
      return;
    }

    try {
      const extractedTemplate = await extractScriptTemplateWithGeneralModel({
        assets: templateAssets.assets,
        category: parsedTemplate.data.category,
        templateName: parsedTemplate.data.templateName,
        apiConfig: parsedTemplate.data.apiConfig,
      });
      const template = await store.addViralTemplate(extractedTemplate);
      response.status(201).json({ template });
    } catch (error) {
      response.status(502).json({
        error: {
          code: "SCRIPT_TEMPLATE_EXTRACTION_FAILED",
          message:
            error instanceof Error ? error.message : "Script asset template extraction failed.",
        },
      });
    }
  });

  router.post("/projects/:projectId/rewrite-script", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const parsedRequest = ScriptGenerationRequestSchema.safeParse(request.body ?? {});
    if (!parsedRequest.success) {
      sendInvalidRequest(
        response,
        "INVALID_SCRIPT_REQUEST",
        "Script generation request is invalid.",
      );
      return;
    }

    const scriptInputs = await prepareScriptGenerationInputs({
      project,
      request: parsedRequest.data,
      requestBody: request.body,
      resolvePreparedAssets,
      resolvePromptContext: (scriptRequest) => resolveScriptPromptContext(store, scriptRequest),
      updateProjectPrepKeywords: (projectId, keywords) =>
        store.updateProjectPrepKeywords(projectId, keywords),
    });
    if (scriptInputs.kind === "error") {
      sendScriptPreparationError(response, scriptInputs.error);
      return;
    }
    const { assets: preparedAssets, promptContext, workingProject } = scriptInputs;
    let providerResult: Awaited<ReturnType<typeof rewriteScriptWithConfiguredProvider>>;
    try {
      providerResult = await rewriteScriptWithConfiguredProvider(
        workingProject,
        parsedRequest.data,
        preparedAssets,
        promptContext,
      );
    } catch (error) {
      sendScriptGenerationFailure(response, error);
      return;
    }

    response.status(201).json(providerResult);
  });

  router.post("/projects/:projectId/scripts", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const parsedRequest = ScriptGenerationRequestSchema.safeParse(request.body ?? {});
    if (!parsedRequest.success) {
      sendInvalidRequest(
        response,
        "INVALID_SCRIPT_REQUEST",
        "Script generation request is invalid.",
      );
      return;
    }

    if (!parsedRequest.data.draftScript?.trim()) {
      sendInvalidRequest(response, "EMPTY_SCRIPT_DRAFT", "Script draft cannot be empty.");
      return;
    }

    const scriptInputs = await prepareScriptGenerationInputs({
      project,
      request: parsedRequest.data,
      requestBody: request.body,
      resolvePreparedAssets,
      resolvePromptContext: (scriptRequest) => resolveScriptPromptContext(store, scriptRequest),
      updateProjectPrepKeywords: (projectId, keywords) =>
        store.updateProjectPrepKeywords(projectId, keywords),
    });
    if (scriptInputs.kind === "error") {
      sendScriptPreparationError(response, scriptInputs.error);
      return;
    }

    const providerResult = generateFallbackScript(scriptInputs.workingProject, {
      assets: scriptInputs.assets,
      request: parsedRequest.data,
      scriptSource: "fallback",
    });
    const storedScript = await store.addScript(project.id, providerResult.script);
    if (!storedScript) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const parsedScript = ScriptResultSchema.safeParse(storedScript);
    if (!parsedScript.success) {
      sendInvalidRequest(
        response,
        "INVALID_SAVED_SCRIPT",
        "Saved script failed contract validation.",
      );
      return;
    }

    response.status(201).json({ script: parsedScript.data });
  });

  router.post("/projects/:projectId/scripts/:scriptId/storyboard", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const script = project.scripts.find((candidate) => candidate.id === request.params.scriptId);
    if (!script) {
      sendNotFound(response, "SCRIPT_NOT_FOUND", "Script was not found.");
      return;
    }

    const storyboardResult = await generateFallbackStoryboardForScript({
      project,
      script,
      resolvePreparedAssets,
      generateFallbackScriptForProject: generateFallbackScript,
      renderStoryboardSceneImagesForScript: (project, script, request, assets) =>
        renderStoryboardSceneImages(project, script, request, assets, videoFrameExtractor),
      updateScriptScenes: (scriptId, scenes, constraints) =>
        store.updateScriptScenes(scriptId, scenes, constraints),
    });
    if (storyboardResult.kind === "error") {
      sendStoryboardRouteError(response, storyboardResult.error);
      return;
    }

    response.status(201).json({ script: storyboardResult.script });
  });

  router.post("/projects/:projectId/generate-script", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const parsedRequest = ScriptGenerationRequestSchema.safeParse(request.body ?? {});
    if (!parsedRequest.success) {
      sendInvalidRequest(
        response,
        "INVALID_SCRIPT_REQUEST",
        "Script generation request is invalid.",
      );
      return;
    }

    const scriptInputs = await prepareScriptGenerationInputs({
      project,
      request: parsedRequest.data,
      requestBody: request.body,
      resolvePreparedAssets,
      resolvePromptContext: (scriptRequest) => resolveScriptPromptContext(store, scriptRequest),
      updateProjectPrepKeywords: (projectId, keywords) =>
        store.updateProjectPrepKeywords(projectId, keywords),
    });
    if (scriptInputs.kind === "error") {
      sendScriptPreparationError(response, scriptInputs.error);
      return;
    }
    const { assets: preparedAssets, promptContext, workingProject } = scriptInputs;
    let textProviderResult: Awaited<ReturnType<typeof rewriteScriptWithConfiguredProvider>>;
    let providerResult: ReturnType<typeof generateFallbackScript>;
    try {
      textProviderResult = await rewriteScriptWithConfiguredProvider(
        workingProject,
        parsedRequest.data,
        preparedAssets,
        promptContext,
      );
      const scriptContext = {
        assets: preparedAssets,
        request: {
          ...parsedRequest.data,
          draftScript: textProviderResult.fallback.used
            ? parsedRequest.data.draftScript
            : textProviderResult.scriptText,
        },
        scriptSource: textProviderResult.fallback.used ? "fallback" : "model",
      } as const;
      providerResult = textProviderResult.fallback.used
        ? generateFallbackScript(workingProject, scriptContext)
        : structureModelScript(workingProject, scriptContext, textProviderResult.fallback.provider);
    } catch (error) {
      sendScriptGenerationFailure(response, error);
      return;
    }
    const storyboardResult = await storeGeneratedStoryboardScript({
      project: workingProject,
      providerScript: providerResult.script,
      request: parsedRequest.data,
      assets: preparedAssets,
      renderStoryboardSceneImagesForScript: (project, script, request, assets) =>
        renderStoryboardSceneImages(project, script, request, assets, videoFrameExtractor),
      addScript: (projectId, script) => store.addScript(projectId, script),
    });
    if (storyboardResult.kind === "error") {
      sendStoryboardRouteError(response, storyboardResult.error);
      return;
    }

    response.status(201).json({
      fallback: textProviderResult.fallback,
      script: storyboardResult.script,
    });
  });

  router.patch("/scripts/:scriptId", async (request, response) => {
    const parsedUpdate = LibraryDisplayNameUpdateSchema.safeParse(request.body ?? {});
    if (!parsedUpdate.success) {
      sendInvalidRequest(response, "INVALID_SCRIPT_DISPLAY_NAME", "Script display name is invalid.");
      return;
    }

    const updatedScript = await store.updateScriptDisplayName(
      request.params.scriptId,
      parsedUpdate.data.displayName,
    );
    if (!updatedScript) {
      sendNotFound(response, "SCRIPT_NOT_FOUND", "Script was not found.");
      return;
    }

    response.json({ script: updatedScript });
  });

  router.delete("/scripts/:scriptId", async (request, response) => {
    const deletedScript = await store.deleteScript(request.params.scriptId);
    if (!deletedScript) {
      sendNotFound(response, "SCRIPT_NOT_FOUND", "Script was not found.");
      return;
    }

    response.json({ deletedScript });
  });

  router.post("/projects/:projectId/render", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    if (project.scenes.length === 0) {
      sendInvalidRequest(
        response,
        "STORYBOARD_REQUIRED",
        "Generate a storyboard before rendering.",
      );
      return;
    }

    const parsedRenderRequest = RenderRequestSchema.safeParse(request.body ?? {});
    if (!parsedRenderRequest.success) {
      sendInvalidRequest(response, "INVALID_RENDER_REQUEST", "Render media settings are invalid.");
      return;
    }

    let renderResult: ReturnType<typeof createQueuedRenderWithConfiguredVideoProvider>;
    try {
      renderResult = createQueuedRenderWithConfiguredVideoProvider(
        project,
        parsedRenderRequest.data,
      );
    } catch (error) {
      if (isSeedanceSceneDurationError(error)) {
        sendInvalidRequest(response, "INVALID_SCENE_DURATION", error.message);
        return;
      }
      throw error;
    }
    const storedRender = await store.addRenderTask(
      project.id,
      renderResult.renderTask,
      renderResult.traceEvents,
    );
    if (!storedRender) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.status(201).json(storedRender);
  });

  router.patch("/render-tasks/:renderTaskId", async (request, response) => {
    const parsedUpdate = LibraryDisplayNameUpdateSchema.safeParse(request.body ?? {});
    if (!parsedUpdate.success) {
      sendInvalidRequest(response, "INVALID_RENDER_TASK_DISPLAY_NAME", "Video display name is invalid.");
      return;
    }

    const updatedRenderTask = await store.updateRenderTask(request.params.renderTaskId, {
      displayName: parsedUpdate.data.displayName,
    });
    if (!updatedRenderTask) {
      sendNotFound(response, "RENDER_TASK_NOT_FOUND", "Render task was not found.");
      return;
    }

    response.json(updatedRenderTask);
  });

  router.delete("/render-tasks/:renderTaskId", async (request, response) => {
    const deletedRenderTask = await store.deleteRenderTask(request.params.renderTaskId);
    if (!deletedRenderTask) {
      sendNotFound(response, "RENDER_TASK_NOT_FOUND", "Render task was not found.");
      return;
    }

    response.json({ deletedRenderTask });
  });

  router.get("/render-tasks/:renderTaskId", async (request, response) => {
    const renderTask = await store.getRenderTask(request.params.renderTaskId);
    if (!renderTask) {
      sendNotFound(response, "RENDER_TASK_NOT_FOUND", "Render task was not found.");
      return;
    }

    if (
      renderTask.renderTask.provider === "volcengine-seedance" &&
      renderTask.renderTask.status === "completed" &&
      renderTask.renderTask.sceneClips?.some(
        (clip) => clip.status === "completed" && clip.videoUrl && !clip.material,
      )
    ) {
      const traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">> = [];
      try {
        const materialized = await materializeCompletedSceneClips(
          renderTask.project.id,
          renderTask.renderTask.id,
          renderTask.renderTask.sceneClips,
        );
        traceEvents.push(...materialized.traceEvents);
        const updated = await store.updateRenderTask(
          renderTask.renderTask.id,
          { sceneClips: materialized.sceneClips },
          traceEvents,
        );
        if (updated) {
          response.json(updated);
          return;
        }
      } catch (error) {
        traceEvents.push({
          status: "failed",
          step: "scene-clip-materialize-failed",
          message: error instanceof Error ? error.message : "Scene clip materialization failed.",
        });
        const updated = await store.updateRenderTask(
          renderTask.renderTask.id,
          {},
          traceEvents,
        );
        if (updated) {
          response.json(updated);
          return;
        }
      }
    }

    if (
      renderTask.renderTask.provider === "volcengine-seedance" &&
      !["completed", "failed"].includes(renderTask.renderTask.status)
    ) {
      try {
        const provider = createSeedanceRenderProvider();
        const providerResult = await provider.loadRenderTask(
          renderTask.project,
          renderTask.renderTask,
        );
        if (
          providerResult.renderTask.status === "completed" &&
          providerResult.renderTask.sceneClips &&
          providerResult.renderTask.sceneClips.length > 0
        ) {
          try {
            const exportUrl = await publishRenderExport(
              renderTask.project.id,
              providerResult.renderTask.sceneClips,
            );
            if (exportUrl) {
              providerResult.renderTask.exportUrl = exportUrl;
              providerResult.traceEvents.push({
                status: "completed",
                step: "render-export-published",
                message: "Seedance scene clips composed and published as a final export video.",
              });
            }
          } catch (error) {
            providerResult.traceEvents.push({
              status: "failed",
              step: "render-export-publish-failed",
              message:
                error instanceof Error ? error.message : "Final render export publishing failed.",
            });
          }
          try {
            const materialized = await materializeCompletedSceneClips(
              renderTask.project.id,
              renderTask.renderTask.id,
              providerResult.renderTask.sceneClips,
            );
            providerResult.renderTask.sceneClips = materialized.sceneClips;
            providerResult.traceEvents.push(...materialized.traceEvents);
          } catch (error) {
            providerResult.traceEvents.push({
              status: "failed",
              step: "scene-clip-materialize-failed",
              message:
                error instanceof Error ? error.message : "Scene clip materialization failed.",
            });
          }
        }
        const updated = await store.updateRenderTask(
          renderTask.renderTask.id,
          providerResult.renderTask,
          providerResult.traceEvents,
        );
        if (updated) {
          response.json(updated);
          return;
        }
      } catch (error) {
        const storedTrace = await store.updateRenderTask(
          renderTask.renderTask.id,
          {
            status: "failed",
            progress: renderTask.renderTask.progress,
            errorMessage:
              error instanceof Error ? error.message : "Seedance render polling failed.",
          },
          [
            {
              status: "failed",
              step: "seedance-task-poll-failed",
              message: error instanceof Error ? error.message : "Seedance render polling failed.",
            },
          ],
        );
        if (storedTrace) {
          response.json(storedTrace);
          return;
        }
      }
    }

    response.json({
      renderTask: renderTask.renderTask,
      traceEvents: renderTask.traceEvents,
    });
  });

  router.post("/render-tasks/:renderTaskId/retry", async (request, response) => {
    const parsedRenderRequest = RenderRequestSchema.safeParse(request.body ?? {});
    if (!parsedRenderRequest.success) {
      sendInvalidRequest(response, "INVALID_RENDER_REQUEST", "Render media settings are invalid.");
      return;
    }

    const retryResult = await retryFailedRenderTask({
      renderTaskId: request.params.renderTaskId,
      requestData: parsedRenderRequest.data,
      store,
    });
    if (retryResult.kind === "not-found") {
      sendNotFound(response, "RENDER_TASK_NOT_FOUND", "Render task was not found.");
      return;
    }
    if (retryResult.kind === "not-retryable") {
      sendInvalidRequest(
        response,
        "RENDER_NOT_RETRYABLE",
        "Only failed render tasks can be retried.",
      );
      return;
    }
    if (retryResult.kind === "project-not-found") {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }
    if (retryResult.kind === "invalid-scene-duration") {
      sendInvalidRequest(response, "INVALID_SCENE_DURATION", retryResult.message);
      return;
    }

    response.status(201).json(retryResult.render);
  });

  router.post("/projects/:projectId/smart-edit", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    if (project.scenes.length === 0) {
      sendInvalidRequest(
        response,
        "STORYBOARD_REQUIRED",
        "Generate a storyboard before smart editing.",
      );
      return;
    }

    const parsedSmartEditRequest = SmartEditRequestSchema.safeParse(request.body ?? {});
    if (!parsedSmartEditRequest.success) {
      sendInvalidRequest(
        response,
        "INVALID_SMART_EDIT_REQUEST",
        "Smart edit settings are invalid.",
      );
      return;
    }

    const queuedEditRender = await store.addRenderTask(
      project.id,
      {
        mediaSettings: parsedSmartEditRequest.data.mediaSettings,
        progress: 0,
        provider: "smart-edit-ffmpeg",
        status: "queued",
        videoSettings: parsedSmartEditRequest.data.videoSettings,
      },
      [
        {
          status: "queued",
          step: "smart-edit-queued",
          message:
            "Smart edit job queued. The server will call the general model and ffmpeg in the background.",
        },
      ],
    );

    if (!queuedEditRender) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    void runSmartEditJob({
      project,
      renderTaskId: queuedEditRender.renderTask.id,
      requestData: parsedSmartEditRequest.data,
      smartEditComposer,
      smartEditPlanner,
      storageProvider,
      store,
    }).catch((error) => {
      console.error("[smart-edit] background job failed unexpectedly.", error);
    });

    response.status(202).json(queuedEditRender);
  });

  router.post("/projects/:projectId/smart-edit/segments/:sceneId/refresh", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const targetScene = project.scenes.find((scene) => scene.id === request.params.sceneId);
    if (!targetScene) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Storyboard scene was not found.");
      return;
    }

    const parsedRefreshRequest = SmartEditSegmentRefreshRequestSchema.safeParse(
      request.body ?? {},
    );
    if (!parsedRefreshRequest.success) {
      sendInvalidRequest(
        response,
        "INVALID_SMART_EDIT_REFRESH_REQUEST",
        "Smart edit segment refresh settings are invalid.",
      );
      return;
    }

    const refreshRequest = parsedRefreshRequest.data;
    const queuedEditRender = await store.addRenderTask(
      project.id,
      {
        mediaSettings: refreshRequest.mediaSettings,
        progress: 0,
        provider: "smart-edit-ffmpeg",
        smartEditPlan: refreshRequest.currentPlan,
        smartEditSegmentOutputs: refreshRequest.segmentOutputs,
        status: "queued",
        videoSettings: refreshRequest.videoSettings,
      },
      [
        {
          status: "queued",
          step: "smart-edit-segment-refresh-queued",
          message:
            "Smart edit segment refresh queued. The server will refresh the selected segment in the background.",
        },
      ],
    );

    if (!queuedEditRender) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    void runSmartEditSegmentRefreshJob({
      project,
      renderTaskId: queuedEditRender.renderTask.id,
      requestData: refreshRequest,
      smartEditComposer,
      smartEditPlanner,
      storageProvider,
      store,
      targetScene,
    }).catch((error) => {
      console.error("[smart-edit] background segment refresh failed unexpectedly.", error);
    });

    response.status(202).json(queuedEditRender);
  });

  router.get("/projects/:projectId/export", async (request, response) => {
    const exportResult = await resolveProjectExport({
      projectId: request.params.projectId,
      publishRenderExport,
      store,
    });
    if (exportResult.kind === "project-not-found") {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }
    if (exportResult.kind === "compose-failed") {
      response.status(502).json({
        error: {
          code: "EXPORT_COMPOSE_FAILED",
          message: exportResult.message,
        },
      });
      return;
    }
    if (exportResult.kind === "not-ready") {
      sendInvalidRequest(
        response,
        "EXPORT_NOT_READY",
        "Render a completed preview before exporting.",
      );
      return;
    }

    response.json(exportResult.body);
  });

  router.patch("/scenes/:sceneId", async (request, response) => {
    const parsedUpdate = SceneUpdateSchema.safeParse(request.body);
    if (!parsedUpdate.success) {
      sendInvalidRequest(response, "INVALID_SCENE_UPDATE", "Scene update fields are invalid.");
      return;
    }

    const updatedScene = await updateSceneWithAssetValidation({
      sceneId: request.params.sceneId,
      store,
      update: parsedUpdate.data,
    });
    if (updatedScene.kind === "scene-not-found") {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }
    if (updatedScene.kind === "invalid-asset") {
      sendInvalidRequest(
        response,
        "INVALID_SCENE_ASSET",
        "Scene asset does not exist or cannot be used in this project.",
      );
      return;
    }

    response.json({ scene: updatedScene.scene });
  });

  router.post("/projects/:projectId/scenes/reorder", async (request, response) => {
    const sceneIds = Array.isArray(request.body?.sceneIds)
      ? request.body.sceneIds.filter(
          (sceneId: unknown): sceneId is string => typeof sceneId === "string",
        )
      : [];
    if (sceneIds.length === 0) {
      sendInvalidRequest(response, "INVALID_SCENE_ORDER", "sceneIds are required.");
      return;
    }

    const scenes = await store.reorderScenes(request.params.projectId, sceneIds);
    if (!scenes) {
      sendInvalidRequest(
        response,
        "INVALID_SCENE_ORDER",
        "Scene order does not match project scenes.",
      );
      return;
    }

    response.json({ scenes });
  });

  router.delete("/scenes/:sceneId", async (request, response) => {
    const scenes = await store.deleteScene(request.params.sceneId);
    if (!scenes) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    response.json({ scenes });
  });

  router.post("/scenes/:sceneId/regenerate", async (request, response) => {
    const parsedRegeneration = SceneRegenerationRequestSchema.safeParse(request.body ?? {});
    if (!parsedRegeneration.success) {
      sendInvalidRequest(
        response,
        "INVALID_SCENE_REGENERATION_REQUEST",
        "Scene regeneration request is invalid.",
      );
      return;
    }

    const regeneratedScene = await regenerateSceneWithImage({
      generateImageUrl: (project, scene, imageRequest, assets) =>
        generateStoryboardSceneImageUrl(
          project,
          scene,
          imageRequest,
          assets,
          videoFrameExtractor,
        ),
      regeneration: parsedRegeneration.data,
      sceneId: request.params.sceneId,
      store,
    });
    if (regeneratedScene.kind === "scene-not-found") {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }
    if (regeneratedScene.kind === "invalid-asset") {
      sendInvalidRequest(
        response,
        "INVALID_SCENE_ASSET",
        "Scene asset does not exist or cannot be used in this project.",
      );
      return;
    }

    response.json({
      scene: regeneratedScene.scene,
      traceEvent: regeneratedScene.traceEvent,
    });
  });

  router.get("/scenes/:sceneId/suggestions", async (request, response) => {
    const context = await store.getSceneContext(request.params.sceneId);
    if (!context) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    response.json({
      suggestions: generateEditingSuggestions(
        context.project,
        context.scene,
        context.project.assets,
      ),
    });
  });

  router.post("/scenes/:sceneId/asset-recall", async (request, response) => {
    const context = await store.getSceneContext(request.params.sceneId);
    if (!context) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    response.json({
      scene: context.scene,
      candidates: recallAssetsForScene(context.project, context.scene),
    });
  });

  router.post("/scenes/:sceneId/suggestions/:suggestionId/apply", async (request, response) => {
    const context = await store.getSceneContext(request.params.sceneId);
    if (!context) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    const suggestion = generateEditingSuggestions(
      context.project,
      context.scene,
      context.project.assets,
    ).find((candidate) => candidate.id === request.params.suggestionId);
    if (!suggestion) {
      sendNotFound(response, "SUGGESTION_NOT_FOUND", "Suggestion was not found.");
      return;
    }

    const storedScene = await store.updateScene(context.scene.id, suggestion.update);
    if (!storedScene) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    const traceEvent = await store.appendTraceEvent(`scene:${context.scene.id}`, {
      status: "completed",
      step: "agent-suggestion-applied",
      message: `Applied editing suggestion ${suggestion.id}: ${suggestion.title}.`,
    });

    response.json({
      scene: storedScene,
      traceEvent,
    });
  });

  return router;
};
