import type {
  AssetMetadata,
  AssetSlice,
  InspirationGenerateRequest,
  ProjectBrief,
  SmartEditPlan,
  SmartEditRequest,
  StoryboardScene,
} from "@shopclip/shared";
import { SmartEditPlanSchema } from "@shopclip/shared";
import { randomUUID } from "node:crypto";

const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_GENERAL_MODEL = "doubao-seed-2-0-pro-260215";
const PROVIDER_ID = "smart-edit-planner";
const REAL_PROVIDER_MODES = ["ark", "doubao", "real", "volcengine-ark"];

interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
}

export interface SmartEditPlannerInput {
  apiConfig?: InspirationGenerateRequest["apiConfig"];
  assets: AssetMetadata[];
  assetSlices: AssetSlice[];
  project: ProjectBrief & { id: string };
  request: SmartEditRequest;
  scenes: StoryboardScene[];
}

export interface SmartEditPlannerResult {
  fallback: {
    provider: string;
    reason?: string;
    used: boolean;
  };
  plan: SmartEditPlan;
}

const firstEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
};

const providerMode = () => (process.env.AI_PROVIDER_MODE ?? "ark").trim().toLowerCase();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const normalizeSegmentDuration = (durationSeconds: number): number =>
  Math.max(0.1, Math.min(120, durationSeconds));

const textFromUnknown = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(textFromUnknown).join(" ");
  }
  if (isRecord(value)) {
    return Object.values(value).map(textFromUnknown).join(" ");
  }
  return "";
};

const normalizeSearchText = (value: string): string => value.toLowerCase().replace(/\s+/gu, " ");

const queryTokens = (value: string): string[] => {
  const normalized = normalizeSearchText(value);
  const latinTokens = normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const cjkTokens = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  return [...new Set([...latinTokens, ...cjkTokens])].slice(0, 40);
};

const sceneSearchText = (scene: StoryboardScene, project: ProjectBrief): string =>
  [
    scene.subtitle,
    scene.voiceover,
    scene.visualPrompt,
    project.productName,
    project.audience,
    ...project.sellingPoints,
    project.style,
    project.tone,
  ].join(" ");

const inferredSceneRole = (scene: StoryboardScene, sceneCount: number): string => {
  const text = normalizeSearchText(`${scene.subtitle} ${scene.voiceover} ${scene.visualPrompt}`);
  if (scene.order === 1 || /hook|opening|开场|吸引|第一秒|3秒/u.test(text)) {
    return "hook";
  }
  if (scene.order >= sceneCount || /cta|下单|购买|点击|商品卡|抢购|结尾/u.test(text)) {
    return "cta";
  }
  if (/trust|proof|证明|材质|防漏|测试|信任/u.test(text)) {
    return "trust";
  }
  return "demo";
};

const keywordScore = (query: string, candidateText: string): number => {
  const candidate = normalizeSearchText(candidateText);
  return queryTokens(query).reduce((score, token) => {
    if (!candidate.includes(token)) {
      return score;
    }
    return score + Math.min(4, Math.max(1, token.length / 2));
  }, 0);
};

const assetSearchCorpus = (asset: AssetMetadata): string =>
  [
    asset.name,
    asset.type,
    asset.mimeType,
    asset.embeddingText,
    ...asset.tags,
    textFromUnknown(asset.structuredMetadata),
    textFromUnknown(asset.metadata),
  ].join(" ");

const sliceSearchCorpus = (slice: AssetSlice): string =>
  [
    slice.label,
    slice.embeddingText,
    slice.searchText,
    ...slice.tags,
    textFromUnknown(slice.metadata),
  ].join(" ");

const assetScoreForScene = (
  asset: AssetMetadata,
  scene: StoryboardScene,
  project: ProjectBrief,
): number => {
  const query = sceneSearchText(scene, project);
  let score = keywordScore(query, assetSearchCorpus(asset));
  if (scene.assetId === asset.id) {
    score += 8;
  }
  if (asset.status === "ready") {
    score += 1;
  }
  if (asset.type === "image" && /close|hero|主图|特写|封面/u.test(scene.visualPrompt)) {
    score += 2;
  }
  if (asset.type === "video" && /demo|action|手|使用|演示|测试/u.test(normalizeSearchText(query))) {
    score += 2;
  }
  return score;
};

