import { raw, type Router } from "express";
import { z } from "zod";
import type { AssetMetadata } from "@shopclip/shared";
import {
  ExternalAssetResultSchema,
  ExternalAssetSearchRequestSchema,
} from "@shopclip/shared";

import {
  mapCosImageMatchesToAssetResults,
  type CosImageSearchMatch,
  type CosIntelligentSearchInput,
} from "../../providers/assets/cosIntelligentSearchProvider.js";
import {
  createExternalAssetProvidersFromConfig,
  searchExternalAssets,
} from "../../providers/assets/externalAssetProviders.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import { processAssetStructure } from "../assets/assetProcessingService.js";
import { createAssetSlices, inferAssetTags } from "../assets/tagging.js";
import {
  ConfirmAssetUploadRequestSchema,
  CreateAssetRequestSchema,
  CreateAssetUploadIntentRequestSchema,
  DeleteAssetsRequestSchema,
} from "../assets/validation.js";
import { mergeAssetSearchResults } from "../retrieval/hybridAssetSearch.js";
import { searchAssets } from "../retrieval/search.js";
import { filterAssetLibrary, getAssetCategory } from "./assetLibraryUtils.js";
import {
  confirmAssetUpload,
  enqueueAssetUploadIntent,
  uploadAssetThroughServer,
} from "./assetUploadService.js";
import { enqueueExternalAssetImport } from "./externalAssetImportJob.js";
import type { ExternalAssetDownloader } from "./externalAssetImportUtils.js";
import { sendInvalidRequest, sendNotFound } from "./httpResponseUtils.js";
import { deleteStoredAssetObjects } from "./projectAssetUtils.js";
import type { ProjectStore } from "./projectStore.js";

export type CosAssetSearch = (
  input: CosIntelligentSearchInput,
) => Promise<CosImageSearchMatch[] | undefined>;

type RegisterAssetRoutesOptions = {
  cosAssetSearch: CosAssetSearch;
  externalAssetDownloader: ExternalAssetDownloader;
  router: Router;
  storageProvider: StorageProvider;
  store: ProjectStore;
};

const ProcessAssetRequestSchema = z
  .object({
    mode: z.enum(["full", "metadata-only"]).default("full"),
    forceRegenerate: z.boolean().default(false),
  })
  .default({ mode: "full", forceRegenerate: false });

export const registerAssetRoutes = ({
  cosAssetSearch,
  externalAssetDownloader,
  router,
  storageProvider,
  store,
}: RegisterAssetRoutesOptions): void => {
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
    let cosMatches: Awaited<ReturnType<typeof cosAssetSearch>> = undefined;
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
};
