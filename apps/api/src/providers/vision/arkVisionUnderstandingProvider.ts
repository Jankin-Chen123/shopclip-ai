import { existsSync, readFileSync } from "node:fs";
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
  "Read visible subtitles, stickers, product labels, and text overlays from frames into ocrText.",
  "Do not invent product colors, shape, logo text, packaging, features, or claims that are not visible or provided.",
  "Use concise English tags because downstream retrieval is keyword-based.",
].join("\n");

const SLICE_SYSTEM_PROMPT = [
  "You are analyzing one short ecommerce video slice or image shot.",
  "Return only valid JSON. Do not wrap JSON in markdown.",
  "Focus on visible product details, shot language, motion, text overlays, and which storyboard roles this slice can serve.",
  "Use ocrText for visible subtitles/text overlays. transcript is optional and should stay empty when no audio transcript is provided.",
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

const wait = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const fetchWithNetworkRetry = async (url: string, init: RequestInit) => {
  let lastError: unknown;
  for (const delay of [0, 500, 1000]) {
    if (delay > 0) {
      await wait(delay);
    }
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

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

const addRole = (roles: Set<SceneRole>, role: SceneRole) => {
  roles.add(role);
};

const enrichSceneRoles = (
  roles: SceneRole[],
  input: SliceUnderstandingInput,
  fields: Array<string | undefined>,
): SceneRole[] => {
  const enrichedRoles = new Set<SceneRole>(roles);
  const text = lowerTokens(fields);

  if (
    input.index === 0 &&
    /(opening|open|unbox|unwrap|reveal|first|intro|开场|拆封|拆包|开箱|露出|第一眼)/i.test(text)
  ) {
    addRole(enrichedRoles, "hook");
  }
  if (/(pain|problem|annoying|worry|困扰|痛点|麻烦|担心|不好用|不方便)/i.test(text)) {
    addRole(enrichedRoles, "pain");
  }
  if (/(solve|solution|fix|解决|改善|一招|轻松)/i.test(text)) {
    addRole(enrichedRoles, "solution");
  }
  if (/(proof|review|material|quality|leak.?proof|easy to clean|trust|材质|质量|防漏|清洗|实测|测评|证明)/i.test(text)) {
    addRole(enrichedRoles, "trust");
  }
  if (/(\$|¥|￥|\bprice\b|discount|deal|sale|元|价格|到手|折扣|优惠)/i.test(text)) {
    addRole(enrichedRoles, "price");
  }
  if (/(buy|order|shop|cart|tap|link|purchase|购买|下单|入手|点击|链接|橱窗|加购)/i.test(text)) {
    addRole(enrichedRoles, "cta");
  }
  if (
    input.startSecond >= 12 &&
    /(packshot|final|ending|display|showcase|overall|定格|收尾|结尾|展示|整体)/i.test(text)
  ) {
    addRole(enrichedRoles, "closure");
  }

  return [...enrichedRoles];
};

const normalizeEnumToken = (value: unknown, allowed: Set<string>, fallback: string) => {
  const normalized = getString(value)?.toLowerCase().replaceAll("-", "_").replace(/\s+/g, "_");
  return normalized && allowed.has(normalized) ? normalized : fallback;
};

const getProviderMode = () =>
  (process.env.VISION_PROVIDER_MODE ?? "ark").trim().toLowerCase();

const isRealVisionMode = () =>
  ["ark", "doubao", "real", "volcengine-ark"].includes(getProviderMode());

const getRequiredConfig = (): ArkVisionConfig | undefined => {
  const mode = getProviderMode();
  if (mode === "mock") {
    return undefined;
  }
  if (!isRealVisionMode()) {
    throw new Error(
      `Unsupported VISION_PROVIDER_MODE=${mode}. Use ark/real for business runs, or explicitly set mock for tests/demo fixtures.`,
    );
  }

  const apiKey = firstEnv("AI_VISION_API_KEY", "AI_GENERAL_API_KEY", "ARK_API_KEY", "AI_API_KEY");
  const model = firstEnv("AI_VISION_MODEL_ID", "AI_VISION_ENDPOINT_ID", "AI_GENERAL_MODEL_ID");
  if (!apiKey || !model) {
    throw new Error(
      `${VISION_PROVIDER_ID} is configured with VISION_PROVIDER_MODE=${mode}, but missing ${
        !apiKey && !model ? "API key and model" : !apiKey ? "API key" : "model"
      }. Set AI_VISION_API_KEY, AI_GENERAL_API_KEY, or ARK_API_KEY, and AI_VISION_MODEL_ID or AI_GENERAL_MODEL_ID.`,
    );
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

const frameImageUrl = (frame: Pick<SampledFrame, "contentType" | "key" | "localPath">) => {
  if (frame.localPath && existsSync(frame.localPath)) {
    return `data:${frame.contentType ?? "image/jpeg"};base64,${readFileSync(frame.localPath).toString("base64")}`;
  }
  return resolvePublicUrl(frame.key);
};

const frameUrlsFromFrames = (
  frames: Array<Pick<SampledFrame, "contentType" | "key" | "localPath">>,
) =>
  frames.map((frame) => frameImageUrl(frame)).filter((url): url is string => Boolean(url));

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
  const response = await fetchWithNetworkRetry(`${config.baseUrl}/responses`, {
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
    `Text extraction mode: ${audio.asrSummary || "OCR-first frame text extraction"}`,
    `Optional audio transcript: ${audio.transcript || "none"}`,
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
    `Text extraction mode: ${input.audio.asrSummary || "OCR-first frame text extraction"}`,
    `Optional audio transcript: ${input.audio.transcript || "none"}`,
    `Frame references: ${input.frameKeys.join(", ") || "none"}`,
  ].join("\n");

const mediaContentForAsset = (
  asset: AssetMetadata,
  frames: SampledFrame[],
  config: ArkVisionConfig,
) => {
  const mediaContent: Array<Record<string, unknown>> = [];
  const assetMediaUrl = getAssetMediaUrl(asset);
  const frameUrls = frameUrlsFromFrames(frames);

  if (asset.type === "image" && assetMediaUrl) {
    mediaContent.push({ type: "input_image", image_url: assetMediaUrl });
  } else if (
    asset.type === "video" &&
    asset.source !== "public_reference" &&
    config.videoInputMode === "video_url" &&
    assetMediaUrl
  ) {
    return [{ type: "input_video", video_url: assetMediaUrl }];
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

  const assetMediaUrl = getAssetMediaUrl(input.asset);
  if (
    input.asset.type === "video" &&
    input.asset.source !== "public_reference" &&
    config.videoInputMode === "video_url" &&
    assetMediaUrl
  ) {
    return [{ type: "input_video", video_url: assetMediaUrl }];
  }

  const frameMedia = frameUrlsFromFrames(
    input.frames?.length
      ? input.frames
      : input.frameKeys.map((key) => ({ key })),
  )
    .slice(0, 6)
    .map((url) => ({ type: "input_image", image_url: url }));
  return frameMedia;
};

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
  const productVisibility = normalizeProductVisibility(record.productVisibility, "uncertain");
  const summary =
    getString(record.summary) ??
    `${input.asset.name} slice ${input.index + 1} from ${input.startSecond}-${input.endSecond}s.`;
  const transcript = getString(record.transcript) ?? input.audio.transcript;
  const ocrText = getString(record.ocrText) ?? "";
  const action = getString(record.action) ?? summary;
  const suitableSceneRoles = enrichSceneRoles(
    normalizeSceneRoles(record.suitableSceneRoles, ["demo"]),
    input,
    [summary, transcript, ocrText, action, getString(record.composition)],
  );
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
        throw new Error(
          `${VISION_PROVIDER_ID} asset understanding failed: ${
            error instanceof Error ? error.message : "Unknown Ark vision provider error."
          }`,
        );
      }
    },
    understandSlice: async (input) => {
      try {
        const raw = await postArkVision(config, SLICE_SYSTEM_PROMPT, [
          { type: "input_text", text: sliceContextText(input) },
          ...mediaContentForSlice(input, config),
        ]);
        return buildStructuredSlice(input, raw);
      } catch (error) {
        throw new Error(
          `${VISION_PROVIDER_ID} slice understanding failed: ${
            error instanceof Error ? error.message : "Unknown Ark vision provider error."
          }`,
        );
      }
    },
  };
};