const sliceScoreForScene = (
  slice: AssetSlice,
  scene: StoryboardScene,
  project: ProjectBrief,
  sceneCount: number,
): number => {
  const query = sceneSearchText(scene, project);
  let score = keywordScore(query, sliceSearchCorpus(slice));
  const role = inferredSceneRole(scene, sceneCount);
  if (slice.metadata?.suitableSceneRoles.some((candidate) => candidate === role)) {
    score += 8;
  }
  if (slice.tags.includes(role)) {
    score += 4;
  }
  if (slice.metadata?.shotType && normalizeSearchText(query).includes(slice.metadata.shotType)) {
    score += 2;
  }
  if (slice.startSecond !== undefined && slice.endSecond !== undefined) {
    score += 1;
  }
  return score;
};

const bestAssetForScene = (
  scene: StoryboardScene,
  assets: AssetMetadata[],
  project: ProjectBrief,
): AssetMetadata | undefined =>
  [...assets]
    .filter((asset) => asset.status === "ready")
    .sort(
      (left, right) =>
        assetScoreForScene(right, scene, project) - assetScoreForScene(left, scene, project),
    )[0] ?? assets[0];

const bestSliceForScene = (
  scene: StoryboardScene,
  slices: AssetSlice[],
  project: ProjectBrief,
  sceneCount: number,
): AssetSlice | undefined =>
  [...slices].sort(
    (left, right) =>
      sliceScoreForScene(right, scene, project, sceneCount) -
      sliceScoreForScene(left, scene, project, sceneCount),
  )[0];

const getResponsesApiText = (body: unknown) => {
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
      if (isRecord(contentItem)) {
        const text = getString(contentItem.text);
        if (text) {
          return text;
        }
      }
    }
  }
  return undefined;
};

const firstChatCompletionText = (body: unknown) => {
  if (!isRecord(body) || !Array.isArray(body.choices)) {
    return undefined;
  }
  const firstChoice = body.choices.find(isRecord);
  const message = isRecord(firstChoice?.message) ? firstChoice.message : undefined;
  return getString(message?.content) ?? getString(firstChoice?.text);
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
    throw new Error("Smart edit model response did not contain valid JSON.");
  }
};

const isArkProvider = (provider?: string) => {
  const providerId = provider?.trim().toLowerCase();
  return providerId === "volcengine-ark" || providerId === "ark" || providerId === "doubao";
};

const usesArkCustomEndpoint = (model: string): boolean => model.trim().toLowerCase().startsWith("ep-");

const shouldUseResponsesApi = (config: ProviderConfig): boolean =>
  isArkProvider(config.provider) && !usesArkCustomEndpoint(config.model);

const hasUserGeneralConfigInput = (apiConfig?: InspirationGenerateRequest["apiConfig"]) => {
  const general = apiConfig?.general;
  return Boolean(
    general?.credentialSource === "official" ||
      general?.apiKey?.trim() ||
      general?.model?.trim() ||
      general?.apiBaseUrl?.trim() ||
      general?.provider?.trim(),
  );
};

const getRequiredConfig = (
  apiConfig?: InspirationGenerateRequest["apiConfig"],
): ProviderConfig | undefined => {
  const mode = providerMode();
  const hasUserConfig = hasUserGeneralConfigInput(apiConfig);
  if (mode === "mock" && !hasUserConfig) {
    return undefined;
  }
  if (!REAL_PROVIDER_MODES.includes(mode) && !hasUserConfig) {
    throw new Error(
      `Unsupported AI_PROVIDER_MODE=${mode}. Use ark/real for business runs, or explicitly set mock for tests.`,
    );
  }

  const userConfig = apiConfig?.general;
  if (userConfig?.credentialSource === "official") {
    const apiKey = firstEnv("AI_GENERAL_API_KEY", "AI_TEXT_API_KEY", "ARK_API_KEY", "AI_API_KEY");
    if (!apiKey) {
      return undefined;
    }
    return {
      apiKey,
      baseUrl: (process.env.ARK_API_BASE_URL ?? DEFAULT_ARK_BASE_URL).replace(/\/$/, ""),
      model:
        firstEnv("AI_GENERAL_MODEL_ID", "AI_TEXT_MODEL_ID", "AI_TEXT_ENDPOINT_ID") ??
        DEFAULT_GENERAL_MODEL,
      provider: "volcengine-ark",
    };
  }

  if (userConfig?.apiKey?.trim() && userConfig.model?.trim() && userConfig.apiBaseUrl?.trim()) {
    return {
      apiKey: userConfig.apiKey.trim(),
      baseUrl: userConfig.apiBaseUrl.trim().replace(/\/$/, ""),
      model: userConfig.model.trim(),
      provider: userConfig.provider?.trim() || "user-configured-provider",
    };
  }

  if (hasUserGeneralConfigInput(apiConfig)) {
    const apiKey = firstEnv("AI_GENERAL_API_KEY", "AI_TEXT_API_KEY", "ARK_API_KEY", "AI_API_KEY");
    if (!apiKey) {
      return undefined;
    }
    return {
      apiKey,
      baseUrl: (userConfig?.apiBaseUrl?.trim() || process.env.ARK_API_BASE_URL || DEFAULT_ARK_BASE_URL).replace(
        /\/$/,
        "",
      ),
      model:
        userConfig?.model?.trim() ||
        firstEnv("AI_GENERAL_MODEL_ID", "AI_TEXT_MODEL_ID", "AI_TEXT_ENDPOINT_ID") ||
        DEFAULT_GENERAL_MODEL,
      provider: userConfig?.provider?.trim() || "volcengine-ark",
    };
  }

  const apiKey = firstEnv("AI_GENERAL_API_KEY", "AI_TEXT_API_KEY", "ARK_API_KEY", "AI_API_KEY");
  if (!apiKey) {
    return undefined;
  }
  return {
    apiKey,
    baseUrl: (process.env.ARK_API_BASE_URL ?? DEFAULT_ARK_BASE_URL).replace(/\/$/, ""),
    model:
      firstEnv("AI_GENERAL_MODEL_ID", "AI_TEXT_MODEL_ID", "AI_TEXT_ENDPOINT_ID") ??
      DEFAULT_GENERAL_MODEL,
    provider: "volcengine-ark",
  };
};

