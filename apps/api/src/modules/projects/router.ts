import { Router, raw } from "express";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import type {
  AssetMetadata,
  AssetProcessingJob,
  AssetUploadIntent,
  ExternalAssetResult,
  ScriptGenerationRequest,
  ScriptResult,
  StoryboardScene,
} from "@shopclip/shared";
import {
  ExternalAssetSearchRequestSchema,
  ProjectBriefSchema,
  ExternalAssetResultSchema,
  RenderRequestSchema,
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
import { searchAssets } from "../retrieval/search.js";
import {
  mapCosImageMatchesToAssetResults,
  searchCosIntelligentAssets,
} from "../../providers/assets/cosIntelligentSearchProvider.js";
import type { CosIntelligentSearchInput } from "../../providers/assets/cosIntelligentSearchProvider.js";
import {
  createExternalAssetProvidersFromConfig,
  searchExternalAssets,
} from "../../providers/assets/externalAssetProviders.js";
import {
  generateEditingSuggestions,
  regenerateSceneFallback,
} from "../../providers/ai/editingAgentProvider.js";
import { generateInspiration } from "../../providers/ai/arkInspirationProvider.js";
import {
  generateFallbackScript,
  rewriteFallbackScript,
} from "../../providers/ai/mockScriptProvider.js";
import { renderFallbackPreview } from "../../providers/renderer/mockRenderer.js";
import { CosStorageProvider } from "../../providers/storage/cosStorageProvider.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import { MemoryProjectStore } from "./memoryStore.js";
import type { ProjectSnapshot, ProjectStore } from "./projectStore.js";

const sendNotFound = (response: Response, code: string, message: string) => {
  response.status(404).json({
    error: {
      code,
      message,
    },
  });
};

const sendInvalidRequest = (response: Response, code: string, message: string) => {
  response.status(400).json({
    error: {
      code,
      message,
    },
  });
};

const scriptGenerationPrompt = (
  project: ProjectSnapshot,
  request: ScriptGenerationRequest,
  assets: AssetMetadata[],
) => {
  const materialLines = [
    ...assets.map((asset) => `${asset.name} (${asset.mimeType ?? asset.type})`),
    ...request.materials.map(
      (material) => `${material.name} (${material.mimeType ?? material.type ?? "material"})`,
    ),
  ];

  return [
    "Rewrite this ecommerce short-video script. Keep it concise, conversion-oriented, and ready for storyboard generation.",
    `Product: ${project.productName}`,
    `Audience: ${project.audience}`,
    `Tone: ${project.tone}`,
    `Selling points: ${project.sellingPoints.join(", ")}`,
    `Prepared materials: ${materialLines.slice(0, 10).join("; ") || "none"}`,
    `Keywords: ${request.keywords.join(", ") || "none"}`,
    `User draft: ${request.draftScript || "No draft provided. Create a strong draft."}`,
  ].join("\n");
};

const rewriteScriptWithConfiguredProvider = async (
  project: ProjectSnapshot,
  request: ScriptGenerationRequest,
  assets: AssetMetadata[],
) => {
  const providerMode = (process.env.AI_PROVIDER_MODE ?? "mock").toLowerCase();
  if (!["ark", "doubao", "real"].includes(providerMode)) {
    return rewriteFallbackScript(project, { assets, request });
  }

  const generated = await generateInspiration({
    assetType: "text",
    prompt: scriptGenerationPrompt(project, request, assets),
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

  return rewriteFallbackScript(project, { assets, request });
};

const escapeSvgText = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const hashString = (value: string): number => {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
};

const clampSvgText = (value: string, maxLength: number): string => {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1)}...` : compacted;
};

const createStoryboardFallbackImageUrl = (
  project: ProjectSnapshot,
  scene: Pick<StoryboardScene, "order" | "subtitle" | "visualPrompt">,
): string => {
  const seed = hashString(`${project.id}:${scene.order}:${scene.subtitle}:${scene.visualPrompt}`);
  const hueA = seed % 360;
  const hueB = (hueA + 42) % 360;
  const subtitle = escapeSvgText(clampSvgText(scene.subtitle, 46));
  const prompt = escapeSvgText(clampSvgText(scene.visualPrompt, 92));
  const product = escapeSvgText(clampSvgText(project.productName, 34));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">`,
    "<defs>",
    `<linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="hsl(${hueA} 82% 46%)"/><stop offset="0.55" stop-color="#101827"/><stop offset="1" stop-color="hsl(${hueB} 86% 42%)"/></linearGradient>`,
    `<radialGradient id="glow" cx="50%" cy="38%" r="55%"><stop offset="0" stop-color="rgba(255,255,255,0.34)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/></radialGradient>`,
    "</defs>",
    '<rect width="1080" height="1920" fill="url(#bg)"/>',
    '<rect width="1080" height="1920" fill="url(#glow)"/>',
    '<rect x="110" y="230" width="860" height="1030" rx="54" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.34)" stroke-width="3"/>',
    '<rect x="172" y="330" width="736" height="560" rx="42" fill="rgba(0,0,0,0.24)"/>',
    '<circle cx="540" cy="610" r="176" fill="rgba(255,255,255,0.16)"/>',
    '<path d="M352 744c96-138 202-208 316-208 72 0 136 28 192 84v206H244c32-28 68-56 108-82Z" fill="rgba(255,255,255,0.30)"/>',
    `<text x="140" y="1460" fill="rgba(255,255,255,0.68)" font-family="Inter,Arial,sans-serif" font-size="40" letter-spacing="2">SCENE ${scene.order}</text>`,
    `<text x="140" y="1530" fill="#ffffff" font-family="Inter,Arial,sans-serif" font-size="66" font-weight="700">${subtitle}</text>`,
    `<text x="140" y="1610" fill="rgba(255,255,255,0.78)" font-family="Inter,Arial,sans-serif" font-size="34">${product}</text>`,
    `<text x="140" y="1690" fill="rgba(255,255,255,0.68)" font-family="Inter,Arial,sans-serif" font-size="30">${prompt}</text>`,
    "</svg>",
  ].join("");

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const buildStoryboardImagePrompt = (
  project: ProjectSnapshot,
  scene: StoryboardScene,
  request: ScriptGenerationRequest | undefined,
  assets: AssetMetadata[],
): string => {
  const materialNames = [
    ...assets.map((asset) => asset.name),
    ...(request?.materials ?? []).map((material) => material.name),
  ]
    .slice(0, 8)
    .join(", ");

  return [
    "Create a vertical ecommerce storyboard frame for a short-video ad.",
    `Product: ${project.productName}`,
    `Audience: ${project.audience}`,
    `Selling points: ${project.sellingPoints.join(", ")}`,
    `Scene ${scene.order}: ${scene.subtitle}`,
    `Visual direction: ${scene.visualPrompt}`,
    `Voiceover context: ${scene.voiceover}`,
    `Prepared materials: ${materialNames || "none"}`,
    `Keywords: ${request?.keywords.join(", ") || "none"}`,
    "Use a clean product-focused composition, no unreadable text, 9:16 aspect ratio.",
  ].join("\n");
};

const generateStoryboardSceneImageUrl = async (
  project: ProjectSnapshot,
  scene: StoryboardScene,
  request: ScriptGenerationRequest | undefined,
  assets: AssetMetadata[],
): Promise<string> => {
  try {
    const generated = await generateInspiration({
      assetType: "image",
      prompt: buildStoryboardImagePrompt(project, scene, request, assets),
      options: {
        image: {
          aspectRatio: "9:16",
          count: 1,
          quality: "standard",
        },
      },
    });
    const material = generated.materials.find(
      (candidate) => candidate.status === "ready" && candidate.url,
    );
    if (material?.url) {
      return material.url;
    }
  } catch (error) {
    console.warn("[storyboard] image generation failed; using deterministic fallback.", error);
  }

  return createStoryboardFallbackImageUrl(project, scene);
};

const renderStoryboardSceneImages = async (
  project: ProjectSnapshot,
  script: Omit<ScriptResult, "id" | "projectId">,
  request: ScriptGenerationRequest | undefined,
  assets: AssetMetadata[],
): Promise<Omit<ScriptResult, "id" | "projectId">> => ({
  ...script,
  scenes: await Promise.all(
    script.scenes.map(async (scene) => ({
      ...scene,
      imageUrl: await generateStoryboardSceneImageUrl(project, scene, request, assets),
    })),
  ),
});

const normalizeTag = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const assetTypeForExternalAsset = (type: ExternalAssetResult["type"]) =>
  type === "audio" || type === "text" ? "reference" : type;

const mimeTypeForExternalAsset = (type: ExternalAssetResult["type"]) =>
  type === "video"
    ? "video/mp4"
    : type === "audio"
      ? "audio/mpeg"
      : type === "text"
        ? "text/plain"
        : "image/jpeg";

const externalAssetTypeTag = (type: ExternalAssetResult["type"]): string =>
  type === "text" ? "script" : type;

const contentTypeMatchesExternalType = (
  type: ExternalAssetResult["type"],
  contentType: string | undefined,
): boolean => {
  const normalizedContentType = contentType?.split(";")[0]?.trim().toLowerCase();
  if (!normalizedContentType) {
    return false;
  }

  if (type === "image") {
    return normalizedContentType.startsWith("image/");
  }
  if (type === "video") {
    return normalizedContentType.startsWith("video/");
  }
  if (type === "audio") {
    return normalizedContentType.startsWith("audio/");
  }

  return normalizedContentType.startsWith("text/") || normalizedContentType === "application/json";
};

const contentTypeForExternalAsset = (
  type: ExternalAssetResult["type"],
  downloadedContentType: string | undefined,
): string => {
  const normalizedContentType = downloadedContentType?.split(";")[0]?.trim().toLowerCase();
  if (normalizedContentType && contentTypeMatchesExternalType(type, normalizedContentType)) {
    return normalizedContentType;
  }

  return mimeTypeForExternalAsset(type);
};

const extensionForContentType = (contentType: string): string => {
  if (contentType.includes("png")) {
    return ".png";
  }
  if (contentType.includes("webp")) {
    return ".webp";
  }
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return ".jpg";
  }
  if (contentType.includes("webm")) {
    return ".webm";
  }
  if (contentType.includes("quicktime")) {
    return ".mov";
  }
  if (contentType.includes("mp4")) {
    return ".mp4";
  }
  if (contentType.includes("wav")) {
    return ".wav";
  }
  if (contentType.includes("mpeg") || contentType.includes("mp3")) {
    return ".mp3";
  }
  if (contentType.includes("markdown")) {
    return ".md";
  }

  return ".txt";
};

