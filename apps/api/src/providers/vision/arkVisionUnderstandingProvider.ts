import {
  StructuredAssetMetadataSchema,
  StructuredSliceMetadataSchema,
  type AssetMetadata,
  type AssetRole,
  type ProductVisibility,
  type SceneRole,
  type StructuredAssetMetadata,
  type StructuredSliceMetadata,
} from "@shopclip/shared";

import { createMockVisionUnderstandingProvider } from "./mockVisionUnderstandingProvider.js";
import type {
  SliceUnderstandingInput,
  VisionUnderstandingProvider,
} from "./visionUnderstandingProvider.js";
import type { ExtractedAudioSummary } from "../../modules/media/audioExtractor.js";
import type { SampledFrame } from "../../modules/media/frameSampler.js";
import type { MediaProbeResult } from "../../modules/media/mediaProbe.js";

const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const VISION_PROVIDER_ID = "volcengine-ark-vision";

const ASSET_SYSTEM_PROMPT = [
  "You are a multimodal analyst for ecommerce short-video production.",
  "Return only valid JSON. Do not wrap JSON in markdown.",
  "Analyze the provided image/video references and asset context.",
  "Do not invent product colors, shape, logo text, packaging, features, or claims that are not visible or provided.",
  "Use concise English tags because downstream retrieval is keyword-based.",
].join("\n");

const SLICE_SYSTEM_PROMPT = [
  "You are analyzing one short ecommerce video slice or image shot.",
  "Return only valid JSON. Do not wrap JSON in markdown.",
  "Focus on visible product details, shot language, motion, text overlays, and which storyboard roles this slice can serve.",
  "Do not invent visual facts. If evidence is weak, use productVisibility=uncertain and add needs_review through low confidence fields.",
].join("\n");

type ArkVisionConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  videoInputMode: "frame_urls" | "text_only" | "video_url";
};

const ASSET_ROLES = new Set<AssetRole>([
  "brand_doc",
  "detail_image",
  "hero_image",
  "lifestyle",
  "packaging",
  "reference_video",
  "transition",
  "usage_demo",
]);
const PRODUCT_VISIBILITIES = new Set<ProductVisibility>(["clear", "none", "partial", "uncertain"]);
const SHOT_TYPES = new Set([
  "close_up",
  "first_person",
  "medium",
  "overhead",
  "packshot",
  "screen_recording",
  "unknown",
  "wide",
]);
const CAMERA_MOVEMENTS = new Set([
  "handheld",
  "handheld_push_in",
  "pan",
  "pull_out",
  "push_in",
  "static",
  "tilt",
  "unknown",
  "zoom",
]);
const SCENE_ROLES = new Set<SceneRole>([
  "closure",
  "cta",
  "demo",
  "hook",
  "pain",
  "price",
  "solution",
  "transition",
  "trust",
]);

const firstEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
};

const lowerTokens = (values: Array<string | undefined>) =>
  values
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .toLowerCase();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const getNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const clampScore = (value: unknown, fallback?: number) => {
  const numberValue = getNumber(value);
  if (numberValue === undefined) {
    return fallback;
  }
  return Math.min(1, Math.max(0, numberValue));
};

const getStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => getString(item)).filter((item): item is string => Boolean(item))
    : [];

const normalizeAssetRole = (value: unknown, fallback: AssetRole): AssetRole => {
  const normalized = getString(value)?.toLowerCase().replaceAll("-", "_");
  return normalized && ASSET_ROLES.has(normalized as AssetRole)
    ? (normalized as AssetRole)
    : fallback;
};

const normalizeProductVisibility = (
  value: unknown,
  fallback: ProductVisibility,
): ProductVisibility => {
  const normalized = getString(value)?.toLowerCase().replaceAll("-", "_");
  return normalized && PRODUCT_VISIBILITIES.has(normalized as ProductVisibility)
    ? (normalized as ProductVisibility)
    : fallback;
};