const postJson = async (
  path: string,
  config: ProviderConfig,
  body: Record<string, unknown>,
): Promise<unknown> => {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const responseBody = await response.json().catch(() => undefined);
  if (!response.ok) {
    const responseSummary = isRecord(responseBody)
      ? ` ${JSON.stringify(responseBody).slice(0, 240)}`
      : "";
    throw new Error(`${PROVIDER_ID} failed with HTTP ${response.status}.${responseSummary}`);
  }
  return responseBody;
};

const sourceForScene = (
  scene: StoryboardScene,
  assets: AssetMetadata[],
  assetSlices: AssetSlice[],
  project: ProjectBrief,
  sceneCount: number,
): SmartEditPlan["segments"][number]["source"] => {
  const linkedAsset =
    (scene.assetId ? assets.find((asset) => asset.id === scene.assetId) : undefined) ??
    bestAssetForScene(scene, assets, project);
  if (!linkedAsset) {
    return {
      imageUrl:
        scene.imageUrl ||
        "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='720'%20height='1280'%3E%3Crect%20width='720'%20height='1280'%20fill='%23111111'/%3E%3C/svg%3E",
      kind: "fallback-still",
    };
  }
  const slices = assetSlices.filter((slice) => slice.assetId === linkedAsset.id);
  const bestSlice = bestSliceForScene(scene, slices, project, sceneCount);
  if (linkedAsset.type === "video" && bestSlice) {
    return {
      assetId: linkedAsset.id,
      endSecond: bestSlice.endSecond,
      kind: "video-slice",
      sliceId: bestSlice.id,
      startSecond: bestSlice.startSecond,
    };
  }
  return {
    assetId: linkedAsset.id,
    imageUrl: scene.imageUrl || linkedAsset.url,
    kind: "image-asset",
  };
};

