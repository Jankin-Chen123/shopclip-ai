import { Router, type Response } from "express";
import { z } from "zod";
import type {
  AssetMetadata,
  ScriptGenerationRequest,
} from "@shopclip/shared";
import {
  InspirationGenerateRequestSchema,
  ProjectBriefSchema,
  ProjectPrepUpdateSchema,
  SmartEditRequestSchema,
  SmartEditSegmentRefreshRequestSchema,
  SceneRegenerationRequestSchema,
  SceneUpdateSchema,
  ScriptGenerationRequestSchema,
} from "@shopclip/shared";
import { buildMockDashboard } from "../dashboard/mockDashboard.js";
import { buildViralTemplateFromReferences } from "../references/referenceTemplateService.js";
import { recallAssetsForScene } from "../scenes/assetRecallService.js";
import { searchCosIntelligentAssets } from "../../providers/assets/cosIntelligentSearchProvider.js";
import type { CosIntelligentSearchInput } from "../../providers/assets/cosIntelligentSearchProvider.js";
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
import {
  deleteReferenceWithOwnedAssets,
  ensureReferenceScriptAsset,
} from "./referenceAssetService.js";
import { registerReferenceAnalysisRoute } from "./referenceAnalysisRouteService.js";
import {
  regenerateSceneWithImage,
  updateSceneWithAssetValidation,
} from "./sceneRouteService.js";
import {
  sendInvalidRequest,
  sendNotFound,
  sendScriptGenerationFailure,
} from "./httpResponseUtils.js";
import { MemoryProjectStore } from "./memoryStore.js";
import type { ProjectSnapshot, ProjectStore } from "./projectStore.js";
import { deleteStoredAssetObjects } from "./projectAssetUtils.js";
import { isScriptLibraryAsset } from "./referenceAssetUtils.js";
import {
  resolvePreparedScriptAssets,
  resolveScriptTemplateAssets,
} from "./projectAssetResolution.js";
import {
  prepareScriptGenerationInputs,
  type ScriptPreparationHttpError,
} from "./scriptRequestPreparation.js";
import { storeFallbackDraftScript } from "./scriptDraftRouteService.js";
import { buildStructuredScriptFromTextProvider } from "./scriptProviderOrchestration.js";
import { extractAndStoreScriptTemplate } from "./scriptTemplateRouteService.js";
import {
  scriptGenerationPrompt,
  type ScriptPromptContext,
} from "./scriptPromptContext.js";
import { resolveScriptPromptContext } from "./scriptPromptContextResolution.js";
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

    const templateResult = await extractAndStoreScriptTemplate({
      request: parsedTemplate.data,
      resolveTemplateAssets: (assetIds) =>
        resolveScriptTemplateAssets({
          getAsset: (assetId) => store.getAsset(assetId),
          isScriptAsset: isScriptLibraryAsset,
          requestedAssetIds: assetIds,
        }),
      extractTemplate: extractScriptTemplateWithGeneralModel,
      addViralTemplate: (template) => store.addViralTemplate(template),
    });
    if (templateResult.kind === "error") {
      if (templateResult.error.status === 404) {
        sendNotFound(response, templateResult.error.code, templateResult.error.message);
        return;
      }
      if (templateResult.error.status === 502) {
        response.status(502).json({
          error: {
            code: templateResult.error.code,
            message: templateResult.error.message,
          },
        });
        return;
      }
      sendInvalidRequest(response, templateResult.error.code, templateResult.error.message);
      return;
    }

    response.status(201).json({ template: templateResult.template });
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
      resolvePromptContext: resolvePromptContextFromStore,
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

    const scriptInputs = await prepareScriptGenerationInputs({
      project,
      request: parsedRequest.data,
      requestBody: request.body,
      resolvePreparedAssets,
      resolvePromptContext: resolvePromptContextFromStore,
      updateProjectPrepKeywords: (projectId, keywords) =>
        store.updateProjectPrepKeywords(projectId, keywords),
    });
    if (scriptInputs.kind === "error") {
      sendScriptPreparationError(response, scriptInputs.error);
      return;
    }

    const draftResult = await storeFallbackDraftScript({
      project: scriptInputs.workingProject,
      request: parsedRequest.data,
      assets: scriptInputs.assets,
      generateFallbackScriptForProject: generateFallbackScript,
      addScript: (projectId, script) => store.addScript(projectId, script),
    });
    if (draftResult.kind === "error") {
      sendStoryboardRouteError(response, draftResult.error);
      return;
    }

    response.status(201).json({ script: draftResult.script });
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
      resolvePromptContext: resolvePromptContextFromStore,
      updateProjectPrepKeywords: (projectId, keywords) =>
        store.updateProjectPrepKeywords(projectId, keywords),
    });
    if (scriptInputs.kind === "error") {
      sendScriptPreparationError(response, scriptInputs.error);
      return;
    }
    const { assets: preparedAssets, promptContext, workingProject } = scriptInputs;
    let providerResult: Awaited<ReturnType<typeof buildStructuredScriptFromTextProvider>>;
    try {
      providerResult = await buildStructuredScriptFromTextProvider({
        project: workingProject,
        request: parsedRequest.data,
        assets: preparedAssets,
        promptContext,
        rewriteScript: rewriteScriptWithConfiguredProvider,
        generateFallbackScriptForProject: generateFallbackScript,
        structureModelScriptForProject: structureModelScript,
      });
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
      fallback: providerResult.fallback,
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

  registerRenderRoutes({
    renderExportPublisher,
    router,
    sceneClipComposer,
    sceneClipMaterializer,
    storageProvider,
    store,
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
