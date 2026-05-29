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
  SceneRenderClip,
  StoryboardScene,
} from "@shopclip/shared";
import {
  ExternalAssetSearchRequestSchema,
  ProjectBriefSchema,
  ProjectPrepUpdateSchema,
  ExternalAssetResultSchema,
  RenderRequestSchema,
  SceneRegenerationRequestSchema,
  SceneUpdateSchema,
  ScriptGenerationRequestSchema,
  ScriptResultSchema,
} from "@shopclip/shared";

import { extractBrandDocumentText } from "../assets/documentText.js";
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
} from "../../providers/ai/editingAgentProvider.js";
import { generateInspiration } from "../../providers/ai/arkInspirationProvider.js";
import {
  generateFallbackScript,
  rewriteFallbackScript,
} from "../../providers/ai/mockScriptProvider.js";
import {
  extractVideoReferenceFrames,
  type VideoFrameExtractor,
  type VideoReferenceFrame,
} from "../../providers/media/videoFrameExtractor.js";
import {
  createSeedanceRenderProvider,
  createQueuedRenderWithConfiguredVideoProvider,
} from "../../providers/renderer/seedanceRenderer.js";
import { composeSceneClipsWithFfmpeg } from "../../providers/renderer/ffmpegComposer.js";
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getMetadataRecord = (asset: AssetMetadata): Record<string, unknown> =>
  isRecord(asset.metadata) ? asset.metadata : {};

const getAppearanceAnchorLines = (asset: AssetMetadata | undefined): string[] => {
  if (!asset) {
    return ["素材不足：未绑定可用素材。"];
  }

  const metadata = getMetadataRecord(asset);
  const anchors = isRecord(metadata.appearanceAnchors) ? metadata.appearanceAnchors : {};
  const lines = [
    typeof anchors.color === "string" ? `颜色：${anchors.color}` : undefined,
    typeof anchors.shape === "string" ? `形状：${anchors.shape}` : undefined,
    typeof anchors.material === "string" ? `材质：${anchors.material}` : undefined,
    typeof anchors.logoText === "string" ? `Logo/文字：${anchors.logoText}` : undefined,
    typeof anchors.packaging === "string" ? `包装：${anchors.packaging}` : undefined,
    Array.isArray(anchors.accessories) ? `配件：${anchors.accessories.join("、")}` : undefined,
    Array.isArray(anchors.distinctiveFeatures)
      ? `显著特征：${anchors.distinctiveFeatures.join("、")}`
      : undefined,
  ].filter((line): line is string => Boolean(line));

  if (lines.length > 0) {
    return lines;
  }

  return [
    `素材名称：${asset.name}`,
    `素材标签：${asset.tags.join("、") || "未提供"}`,
    "素材未提供结构化外观锚点，必须优先保持参考图中的产品外观。",
  ];
};

const storedVideoReferenceFrames = (asset: AssetMetadata): VideoReferenceFrame[] => {
  const frames = getMetadataRecord(asset).videoReferenceFrames;
  if (!Array.isArray(frames)) {
    return [];
  }

  return frames
    .map((frame, index): VideoReferenceFrame | undefined => {
      if (!isRecord(frame) || typeof frame.imageUrl !== "string" || !frame.imageUrl.trim()) {
        return undefined;
      }

      return {
        frameId:
          typeof frame.frameId === "string" && frame.frameId.trim()
            ? frame.frameId.trim()
            : `${asset.id}-stored-frame-${index + 1}`,
        imageUrl: frame.imageUrl.trim(),
        purpose:
          frame.purpose === "cover" ||
          frame.purpose === "product-closeup" ||
          frame.purpose === "usage-scene"
            ? frame.purpose
            : "product-closeup",
        timestampSeconds:
          typeof frame.timestampSeconds === "number" && Number.isFinite(frame.timestampSeconds)
            ? frame.timestampSeconds
            : 0,
      };
    })
    .filter((frame): frame is VideoReferenceFrame => Boolean(frame));
};

const resolveSceneBoundAsset = (
  scene: Pick<StoryboardScene, "assetId">,
  assets: AssetMetadata[],
): AssetMetadata | undefined =>
  (scene.assetId ? assets.find((asset) => asset.id === scene.assetId) : undefined) ?? assets[0];