const createLocalPlan = (
  input: SmartEditPlannerInput,
  reason: string,
): SmartEditPlannerResult => {
  const overrides = new Map(input.request.segments.map((segment) => [segment.sceneId, segment]));
  const segments = input.scenes
    .sort((left, right) => left.order - right.order)
    .map((scene, index) => {
      const override = overrides.get(scene.id);
      const source =
        override?.source ??
        sourceForScene(scene, input.assets, input.assetSlices, input.project, input.scenes.length);
      const linkedAsset = source.assetId
        ? input.assets.find((asset) => asset.id === source.assetId)
        : undefined;
      return {
        id: `edit_segment_${scene.id}`,
        assetTags: linkedAsset?.tags ?? [],
        durationSeconds: normalizeSegmentDuration(override?.durationSeconds ?? scene.durationSeconds),
        timelineStartSecond: override?.timelineStartSecond ?? 0,
        enabled: override?.enabled ?? true,
        order: index + 1,
        playbackRate: override?.playbackRate ?? 1,
        sourceAudioMuted: override?.sourceAudioMuted ?? false,
        sourceAudioStartOffsetSeconds: override?.sourceAudioStartOffsetSeconds ?? 0,
        sourceAudioDurationSeconds: override?.sourceAudioDurationSeconds,
        captionHidden: override?.captionHidden ?? false,
        captionStartOffsetSeconds: override?.captionStartOffsetSeconds ?? 0,
        captionDurationSeconds: override?.captionDurationSeconds,
        voiceoverStartOffsetSeconds: override?.voiceoverStartOffsetSeconds ?? 0,
        voiceoverDurationSeconds: override?.voiceoverDurationSeconds,
        rationale:
          linkedAsset || scene.imageUrl
            ? "Selected the closest structured asset or generated scene visual for this storyboard scene."
            : "No matching asset was available, so the segment keeps the storyboard still as a fallback.",
        sceneId: scene.id,
        source,
        subtitle: override?.subtitle ?? scene.subtitle,
        transition: override?.transition ?? (index === 0 ? "cut" : "fade"),
        voiceover: override?.voiceover ?? scene.voiceover,
      } satisfies SmartEditPlan["segments"][number];
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
    fallback: {
      provider: "local-smart-edit-planner",
      reason,
      used: true,
    },
    plan: SmartEditPlanSchema.parse({
      id: randomUUID(),
      audio: {
        bgmTrack: input.request.mediaSettings.bgmTrack,
        targetLanguage: input.request.targetLanguage,
        voice: input.request.mediaSettings.ttsVoice,
      },
      createdAt: new Date().toISOString(),
      projectId: input.project.id,
      segments,
      strategy:
        "Match each storyboard scene to the strongest structured asset slice, add compact fades, burn subtitles, and keep the total edit short.",
      targetDurationSeconds,
    }),
  };
};

const SYSTEM_PROMPT = [
  "You are a senior ecommerce video editor and growth creative director.",
  "Create a real ffmpeg-ready edit plan for ecommerce product videos up to 600 seconds after timeline editing.",
  "Use only the provided merchant-owned assets, generated scene clips, or structured slices.",
  "If a targetLanguage is provided, rewrite both subtitle and voiceover in that target language for dubbing.",
  "Keep translated subtitle and voiceover concise, natural, and synchronized with each segment duration.",
  "Return only JSON. Do not wrap JSON in markdown.",
  "Every segment must include: sceneId, order, enabled, durationSeconds, timelineStartSecond, playbackRate, sourceAudioMuted, captionHidden, captionStartOffsetSeconds, voiceoverStartOffsetSeconds, transition, subtitle, voiceover, source, rationale.",
  "source.kind must be one of video-slice, image-asset, generated-scene-clip, fallback-still.",
].join("\n");

const buildPrompt = (input: SmartEditPlannerInput): string =>
  [
    `Project: ${input.project.title}`,
    `Product: ${input.project.productName}`,
    `Audience: ${input.project.audience}`,
    `Selling points: ${input.project.sellingPoints.join(", ")}`,
    `Style: ${input.project.style}`,
    `Locale: ${input.request.locale}`,
    input.request.targetLanguage ? `Target language: ${input.request.targetLanguage}` : undefined,
    input.request.targetLanguage
      ? `Dubbing requirement: output every segment.subtitle and segment.voiceover in ${input.request.targetLanguage}; do not leave them in the source storyboard language unless the target language is the same.`
      : undefined,
    input.request.instructions ? `User edit instructions: ${input.request.instructions}` : undefined,
    "",
    "Storyboard scenes:",
    JSON.stringify(input.scenes, null, 2),
    "",
    "Structured assets:",
    JSON.stringify(
      input.assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        url: asset.url,
        tags: asset.tags,
        structuredMetadata: asset.structuredMetadata ?? asset.metadata,
      })),
      null,
      2,
    ),
    "",
    "Structured slices:",
    JSON.stringify(input.assetSlices, null, 2),
    "",
    "Return JSON matching this shape: { id, projectId, strategy, targetDurationSeconds, audio: { bgmTrack, targetLanguage, voice }, createdAt, segments: [{ id, sceneId, order, enabled, durationSeconds, timelineStartSecond, playbackRate, sourceAudioMuted, captionHidden, captionStartOffsetSeconds, voiceoverStartOffsetSeconds, transition, subtitle, voiceover, source: { assetId, sliceId, sceneClipUrl, sceneClipVideoOnlyUrl, sceneClipAudioUrl, imageUrl, startSecond, endSecond, kind }, transform: { scale, rotateDegrees, offsetXPercent, offsetYPercent, opacity }, effects: { blur, sharpen, fadeInSeconds, fadeOutSeconds }, visualEffects: [{ id, type, enabled, params: { amount, radius }, keyframes: [{ id, timeSecond, easing, param: \"amount\", value }] }], visualMask: { id, type, inverted, xPercent, yPercent, widthPercent, heightPercent }, visualKeyframes: [{ id, timeSecond, easing, transform: { scale, rotateDegrees, offsetXPercent, offsetYPercent, opacity }, effects: { blur, sharpen, fadeInSeconds, fadeOutSeconds } }], assetTags, rationale }] }",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

