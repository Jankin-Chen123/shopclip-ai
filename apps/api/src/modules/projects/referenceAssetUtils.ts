import type {
  AssetMetadata,
  ReferenceVideo,
  StoryboardScene,
} from "@shopclip/shared";

import type {
  VideoFrameExtractor,
  VideoReferenceFrame,
} from "../../providers/media/videoFrameExtractor.js";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const getMetadataRecord = (asset: AssetMetadata): Record<string, unknown> =>
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

export const buildReferenceScriptAssetBody = (reference: ReferenceVideo): string => {
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

export const buildReferenceScriptAssetTags = (reference: ReferenceVideo): string[] => {
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

export const isScriptLibraryAsset = (asset: AssetMetadata): boolean => {
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

export const isReferenceScriptAssetFor = (
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

export const isReferenceOwnedAsset = (
  asset: AssetMetadata,
  reference: ReferenceVideo,
): boolean => {
  const metadata = getMetadataRecord(asset);
  return (
    (metadata.kind === "reference_script_asset" && metadata.referenceId === reference.id) ||
    (asset.id === reference.sourceAssetId && asset.source === "public_reference")
  );
};

export const getAppearanceAnchorLines = (asset: AssetMetadata | undefined): string[] => {
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

export const resolveSceneBoundAsset = (
  scene: Pick<StoryboardScene, "assetId">,
  assets: AssetMetadata[],
): AssetMetadata | undefined =>
  (scene.assetId ? assets.find((asset) => asset.id === scene.assetId) : undefined) ?? assets[0];

export const resolveStoryboardReferenceImageUrls = async (
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