const resolveStoryboardReferenceImageUrls = async (
  scene: StoryboardScene,
  assets: AssetMetadata[],
  videoFrameExtractor: VideoFrameExtractor,
): Promise<string[]> => {
  const boundAsset = resolveSceneBoundAsset(scene, assets);
  if (!boundAsset) {
    return [];
  }

  if (boundAsset.type === "image") {
    return [boundAsset.url];
  }

  if (boundAsset.type === "video") {
    const storedFrames = storedVideoReferenceFrames(boundAsset);
    if (storedFrames.length > 0) {
      return storedFrames.map((frame) => frame.imageUrl).slice(0, 3);
    }

    try {
      return (await videoFrameExtractor({ assetId: boundAsset.id, maxFrames: 3, videoUrl: boundAsset.url }))
        .map((frame) => frame.imageUrl)
        .slice(0, 3);
    } catch (error) {
      console.warn("[storyboard] video frame extraction failed; continuing without frames.", error);
    }
  }

  return [];
};

const collectStorageObjectKeys = (assets: AssetMetadata[]): Set<string> => {
  const objectKeys = new Set<string>();
  assets.forEach((asset) => {
    if (asset.objectKey) {
      objectKeys.add(asset.objectKey);
    }
    if (asset.thumbnailKey) {
      objectKeys.add(asset.thumbnailKey);
    }
  });
  return objectKeys;
};