type SmartEditTransition = SmartEditPlan["segments"][number]["transition"];
type SmartEditBgmTrack = SmartEditPlan["audio"]["bgmTrack"];
type SmartEditVoice = SmartEditPlan["audio"]["voice"];

const SMART_EDIT_TRANSITIONS = new Set<SmartEditTransition>([
  "cut",
  "fade",
  "crossfade",
  "wipe",
]);
const SMART_EDIT_BGM_TRACKS = new Set<SmartEditBgmTrack>([
  "none",
  "creator-pop",
  "soft-lift",
  "tech-pulse",
]);
const SMART_EDIT_VOICES = new Set<SmartEditVoice>([
  "clear-host",
  "warm-creator",
  "energetic-seller",
]);

const enumStringOr = <T extends string>(
  value: unknown,
  allowedValues: Set<T>,
  fallback: T,
): T => {
  const normalized = getString(value)?.toLowerCase();
  return normalized && allowedValues.has(normalized as T) ? (normalized as T) : fallback;
};

const cleanOptionalString = (value: unknown): string | undefined => getString(value);

const normalizeModelSource = (
  rawSource: unknown,
  localSource: SmartEditPlan["segments"][number]["source"],
): SmartEditPlan["segments"][number]["source"] => {
  if (!isRecord(rawSource)) {
    return localSource;
  }

  const kind = enumStringOr(
    rawSource.kind,
    new Set(["video-slice", "image-asset", "generated-scene-clip", "fallback-still"]),
    localSource.kind,
  );
  const source = {
    ...localSource,
    kind,
    assetId: cleanOptionalString(rawSource.assetId) ?? localSource.assetId,
    sliceId: cleanOptionalString(rawSource.sliceId) ?? localSource.sliceId,
    sceneClipUrl: cleanOptionalString(rawSource.sceneClipUrl) ?? localSource.sceneClipUrl,
    sceneClipVideoOnlyUrl:
      cleanOptionalString(rawSource.sceneClipVideoOnlyUrl) ?? localSource.sceneClipVideoOnlyUrl,
    sceneClipAudioUrl:
      cleanOptionalString(rawSource.sceneClipAudioUrl) ?? localSource.sceneClipAudioUrl,
    imageUrl: cleanOptionalString(rawSource.imageUrl) ?? localSource.imageUrl,
    startSecond:
      typeof rawSource.startSecond === "number" ? rawSource.startSecond : localSource.startSecond,
    endSecond: typeof rawSource.endSecond === "number" ? rawSource.endSecond : localSource.endSecond,
  };

  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  ) as SmartEditPlan["segments"][number]["source"];
};

const normalizeModelTransform = (
  rawTransform: unknown,
  localTransform: SmartEditPlan["segments"][number]["transform"],
): SmartEditPlan["segments"][number]["transform"] | undefined => {
  if (!isRecord(rawTransform)) {
    return localTransform;
  }
  return {
    offsetXPercent:
      typeof rawTransform.offsetXPercent === "number"
        ? Math.max(-100, Math.min(100, rawTransform.offsetXPercent))
        : localTransform?.offsetXPercent ?? 0,
    offsetYPercent:
      typeof rawTransform.offsetYPercent === "number"
        ? Math.max(-100, Math.min(100, rawTransform.offsetYPercent))
        : localTransform?.offsetYPercent ?? 0,
    opacity:
      typeof rawTransform.opacity === "number"
        ? Math.max(0, Math.min(1, rawTransform.opacity))
        : localTransform?.opacity ?? 1,
    rotateDegrees:
      typeof rawTransform.rotateDegrees === "number"
        ? Math.max(-180, Math.min(180, rawTransform.rotateDegrees))
        : localTransform?.rotateDegrees ?? 0,
    scale:
      typeof rawTransform.scale === "number"
        ? Math.max(0.1, Math.min(4, rawTransform.scale))
        : localTransform?.scale ?? 1,
  };
};

