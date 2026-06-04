import { Router, raw } from "express";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type {
  AssetMetadata,
  AssetProcessingJob,
  AssetUploadIntent,
  ExternalAssetResult,
  ReferenceVideo,
  SmartEditPlan,
  SmartEditSegmentOutput,
  SmartEditTimeline,
  ScriptGenerationRequest,
  ScriptResult,
  SceneRenderClip,
  StoryboardScene,
  TraceEvent,
  ViralTemplate,
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

import { extractBrandDocumentText } from "../assets/documentText.js";
import { createAssetSlices, inferAssetTags } from "../assets/tagging.js";
import {
  CreateAssetRequestSchema,
  CreateAssetUploadIntentRequestSchema,
  ConfirmAssetUploadRequestSchema,
  DeleteAssetsRequestSchema,
} from "../assets/validation.js";
import { buildMockDashboard } from "../dashboard/mockDashboard.js";
import { processAssetStructure } from "../assets/assetProcessingService.js";
import {
  registerReferenceForAnalysis,
  runRegisteredReferenceAnalysis,
} from "../references/referenceAnalysisService.js";
import { buildViralTemplateFromReferences } from "../references/referenceTemplateService.js";
import { mediaOutputDir } from "../media/mediaPaths.js";
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
  type VideoReferenceFrame,
} from "../../providers/media/videoFrameExtractor.js";
import {
  createSeedanceRenderProvider,
  createQueuedRenderWithConfiguredVideoProvider,
} from "../../providers/renderer/seedanceRenderer.js";
import {
  createCosRenderExportPublisher,
  type RenderExportPublisher,
} from "../../providers/renderer/renderExportPublisher.js";
import {
  composeSmartEditToStorage,
  smartEditSegmentOutputsForResponse,
} from "../../providers/renderer/smartEditComposer.js";
import { materializeSceneClipsForSmartEdit } from "../../providers/renderer/sceneClipMaterializer.js";
import { CosStorageProvider } from "../../providers/storage/cosStorageProvider.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import { MemoryProjectStore } from "./memoryStore.js";
import type { ProjectSnapshot, ProjectStore } from "./projectStore.js";

const LibraryDisplayNameUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
});

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

const isSeedanceSceneDurationError = (error: unknown): error is Error =>
  error instanceof Error && error.message.includes("outside the configured Seedance range");

const sendScriptGenerationFailure = (response: Response, error: unknown) => {
  response.status(502).json({
    error: {
      code: "SCRIPT_GENERATION_FAILED",
      message:
        error instanceof Error && error.message.trim()
          ? error.message
          : "Real script generation failed.",
    },
  });
};

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getMetadataRecord = (asset: AssetMetadata): Record<string, unknown> =>
  isRecord(asset.metadata) ? asset.metadata : {};

const compactText = (values: Array<string | undefined>): string =>
  values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n");

const uniqueNonEmpty = (values: Array<string | undefined>): string[] => [
  ...new Set(
    values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)),
  ),
];

const buildReferenceScriptAssetBody = (reference: ReferenceVideo): string => {
  const analysis = reference.analysis;
  if (!analysis) {
    return compactText([
      `Reference: ${reference.title}`,
      `Category: ${reference.category}`,
      `Source: ${reference.sourcePlatform} ${reference.sourceUrl}`,
      reference.sourceDeclaration,
    ]);
  }

  const segments = analysis.commerceNarrativeSegments
    .map((segment, index) =>
      [
        `${index + 1}. ${segment.role} ${segment.startSecond}-${segment.endSecond}s`,
        `Summary: ${segment.summary}`,
        `Copy: ${segment.copywriting}`,
        `Visual: ${segment.visualPrompt}`,
      ].join("\n"),
    )
    .join("\n\n");

  return compactText([
    `Reference: ${analysis.title}`,
    `Category: ${analysis.category}`,
    `Source: ${analysis.sourcePlatform} ${analysis.sourceUrl}`,
    analysis.sourceDeclaration,
    `Hook: ${analysis.hookAnalysis}`,
    `Pacing: ${analysis.pacingAnalysis}`,
    `Formula: ${analysis.contentFormula}`,
    `Audience: ${analysis.targetAudience.join(", ")}`,
    `Viral factors: ${analysis.keyViralFactors.join(", ")}`,
    segments ? `Reusable storyboard:\n${segments}` : undefined,
    `Recreation visual: ${analysis.recreationBlueprint.visual}`,
    `Recreation copywriting: ${analysis.recreationBlueprint.copywriting}`,
    `Shooting guide: ${analysis.recreationBlueprint.shootingGuide}`,
    analysis.commentInsights.length > 0
      ? `Comment insights: ${analysis.commentInsights.join(", ")}`
      : undefined,
  ]);
};

const buildReferenceScriptAssetTags = (reference: ReferenceVideo): string[] => {
  const analysis = reference.analysis;
  return uniqueNonEmpty([
    "script",
    "copy",
    "reference-video",
    "viral-breakdown",
    reference.category,
    reference.sourcePlatform,
    ...(analysis?.commerceNarrativeSegments.map((segment) => segment.role) ?? []),
    ...(analysis?.keyViralFactors ?? []),
    ...(analysis?.derivedTemplates ?? []),
  ]);
};

const isScriptLibraryAsset = (asset: AssetMetadata): boolean => {
  const tags = asset.tags.map((tag) => tag.toLowerCase());
  const metadata = getMetadataRecord(asset);
  return (
    metadata.kind === "reference_script_asset" ||
    asset.mimeType === "text/plain" ||
    asset.mimeType === "text/markdown" ||
    asset.mimeType?.startsWith("text/") ||
    tags.some((tag) => tag === "script" || tag === "copy" || tag === "text" || tag === "剧本")
  );
};

const isReferenceScriptAssetFor = (
  asset: AssetMetadata,
  referenceId: string,
  projectId: string | undefined,
): boolean => {
  const metadata = getMetadataRecord(asset);
  return (
    metadata.kind === "reference_script_asset" &&
    metadata.referenceId === referenceId &&
    asset.projectId === projectId
  );
};