const compactPromptText = (value: string, maxLength: number): string => {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1)}...` : compacted;
};

const getExtractedDocumentText = (asset: AssetMetadata): string | undefined => {
  const metadata = getMetadataRecord(asset);
  if (metadata.documentTextStatus !== "extracted") {
    return undefined;
  }
  return asset.embeddingText?.trim() || undefined;
};

const buildBrandDocumentPromptLines = (assets: AssetMetadata[]): string[] => {
  let remainingCharacters = 3_600;
  const lines: string[] = [];

  for (const asset of assets) {
    const text = getExtractedDocumentText(asset);
    if (!text || remainingCharacters <= 0) {
      continue;
    }

    const excerpt = compactPromptText(text, Math.min(1_200, remainingCharacters));
    if (!excerpt) {
      continue;
    }
    remainingCharacters -= excerpt.length;
    lines.push(`${asset.name}:${excerpt}`);
  }

  return lines;
};

const scriptGenerationPrompt = (
  project: ProjectSnapshot,
  request: ScriptGenerationRequest,
  assets: AssetMetadata[],
) => {
  const targetDurationSeconds = project.targetDurationSeconds;
  const keywords = request.keywords.length > 0 ? request.keywords : project.prepKeywords;
  const materialLines = [
    ...assets.map((asset) => `${asset.name} (${asset.mimeType ?? asset.type})`),
    ...request.materials.map(
      (material) => `${material.name} (${material.mimeType ?? material.type ?? "素材"})`,
    ),
  ];
  const brandDocumentLines = buildBrandDocumentPromptLines(assets);

  return [
    "请改写电商短视频脚本。必须使用中文输出，内容要简洁、转化导向，并可直接用于分镜生成。",
    "输出格式必须是 Markdown 表格，表头固定为：| 时间 | 旁白 | 字幕 | 画面 |。",
    `每一行代表一个分镜，分镜时长总和必须等于目标总时长 ${targetDurationSeconds} 秒；画面列必须包含素材外观一致性要求。`,
    `产品：${project.productName}`,
    `目标人群：${project.audience}`,
    `语气：${project.tone}`,
    `视频风格：${project.style}`,
    `目标总时长：${targetDurationSeconds} 秒`,
    `核心卖点：${project.sellingPoints.join("、")}`,
    `已准备素材：${materialLines.slice(0, 10).join("；") || "无"}`,
    `品牌资料内容：${brandDocumentLines.join("; ") || "无可读取品牌资料正文"}`,
    `关键词：${keywords.join("、") || "无"}`,
    `用户草稿：${request.draftScript || "未提供草稿，请直接生成一个强脚本。"}`,
  ].join("\n");
};

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
) => {
  const providerMode = (process.env.AI_PROVIDER_MODE ?? "mock").toLowerCase();
  if (
    !request.apiConfig?.general &&
    (!["ark", "doubao", "real"].includes(providerMode) || !hasConfiguredTextProviderEnvironment())
  ) {
    return rewriteFallbackScript(project, { assets, request });
  }

  const generated = await generateInspiration({
    assetType: "text",
    prompt: scriptGenerationPrompt(project, request, assets),
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
  referenceImageUrls: string[],
): string => {
  const boundAsset = resolveSceneBoundAsset(scene, assets);
  const materialNames = [
    ...(boundAsset ? [boundAsset.name] : []),
    ...assets.filter((asset) => asset.id !== boundAsset?.id).map((asset) => asset.name),
    ...(request?.materials ?? []).map((material) => material.name),
  ].slice(0, 8);
  const appearanceAnchorLines = getAppearanceAnchorLines(boundAsset);

  return [
    "你正在为电商短视频生成 9:16 竖版分镜图。",
    "",
    "【全局硬性规则】",
    "- 必须使用中文理解以下内容。",
    "- 画面中的产品必须严格匹配绑定素材和参考图，不得重新设计产品。",
    "- 不得改变产品颜色、形状、材质、Logo、包装、结构、配件和可见文字。",
    "- 如果素材信息不足，只能弱化背景或镜头动作，不能虚构产品外观。",
    "",
    "【视频脚本上下文】",
    `产品名称：${project.productName}`,
    `目标人群：${project.audience}`,
    `核心卖点：${project.sellingPoints.join("、")}`,
    `视频语气：${project.tone}`,
    `视频风格：${project.style}`,
    `关键词：${request?.keywords.join("、") || "无"}`,
    "",
    "【本镜头信息】",
    `镜头序号：${scene.order}`,
    `镜头目标：${scene.subtitle}`,
    `时长：${scene.durationSeconds} 秒`,
    `旁白：${scene.voiceover}`,
    `字幕：${scene.subtitle}`,
    `画面描述：${scene.visualPrompt}`,
    "",
    "【绑定素材】",
    `素材 ID：${boundAsset?.id ?? "未绑定"}`,
    `素材名称：${boundAsset?.name ?? "未绑定"}`,
    `素材类型：${boundAsset?.type ?? "未知"}`,
    `参考图数量：${referenceImageUrls.length}`,
    `已准备素材：${materialNames.join("、") || "无"}`,
    `产品外观锚点：${appearanceAnchorLines.join("；")}`,
    "",
    "【禁止改变】",
    "- 禁止更换产品颜色、形状、品牌、Logo、包装、材质、屏幕内容、结构和配件数量。",
    "- 禁止添加参考图中不存在的品牌元素。",
    "- 禁止生成海报大字、乱码或不可读文字。",
    "",
    "【生成要求】",
    "生成一张 9:16 电商短视频分镜图。画面主体是绑定素材中的同一款产品。构图、背景、光线、人物手部或使用场景可以服务本镜头目标，但产品外观必须与绑定素材一致。",
  ].join("\n");
};

const generateStoryboardSceneImageUrl = async (
  project: ProjectSnapshot,
  scene: StoryboardScene,
  request: ScriptGenerationRequest | undefined,
  assets: AssetMetadata[],
  videoFrameExtractor: VideoFrameExtractor,
): Promise<string> => {
  try {
    const referenceImageUrls = await resolveStoryboardReferenceImageUrls(
      scene,
      assets,
      videoFrameExtractor,
    );
    const prompt = buildStoryboardImagePrompt(project, scene, request, assets, referenceImageUrls);
    const generated = await generateInspiration({
      assetType: "image",
      prompt,
      apiConfig: request?.apiConfig,
      options: {
        image: {
          aspectRatio: "9:16",
          count: 1,
          quality: "standard",
          referenceImages: referenceImageUrls,
        },
      },
    });
    const material = generated.materials.find(
      (candidate) => candidate.status === "ready" && candidate.url,
    );
    if (material?.url) {
      return material.url;
    }
    const fallbackReason = generated.fallback.reason ?? "";
    const shouldRetryWithoutReferences =
      referenceImageUrls.length > 0 &&
      !fallbackReason.includes("AI_PROVIDER_MODE is mock") &&
      !fallbackReason.includes("environment variables are incomplete") &&
      !fallbackReason.includes("User API settings are incomplete");
    if (shouldRetryWithoutReferences) {
      console.warn(
        "[storyboard] image generation with reference images did not return a URL; retrying text-only generation.",
        {
          fallback: generated.fallback,
          referenceImageCount: referenceImageUrls.length,
          sceneId: scene.id,
        },
      );
      const retried = await generateInspiration({
        assetType: "image",
        prompt,
        apiConfig: request?.apiConfig,
        options: {
          image: {
            aspectRatio: "9:16",
            count: 1,
            quality: "standard",
          },
        },
      });
      const retriedMaterial = retried.materials.find(
        (candidate) => candidate.status === "ready" && candidate.url,
      );
      if (retriedMaterial?.url) {
        return retriedMaterial.url;
      }
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
  videoFrameExtractor: VideoFrameExtractor,
): Promise<Omit<ScriptResult, "id" | "projectId">> => ({
  ...script,
  scenes: await Promise.all(
    script.scenes.map(async (scene) => ({
      ...scene,
      imageUrl: await generateStoryboardSceneImageUrl(
        project,
        scene,
        request,
        assets,
        videoFrameExtractor,
      ),
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
export type SceneClipComposer = (
  projectId: string,
  clips: SceneRenderClip[],
) => Promise<string | undefined>;

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
  sceneClipComposer?: SceneClipComposer;
  videoFrameExtractor?: VideoFrameExtractor;
}

export const createP0Router = ({
  cosAssetSearch = searchCosIntelligentAssets,
  externalAssetDownloader = downloadExternalAsset,
  sceneClipComposer = composeSceneClipsWithFfmpeg,
  store = new MemoryProjectStore(),
  storageProvider = new CosStorageProvider(),
  videoFrameExtractor = extractVideoReferenceFrames,
}: P0RouterOptions = {}): Router => {
  const router = Router();

  const canUseAssetInProject = (asset: AssetMetadata, projectId: string): boolean =>
    !asset.projectId || asset.projectId === projectId;

  const resolvePreparedAssets = async (
    project: ProjectSnapshot,
    request: ScriptGenerationRequest,
  ): Promise<{ assets: AssetMetadata[]; invalidAssetIds: string[] }> => {
    const requestedAssetIds = [...new Set(request.assetIds)];
    const requestedAssets = (
      await Promise.all(requestedAssetIds.map((assetId) => store.getAsset(assetId)))
    ).filter((asset): asset is AssetMetadata => Boolean(asset));
    const assetById = new Map(requestedAssets.map((asset) => [asset.id, asset]));
    const invalidAssetIds = requestedAssetIds.filter((assetId) => {
      const asset = assetById.get(assetId);
      return !asset || !canUseAssetInProject(asset, project.id);
    });

    if (invalidAssetIds.length > 0) {
      return { assets: [], invalidAssetIds };
    }

    if (requestedAssets.length > 0) {
      return { assets: requestedAssets, invalidAssetIds: [] };
    }

    return { assets: project.assets, invalidAssetIds: [] };
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

  router.delete("/projects/:projectId", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const objectKeys = collectStorageObjectKeys(project.assets);
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

      const contentType =
        typeof request.headers["content-type"] === "string"
          ? request.headers["content-type"]
          : (asset.mimeType ?? "application/octet-stream");
      let uploaded;
      try {
        uploaded = await storageProvider.uploadObject({
          body: request.body,
          contentType,
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
      const documentText = await extractBrandDocumentText({
        body: request.body,
        mimeType: contentType,
        name: asset.name,
      });
      const documentTextMetadata =
        documentText.status === "unsupported"
          ? {}
          : {
              documentTextCharacterCount: documentText.characterCount,
              documentTextExtractedAt: uploadedAt,
              documentTextKind: documentText.kind,
              documentTextStatus: documentText.status,
              ...(documentText.errorMessage
                ? { documentTextError: documentText.errorMessage }
                : {}),
            };
      const updatedAsset = await store.updateAsset(asset.id, {
        status: "ready",
        url: uploaded.publicUrl,
        ...(documentText.status === "extracted" && documentText.text
          ? { embeddingText: documentText.text }
          : {}),
        metadata: {
          proxiedUpload: true,
          uploadedBytes: request.body.length,
          uploadConfirmedAt: uploadedAt,
          structuredAssetVersion: "asset-multigranularity-v1",
          structureProvider: "mock-asset-processor",
          ...documentTextMetadata,
        },
      });
      if (!updatedAsset) {
        sendNotFound(response, "ASSET_NOT_FOUND", "Asset was not found.");
        return;
      }

      const processingJob = job
        ? await store.updateAssetProcessingJob(job.id, {
            status: "ready",
            steps: [
              ...job.steps,
              "server-proxy-upload",
              ...(documentText.status === "extracted" ? ["document-text-extracted"] : []),
              "metadata-ready",
            ],
            message:
              documentText.status === "extracted"
                ? "Asset uploaded through the API server. Document text is ready for script generation and storyboard recall."
                : "Asset uploaded through the API server. Metadata is ready for script generation and storyboard recall.",
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

    const objectKeys = collectStorageObjectKeys(assets);

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
      prepKeywords: [],
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

    const shouldPersistKeywords = Object.prototype.hasOwnProperty.call(
      request.body ?? {},
      "keywords",
    );
    const workingProject = shouldPersistKeywords
      ? ((await store.updateProjectPrepKeywords(project.id, parsedRequest.data.keywords)) ?? project)
      : project;

    const preparedAssetResult = await resolvePreparedAssets(workingProject, parsedRequest.data);
    if (preparedAssetResult.invalidAssetIds.length > 0) {
      sendInvalidRequest(
        response,
        "INVALID_SCRIPT_ASSETS",
        "One or more requested assets do not exist or cannot be used in this project.",
      );
      return;
    }
    const preparedAssets = preparedAssetResult.assets;
    const providerResult = await rewriteScriptWithConfiguredProvider(
      workingProject,
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

    const shouldPersistKeywords = Object.prototype.hasOwnProperty.call(
      request.body ?? {},
      "keywords",
    );
    const workingProject = shouldPersistKeywords
      ? ((await store.updateProjectPrepKeywords(project.id, parsedRequest.data.keywords)) ?? project)
      : project;

    const preparedAssetResult = await resolvePreparedAssets(workingProject, parsedRequest.data);
    if (preparedAssetResult.invalidAssetIds.length > 0) {
      sendInvalidRequest(
        response,
        "INVALID_SCRIPT_ASSETS",
        "One or more requested assets do not exist or cannot be used in this project.",
      );
      return;
    }
    const preparedAssets = preparedAssetResult.assets;
    const textProviderResult = await rewriteScriptWithConfiguredProvider(
      workingProject,
      parsedRequest.data,
      preparedAssets,
    );
    const providerResult = generateFallbackScript(workingProject, {
      assets: preparedAssets,
      request: {
        ...parsedRequest.data,
        draftScript: textProviderResult.fallback.used
          ? parsedRequest.data.draftScript
          : textProviderResult.scriptText,
      },
    });
    const scriptWithSceneImages = await renderStoryboardSceneImages(
      workingProject,
      providerResult.script,
      parsedRequest.data,
      preparedAssets,
      videoFrameExtractor,
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
      fallback: textProviderResult.fallback,
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

    const renderResult = createQueuedRenderWithConfiguredVideoProvider(
      project,
      parsedRenderRequest.data,
    );
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
          providerResult.renderTask.sceneClips.length > 1
        ) {
          try {
            const exportUrl = await sceneClipComposer(
              renderTask.project.id,
              providerResult.renderTask.sceneClips,
            );
            if (exportUrl) {
              providerResult.renderTask.exportUrl = exportUrl;
              providerResult.traceEvents.push({
                status: "completed",
                step: "ffmpeg-scene-compose-completed",
                message: "Seedance scene clips composed into a final export video.",
              });
            }
          } catch (error) {
            providerResult.traceEvents.push({
              status: "failed",
              step: "ffmpeg-scene-compose-failed",
              message:
                error instanceof Error
                  ? error.message
                  : "ffmpeg scene clip composition failed.",
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
              message:
                error instanceof Error ? error.message : "Seedance render polling failed.",
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
    const renderResult = createQueuedRenderWithConfiguredVideoProvider(previousRender.project, {
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
    let exportUrl = completedRender?.exportUrl;

    if (
      completedRender &&
      !exportUrl &&
      completedRender.sceneClips &&
      completedRender.sceneClips.length > 1
    ) {
      try {
        exportUrl = await sceneClipComposer(project.id, completedRender.sceneClips);
        if (exportUrl) {
          await store.updateRenderTask(
            completedRender.id,
            { exportUrl },
            [
              {
                status: "completed",
                step: "ffmpeg-scene-compose-completed",
                message: "Seedance scene clips composed into a final export video.",
              },
            ],
          );
        }
      } catch (error) {
        response.status(502).json({
          error: {
            code: "EXPORT_COMPOSE_FAILED",
            message:
              error instanceof Error ? error.message : "Final video composition failed.",
          },
        });
        return;
      }
    }

    if (!exportUrl) {
      sendInvalidRequest(
        response,
        "EXPORT_NOT_READY",
        "Render a completed preview before exporting.",
      );
      return;
    }

    response.json({
      projectId: project.id,
      exportUrl,
      downloadUrl: exportUrl,
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

    if (typeof parsedUpdate.data.assetId === "string") {
      const context = await store.getSceneContext(request.params.sceneId);
      if (!context) {
        sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
        return;
      }

      const asset = await store.getAsset(parsedUpdate.data.assetId);
      if (!asset || !canUseAssetInProject(asset, context.project.id)) {
        sendInvalidRequest(
          response,
          "INVALID_SCENE_ASSET",
          "Scene asset does not exist or cannot be used in this project.",
        );
        return;
      }
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
    const parsedRegeneration = SceneRegenerationRequestSchema.safeParse(request.body ?? {});
    if (!parsedRegeneration.success) {
      sendInvalidRequest(
        response,
        "INVALID_SCENE_REGENERATION_REQUEST",
        "Scene regeneration request is invalid.",
      );
      return;
    }

    const context = await store.getSceneContext(request.params.sceneId);
    if (!context) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    const sceneUpdate = parsedRegeneration.data.scene;
    if (typeof sceneUpdate?.assetId === "string") {
      const asset = await store.getAsset(sceneUpdate.assetId);
      if (!asset || !canUseAssetInProject(asset, context.project.id)) {
        sendInvalidRequest(
          response,
          "INVALID_SCENE_ASSET",
          "Scene asset does not exist or cannot be used in this project.",
        );
        return;
      }
    }
    const nextAssetId =
      sceneUpdate?.assetId === null ? undefined : (sceneUpdate?.assetId ?? context.scene.assetId);
    const sceneForImage = {
      ...context.scene,
      durationSeconds: sceneUpdate?.durationSeconds ?? context.scene.durationSeconds,
      subtitle: sceneUpdate?.subtitle ?? context.scene.subtitle,
      voiceover: sceneUpdate?.voiceover ?? context.scene.voiceover,
      visualPrompt: sceneUpdate?.visualPrompt ?? context.scene.visualPrompt,
      assetId: nextAssetId,
      status: "generated" as const,
    };
    const linkedAsset = sceneForImage.assetId
      ? await store.getAsset(sceneForImage.assetId)
      : undefined;
    const imageUrl = await generateStoryboardSceneImageUrl(
      context.project,
      sceneForImage,
      {
        assetIds: sceneForImage.assetId ? [sceneForImage.assetId] : [],
        keywords: [],
        materials: [],
        apiConfig: parsedRegeneration.data.apiConfig,
      },
      linkedAsset ? [linkedAsset] : context.project.assets,
      videoFrameExtractor,
    );
    const storedScene = await store.updateScene(context.scene.id, {
      durationSeconds: sceneForImage.durationSeconds,
      subtitle: sceneForImage.subtitle,
      voiceover: sceneForImage.voiceover,
      visualPrompt: sceneForImage.visualPrompt,
      assetId: sceneUpdate?.assetId === null ? null : sceneForImage.assetId,
      status: "generated",
      imageUrl,
    });
    if (!storedScene) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    const traceEvent = await store.appendTraceEvent(`scene:${context.scene.id}`, {
      status: "completed",
      step: "scene-regenerated",
      message: `已根据当前分镜字段重生成第 ${context.scene.order} 个镜头图片。`,
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