const normalizeModelEffects = (
  rawEffects: unknown,
  localEffects: SmartEditPlan["segments"][number]["effects"],
): SmartEditPlan["segments"][number]["effects"] | undefined => {
  if (!isRecord(rawEffects)) {
    return localEffects;
  }
  return {
    blur:
      typeof rawEffects.blur === "number" ? Math.max(0, Math.min(20, rawEffects.blur)) : localEffects?.blur ?? 0,
    fadeInSeconds:
      typeof rawEffects.fadeInSeconds === "number"
        ? Math.max(0, Math.min(5, rawEffects.fadeInSeconds))
        : localEffects?.fadeInSeconds ?? 0,
    fadeOutSeconds:
      typeof rawEffects.fadeOutSeconds === "number"
        ? Math.max(0, Math.min(5, rawEffects.fadeOutSeconds))
        : localEffects?.fadeOutSeconds ?? 0,
    sharpen:
      typeof rawEffects.sharpen === "number"
        ? Math.max(0, Math.min(2, rawEffects.sharpen))
        : localEffects?.sharpen ?? 0,
  };
};

const SMART_EDIT_VISUAL_EFFECT_TYPES = new Set<
  NonNullable<SmartEditPlan["segments"][number]["visualEffects"]>[number]["type"]
>(["blur", "sharpen", "brightness", "contrast", "saturation", "vignette"]);

type SmartEditVisualEffectType = NonNullable<
  SmartEditPlan["segments"][number]["visualEffects"]
>[number]["type"];

const clampVisualEffectAmount = (type: SmartEditVisualEffectType, amount: number): number => {
  if (type === "blur") {
    return Math.max(0, Math.min(20, amount));
  }
  if (type === "sharpen") {
    return Math.max(0, Math.min(2, amount));
  }
  if (type === "brightness") {
    return Math.max(-1, Math.min(1, amount));
  }
  if (type === "contrast" || type === "saturation") {
    return Math.max(0, Math.min(3, amount));
  }
  return Math.max(0, Math.min(1, amount));
};

const normalizeModelVisualEffectKeyframes = (
  rawKeyframes: unknown,
  effectType: SmartEditVisualEffectType,
  segmentDurationSeconds: number,
) => {
  if (!Array.isArray(rawKeyframes)) {
    return undefined;
  }
  const keyframes = rawKeyframes
    .filter(isRecord)
    .filter((keyframe) => getString(keyframe.param)?.toLowerCase() === "amount")
    .slice(0, 40)
    .map((keyframe, index) => ({
      easing: enumStringOr(keyframe.easing, new Set<"linear" | "hold">(["linear", "hold"]), "linear"),
      id: getString(keyframe.id) ?? `model_effect_amount_keyframe_${index + 1}`,
      param: "amount" as const,
      timeSecond:
        typeof keyframe.timeSecond === "number"
          ? Math.max(0, Math.min(segmentDurationSeconds, keyframe.timeSecond))
          : 0,
      value:
        typeof keyframe.value === "number"
          ? clampVisualEffectAmount(effectType, keyframe.value)
          : clampVisualEffectAmount(effectType, 1),
    }))
    .sort((left, right) => left.timeSecond - right.timeSecond);
  return keyframes.length > 0 ? keyframes : undefined;
};

const normalizeModelVisualEffects = (
  rawEffects: unknown,
  localEffects: SmartEditPlan["segments"][number]["visualEffects"],
  segmentDurationSeconds: number,
): SmartEditPlan["segments"][number]["visualEffects"] | undefined => {
  if (!Array.isArray(rawEffects)) {
    return localEffects;
  }
  return rawEffects
    .filter(isRecord)
    .slice(0, 20)
    .map((effect, index) => {
      const type = enumStringOr(effect.type, SMART_EDIT_VISUAL_EFFECT_TYPES, "blur");
      return {
        enabled: typeof effect.enabled === "boolean" ? effect.enabled : true,
        id: getString(effect.id) ?? `model_visual_effect_${index + 1}`,
        keyframes: normalizeModelVisualEffectKeyframes(
          effect.keyframes,
          type,
          segmentDurationSeconds,
        ),
        params: {
          amount:
            isRecord(effect.params) && typeof effect.params.amount === "number"
              ? clampVisualEffectAmount(type, effect.params.amount)
              : 1,
          radius:
            isRecord(effect.params) && typeof effect.params.radius === "number"
              ? Math.max(0, Math.min(20, effect.params.radius))
              : 4,
        },
        type,
      };
    });
};