const normalizeSceneRoles = (value: unknown, fallback: SceneRole[]): SceneRole[] => {
  const roles = getStringArray(value)
    .map((role) => role.toLowerCase().replaceAll("-", "_"))
    .filter((role): role is SceneRole => SCENE_ROLES.has(role as SceneRole));
  return roles.length ? [...new Set(roles)] : fallback;
};

const normalizeEnumToken = (value: unknown, allowed: Set<string>, fallback: string) => {
  const normalized = getString(value)?.toLowerCase().replaceAll("-", "_").replace(/\s+/g, "_");
  return normalized && allowed.has(normalized) ? normalized : fallback;
};

const getProviderMode = () =>
  (process.env.VISION_PROVIDER_MODE ?? "mock").trim().toLowerCase();

const isRealVisionMode = () =>
  ["ark", "doubao", "real", "volcengine-ark"].includes(getProviderMode());

const getRequiredConfig = (): ArkVisionConfig | undefined => {
  if (!isRealVisionMode()) {
    return undefined;
  }

  const apiKey = firstEnv("AI_VISION_API_KEY", "ARK_API_KEY", "AI_API_KEY");
  const model = firstEnv("AI_VISION_MODEL_ID", "AI_VISION_ENDPOINT_ID", "AI_GENERAL_MODEL_ID");
  if (!apiKey || !model) {
    return undefined;
  }

  const videoInputMode = (
    process.env.VISION_VIDEO_INPUT_MODE?.trim().toLowerCase() ?? "video_url"
  ) as ArkVisionConfig["videoInputMode"];

  return {
    apiKey,
    model,
    baseUrl: (process.env.ARK_API_BASE_URL ?? DEFAULT_ARK_BASE_URL).replace(/\/$/, ""),
    videoInputMode: ["frame_urls", "text_only", "video_url"].includes(videoInputMode)
      ? videoInputMode
      : "video_url",
  };
};

const buildSourceDeclaration = (asset: AssetMetadata) => {
  if (asset.source === "public_reference") {
    return "Public reference asset; use structured analysis only.";
  }
  if (asset.source === "generated") {
    return "Generated asset owned by this demo workspace.";
  }
  if (asset.source === "external_provider") {
    return "Imported external provider asset with source metadata retained.";
  }
  return "Merchant-uploaded asset for this product workspace.";
};

const roleFallbackForAsset = (asset: AssetMetadata): AssetRole => {
  if (asset.source === "public_reference" || asset.type === "reference") {
    return "reference_video";
  }
  if (asset.type === "video") {
    return "usage_demo";
  }
  const source = lowerTokens([asset.name, asset.tags.join(" ")]);
  if (source.includes("package") || source.includes("box")) {
    return "packaging";
  }
  if (source.includes("detail") || source.includes("close")) {
    return "detail_image";
  }
  return "hero_image";
};

const qualityFromRecord = (value: unknown, fallback: StructuredAssetMetadata["qualitySignals"]) => {
  const record = isRecord(value) ? value : {};
  return {
    sharpness: clampScore(record.sharpness, fallback.sharpness),
    stability: clampScore(record.stability, fallback.stability),
    productVisibility: normalizeProductVisibility(
      record.productVisibility,
      fallback.productVisibility ?? "uncertain",
    ),
    usableForAd:
      typeof record.usableForAd === "boolean" ? record.usableForAd : fallback.usableForAd,
  };
};

const visualStyleFromRecord = (value: unknown): StructuredAssetMetadata["visualStyle"] => {
  const record = isRecord(value) ? value : {};
  return {
    colors: getStringArray(record.colors),
    materials: getStringArray(record.materials),
    lighting: getString(record.lighting),
    background: getString(record.background),
    mood: getString(record.mood),
  };
};

const resolvePublicUrl = (value: string | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) {
    return trimmed;
  }
  if (!trimmed.startsWith("/")) {
    return undefined;
  }

  const baseUrl = firstEnv("VISION_PUBLIC_BASE_URL", "API_PUBLIC_BASE_URL", "PUBLIC_API_BASE_URL");
  if (!baseUrl) {
    return undefined;
  }

  return new URL(trimmed, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
};

