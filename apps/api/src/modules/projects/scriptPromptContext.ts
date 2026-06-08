import type {
  AssetMetadata,
  ReferenceVideo,
  ScriptGenerationRequest,
  ViralTemplate,
} from "@shopclip/shared";

import type { ProjectSnapshot } from "./projectStore.js";
import { getMetadataRecord, isRecord } from "./referenceAssetUtils.js";

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

export interface ScriptPromptContext {
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