const normalizeModelVisualMask = (
  rawMask: unknown,
  localMask: SmartEditPlan["segments"][number]["visualMask"],
): SmartEditPlan["segments"][number]["visualMask"] | undefined => {
  if (!isRecord(rawMask)) {
    return localMask;
  }
  return {
    heightPercent:
      typeof rawMask.heightPercent === "number"
        ? Math.max(1, Math.min(100, rawMask.heightPercent))
        : localMask?.heightPercent ?? 80,
    id: getString(rawMask.id) ?? localMask?.id ?? "model_visual_mask",
    inverted: typeof rawMask.inverted === "boolean" ? rawMask.inverted : localMask?.inverted ?? false,
    type: enumStringOr(rawMask.type, new Set<"rectangle" | "ellipse">(["rectangle", "ellipse"]), localMask?.type ?? "rectangle"),
    widthPercent:
      typeof rawMask.widthPercent === "number"
        ? Math.max(1, Math.min(100, rawMask.widthPercent))
        : localMask?.widthPercent ?? 80,
    xPercent:
      typeof rawMask.xPercent === "number"
        ? Math.max(0, Math.min(100, rawMask.xPercent))
        : localMask?.xPercent ?? 50,
    yPercent:
      typeof rawMask.yPercent === "number"
        ? Math.max(0, Math.min(100, rawMask.yPercent))
        : localMask?.yPercent ?? 50,
  };
};

const normalizeModelVisualKeyframes = (
  rawKeyframes: unknown,
  localSegment: SmartEditPlan["segments"][number],
) => {
  if (!Array.isArray(rawKeyframes)) {
    return localSegment.visualKeyframes ?? [];
  }
  return rawKeyframes
    .filter(isRecord)
    .slice(0, 40)
    .map((keyframe, index) => ({
      easing: enumStringOr(keyframe.easing, new Set<"linear" | "hold">(["linear", "hold"]), "linear"),
      effects: normalizeModelEffects(keyframe.effects, localSegment.effects),
      id: getString(keyframe.id) ?? `${localSegment.id}_visual_keyframe_${index + 1}`,
      timeSecond:
        typeof keyframe.timeSecond === "number"
          ? Math.max(0, Math.min(localSegment.durationSeconds, keyframe.timeSecond))
          : 0,
      transform:
        normalizeModelTransform(keyframe.transform, localSegment.transform) ??
        {
          offsetXPercent: 0,
          offsetYPercent: 0,
          opacity: 1,
          rotateDegrees: 0,
          scale: 1,
        },
    }))
    .sort((left, right) => left.timeSecond - right.timeSecond);
};

const normalizeModelSegment = (
  rawSegment: unknown,
  localSegment: SmartEditPlan["segments"][number],
): SmartEditPlan["segments"][number] => {
  if (!isRecord(rawSegment)) {
    return localSegment;
  }

  return {
    ...localSegment,
    ...rawSegment,
    id: getString(rawSegment.id) ?? localSegment.id,
    sceneId: localSegment.sceneId,
    order: typeof rawSegment.order === "number" ? rawSegment.order : localSegment.order,
    enabled: typeof rawSegment.enabled === "boolean" ? rawSegment.enabled : localSegment.enabled,
    durationSeconds:
      typeof rawSegment.durationSeconds === "number"
        ? normalizeSegmentDuration(rawSegment.durationSeconds)
        : localSegment.durationSeconds,
    timelineStartSecond:
      typeof rawSegment.timelineStartSecond === "number"
        ? Math.max(0, Math.min(600, rawSegment.timelineStartSecond))
        : localSegment.timelineStartSecond,
    playbackRate:
      typeof rawSegment.playbackRate === "number"
        ? Math.max(0.25, Math.min(4, rawSegment.playbackRate))
        : localSegment.playbackRate,
    sourceAudioMuted:
      typeof rawSegment.sourceAudioMuted === "boolean"
        ? rawSegment.sourceAudioMuted
        : localSegment.sourceAudioMuted,
    sourceAudioStartOffsetSeconds:
      typeof rawSegment.sourceAudioStartOffsetSeconds === "number"
        ? Math.max(0, Math.min(localSegment.durationSeconds, rawSegment.sourceAudioStartOffsetSeconds))
        : localSegment.sourceAudioStartOffsetSeconds,
    sourceAudioDurationSeconds:
      typeof rawSegment.sourceAudioDurationSeconds === "number"
        ? Math.max(0.1, Math.min(localSegment.durationSeconds, rawSegment.sourceAudioDurationSeconds))
        : localSegment.sourceAudioDurationSeconds,
    captionHidden:
      typeof rawSegment.captionHidden === "boolean"
        ? rawSegment.captionHidden
        : localSegment.captionHidden,
    captionStartOffsetSeconds:
      typeof rawSegment.captionStartOffsetSeconds === "number"
        ? Math.max(0, Math.min(localSegment.durationSeconds, rawSegment.captionStartOffsetSeconds))
        : localSegment.captionStartOffsetSeconds,
    captionDurationSeconds:
      typeof rawSegment.captionDurationSeconds === "number"
        ? Math.max(0.1, Math.min(localSegment.durationSeconds, rawSegment.captionDurationSeconds))
        : localSegment.captionDurationSeconds,
    voiceoverStartOffsetSeconds:
      typeof rawSegment.voiceoverStartOffsetSeconds === "number"
        ? Math.max(0, Math.min(localSegment.durationSeconds, rawSegment.voiceoverStartOffsetSeconds))
        : localSegment.voiceoverStartOffsetSeconds,
    voiceoverDurationSeconds:
      typeof rawSegment.voiceoverDurationSeconds === "number"
        ? Math.max(0.1, Math.min(localSegment.durationSeconds, rawSegment.voiceoverDurationSeconds))
        : localSegment.voiceoverDurationSeconds,
    transition: enumStringOr(rawSegment.transition, SMART_EDIT_TRANSITIONS, localSegment.transition),
    subtitle: getString(rawSegment.subtitle) ?? localSegment.subtitle,
    voiceover: getString(rawSegment.voiceover) ?? localSegment.voiceover,
    source: normalizeModelSource(rawSegment.source, localSegment.source),
    transform: normalizeModelTransform(rawSegment.transform, localSegment.transform),
    effects: normalizeModelEffects(rawSegment.effects, localSegment.effects),
    visualEffects: normalizeModelVisualEffects(
      rawSegment.visualEffects,
      localSegment.visualEffects,
      localSegment.durationSeconds,
    ),
    visualMask: normalizeModelVisualMask(rawSegment.visualMask, localSegment.visualMask),
    visualKeyframes: normalizeModelVisualKeyframes(rawSegment.visualKeyframes, localSegment),
    assetTags: Array.isArray(rawSegment.assetTags)
      ? rawSegment.assetTags.map(getString).filter((tag): tag is string => Boolean(tag))
      : localSegment.assetTags,
    rationale: getString(rawSegment.rationale) ?? localSegment.rationale,
  };
};