const fileNameForExternalImport = (title: string, contentType: string): string => {
  const extension = extensionForContentType(contentType);
  return title.toLowerCase().endsWith(extension) ? title : `${title}${extension}`;
};

const allowedDownloadHostsBySource: Record<ExternalAssetResult["source"], string[]> = {
  freesound: ["freesound.org", "cdn.freesound.org"],
  pexels: ["pexels.com", "images.pexels.com", "videos.pexels.com"],
  pixabay: ["pixabay.com", "cdn.pixabay.com"],
};

const assertAllowedExternalDownloadUrl = (asset: ExternalAssetResult, sourceUrl: string): void => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    throw new Error("External asset download URL is invalid.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("External asset downloads must use HTTPS URLs.");
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const allowedHosts = allowedDownloadHostsBySource[asset.source];
  const allowed = allowedHosts.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
  if (!allowed) {
    throw new Error(`External asset download host is not allowed for ${asset.source}.`);
  }
};

export interface ExternalAssetDownloadResult {
  body: Buffer;
  contentType?: string;
  sourceUrl: string;
}

export type ExternalAssetDownloader = (
  asset: ExternalAssetResult,
) => Promise<ExternalAssetDownloadResult>;

const downloadExternalAsset: ExternalAssetDownloader = async (asset) => {
  const sourceUrl = asset.downloadUrl ?? asset.previewUrl;
  assertAllowedExternalDownloadUrl(asset, sourceUrl);

  const downloadResponse = await fetch(sourceUrl);
  if (!downloadResponse.ok) {
    throw new Error(`External asset download failed with status ${downloadResponse.status}.`);
  }

  return {
    body: Buffer.from(await downloadResponse.arrayBuffer()),
    contentType: downloadResponse.headers.get("content-type") ?? undefined,
    sourceUrl,
  };
};