const getAssetMediaUrl = (asset: AssetMetadata) =>
  resolvePublicUrl(asset.url) ?? resolvePublicUrl(`/api/assets/${asset.id}/content`);

const frameUrlsFromKeys = (frameKeys: string[]) =>
  frameKeys.map((key) => resolvePublicUrl(key)).filter((url): url is string => Boolean(url));

const responseTextFromBody = (body: unknown): string | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }

  const outputText = getString(body.output_text);
  if (outputText) {
    return outputText;
  }

  const output = Array.isArray(body.output) ? body.output : [];
  for (const outputItem of output) {
    if (!isRecord(outputItem)) {
      continue;
    }
    const content = Array.isArray(outputItem.content) ? outputItem.content : [];
    for (const contentItem of content) {
      if (!isRecord(contentItem)) {
        continue;
      }
      const text = getString(contentItem.text);
      if (text) {
        return text;
      }
    }
  }

  return undefined;
};

const extractJsonObject = (text: string): unknown => {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  const jsonText = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(jsonText);
  } catch {
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(jsonText.slice(start, end + 1));
    }
    throw new Error("Ark vision response did not contain valid JSON.");
  }
};

const postArkVision = async (
  config: ArkVisionConfig,
  systemPrompt: string,
  content: Array<Record<string, unknown>>,
) => {
  const response = await fetch(`${config.baseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: systemPrompt,
            },
          ],
        },
        {
          role: "user",
          content,
        },
      ],
      temperature: 0,
    }),
  });

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = undefined;
  }

  if (!response.ok) {
    const responseSummary = isRecord(responseBody)
      ? ` ${JSON.stringify(responseBody).slice(0, 240)}`
      : "";
    throw new Error(`Ark vision request failed with HTTP ${response.status}.${responseSummary}`);
  }

  const responseText = responseTextFromBody(responseBody);
  if (!responseText) {
    throw new Error("Ark vision response did not include output_text.");
  }

  return extractJsonObject(responseText);
};

const assetContextText = (
  asset: AssetMetadata,
  audio: ExtractedAudioSummary,
  frames: SampledFrame[],
  probe: MediaProbeResult,
) =>
  [
    "Return JSON fields: overallSummary, role, globalTags, ocrText, visualStyle { colors, materials, lighting, background, mood }, qualitySignals { sharpness, stability, productVisibility, usableForAd }, complianceFlags, confidence.",
    `Asset id: ${asset.id}`,
    `Asset name: ${asset.name}`,
    `Type: ${asset.type}`,
    `Source: ${asset.source ?? "merchant_upload"}`,
    `Existing tags: ${asset.tags.join(", ") || "none"}`,
    `Mime: ${asset.mimeType ?? "unknown"}`,
    `Duration seconds: ${probe.durationSeconds}`,
    `Format: ${probe.format ?? "unknown"}`,
    `Resolution: ${probe.width ?? "unknown"}x${probe.height ?? "unknown"}`,
    `Existing embedding text: ${asset.embeddingText ?? "none"}`,
    `ASR summary: ${audio.asrSummary || "none"}`,
    `Transcript: ${audio.transcript || "none"}`,
    `Sampled frame references: ${frames.map((frame) => `${frame.second}s=${frame.key}`).join(", ") || "none"}`,
  ].join("\n");

const sliceContextText = (input: SliceUnderstandingInput) =>
  [
    "Return JSON fields: summary, transcript, ocrText, shotType, cameraMovement, composition, transition, mood, action, keyElements, productVisibility, visibleProductParts, suitableSceneRoles, qualitySignals.",
    `Asset id: ${input.asset.id}`,
    `Asset name: ${input.asset.name}`,
    `Type: ${input.asset.type}`,
    `Existing tags: ${input.asset.tags.join(", ") || "none"}`,
    `Slice id: ${input.sliceId}`,
    `Slice index: ${input.index}`,
    `Time range: ${input.startSecond}-${input.endSecond}s`,
    `ASR summary: ${input.audio.asrSummary || "none"}`,
    `Transcript: ${input.audio.transcript || "none"}`,
    `Frame references: ${input.frameKeys.join(", ") || "none"}`,
  ].join("\n");

const mediaContentForAsset = (
  asset: AssetMetadata,
  frames: SampledFrame[],
  config: ArkVisionConfig,
) => {
  const mediaContent: Array<Record<string, unknown>> = [];
  const assetMediaUrl = getAssetMediaUrl(asset);
  const frameUrls = frameUrlsFromKeys(frames.map((frame) => frame.key));

  if (asset.type === "image" && assetMediaUrl) {
    mediaContent.push({ type: "input_image", image_url: assetMediaUrl });
  } else if (asset.type === "video" && config.videoInputMode === "video_url" && assetMediaUrl) {
    mediaContent.push({ type: "input_video", video_url: assetMediaUrl });
  }

  if (config.videoInputMode !== "text_only") {
    frameUrls.slice(0, 6).forEach((url) => {
      mediaContent.push({ type: "input_image", image_url: url });
    });
  }

  return mediaContent;
};

const mediaContentForSlice = (input: SliceUnderstandingInput, config: ArkVisionConfig) => {
  if (config.videoInputMode === "text_only") {
    return [];
  }

  const frameMedia = frameUrlsFromKeys(input.frameKeys)
    .slice(0, 6)
    .map((url) => ({ type: "input_image", image_url: url }));
  if (frameMedia.length || config.videoInputMode !== "video_url") {
    return frameMedia;
  }

  const assetMediaUrl = getAssetMediaUrl(input.asset);
  return assetMediaUrl ? [{ type: "input_video", video_url: assetMediaUrl }] : [];
};

const withNeedsReview = (
  metadata: StructuredAssetMetadata,
  config: ArkVisionConfig,
  error: unknown,
): StructuredAssetMetadata => ({
  ...metadata,
  complianceFlags: [...new Set([...metadata.complianceFlags, "needs_review"])],
  modelTrace: {
    provider: VISION_PROVIDER_ID,
    model: config.model,
    confidence: metadata.modelTrace?.confidence,
    fallbackUsed: true,
    error: error instanceof Error ? error.message : "Unknown Ark vision provider error.",
  },
});

const buildStructuredAsset = (
  input: {
    asset: AssetMetadata;
    audio: ExtractedAudioSummary;
    frames: SampledFrame[];
    probe: MediaProbeResult;
  },
  raw: unknown,
  config: ArkVisionConfig,
): StructuredAssetMetadata => {
  const record = isRecord(raw) ? raw : {};
  const fallbackRole = roleFallbackForAsset(input.asset);
  const role = normalizeAssetRole(record.role, fallbackRole);
  const overallSummary =
    getString(record.overallSummary) ??
    `${input.asset.name} analyzed as ${role.replaceAll("_", " ")} for ecommerce video creation.`;
  const ocrText = getString(record.ocrText) ?? "";
  const asrSummary = input.audio.asrSummary;
  const globalTags = [
    ...new Set([
      ...input.asset.tags,
      ...getStringArray(record.globalTags),
      role,
      input.asset.type,
    ]),
  ];
  const visualStyle = visualStyleFromRecord(record.visualStyle);
  const qualitySignals = qualityFromRecord(record.qualitySignals, {
    productVisibility: "uncertain",
  });
  const searchText = lowerTokens([
    input.asset.name,
    input.asset.tags.join(" "),
    overallSummary,
    ocrText,
    asrSummary,
    globalTags.join(" "),
    visualStyle.colors.join(" "),
    visualStyle.materials.join(" "),
  ]);

  return StructuredAssetMetadataSchema.parse({
    assetId: input.asset.id,
    projectId: input.asset.projectId,
    type: input.asset.type,
    source: input.asset.source ?? "merchant_upload",
    sourceDeclaration: buildSourceDeclaration(input.asset),
    objectKey: input.asset.objectKey,
    thumbnailKey: input.asset.thumbnailKey,
    durationSeconds: input.asset.type === "video" ? input.probe.durationSeconds : undefined,
    width: input.probe.width,
    height: input.probe.height,
    format: input.probe.format,
    overallSummary,
    role,
    globalTags,
    ocrText,
    asrSummary,
    visualStyle,
    qualitySignals,
    complianceFlags: getStringArray(record.complianceFlags),
    searchText,
    embeddingText: searchText,
    modelTrace: {
      provider: VISION_PROVIDER_ID,
      model: config.model,
      confidence: clampScore(record.confidence),
      fallbackUsed: false,
    },
  });
};

const buildStructuredSlice = (
  input: SliceUnderstandingInput,
  raw: unknown,
): StructuredSliceMetadata => {
  const record = isRecord(raw) ? raw : {};
  const suitableSceneRoles = normalizeSceneRoles(record.suitableSceneRoles, ["demo"]);
  const productVisibility = normalizeProductVisibility(record.productVisibility, "uncertain");
  const summary =
    getString(record.summary) ??
    `${input.asset.name} slice ${input.index + 1} from ${input.startSecond}-${input.endSecond}s.`;
  const transcript = getString(record.transcript) ?? input.audio.transcript;
  const ocrText = getString(record.ocrText) ?? "";
  const action = getString(record.action) ?? summary;
  const keyElements = [
    ...new Set(["product", ...input.asset.tags.slice(0, 4), ...getStringArray(record.keyElements)]),
  ];
  const qualitySignals = qualityFromRecord(record.qualitySignals, {
    productVisibility,
  });
  const searchText = lowerTokens([
    input.asset.name,
    input.asset.tags.join(" "),
    summary,
    transcript,
    ocrText,
    action,
    keyElements.join(" "),
    suitableSceneRoles.join(" "),
  ]);

  return StructuredSliceMetadataSchema.parse({
    sliceId: input.sliceId,
    assetId: input.asset.id,
    startSecond: input.startSecond,
    endSecond: input.endSecond,
    thumbnailKey: input.frameKeys[0],
    frameKeys: input.frameKeys,
    summary,
    transcript,
    ocrText,
    shotType: normalizeEnumToken(record.shotType, SHOT_TYPES, "unknown"),
    cameraMovement: normalizeEnumToken(record.cameraMovement, CAMERA_MOVEMENTS, "unknown"),
    composition: getString(record.composition) ?? "",
    transition: getString(record.transition) ?? "",
    mood: getString(record.mood) ?? "",
    action,
    keyElements,
    productVisibility,
    visibleProductParts: getStringArray(record.visibleProductParts),
    suitableSceneRoles,
    qualitySignals,
    searchText,
    embeddingText: searchText,
    cosFrameObjectKeys: input.frameKeys,
  });
};

export const createArkVisionUnderstandingProvider = (): VisionUnderstandingProvider => {
  const config = getRequiredConfig();
  const fallbackProvider = createMockVisionUnderstandingProvider();
  if (!config) {
    return fallbackProvider;
  }

  return {
    understandAsset: async (input) => {
      try {
        const raw = await postArkVision(config, ASSET_SYSTEM_PROMPT, [
          { type: "input_text", text: assetContextText(input.asset, input.audio, input.frames, input.probe) },
          ...mediaContentForAsset(input.asset, input.frames, config),
        ]);
        return buildStructuredAsset(input, raw, config);
      } catch (error) {
        const fallback = await fallbackProvider.understandAsset(input);
        return withNeedsReview(fallback, config, error);
      }
    },
    understandSlice: async (input) => {
      try {
        const raw = await postArkVision(config, SLICE_SYSTEM_PROMPT, [
          { type: "input_text", text: sliceContextText(input) },
          ...mediaContentForSlice(input, config),
        ]);
        return buildStructuredSlice(input, raw);
      } catch {
        const fallback = await fallbackProvider.understandSlice(input);
        return {
          ...fallback,
          searchText: `${fallback.searchText} needs_review`,
          embeddingText: `${fallback.embeddingText} needs_review`,
        };
      }
    },
  };
};