const normalizeModelPlan = (rawPlan: unknown, input: SmartEditPlannerInput): SmartEditPlan => {
  const raw = isRecord(rawPlan) ? rawPlan : {};
  const local = createLocalPlan(input, "Local normalization baseline.").plan;
  const rawSegments = Array.isArray(raw.segments) ? raw.segments.filter(isRecord) : [];
  const rawSegmentsByScene = new Map(
    rawSegments
      .map((segment) => [getString(segment.sceneId), segment] as const)
      .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[0])),
  );
  return SmartEditPlanSchema.parse({
    ...local,
    ...raw,
    id: getString(raw.id) ?? randomUUID(),
    projectId: input.project.id,
    createdAt: getString(raw.createdAt) ?? new Date().toISOString(),
    audio: {
      ...local.audio,
      ...(isRecord(raw.audio) ? raw.audio : {}),
      bgmTrack: enumStringOr(
        isRecord(raw.audio) ? raw.audio.bgmTrack : undefined,
        SMART_EDIT_BGM_TRACKS,
        local.audio.bgmTrack,
      ),
      voice: enumStringOr(
        isRecord(raw.audio) ? raw.audio.voice : undefined,
        SMART_EDIT_VOICES,
        local.audio.voice,
      ),
      targetLanguage:
        (isRecord(raw.audio) ? getString(raw.audio.targetLanguage) : undefined) ??
        local.audio.targetLanguage,
    },
    segments: local.segments.map((localSegment) =>
      normalizeModelSegment(rawSegmentsByScene.get(localSegment.sceneId), localSegment),
    ),
  });
};

export const createSmartEditPlan = async (
  input: SmartEditPlannerInput,
): Promise<SmartEditPlannerResult> => {
  if (input.scenes.length === 0) {
    throw new Error("Storyboard scenes are required before smart editing.");
  }

  const config = getRequiredConfig(input.apiConfig);
  if (!config) {
    return createLocalPlan(
      input,
      "General model configuration is missing; used deterministic local planning.",
    );
  }

  try {
    const prompt = buildPrompt(input);
    const body = shouldUseResponsesApi(config)
      ? await postJson("/responses", config, {
          model: config.model,
          input: [
            { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
            { role: "user", content: [{ type: "input_text", text: prompt }] },
          ],
          temperature: 0.25,
        })
      : await postJson("/chat/completions", config, {
          model: config.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          temperature: 0.25,
        });
    const text = getResponsesApiText(body) ?? firstChatCompletionText(body);
    if (!text) {
      throw new Error("Smart edit model did not return text.");
    }
    return {
      fallback: {
        provider: config.provider,
        used: false,
      },
      plan: normalizeModelPlan(extractJsonObject(text), input),
    };
  } catch (error) {
    return createLocalPlan(
      input,
      error instanceof Error ? error.message : "Smart edit model planning failed.",
    );
  }
};