const assetMatchesCategory = (asset: AssetMetadata, category: string): boolean => {
  const tags = asset.tags.map((tag) => tag.toLowerCase());

  if (category === "image") {
    return asset.type === "image";
  }

  if (category === "video") {
    return asset.type === "video";
  }

  if (category === "audio") {
    return asset.mimeType?.startsWith("audio/") === true || tags.includes("audio");
  }

  if (category === "script") {
    return (
      asset.mimeType === "text/plain" ||
      asset.mimeType === "text/markdown" ||
      tags.some((tag) => tag === "script" || tag === "copy")
    );
  }

  return true;
};

const getAssetCategory = (value: unknown): string =>
  typeof value === "string" && value.trim() ? value.trim() : "all";

const filterAssetLibrary = (
  library: { assets: AssetMetadata[]; assetSlices: { assetId: string }[] },
  category: string,
) => {
  const assets =
    category === "all"
      ? library.assets
      : library.assets.filter((asset) => assetMatchesCategory(asset, category));
  const assetIds = new Set(assets.map((asset) => asset.id));

  return {
    assets,
    assetSlices: library.assetSlices.filter((slice) => assetIds.has(slice.assetId)),
  };
};

export interface P0RouterOptions {
  cosAssetSearch?: (
    input: CosIntelligentSearchInput,
  ) => Promise<Awaited<ReturnType<typeof searchCosIntelligentAssets>>>;
  externalAssetDownloader?: ExternalAssetDownloader;
  store?: ProjectStore;
  storageProvider?: StorageProvider;
}