const isReferenceOwnedAsset = (asset: AssetMetadata, reference: ReferenceVideo): boolean => {
  const metadata = getMetadataRecord(asset);
  return (
    (metadata.kind === "reference_script_asset" && metadata.referenceId === reference.id) ||
    (asset.id === reference.sourceAssetId && asset.source === "public_reference")
  );
};

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
      return (
        await videoFrameExtractor({
          assetId: boundAsset.id,
          maxFrames: 3,
          videoUrl: boundAsset.url,
        })
      )
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

const structuredAssetPromptContext = (asset: AssetMetadata): string => {
  const metadata = getMetadataRecord(asset);
  const structuredAsset = isRecord(metadata.structuredAsset) ? metadata.structuredAsset : undefined;
  if (!structuredAsset) {
    return "";
  }

  const summary =
    typeof structuredAsset.overallSummary === "string" ? structuredAsset.overallSummary : "";
  const role = typeof structuredAsset.role === "string" ? structuredAsset.role : "";
  const ocrText = typeof structuredAsset.ocrText === "string" ? structuredAsset.ocrText : "";
  const searchText =
    typeof structuredAsset.searchText === "string" ? structuredAsset.searchText : "";
  const qualitySignals = isRecord(structuredAsset.qualitySignals)
    ? structuredAsset.qualitySignals
    : {};
  const productVisibility =
    typeof qualitySignals.productVisibility === "string" ? qualitySignals.productVisibility : "";

  return [
    summary ? `结构化摘要=${summary}` : undefined,
    role ? `素材角色=${role}` : undefined,
    ocrText ? `OCR=${ocrText}` : undefined,
    productVisibility ? `可见度=${productVisibility}` : undefined,
    searchText ? `检索语义=${searchText}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("；");
};

interface ScriptPromptContext {
  reference?: ReferenceVideo;
  referenceScriptAsset?: AssetMetadata;
  template?: ViralTemplate;
}

const compactPromptList = (values: string[]): string =>
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .join("、");

const metadataString = (asset: AssetMetadata | undefined, key: string): string | undefined => {
  const metadata = asset ? getMetadataRecord(asset) : {};
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const buildReferencePromptLines = (
  reference: ReferenceVideo | undefined,
  scriptAsset: AssetMetadata | undefined,
): string[] => {
  if (!reference) {
    return [];
  }

  const analysis = reference.analysis;
  const scriptAssetText =
    scriptAsset?.embeddingText ??
    metadataString(scriptAsset, "content") ??
    metadataString(scriptAsset, "searchText");
  const segmentLines =
    analysis?.commerceNarrativeSegments.map(
      (segment, index) =>
        `${index + 1}. ${segment.role} ${segment.startSecond}-${segment.endSecond}s：${segment.summary}；台词=${segment.copywriting}；画面=${segment.visualPrompt}`,
    ) ?? [];

  return [
    "【爆款参考拆解】",
    `参考ID：${reference.id}`,
    `参考标题：${analysis?.title ?? reference.title}`,
    `参考平台：${analysis?.sourcePlatform ?? reference.sourcePlatform}`,
    `参考类目：${analysis?.category ?? reference.category}`,
    analysis?.hookAnalysis ? `Hook手法：${analysis.hookAnalysis}` : undefined,
    analysis?.pacingAnalysis ? `节奏拆解：${analysis.pacingAnalysis}` : undefined,
    analysis?.contentFormula ? `内容公式：${analysis.contentFormula}` : undefined,
    analysis?.targetAudience.length
      ? `参考目标人群：${compactPromptList(analysis.targetAudience)}`
      : undefined,
    analysis?.keyViralFactors.length
      ? `爆款因子：${compactPromptList(analysis.keyViralFactors)}`
      : undefined,
    segmentLines.length ? `参考分镜结构：\n${segmentLines.join("\n")}` : undefined,
    analysis?.recreationBlueprint
      ? `可复用拍法：视觉=${analysis.recreationBlueprint.visual}；文案=${analysis.recreationBlueprint.copywriting}；拍摄约束=${analysis.recreationBlueprint.shootingGuide}`
      : undefined,
    analysis?.commentInsights.length
      ? `评论洞察：${compactPromptList(analysis.commentInsights)}`
      : undefined,
    scriptAssetText ? `剧本素材库正文：${scriptAssetText.slice(0, 3000)}` : undefined,
    "使用要求：只学习参考视频的Hook、节奏、叙事结构和转化手法；不得复刻、搬运、混剪或要求使用公开视频原素材。",
  ].filter((line): line is string => Boolean(line));
};

const buildTemplatePromptLines = (template: ViralTemplate | undefined): string[] => {
  if (!template) {
    return [];
  }

  return [
    "【灵感模板】",
    `模板ID：${template.templateId}`,
    `模板名称：${template.name}`,
    `模板类目：${template.category}`,
    `创作策略：${template.strategy}`,
    `核心因子：${compactPromptList(template.factorSet) || "无"}`,
    `叙事结构：${compactPromptList(template.narrativeStructure)}`,
    `镜头要求：${compactPromptList(template.shotRequirements) || "无"}`,
    `文案规则：${compactPromptList(template.copywritingRules) || "无"}`,
    `风险约束：${compactPromptList(template.riskRules) || "无"}`,
  ];
};

export const buildScriptAssetPromptLines = (
  request: ScriptGenerationRequest,
  assets: AssetMetadata[],
): string[] => {
  const materialsByAssetId = new Map(
    request.materials
      .filter((material) => material.assetId)
      .map((material) => [material.assetId!, material]),
  );
  const assetLines = assets.map((asset) => {
    const material = materialsByAssetId.get(asset.id);
    const bucket = material?.bucketId ? `；素材槽位=${material.bucketId}` : "";
    const tags = asset.tags.length > 0 ? `；标签=${asset.tags.join("、")}` : "";
    const structuredContext = structuredAssetPromptContext(asset);
    return `assetId=${asset.id}；文件名=${asset.name}${bucket}；类型=${asset.mimeType ?? asset.type}${tags}${
      structuredContext ? `；${structuredContext}` : ""
    }`;
  });
  const pendingMaterialLines = request.materials
    .filter((material) => !material.assetId)
    .map(
      (material) =>
        `未入库素材；文件名=${material.name}；素材槽位=${material.bucketId ?? "未知"}；类型=${material.mimeType ?? material.type ?? "素材"}`,
    );

  return [...assetLines, ...pendingMaterialLines];
};

export const scriptGenerationPrompt = (
  project: ProjectSnapshot,
  request: ScriptGenerationRequest,
  assets: AssetMetadata[],
  context: ScriptPromptContext = {},
) => {
  const targetDurationSeconds = project.targetDurationSeconds;
  const keywords = request.keywords.length > 0 ? request.keywords : project.prepKeywords;
  const materialLines = buildScriptAssetPromptLines(request, assets);
  const brandDocumentLines = buildBrandDocumentPromptLines(assets);
  const referenceLines = buildReferencePromptLines(context.reference, context.referenceScriptAsset);
  const templateLines = buildTemplatePromptLines(context.template);

  return [
    "请生成电商短视频分镜脚本。必须使用中文输出，内容要简洁、转化导向，并可直接写入分镜编辑器。",
    "输出格式必须是 Markdown 表格，表头固定为：| 时长 | 文案 | 画面提示词 | 素材槽位 |。",
    `每一行代表一个分镜，分镜时长总和必须等于目标总时长 ${targetDurationSeconds} 秒；单个分镜时长必须在 4-12 秒之间。`,
    "文案列是该分镜唯一对用户展示和用于音频/字幕参考的短文案，不要再拆成旁白和字幕两列；每条文案建议 8-22 个中文字符。",
    "素材槽位列必须只填写一个已准备素材的文件名或 assetId，用来绑定该分镜素材槽位；不要写“提供的素材”“用户素材”“同款产品”这类泛称。",
    "不同分镜必须根据镜头目标选择最合适的素材：产品外观/开场优先主图，功能结构优先细节图，使用场景/通勤/CTA 优先场景图；如果素材充足，不要所有分镜都使用同一张图。",
    "画面提示词列必须描述镜头动作、构图、主体细节和使用场景，并写明“主要参考素材：<文件名>，产品外观必须与绑定素材一致”。",
    `产品：${project.productName}`,
    `目标人群：${project.audience}`,
    `语气：${project.tone}`,
    `视频风格：${project.style}`,
    `目标总时长：${targetDurationSeconds} 秒`,
    `核心卖点：${project.sellingPoints.join("、")}`,
    `已准备素材清单：${materialLines.slice(0, 20).join("\n") || "无"}`,
    `品牌资料内容：${brandDocumentLines.join("; ") || "无可读取品牌资料正文"}`,
    referenceLines.length ? referenceLines.join("\n") : undefined,
    templateLines.length ? templateLines.join("\n") : undefined,
    `关键词：${keywords.join("、") || "无"}`,
    `用户草稿：${request.draftScript || "未提供草稿，请直接生成一个强脚本。"}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
};

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

const canUseStoryboardFallbackImage = () =>
  (process.env.AI_PROVIDER_MODE ?? "ark").trim().toLowerCase() === "mock";

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
    `镜头文案：${scene.subtitle}`,
    `时长：${scene.durationSeconds} 秒`,
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
  let referenceImageUrls: string[] = [];
  let prompt = "";
  try {
    referenceImageUrls = await resolveStoryboardReferenceImageUrls(
      scene,
      assets,
      videoFrameExtractor,
    );
    prompt = buildStoryboardImagePrompt(project, scene, request, assets, referenceImageUrls);
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
    if (referenceImageUrls.length > 0 && !canUseStoryboardFallbackImage()) {
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
    if (canUseStoryboardFallbackImage()) {
      console.warn("[storyboard] image generation failed; using deterministic fallback.", error);
      return createStoryboardFallbackImageUrl(project, scene);
    }
    throw error;
  }

  if (canUseStoryboardFallbackImage()) {
    return createStoryboardFallbackImageUrl(project, scene);
  }
  throw new Error(
    "Real storyboard image generation did not return a usable image URL. Set AI_PROVIDER_MODE=mock only for demo fixtures.",
  );
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

const safeLocalFileName = (value: string): string =>
  // eslint-disable-next-line no-control-regex
  value.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/^\.+$/, "asset") || "asset";

const writeDownloadedAssetCache = async ({
  assetId,
  body,
  name,
}: {
  assetId: string;
  body: Buffer;
  name: string;
}): Promise<string> => {
  const directory = join(mediaOutputDir(), "downloaded-assets", assetId);
  await mkdir(directory, { recursive: true });
  const localFilePath = join(directory, safeLocalFileName(name));
  await writeFile(localFilePath, body);
  return localFilePath;
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
  const allowed = allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
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
export type SmartEditPlanner = typeof createSmartEditPlan;
export type SmartEditComposer = typeof composeSmartEditToStorage;
export type SceneClipMaterializer = typeof materializeSceneClipsForSmartEdit;

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

const segmentOutputsByScene = (
  outputs: SmartEditSegmentOutput[],
): Map<string, SmartEditSegmentOutput> =>
  new Map(outputs.map((output) => [output.sceneId, output]));

const containsReadableTimelineText = (text: string): boolean =>
  /[\p{L}\p{N}]/u.test(text) &&
  !/^[\s?？�□■◇◆]+$/u.test(text.trim()) &&
  ([...text.replace(/\s/gu, "")].filter((character) => /[?？�□■◇◆]/u.test(character)).length /
    Math.max(1, [...text.replace(/\s/gu, "")].length) <
    0.35);

const readableTimelineText = (...candidates: Array<string | undefined>): string | undefined =>
  candidates.find((candidate) => candidate && containsReadableTimelineText(candidate));

const sanitizeSmartEditSegmentText = (
  segment: SmartEditPlan["segments"][number],
  scene: StoryboardScene | undefined,
): SmartEditPlan["segments"][number] => ({
  ...segment,
  subtitle:
    readableTimelineText(segment.subtitle, segment.voiceover, scene?.subtitle, scene?.voiceover) ??
    segment.subtitle,
  voiceover:
    readableTimelineText(segment.voiceover, segment.subtitle, scene?.voiceover, scene?.subtitle) ??
    segment.voiceover,
});

const buildSmartEditRefreshPlan = ({
  currentPlan,
  projectId,
  refreshedSegment,
  segmentOutputs,
  scenes,
  targetSceneId,
}: {
  currentPlan: SmartEditPlan;
  projectId: string;
  refreshedSegment: SmartEditPlan["segments"][number];
  segmentOutputs: SmartEditSegmentOutput[];
  scenes: StoryboardScene[];
  targetSceneId: string;
}): SmartEditPlan => {
  const outputsByScene = segmentOutputsByScene(segmentOutputs);
  const scenesById = new Map(scenes.map((scene) => [scene.id, scene]));
  const segments = currentPlan.segments.map((segment) => {
    if (segment.sceneId === targetSceneId) {
      return {
        ...sanitizeSmartEditSegmentText(refreshedSegment, scenesById.get(segment.sceneId)),
        id: `edit_segment_${targetSceneId}_${randomUUID()}`,
        order: segment.order,
      };
    }
    if (!segment.enabled) {
      return segment;
    }
    const previousOutput = outputsByScene.get(segment.sceneId);
    if (!previousOutput) {
      throw new Error(
        `Missing reusable smart edit segment output for scene ${segment.sceneId}. Run a full smart edit first.`,
      );
    }
    return {
      ...sanitizeSmartEditSegmentText(segment, scenesById.get(segment.sceneId)),
      rationale: `${segment.rationale} Reused the previous uploaded segment during partial refresh.`,
      source: {
        kind: "generated-scene-clip" as const,
        sceneClipUrl: previousOutput.videoUrl,
      },
    };
  });
  const targetDurationSeconds = Math.min(
    600,
    Math.max(
      1,
      segments
        .filter((segment) => segment.enabled)
        .reduce((sum, segment) => sum + segment.durationSeconds, 0),
    ),
  );
  return {
    ...currentPlan,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    projectId,
    segments,
    strategy: `${currentPlan.strategy} Partial refresh reused existing segment outputs and recomposed the final video.`,
    targetDurationSeconds,
  };
};

const smartEditSegmentClipsForPlan = (plan: SmartEditPlan, videoUrl?: string): SceneRenderClip[] =>
  plan.segments
    .filter((segment) => segment.enabled)
    .map((segment) => ({
      sceneId: segment.sceneId,
      order: segment.order,
      progress: videoUrl ? 100 : 45,
      status: videoUrl ? ("completed" as const) : ("running" as const),
      subtitle: segment.subtitle,
      videoUrl,
    }));

const withSmartEditTimeline = (plan: SmartEditPlan): SmartEditPlan => {
  const enabledSegments = [...plan.segments]
    .filter((segment) => segment.enabled)
    .sort((left, right) => left.order - right.order);
  let cursor = 0;
  const hasManualTimelineStarts = enabledSegments.some(
    (segment) => (segment.timelineStartSecond ?? 0) > 0,
  );
  const tracks: SmartEditTimeline["tracks"] = [
    {
      hidden: false,
      id: "video-main",
      kind: "video" as const,
      label: "Video",
      locked: false,
      muted: false,
    },
    {
      hidden: false,
      id: "audio-source",
      kind: "audio" as const,
      label: "Source audio",
      locked: false,
      muted: false,
    },
    {
      hidden: false,
      id: "text-copy",
      kind: "text" as const,
      label: "Text",
      locked: false,
      muted: false,
    },
    {
      hidden: false,
      id: "voiceover",
      kind: "audio" as const,
      label: "Voice",
      locked: false,
      muted: false,
    },
    ...(plan.audio.bgmTrack !== "none"
      ? [
          {
            hidden: false,
            id: "bgm-bed",
            kind: "bgm" as const,
            label: "BGM",
            locked: false,
            muted: false,
          },
        ]
      : []),
  ];
  const elements: SmartEditTimeline["elements"] = enabledSegments.flatMap((segment) => {
    const startSecond = hasManualTimelineStarts
      ? Math.max(0, Math.min(600, segment.timelineStartSecond ?? 0))
      : cursor;
    const durationSeconds = segment.durationSeconds;
    cursor = Math.max(cursor, startSecond + durationSeconds);
    const sourceStart = segment.source.startSecond ?? 0;
    const sourceEnd = segment.source.endSecond;
    return [
      {
        detachedAudio: false,
        durationSeconds,
        hidden: false,
        id: `${segment.id}-video`,
        kind: "video" as const,
        label: `Scene ${segment.order}`,
        muted: false,
        playbackRate: segment.playbackRate ?? 1,
        sceneId: segment.sceneId,
        segmentId: segment.id,
        sourceDurationSeconds:
          sourceEnd !== undefined ? Math.max(0.1, sourceEnd - sourceStart) : durationSeconds,
        sourceUrl: segment.source.sceneClipVideoOnlyUrl ?? segment.source.sceneClipUrl ?? segment.source.imageUrl,
        startSecond,
        trackId: "video-main",
        trimEndSecond: sourceEnd,
        trimStartSecond: sourceStart,
      },
      ...(segment.source.sceneClipAudioUrl
        ? [
            {
              detachedAudio: true,
              durationSeconds,
              hidden: false,
              id: `${segment.id}-audio`,
              kind: "audio" as const,
              label: `Scene ${segment.order} audio`,
              muted: segment.sourceAudioMuted ?? false,
              playbackRate: segment.playbackRate ?? 1,
              sceneId: segment.sceneId,
              segmentId: segment.id,
              sourceUrl: segment.source.sceneClipAudioUrl,
              startSecond,
              trackId: "audio-source",
              trimEndSecond: sourceEnd,
              trimStartSecond: sourceStart,
            },
          ]
        : []),
      {
        detachedAudio: false,
        durationSeconds,
        hidden: segment.captionHidden ?? false,
        id: `${segment.id}-text`,
        kind: "text" as const,
        label: segment.subtitle,
        muted: false,
        playbackRate: 1,
        sceneId: segment.sceneId,
        segmentId: segment.id,
        startSecond: startSecond + (segment.captionStartOffsetSeconds ?? 0),
        text: segment.subtitle,
        trackId: "text-copy",
        trimStartSecond: 0,
      },
      ...(segment.voiceover.trim()
        ? [
            {
              detachedAudio: false,
              durationSeconds: Math.max(0.1, durationSeconds - (segment.voiceoverStartOffsetSeconds ?? 0)),
              hidden: false,
              id: `${segment.id}-voice`,
              kind: "audio" as const,
              label: segment.voiceover,
              muted: false,
              playbackRate: 1,
              sceneId: segment.sceneId,
              segmentId: segment.id,
              startSecond: startSecond + (segment.voiceoverStartOffsetSeconds ?? 0),
              text: segment.voiceover,
              trackId: "voiceover",
              trimStartSecond: 0,
            },
          ]
        : []),
    ];
  });

  if (plan.audio.bgmTrack !== "none" && cursor > 0) {
    elements.push({
      detachedAudio: false,
      durationSeconds: cursor,
      hidden: false,
      id: "bgm-bed",
      kind: "bgm",
      label: plan.audio.bgmTrack,
      muted: false,
      playbackRate: 1,
      startSecond: 0,
      trackId: "bgm-bed",
      trimStartSecond: 0,
    });
  }

  return {
    ...plan,
    timeline: {
      durationSeconds: cursor,
      elements,
      scale: 1,
      tracks,
    },
  };
};

const smartEditFailureMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const runSmartEditJob = async ({
  project,
  renderTaskId,
  requestData,
  smartEditComposer,
  smartEditPlanner,
  storageProvider,
  store,
}: {
  project: ProjectSnapshot;
  renderTaskId: string;
  requestData: ReturnType<typeof SmartEditRequestSchema.parse>;
  smartEditComposer: SmartEditComposer;
  smartEditPlanner: SmartEditPlanner;
  storageProvider: StorageProvider;
  store: ProjectStore;
}) => {
  await store.updateRenderTask(
    renderTaskId,
    {
      progress: 12,
      status: "running",
    },
    [
      {
        status: "running",
        step: "smart-edit-plan-started",
        message: "Smart edit job started. Calling the configured general model for timeline planning.",
      },
    ],
  );

  let plannerResult: Awaited<ReturnType<SmartEditPlanner>>;
  try {
    plannerResult = await smartEditPlanner({
      apiConfig: requestData.apiConfig,
      assets: project.assets,
      assetSlices: project.assetSlices,
      project,
      request: requestData,
      scenes: project.scenes,
    });
  } catch (error) {
    await store.updateRenderTask(
      renderTaskId,
      {
        errorMessage: smartEditFailureMessage(error, "Smart edit planning failed."),
        progress: 100,
        status: "failed",
      },
      [
        {
          status: "failed",
          step: "smart-edit-plan-failed",
          message: smartEditFailureMessage(error, "Smart edit planning failed."),
        },
      ],
    );
    return;
  }
  plannerResult = {
    ...plannerResult,
    plan: withSmartEditTimeline(plannerResult.plan),
  };

  await store.updateRenderTask(
    renderTaskId,
    {
      progress: 42,
      providerTaskId: plannerResult.plan.id,
      sceneClips: smartEditSegmentClipsForPlan(plannerResult.plan),
      smartEditPlan: plannerResult.plan,
      status: "running",
    },
    [
      {
        status: plannerResult.fallback.used ? "retrying" : "completed",
        step: plannerResult.fallback.used ? "smart-edit-plan-fallback" : "smart-edit-plan-model",
        message: plannerResult.fallback.used
          ? `Smart edit used local planning fallback: ${plannerResult.fallback.reason ?? "unknown reason"}`
          : `Smart edit planned by ${plannerResult.fallback.provider}.`,
      },
      {
        status: "running",
        step: "smart-edit-ffmpeg-compose-started",
        message: "Planning is ready. ffmpeg is composing clips, transitions, subtitles, voiceover, and BGM.",
      },
    ],
  );

  let exportResult: Awaited<ReturnType<SmartEditComposer>>;
  try {
    exportResult = await smartEditComposer(project.id, plannerResult.plan, project.assets, {
      storageProvider,
      subtitlesEnabled: requestData.mediaSettings.subtitlesEnabled,
      videoSettings: requestData.videoSettings,
    });
  } catch (error) {
    await store.updateRenderTask(
      renderTaskId,
      {
        errorMessage: smartEditFailureMessage(error, "Smart edit ffmpeg composition failed."),
        progress: 100,
        status: "failed",
      },
      [
        {
          status: "failed",
          step: "smart-edit-ffmpeg-compose-failed",
          message: smartEditFailureMessage(error, "Smart edit ffmpeg composition failed."),
        },
      ],
    );
    return;
  }

  await store.updateRenderTask(
    renderTaskId,
    {
      exportUrl: exportResult.publicUrl,
      previewUrl: exportResult.publicUrl,
      progress: 100,
      sceneClips: smartEditSegmentClipsForPlan(plannerResult.plan, exportResult.publicUrl),
      smartEditPlan: plannerResult.plan,
      smartEditSegmentOutputs: smartEditSegmentOutputsForResponse(exportResult.segmentOutputs),
      status: "completed",
    },
    [
      {
        status: "completed",
        step: "smart-edit-ffmpeg-compose",
        message: "Smart edit video composed with ffmpeg and uploaded to storage.",
      },
    ],
  );
};

const runSmartEditSegmentRefreshJob = async ({
  project,
  renderTaskId,
  requestData,
  smartEditComposer,
  smartEditPlanner,
  storageProvider,
  store,
  targetScene,
}: {
  project: ProjectSnapshot;
  renderTaskId: string;
  requestData: ReturnType<typeof SmartEditSegmentRefreshRequestSchema.parse>;
  smartEditComposer: SmartEditComposer;
  smartEditPlanner: SmartEditPlanner;
  storageProvider: StorageProvider;
  store: ProjectStore;
  targetScene: StoryboardScene;
}) => {
  await store.updateRenderTask(
    renderTaskId,
    {
      progress: 12,
      status: "running",
    },
    [
      {
        status: "running",
        step: "smart-edit-segment-plan-started",
        message: "Refreshing the selected segment with the configured general model.",
      },
    ],
  );

  let plannerResult: Awaited<ReturnType<SmartEditPlanner>>;
  try {
    plannerResult = await smartEditPlanner({
      apiConfig: requestData.apiConfig,
      assets: project.assets,
      assetSlices: project.assetSlices,
      project,
      request: {
        apiConfig: requestData.apiConfig,
        instructions: requestData.instructions,
        locale: requestData.locale,
        mediaSettings: requestData.mediaSettings,
        segments: requestData.segment ? [requestData.segment] : [],
        targetLanguage: requestData.targetLanguage,
        videoSettings: requestData.videoSettings,
      },
      scenes: [targetScene],
    });
  } catch (error) {
    await store.updateRenderTask(
      renderTaskId,
      {
        errorMessage: smartEditFailureMessage(error, "Smart edit segment planning failed."),
        progress: 100,
        status: "failed",
      },
      [
        {
          status: "failed",
          step: "smart-edit-segment-plan-failed",
          message: smartEditFailureMessage(error, "Smart edit segment planning failed."),
        },
      ],
    );
    return;
  }

  const refreshedSegment = plannerResult.plan.segments[0];
  if (!refreshedSegment) {
    await store.updateRenderTask(
      renderTaskId,
      {
        errorMessage: "Smart edit segment planning returned no segment.",
        progress: 100,
        status: "failed",
      },
      [
        {
          status: "failed",
          step: "smart-edit-segment-plan-empty",
          message: "Smart edit segment planning returned no segment.",
        },
      ],
    );
    return;
  }

  let refreshPlan: SmartEditPlan;
  try {
    refreshPlan = buildSmartEditRefreshPlan({
      currentPlan: requestData.currentPlan,
      projectId: project.id,
      refreshedSegment,
      segmentOutputs: requestData.segmentOutputs,
      scenes: project.scenes,
      targetSceneId: targetScene.id,
    });
  } catch (error) {
    await store.updateRenderTask(
      renderTaskId,
      {
        errorMessage: smartEditFailureMessage(error, "Reusable segment outputs are required."),
        progress: 100,
        status: "failed",
      },
      [
        {
          status: "failed",
          step: "smart-edit-segment-outputs-missing",
          message: smartEditFailureMessage(error, "Reusable segment outputs are required."),
        },
      ],
    );
    return;
  }
  refreshPlan = withSmartEditTimeline(refreshPlan);

  await store.updateRenderTask(
    renderTaskId,
    {
      progress: 42,
      providerTaskId: refreshPlan.id,
      sceneClips: smartEditSegmentClipsForPlan(refreshPlan),
      smartEditPlan: refreshPlan,
      status: "running",
    },
    [
      {
        status: plannerResult.fallback.used ? "retrying" : "completed",
        step: plannerResult.fallback.used
          ? "smart-edit-segment-plan-fallback"
          : "smart-edit-segment-plan-model",
        message: plannerResult.fallback.used
          ? `Segment refresh used local planning fallback: ${plannerResult.fallback.reason ?? "unknown reason"}`
          : `Segment refresh planned by ${plannerResult.fallback.provider}.`,
      },
      {
        status: "running",
        step: "smart-edit-segment-refresh-compose-started",
        message: "Reusing unchanged segment outputs and recomposing the final video with ffmpeg.",
      },
    ],
  );

  let exportResult: Awaited<ReturnType<SmartEditComposer>>;
  try {
    exportResult = await smartEditComposer(project.id, refreshPlan, project.assets, {
      storageProvider,
      subtitlesEnabled: requestData.mediaSettings.subtitlesEnabled,
      videoSettings: requestData.videoSettings,
    });
  } catch (error) {
    await store.updateRenderTask(
      renderTaskId,
      {
        errorMessage: smartEditFailureMessage(
          error,
          "Smart edit segment refresh ffmpeg composition failed.",
        ),
        progress: 100,
        status: "failed",
      },
      [
        {
          status: "failed",
          step: "smart-edit-segment-refresh-compose-failed",
          message: smartEditFailureMessage(
            error,
            "Smart edit segment refresh ffmpeg composition failed.",
          ),
        },
      ],
    );
    return;
  }

  await store.updateRenderTask(
    renderTaskId,
    {
      exportUrl: exportResult.publicUrl,
      previewUrl: exportResult.publicUrl,
      progress: 100,
      sceneClips: smartEditSegmentClipsForPlan(refreshPlan, exportResult.publicUrl),
      smartEditPlan: refreshPlan,
      smartEditSegmentOutputs: smartEditSegmentOutputsForResponse(exportResult.segmentOutputs),
      status: "completed",
    },
    [
      {
        status: "completed",
        step: "smart-edit-segment-refresh-compose",
        message:
          "Selected segment was refreshed; unchanged segments reused uploaded segment outputs before final ffmpeg composition.",
      },
    ],
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
    if (!sceneClips?.some((clip) => clip.status === "completed" && clip.videoUrl)) {
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

  const canUseAssetInProject = (asset: AssetMetadata, projectId: string): boolean =>
    !asset.projectId || asset.projectId === projectId;
  const isLocalRenderExportUrl = (url: string | undefined): boolean =>
    url?.startsWith("/api/render-exports/") ?? false;

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
      const importedFileName = fileNameForExternalImport(externalAsset.title, contentType);
      const localFilePath = await writeDownloadedAssetCache({
        assetId,
        body: downloaded.body,
        name: importedFileName,
      });

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
          localFilePath,
          importedAt: new Date().toISOString(),
        }),
        tags: buildExternalImportTags(externalAsset, contentType, uploaded.provider),
      });

      if (assetType === "image" || assetType === "video") {
        await store.updateAssetProcessingJob(jobId, {
          status: "processing",
          steps: ["queued", "external-download", "cos-upload", "multigranularity-structure"],
          message: "Generating structured asset metadata and slice index from the imported asset.",
        });
        await processAssetStructure({
          assetId,
          input: { forceRegenerate: true, mode: "full" },
          store,
          storageProvider,
        });
      }

      await store.updateAssetProcessingJob(jobId, {
        status: "ready",
        steps: [
          "queued",
          "external-download",
          "cos-upload",
          ...(assetType === "image" || assetType === "video" ? ["multigranularity-structure"] : []),
          "metadata-ready",
        ],
        message:
          assetType === "image" || assetType === "video"
            ? "External asset imported into Tencent COS and structured metadata persisted."
            : "External asset imported into Tencent COS and metadata persisted.",
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
      sendNotFound(
        response,
        "ASSET_PROCESSING_JOB_NOT_FOUND",
        "Asset processing job was not found.",
      );
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
        structureStatus: "pending_structure",
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
      sendNotFound(
        response,
        "ASSET_PROCESSING_JOB_NOT_FOUND",
        "Asset processing job was not found.",
      );
      return;
    }

    response.json({
      asset: updatedAsset,
      processingJob,
    });
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
      const localFilePath = await writeDownloadedAssetCache({
        assetId: asset.id,
        body: request.body,
        name: asset.name,
      });
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
          localFilePath,
          uploadedBytes: request.body.length,
          uploadConfirmedAt: uploadedAt,
          structuredAssetVersion: "asset-multigranularity-v1",
          structureStatus:
            asset.type === "image" || asset.type === "video"
              ? "pending_structure"
              : "metadata_ready",
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

    const { projectId, sourceAssetId, ...referenceInput } = parsedReference.data;
    if (projectId && !(await store.getProject(projectId))) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const sourceAsset = sourceAssetId ? await store.getAsset(sourceAssetId) : undefined;
    if (sourceAssetId && !sourceAsset) {
      sendNotFound(
        response,
        "REFERENCE_SOURCE_ASSET_NOT_FOUND",
        "Reference source asset was not found.",
      );
      return;
    }
    if (sourceAsset && projectId && sourceAsset.projectId && sourceAsset.projectId !== projectId) {
      sendInvalidRequest(
        response,
        "REFERENCE_SOURCE_ASSET_PROJECT_MISMATCH",
        "Reference source asset does not belong to this project.",
      );
      return;
    }
    if (
      sourceAsset &&
      sourceAsset.type !== "video" &&
      !sourceAsset.mimeType?.startsWith("video/")
    ) {
      sendInvalidRequest(
        response,
        "REFERENCE_SOURCE_ASSET_NOT_VIDEO",
        "Reference source asset must be a video asset.",
      );
      return;
    }
    let reference;
    try {
      const referencePayload = {
        ...referenceInput,
        sourceAssetId,
        sourceUrl:
          referenceInput.sourceUrl ?? sourceAsset?.url ?? `/api/assets/${sourceAssetId}/content`,
      };
      reference = await registerReferenceForAnalysis({
        projectId,
        reference: referencePayload,
        store,
      });
      if (reference) {
        void runRegisteredReferenceAnalysis({
          projectId,
          reference: referencePayload,
          registeredReference: reference,
          store,
          referenceDownloader,
          storageProvider,
        }).catch((error) => {
          console.error("Reference video background analysis failed", error);
        });
      }
    } catch (error) {
      response.status(500).json({
        error: {
          code: "REFERENCE_ANALYSIS_REGISTRATION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Reference video analysis could not be registered.",
        },
      });
      return;
    }
    if (!reference) {
      response.status(500).json({
        error: {
          code: "REFERENCE_ANALYSIS_FAILED",
          message: "Reference video could not be registered for analysis.",
        },
      });
      return;
    }

    response.status(202).json({ reference });
  });

  router.get("/references", async (request, response) => {
    const projectId =
      typeof request.query.projectId === "string" ? request.query.projectId : undefined;
    response.json({
      references: await store.listReferenceVideos(projectId),
    });
  });

  router.delete("/references/:referenceId", async (request, response) => {
    const reference = (await store.listReferenceVideos()).find(
      (candidate) => candidate.id === request.params.referenceId,
    );
    if (!reference) {
      sendNotFound(response, "REFERENCE_NOT_FOUND", "Reference video was not found.");
      return;
    }

    const assetsToDelete = (await store.listAssets()).assets.filter((asset) =>
      isReferenceOwnedAsset(asset, reference),
    );
    const objectKeys = collectStorageObjectKeys(assetsToDelete);

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

    const deleted = await store.deleteReferenceVideo(reference.id);
    if (!deleted) {
      sendNotFound(response, "REFERENCE_NOT_FOUND", "Reference video was not found.");
      return;
    }

    response.json(deleted);
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

    const projectId = parsedRequest.data.projectId;
    if (projectId && !(await store.getProject(projectId))) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const reference = (await store.listReferenceVideos()).find(
      (candidate) => candidate.id === request.params.referenceId,
    );
    if (!reference) {
      sendNotFound(response, "REFERENCE_NOT_FOUND", "Reference video was not found.");
      return;
    }
    if (reference.status !== "ready" || !reference.analysis) {
      sendInvalidRequest(
        response,
        "REFERENCE_NOT_READY",
        "Reference video must finish analysis before it can be added to the script library.",
      );
      return;
    }

    const existingAsset = (await store.listAssets()).assets.find((asset) =>
      isReferenceScriptAssetFor(asset, reference.id, projectId),
    );
    if (existingAsset) {
      response.json({ asset: existingAsset });
      return;
    }

    const body = buildReferenceScriptAssetBody(reference);
    const title = reference.title.trim() || "Reference video script ideas";
    const storedAsset = await store.addAsset(projectId, {
      type: "reference",
      status: "ready",
      url: reference.sourceUrl,
      name: `${title} - script ideas`,
      mimeType: "text/plain",
      sizeBytes: Math.max(1, Buffer.byteLength(body, "utf8")),
      source: "public_reference",
      embeddingText: body,
      metadata: {
        kind: "reference_script_asset",
        referenceId: reference.id,
        sourceUrl: reference.sourceUrl,
        sourcePlatform: reference.sourcePlatform,
        sourceDeclaration: reference.sourceDeclaration,
        title: reference.title,
        category: reference.category,
        content: body,
        searchText: body,
        reusableSegments: reference.analysis.commerceNarrativeSegments,
        recreationBlueprint: reference.analysis.recreationBlueprint,
        keyViralFactors: reference.analysis.keyViralFactors,
        derivedTemplates: reference.analysis.derivedTemplates,
      },
      tags: inferAssetTags({
        name: `${title} script ideas reference video ${reference.category}`,
        mimeType: "text/plain",
        source: "public_reference",
        tags: buildReferenceScriptAssetTags(reference),
      }),
    });

    if (!storedAsset) {
      response.status(500).json({
        error: {
          code: "REFERENCE_SCRIPT_ASSET_CREATE_FAILED",
          message: "Reference script asset could not be created.",
        },
      });
      return;
    }

    response.status(201).json({ asset: storedAsset });
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

    const assetIds = [...new Set(parsedTemplate.data.assetIds)];
    const assets = (await Promise.all(assetIds.map((assetId) => store.getAsset(assetId)))).filter(
      (asset): asset is AssetMetadata => Boolean(asset),
    );
    if (assets.length !== assetIds.length) {
      sendNotFound(response, "SCRIPT_ASSET_NOT_FOUND", "One or more script assets were not found.");
      return;
    }
    if (assets.some((asset) => !isScriptLibraryAsset(asset))) {
      sendInvalidRequest(
        response,
        "SCRIPT_ASSET_REQUIRED",
        "Template extraction only supports script material assets.",
      );
      return;
    }

    try {
      const extractedTemplate = await extractScriptTemplateWithGeneralModel({
        assets,
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

    const promptContextResult = await resolveScriptPromptContext(store, parsedRequest.data);
    if (promptContextResult.error) {
      const { code, message, status } = promptContextResult.error;
      if (status === 404) {
        sendNotFound(response, code, message);
      } else {
        sendInvalidRequest(response, code, message);
      }
      return;
    }

    const shouldPersistKeywords = Object.prototype.hasOwnProperty.call(
      request.body ?? {},
      "keywords",
    );
    const workingProject = shouldPersistKeywords
      ? ((await store.updateProjectPrepKeywords(project.id, parsedRequest.data.keywords)) ??
        project)
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
    let providerResult: Awaited<ReturnType<typeof rewriteScriptWithConfiguredProvider>>;
    try {
      providerResult = await rewriteScriptWithConfiguredProvider(
        workingProject,
        parsedRequest.data,
        preparedAssets,
        promptContextResult.context,
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

    const promptContextResult = await resolveScriptPromptContext(store, parsedRequest.data);
    if (promptContextResult.error) {
      const { code, message, status } = promptContextResult.error;
      if (status === 404) {
        sendNotFound(response, code, message);
      } else {
        sendInvalidRequest(response, code, message);
      }
      return;
    }

    const shouldPersistKeywords = Object.prototype.hasOwnProperty.call(
      request.body ?? {},
      "keywords",
    );
    const workingProject = shouldPersistKeywords
      ? ((await store.updateProjectPrepKeywords(project.id, parsedRequest.data.keywords)) ??
        project)
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

    const providerResult = generateFallbackScript(workingProject, {
      assets: preparedAssetResult.assets,
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

    const storyboardRequest: ScriptGenerationRequest = {
      assetIds: [],
      draftScript: script.narrative,
      keywords: project.prepKeywords,
      materials: [],
      productionMode: "automatic",
    };
    const preparedAssetResult = await resolvePreparedAssets(project, storyboardRequest);
    if (preparedAssetResult.invalidAssetIds.length > 0) {
      sendInvalidRequest(
        response,
        "INVALID_SCRIPT_ASSETS",
        "One or more requested assets do not exist or cannot be used in this project.",
      );
      return;
    }

    const providerResult = generateFallbackScript(project, {
      assets: preparedAssetResult.assets,
      request: storyboardRequest,
      scriptSource: "fallback",
    });
    const scriptWithSceneImages = await renderStoryboardSceneImages(
      project,
      providerResult.script,
      storyboardRequest,
      preparedAssetResult.assets,
      videoFrameExtractor,
    );
    const updatedScript = await store.updateScriptScenes(
      script.id,
      scriptWithSceneImages.scenes,
      scriptWithSceneImages.constraints,
    );
    if (!updatedScript) {
      sendNotFound(response, "SCRIPT_NOT_FOUND", "Script was not found.");
      return;
    }

    const parsedScript = ScriptResultSchema.safeParse(updatedScript);
    if (!parsedScript.success) {
      sendInvalidRequest(
        response,
        "INVALID_GENERATED_SCRIPT",
        "Generated storyboard failed contract validation.",
      );
      return;
    }

    response.status(201).json({ script: parsedScript.data });
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

    const promptContextResult = await resolveScriptPromptContext(store, parsedRequest.data);
    if (promptContextResult.error) {
      const { code, message, status } = promptContextResult.error;
      if (status === 404) {
        sendNotFound(response, code, message);
      } else {
        sendInvalidRequest(response, code, message);
      }
      return;
    }

    const shouldPersistKeywords = Object.prototype.hasOwnProperty.call(
      request.body ?? {},
      "keywords",
    );
    const workingProject = shouldPersistKeywords
      ? ((await store.updateProjectPrepKeywords(project.id, parsedRequest.data.keywords)) ??
        project)
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
    let textProviderResult: Awaited<ReturnType<typeof rewriteScriptWithConfiguredProvider>>;
    let providerResult: ReturnType<typeof generateFallbackScript>;
    try {
      textProviderResult = await rewriteScriptWithConfiguredProvider(
        workingProject,
        parsedRequest.data,
        preparedAssets,
        promptContextResult.context,
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
    const latestProject = await store.getProject(previousRender.project.id);
    if (!latestProject) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    let renderResult: ReturnType<typeof createQueuedRenderWithConfiguredVideoProvider>;
    try {
      renderResult = createQueuedRenderWithConfiguredVideoProvider(latestProject, {
        ...parsedRenderRequest.data,
        retryOfRenderTaskId: previousRender.renderTask.id,
        retryOfTraceEventId: failedTrace?.id,
      });
    } catch (error) {
      if (isSeedanceSceneDurationError(error)) {
        sendInvalidRequest(response, "INVALID_SCENE_DURATION", error.message);
        return;
      }
      throw error;
    }
    const storedRender = await store.addRenderTask(
      latestProject.id,
      renderResult.renderTask,
      renderResult.traceEvents,
    );
    if (!storedRender) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.status(201).json(storedRender);
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
      (!exportUrl || isLocalRenderExportUrl(exportUrl)) &&
      completedRender.sceneClips &&
      completedRender.sceneClips.length > 0
    ) {
      try {
        exportUrl = await publishRenderExport(project.id, completedRender.sceneClips);
        if (exportUrl) {
          await store.updateRenderTask(completedRender.id, { exportUrl }, [
            {
              status: "completed",
              step: "render-export-published",
              message: "Seedance scene clips composed and published as a final export video.",
            },
          ]);
        }
      } catch (error) {
        response.status(502).json({
          error: {
            code: "EXPORT_COMPOSE_FAILED",
            message: error instanceof Error ? error.message : "Final video composition failed.",
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
        used: completedRender?.provider === "mock-renderer",
        provider: completedRender?.provider ?? "unknown",
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
        productionMode: "automatic",
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