export const createP0Router = ({
  cosAssetSearch = searchCosIntelligentAssets,
  externalAssetDownloader = downloadExternalAsset,
  store = new MemoryProjectStore(),
  storageProvider = new CosStorageProvider(),
}: P0RouterOptions = {}): Router => {
  const router = Router();

  const resolvePreparedAssets = async (
    project: ProjectSnapshot,
    request: ScriptGenerationRequest,
  ): Promise<AssetMetadata[]> => {
    const requestedAssetIds = [...new Set(request.assetIds)];
    const requestedAssets = (
      await Promise.all(requestedAssetIds.map((assetId) => store.getAsset(assetId)))
    ).filter((asset): asset is AssetMetadata => Boolean(asset));

    if (requestedAssets.length > 0) {
      return requestedAssets;
    }

    return project.assets;
  };

  const buildExternalImportTags = (
    externalAsset: ExternalAssetResult,
    contentType: string,
    storageProviderName?: AssetMetadata["storageProvider"],
  ): string[] =>
    inferAssetTags({
      name: externalAsset.title,
      mimeType: contentType,
      source: "external_provider",
      storageProvider: storageProviderName,
      tags: [
        ...externalAsset.tags,
        externalAssetTypeTag(externalAsset.type),
        "external",
        `source-${externalAsset.source}`,
        `external-id-${externalAsset.externalId}`,
        `license-${normalizeTag(externalAsset.licenseLabel)}`,
      ],
    });

  const buildExternalImportMetadata = (
    externalAsset: ExternalAssetResult,
    extras: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    externalAssetImport: true,
    externalAssetType: externalAsset.type,
    externalId: externalAsset.externalId,
    externalSource: externalAsset.source,
    externalUrl: externalAsset.externalUrl,
    originalDownloadUrl: externalAsset.downloadUrl,
    originalPreviewUrl: externalAsset.previewUrl,
    licenseLabel: externalAsset.licenseLabel,
    licenseUrl: externalAsset.licenseUrl,
    requiresAttribution: externalAsset.requiresAttribution,
    canUseCommercially: externalAsset.canUseCommercially,
    structuredAssetVersion: "asset-multigranularity-v1",
    ...extras,
  });

  const runExternalAssetImportJob = async (
    projectId: string | undefined,
    externalAsset: ExternalAssetResult,
    assetId: string,
    jobId: string,
  ): Promise<void> => {
    try {
      await store.updateAssetProcessingJob(jobId, {
        status: "processing",
        steps: ["queued", "external-download"],
        message: "Downloading the selected third-party asset before COS upload.",
      });

      const downloaded = await externalAssetDownloader(externalAsset);
      const contentType = contentTypeForExternalAsset(externalAsset.type, downloaded.contentType);
      const assetType = assetTypeForExternalAsset(externalAsset.type);
      const sizeBytes = downloaded.body.length;
      const uploadIntent: AssetUploadIntent = storageProvider.createUploadIntent({
        projectId,
        assetId,
        asset: {
          type: assetType,
          name: fileNameForExternalImport(externalAsset.title, contentType),
          mimeType: contentType,
          sizeBytes,
          source: "external_provider",
          tags: [...externalAsset.tags, externalAssetTypeTag(externalAsset.type), "external"],
        },
      });

      await store.updateAssetProcessingJob(jobId, {
        status: "processing",
        steps: ["queued", "external-download", "cos-upload"],
        message: "Uploading the downloaded third-party asset into Tencent COS.",
      });

      const uploaded = await storageProvider.uploadObject({
        body: downloaded.body,
        contentType,
        objectKey: uploadIntent.objectKey,
      });
      const sourceUrl =
        downloaded.sourceUrl || externalAsset.downloadUrl || externalAsset.previewUrl;

      await store.updateAsset(assetId, {
        status: "ready",
        url: uploaded.publicUrl,
        mimeType: contentType,
        sizeBytes,
        source: "external_provider",
        storageProvider: uploaded.provider,
        objectKey: uploaded.objectKey,
        embeddingText: `${externalAsset.title} ${externalAsset.tags.join(" ")}`,
        metadata: buildExternalImportMetadata(externalAsset, {
          bucket: uploadIntent.bucket,
          region: uploadIntent.region,
          downloadedFromUrl: sourceUrl,
          downloadedBytes: sizeBytes,
          importedAt: new Date().toISOString(),
        }),
        tags: buildExternalImportTags(externalAsset, contentType, uploaded.provider),
      });

      await store.updateAssetProcessingJob(jobId, {
        status: "ready",
        steps: ["queued", "external-download", "cos-upload", "metadata-ready"],
        message: "External asset imported into Tencent COS and metadata persisted.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "External asset import failed.";
      await store.updateAsset(assetId, {
        status: "failed",
        metadata: {
          externalImportError: message,
          failedAt: new Date().toISOString(),
        },
      });
      await store.updateAssetProcessingJob(jobId, {
        status: "failed",
        steps: ["queued", "external-download", "cos-upload"],
        message,
      });
    }
  };

  const enqueueExternalAssetImport = async (
    projectId: string | undefined,
    externalAsset: ExternalAssetResult,
  ): Promise<{ asset: AssetMetadata; processingJob: AssetProcessingJob } | undefined> => {
    const assetId = randomUUID();
    const contentType = mimeTypeForExternalAsset(externalAsset.type);
    const storedAsset = await store.addAssetWithId(
      projectId,
      assetId,
      {
        type: assetTypeForExternalAsset(externalAsset.type),
        status: "processing",
        url: externalAsset.previewUrl,
        name: externalAsset.title,
        mimeType: contentType,
        source: "external_provider",
        embeddingText: `${externalAsset.title} ${externalAsset.tags.join(" ")}`,
        metadata: buildExternalImportMetadata(externalAsset, {
          queuedAt: new Date().toISOString(),
        }),
        tags: buildExternalImportTags(externalAsset, contentType),
      },
      createAssetSlices,
    );
    if (!storedAsset) {
      return undefined;
    }

    const processingJob = await store.addAssetProcessingJob(projectId, {
      id: randomUUID(),
      assetId,
      status: "processing",
      steps: ["queued", "external-download", "cos-upload", "metadata-ready"],
      message:
        "External asset import queued. Download, Tencent COS upload, and metadata persistence will continue in the background.",
    });
    if (!processingJob) {
      return undefined;
    }

    void runExternalAssetImportJob(projectId, externalAsset, assetId, processingJob.id);

    return { asset: storedAsset, processingJob };
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

    const assetId = randomUUID();
    let uploadIntent;
    try {
      uploadIntent = storageProvider.createUploadIntent({
        projectId: request.params.projectId,
        assetId,
        asset: parsedAsset.data,
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

    const storedAsset = await store.addAssetWithId(
      request.params.projectId,
      assetId,
      {
        type: parsedAsset.data.type,
        status: "uploaded",
        url: uploadIntent.publicUrl,
        name: parsedAsset.data.name,
        mimeType: parsedAsset.data.mimeType,
        sizeBytes: parsedAsset.data.sizeBytes,
        source: parsedAsset.data.source ?? "merchant_upload",
        storageProvider: uploadIntent.provider,
        objectKey: uploadIntent.objectKey,
        embeddingText:
          parsedAsset.data.embeddingText ??
          `${parsedAsset.data.name} ${(parsedAsset.data.tags ?? []).join(" ")}`,
        metadata: {
          ...(parsedAsset.data.metadata ?? {}),
          bucket: uploadIntent.bucket,
          region: uploadIntent.region,
          checksum: parsedAsset.data.checksum,
          structuredAssetVersion: "asset-multigranularity-v1",
        },
        tags: inferAssetTags({
          ...parsedAsset.data,
          source: parsedAsset.data.source ?? "merchant_upload",
          storageProvider: uploadIntent.provider,
        }),
      },
      createAssetSlices,
    );

    if (!storedAsset) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const processingJob = await store.addAssetProcessingJob(request.params.projectId, {
      id: randomUUID(),
      assetId: storedAsset.id,
      status: "processing",
      steps: ["upload", "multimodal-understanding", "slice-indexing"],
      message:
        "Upload intent created. Structured metadata generation can run after the object is uploaded.",
    });
    if (!processingJob) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.status(201).json({
      asset: storedAsset,
      upload: uploadIntent,
      processingJob,
    });
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

    const assetId = randomUUID();
    let uploadIntent;
    try {
      uploadIntent = storageProvider.createUploadIntent({
        assetId,
        asset: parsedAsset.data,
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

    const storedAsset = await store.addAssetWithId(
      undefined,
      assetId,
      {
        type: parsedAsset.data.type,
        status: "uploaded",
        url: uploadIntent.publicUrl,
        name: parsedAsset.data.name,
        mimeType: parsedAsset.data.mimeType,
        sizeBytes: parsedAsset.data.sizeBytes,
        source: parsedAsset.data.source ?? "merchant_upload",
        storageProvider: uploadIntent.provider,
        objectKey: uploadIntent.objectKey,
        embeddingText:
          parsedAsset.data.embeddingText ??
          `${parsedAsset.data.name} ${(parsedAsset.data.tags ?? []).join(" ")}`,
        metadata: {
          ...(parsedAsset.data.metadata ?? {}),
          bucket: uploadIntent.bucket,
          region: uploadIntent.region,
          checksum: parsedAsset.data.checksum,
          structuredAssetVersion: "asset-multigranularity-v1",
        },
        tags: inferAssetTags({
          ...parsedAsset.data,
          source: parsedAsset.data.source ?? "merchant_upload",
          storageProvider: uploadIntent.provider,
        }),
      },
      createAssetSlices,
    );

    if (!storedAsset) {
      response.status(500).json({
        error: {
          code: "ASSET_CREATE_FAILED",
          message: "Global asset could not be created.",
        },
      });
      return;
    }

    const processingJob = await store.addAssetProcessingJob(undefined, {
      id: randomUUID(),
      assetId: storedAsset.id,
      status: "processing",
      steps: ["upload", "multimodal-understanding", "slice-indexing"],
      message:
        "Upload intent created. Structured metadata generation can run after the object is uploaded.",
    });
    if (!processingJob) {
      response.status(500).json({
        error: {
          code: "ASSET_PROCESSING_JOB_CREATE_FAILED",
          message: "Global asset processing job could not be created.",
        },
      });
      return;
    }

    response.status(201).json({
      asset: storedAsset,
      upload: uploadIntent,
      processingJob,
    });
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

    const job = await store.getLatestAssetProcessingJob(request.params.assetId);
    if (!job) {
      sendNotFound(response, "ASSET_PROCESSING_JOB_NOT_FOUND", "Asset processing job was not found.");
      return;
    }

    const confirmedAt = new Date().toISOString();
    const updatedAsset = await store.updateAsset(request.params.assetId, {
      status: "ready",
      objectKey: parsedConfirmation.data.objectKey,
      metadata: {
        ...(parsedConfirmation.data.metadata ?? {}),
        checksum: parsedConfirmation.data.checksum,
        uploadConfirmedAt: confirmedAt,
        structuredAssetVersion: "asset-multigranularity-v1",
        structureProvider: "mock-asset-processor",
      },
    });
    if (!updatedAsset) {
      sendNotFound(response, "ASSET_NOT_FOUND", "Asset was not found.");
      return;
    }

    const processingJob = await store.updateAssetProcessingJob(job.id, {
      status: "ready",
      steps: [...job.steps, "metadata-ready"],
      message:
        "Upload confirmed. Asset metadata is ready for script generation and storyboard recall.",
    });
    if (!processingJob) {
      sendNotFound(response, "ASSET_PROCESSING_JOB_NOT_FOUND", "Asset processing job was not found.");
      return;
    }

    response.json({
      asset: updatedAsset,
      processingJob,
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

      let uploaded;
      try {
        uploaded = await storageProvider.uploadObject({
          body: request.body,
          contentType:
            typeof request.headers["content-type"] === "string"
              ? request.headers["content-type"]
              : (asset.mimeType ?? "application/octet-stream"),
          objectKey: asset.objectKey,
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

      const job = await store.getLatestAssetProcessingJob(asset.id);
      const uploadedAt = new Date().toISOString();
      const updatedAsset = await store.updateAsset(asset.id, {
        status: "ready",
        url: uploaded.publicUrl,
        metadata: {
          proxiedUpload: true,
          uploadedBytes: request.body.length,
          uploadConfirmedAt: uploadedAt,
          structuredAssetVersion: "asset-multigranularity-v1",
          structureProvider: "mock-asset-processor",
        },
      });
      if (!updatedAsset) {
        sendNotFound(response, "ASSET_NOT_FOUND", "Asset was not found.");
        return;
      }

      const processingJob = job
        ? await store.updateAssetProcessingJob(job.id, {
            status: "ready",
            steps: [...job.steps, "server-proxy-upload", "metadata-ready"],
            message:
              "Asset uploaded through the API server. Metadata is ready for script generation and storyboard recall.",
          })
        : undefined;

      response.json({
        asset: updatedAsset,
        processingJob,
        storage: uploaded,
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
          message: error instanceof Error ? error.message : "Storage read URL could not be created.",
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

    const objectKeys = new Set<string>();
    assets.forEach((asset) => {
      if (asset.objectKey) {
        objectKeys.add(asset.objectKey);
      }
      if (asset.thumbnailKey) {
        objectKeys.add(asset.thumbnailKey);
      }
    });

    try {
      await Promise.all(
        [...objectKeys].map((objectKey) =>
          storageProvider.deleteObject({
            objectKey,
          }),
        ),
      );
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

  router.get("/asset-processing-jobs/:jobId", async (request, response) => {
    const processingJob = await store.getAssetProcessingJob(request.params.jobId);
    if (!processingJob) {
      sendNotFound(response, "ASSET_PROCESSING_JOB_NOT_FOUND", "Asset processing job was not found.");
      return;
    }

    response.json({ processingJob });
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

    const queuedImport = await enqueueExternalAssetImport(undefined, parsedExternalAsset.data);
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

    const searchLibrary = project ?? {
      id: "global-asset-library",
      title: "Global asset library",
      productName: "Global asset library",
      audience: "merchant",
      sellingPoints: ["shared assets"],
      tone: "neutral",
      style: "library",
      targetDurationSeconds: 15,
      status: "ready" as const,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      assets: globalLibrary?.assets ?? [],
      assetSlices: globalLibrary?.assetSlices ?? [],
      assetProcessingJobs: [],
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

    response.json({
      ...(projectId ? { projectId } : {}),
      query,
      tags,
      results: cosResults ?? searchAssets(searchLibrary, { query, tags }),
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

  router.post("/projects/:projectId/rewrite-script", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const parsedRequest = ScriptGenerationRequestSchema.safeParse(request.body ?? {});
    if (!parsedRequest.success) {
      sendInvalidRequest(response, "INVALID_SCRIPT_REQUEST", "Script generation request is invalid.");
      return;
    }

    const preparedAssets = await resolvePreparedAssets(project, parsedRequest.data);
    const providerResult = await rewriteScriptWithConfiguredProvider(
      project,
      parsedRequest.data,
      preparedAssets,
    );

    response.status(201).json(providerResult);
  });

  router.post("/projects/:projectId/generate-script", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const parsedRequest = ScriptGenerationRequestSchema.safeParse(request.body ?? {});
    if (!parsedRequest.success) {
      sendInvalidRequest(response, "INVALID_SCRIPT_REQUEST", "Script generation request is invalid.");
      return;
    }

    const preparedAssets = await resolvePreparedAssets(project, parsedRequest.data);
    const providerResult = generateFallbackScript(project, {
      assets: preparedAssets,
      request: parsedRequest.data,
    });
    const scriptWithSceneImages = await renderStoryboardSceneImages(
      project,
      providerResult.script,
      parsedRequest.data,
      preparedAssets,
    );
    const storedScript = await store.addScript(project.id, scriptWithSceneImages);
    if (!storedScript) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const parsedScript = ScriptResultSchema.safeParse(storedScript);
    if (!parsedScript.success) {
      sendInvalidRequest(
        response,
        "INVALID_GENERATED_SCRIPT",
        "Generated storyboard failed contract validation.",
      );
      return;
    }

    response.status(201).json({
      fallback: providerResult.fallback,
      script: parsedScript.data,
    });
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

    const renderResult = renderFallbackPreview(project, parsedRenderRequest.data);
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

  router.get("/render-tasks/:renderTaskId", async (request, response) => {
    const renderTask = await store.getRenderTask(request.params.renderTaskId);
    if (!renderTask) {
      sendNotFound(response, "RENDER_TASK_NOT_FOUND", "Render task was not found.");
      return;
    }

    response.json({
      renderTask: renderTask.renderTask,
      traceEvents: renderTask.traceEvents,
    });
  });

  router.post("/render-tasks/:renderTaskId/retry", async (request, response) => {
    const previousRender = await store.getRenderTask(request.params.renderTaskId);
    if (!previousRender) {
      sendNotFound(response, "RENDER_TASK_NOT_FOUND", "Render task was not found.");
      return;
    }

    if (previousRender.renderTask.status !== "failed") {
      sendInvalidRequest(
        response,
        "RENDER_NOT_RETRYABLE",
        "Only failed render tasks can be retried.",
      );
      return;
    }

    const parsedRenderRequest = RenderRequestSchema.safeParse(request.body ?? {});
    if (!parsedRenderRequest.success) {
      sendInvalidRequest(response, "INVALID_RENDER_REQUEST", "Render media settings are invalid.");
      return;
    }

    const failedTrace = [...previousRender.traceEvents]
      .reverse()
      .find((event) => event.status === "failed");
    const renderResult = renderFallbackPreview(previousRender.project, {
      ...parsedRenderRequest.data,
      retryOfRenderTaskId: previousRender.renderTask.id,
      retryOfTraceEventId: failedTrace?.id,
    });
    const storedRender = await store.addRenderTask(
      previousRender.project.id,
      renderResult.renderTask,
      renderResult.traceEvents,
    );
    if (!storedRender) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.status(201).json(storedRender);
  });

  router.get("/projects/:projectId/export", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const completedRender = [...project.renderTasks]
      .reverse()
      .find((renderTask) => renderTask.status === "completed");

    if (!completedRender?.exportUrl) {
      sendInvalidRequest(
        response,
        "EXPORT_NOT_READY",
        "Render a completed preview before exporting.",
      );
      return;
    }

    response.json({
      projectId: project.id,
      exportUrl: completedRender.exportUrl,
      downloadUrl: completedRender.exportUrl,
      contentType: "video/mp4",
      fallback: {
        used: true,
        provider: "mock-renderer",
      },
    });
  });

  router.patch("/scenes/:sceneId", async (request, response) => {
    const parsedUpdate = SceneUpdateSchema.safeParse(request.body);
    if (!parsedUpdate.success) {
      sendInvalidRequest(response, "INVALID_SCENE_UPDATE", "Scene update fields are invalid.");
      return;
    }

    const updatedScene = await store.updateScene(request.params.sceneId, parsedUpdate.data);
    if (!updatedScene) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    response.json({ scene: updatedScene });
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
    const context = await store.getSceneContext(request.params.sceneId);
    if (!context) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    const regeneratedScene = regenerateSceneFallback(context.project, context.scene);
    const linkedAsset = regeneratedScene.assetId
      ? await store.getAsset(regeneratedScene.assetId)
      : undefined;
    const imageUrl = await generateStoryboardSceneImageUrl(
      context.project,
      regeneratedScene,
      undefined,
      linkedAsset ? [linkedAsset] : context.project.assets,
    );
    const storedScene = await store.updateScene(context.scene.id, {
      ...regeneratedScene,
      imageUrl,
    });
    if (!storedScene) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    const traceEvent = await store.appendTraceEvent(`scene:${context.scene.id}`, {
      status: "completed",
      step: "scene-regenerated",
      message: `Regenerated scene ${context.scene.order} with deterministic editing fallback.`,
    });

    response.json({
      scene: storedScene,
      traceEvent,
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
