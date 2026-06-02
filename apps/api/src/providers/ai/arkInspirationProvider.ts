import type {
  InspirationAssetType,
  InspirationGenerateRequest,
  InspirationGenerateResponse,
  InspirationMaterial,
  InspirationVideoTaskRequest,
} from "@shopclip/shared";

const SEED_MODEL_NAME = "doubao-seed2.0-pro";
const IMAGE_MODEL_NAME = "doubao-seedream";
const SEEDANCE_MODEL_NAME = "doubao-seedance1.5-pro";
const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const MIN_ARK_IMAGE_PIXELS = 3_686_400;
const TEXT_STORYBOARD_SYSTEM_PROMPT = [
  "你是拥有 10 年经验的电商爆款短视频脚本策划，目标是生成可直接拍摄、可直接进入分镜编辑器的高转化带货脚本；只能使用中文输出。",
  "必须只返回 Markdown 表格，不要输出标题、解释、编号列表或表格外文字。",
  "表格列必须严格为：| 时长 | 文案 | 画面提示词 | 素材槽位 |，列名、顺序和列数不得改变。",
  "每行代表一个分镜，整条视频总时长不得超过 15 秒；单个分镜必须遵守用户提示中的时长范围和目标总时长。",
  "黄金 3 秒法则：第一镜必须是强 Hook，优先使用痛点式、惊呼式、反差式、结果式或身份标签式开场；禁止用平铺直叙的商品介绍开场。",
  "文案必须口语化、短句化、有情绪和转化指向；每条文案只表达一个核心信息，不要堆叠多个卖点，不要拆成旁白和字幕。",
  "卖点可视化法则：每个功能卖点都必须对应可拍摄的视觉演示动作，禁止只靠文案描述卖点；例如防漏要有倒置/摇晃动作，大容量要有装水或对比动作，便携要有放包/手拎/随身动作。",
  "画面提示词必须具体到景别、运镜、主体、动作、场景和节奏，并可包含 BGM 风格、环境音、音效、醒目字幕位置等后期提示；但仍必须写在画面提示词这一列内。",
  "节奏控制法则：15 秒视频至少 4 个镜头；单镜头尽量 3-5 秒，镜头之间要有快切、推拉、特写、对比或定格变化，避免每镜头都是静态展示。",
  "素材匹配法则：产品主图优先用于开头 Hook 和结尾定格，细节图用于功能特写，场景图用于真实使用或行动号召；素材槽位必须填写用户已准备素材的文件名或 assetId。",
  "转化收尾法则：最后一镜必须给出具体行动引导和利益点；只有当用户明确提供价格、库存、赠品或优惠时才可写入，严禁编造价格、库存、赠品、销量或限时信息。",
  "合规和防幻觉：所有卖点、产品颜色、形状、Logo、包装、结构、配件、可见文字、价格和优惠都必须来自用户输入或用户素材；信息不足时用真实可拍摄的场景表达，不得自行编造。",
  "画面提示词必须包含“主要参考素材：<文件名或assetId>，产品外观必须与绑定素材一致”。",
].join("\n");

const ARK_MODEL_ALIASES = new Map<string, string>([
  ["doubao-seed-2.0-pro", "doubao-seed-2-0-pro-260215"],
  ["doubao-seed-2.0-lite", "doubao-seed-2-0-lite-260428"],
  ["doubao-seed-2.0-mini", "doubao-seed-2-0-mini-260428"],
  ["doubao-seed-2-0-pro-260215", "doubao-seed-2-0-pro-260215"],
  ["doubao-seed-2-0-lite-260428", "doubao-seed-2-0-lite-260428"],
  ["doubao-seed-2-0-mini-260428", "doubao-seed-2-0-mini-260428"],
  ["doubao-seedream-5.0", "doubao-seedream-5-0-260128"],
  ["doubao-seedream-5.0-lite", "doubao-seedream-5-0-260128"],
  ["doubao-seedream-4.5", "doubao-seedream-4-5-251128"],
  ["doubao-seedream-4.0", "doubao-seedream-4-0-250828"],
  ["doubao-seedream-5-0-260128", "doubao-seedream-5-0-260128"],
  ["doubao-seedream-4-5-251128", "doubao-seedream-4-5-251128"],
  ["doubao-seedream-4-0-250828", "doubao-seedream-4-0-250828"],
  ["doubao-seedance-1.5-pro", "doubao-seedance-1-5-pro-251215"],
  ["doubao-seedance-2.0", "doubao-seedance-1-5-pro-251215"],
  ["doubao-seedance-1.5-lite", "doubao-seedance-1-5-pro-251215"],
  ["doubao-seedance-1-5-pro-251215", "doubao-seedance-1-5-pro-251215"],
]);

type ProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
};

const firstEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
};

const getDefaultModelName = (assetType: InspirationAssetType) =>
  assetType === "video"
    ? SEEDANCE_MODEL_NAME
    : assetType === "image"
      ? (firstEnv("AI_IMAGE_MODEL_ID", "AI_IMAGE_ENDPOINT_ID", "AI_IMAGE_MODEL_NAME") ??
        IMAGE_MODEL_NAME)
      : SEED_MODEL_NAME;

const getUserConfigForAssetType = (request: InspirationGenerateRequest) => {
  if (request.assetType === "image") {
    return request.apiConfig?.image;
  }
  if (request.assetType === "video") {
    return request.apiConfig?.video;
  }
  return request.apiConfig?.general;
};

const hasUserConfigInput = (request: InspirationGenerateRequest) => {
  const userConfig = getUserConfigForAssetType(request);
  return Boolean(
    userConfig?.credentialSource === "official" ||
    userConfig?.apiKey?.trim() ||
    userConfig?.model?.trim() ||
    userConfig?.apiBaseUrl?.trim() ||
    userConfig?.provider?.trim(),
  );
};

const normalizeArkModel = (model: string) => {
  const trimmedModel = model.trim();
  return ARK_MODEL_ALIASES.get(trimmedModel.toLowerCase()) ?? trimmedModel;
};

const isArkProvider = (provider?: string) => {
  const providerId = provider?.trim().toLowerCase();
  return providerId === "volcengine-ark" || providerId === "ark" || providerId === "doubao";
};

const resolveArkModel = (model: string, assetType: InspirationAssetType, provider?: string) => {
  const normalizedModel = normalizeArkModel(model);
  return isArkProvider(provider) ? normalizedModel : model.trim();
};

const getRequestModelName = (request: InspirationGenerateRequest) => {
  const userConfig = getUserConfigForAssetType(request);
  if (userConfig?.credentialSource === "official") {
    return getEnvironmentModel(request.assetType) ?? getDefaultModelName(request.assetType);
  }

  const userModel = userConfig?.model?.trim();
  if (userModel) {
    return resolveArkModel(userModel, request.assetType, userConfig?.provider);
  }

  return hasUserConfigInput(request)
    ? getDefaultModelName(request.assetType)
    : (getEnvironmentModel(request.assetType) ?? getDefaultModelName(request.assetType));
};

const getEnvironmentModel = (assetType: InspirationAssetType) => {
  if (assetType === "video") {
    return firstEnv("AI_VIDEO_MODEL_ID", "AI_VIDEO_ENDPOINT_ID");
  }
  if (assetType === "image") {
    return firstEnv("AI_IMAGE_MODEL_ID", "AI_IMAGE_ENDPOINT_ID", "AI_IMAGE_MODEL_NAME");
  }
  return firstEnv("AI_GENERAL_MODEL_ID", "AI_TEXT_MODEL_ID", "AI_TEXT_ENDPOINT_ID");
};

const getEnvironmentApiKey = (assetType: InspirationAssetType) => {
  const sharedApiKey = firstEnv("ARK_API_KEY", "AI_API_KEY");
  if (assetType === "text") {
    return firstEnv("AI_GENERAL_API_KEY", "AI_TEXT_API_KEY") || sharedApiKey;
  }
  if (assetType === "image") {
    return firstEnv("AI_IMAGE_API_KEY") || sharedApiKey;
  }
  return firstEnv("AI_VIDEO_API_KEY") || sharedApiKey;
};

const createId = (prefix: string, seed: string) => {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `${prefix}_${Date.now().toString(36)}_${hash.toString(36)}`;
};

const _normalizePromptTitle = (prompt: string) =>
  prompt
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64)
    .replace(/[.。!！?？]$/, "");

const createMockMaterial = (request: InspirationGenerateRequest): InspirationMaterial => {
  const id = createId("material", `${request.assetType}:${request.prompt}`);

  if (request.assetType === "text") {
    return {
      id,
      type: "text",
      title: "Copy plan",
      content: [
        "Hook: Lead with a concrete customer moment.",
        "Angle: lead with a concrete buyer pain, then show the product resolving it in one move.",
        "CTA: keep the final line direct and shoppable.",
      ].join("\n"),
      status: "ready",
      mimeType: "text/plain",
    };
  }

  if (request.assetType === "image") {
    return {
      id,
      type: "image",
      title: "Visual concept",
      content: "Generated image material.",
      status: "ready",
      mimeType: "image/png",
    };
  }

  return {
    id,
    type: "video",
    title: "Motion concept",
    content: "Video generation task submitted.",
    status: "processing",
    progress: 0,
    mimeType: "video/mp4",
  };
};

const createFailedMaterial = (request: InspirationGenerateRequest): InspirationMaterial => {
  const id = createId("material", `failed:${request.assetType}:${request.prompt}`);

  return {
    id,
    type: request.assetType,
    title: "Generation failed",
    content:
      request.assetType === "image"
        ? "Image generation did not return a renderable image artifact."
        : request.assetType === "video"
          ? "Video generation did not return a renderable video artifact or task."
          : "Text generation did not return usable content.",
    status: "failed",
    progress: request.assetType === "video" ? 0 : undefined,
    mimeType:
      request.assetType === "image"
        ? "image/png"
        : request.assetType === "video"
          ? "video/mp4"
          : "text/plain",
  };
};

const createFallbackResponse = (
  request: InspirationGenerateRequest,
  reason: string,
  failed = false,
): InspirationGenerateResponse => ({
  id: createId("inspiration", `${request.assetType}:${request.prompt}`),
  prompt: request.prompt,
  assetType: request.assetType,
  model: getRequestModelName(request),
  provider: "mock-inspiration-provider",
  fallback: {
    used: true,
    reason,
  },
  materials: [failed ? createFailedMaterial(request) : createMockMaterial(request)],
});

const getRequiredConfig = (request: InspirationGenerateRequest): ProviderConfig | undefined => {
  const userConfig = getUserConfigForAssetType(request);
  if (userConfig?.credentialSource === "official") {
    const apiKey = getEnvironmentApiKey(request.assetType);
    const model = getEnvironmentModel(request.assetType) ?? getDefaultModelName(request.assetType);

    if (!apiKey) {
      return undefined;
    }

    return {
      apiKey,
      model,
      baseUrl: (process.env.ARK_API_BASE_URL || DEFAULT_ARK_BASE_URL).replace(/\/$/, ""),
      provider: "volcengine-ark",
    };
  }

  if (userConfig?.apiKey?.trim() && userConfig.model?.trim() && userConfig.apiBaseUrl?.trim()) {
    return {
      apiKey: userConfig.apiKey.trim(),
      model: resolveArkModel(userConfig.model, request.assetType, userConfig.provider),
      baseUrl: userConfig.apiBaseUrl.trim().replace(/\/$/, ""),
      provider: userConfig.provider?.trim() || "user-configured-provider",
    };
  }

  if (hasUserConfigInput(request)) {
    return undefined;
  }

  const apiKey = getEnvironmentApiKey(request.assetType);
  const model = getEnvironmentModel(request.assetType) ?? getDefaultModelName(request.assetType);

  if (!apiKey) {
    return undefined;
  }

  return {
    apiKey,
    model,
    baseUrl: (process.env.ARK_API_BASE_URL ?? DEFAULT_ARK_BASE_URL).replace(/\/$/, ""),
    provider: "volcengine-ark",
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const firstRecord = (value: unknown): Record<string, unknown> | undefined =>
  Array.isArray(value) && isRecord(value[0]) ? value[0] : undefined;

const parseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const postArkJson = async (
  path: string,
  apiKey: string,
  baseUrl: string,
  body: Record<string, unknown>,
): Promise<unknown> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const responseBody = await parseJson(response);

  if (!response.ok) {
    const error =
      isRecord(responseBody) && isRecord(responseBody.error) ? responseBody.error : undefined;
    const errorCode = getString(error?.code);
    if (errorCode === "InvalidEndpointOrModel.ModelIDAccessDisabled") {
      throw new Error(
        "Ark account cannot access this model by Model ID. Paste your custom Ark endpoint ID into Settings > Model for this generation type.",
      );
    }
    const responseSummary = isRecord(responseBody)
      ? ` ${JSON.stringify(responseBody).slice(0, 240)}`
      : "";
    throw new Error(`Ark request failed with HTTP ${response.status}.${responseSummary}`);
  }

  return responseBody;
};

const getArkJson = async (path: string, apiKey: string, baseUrl: string): Promise<unknown> => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
  });
  const responseBody = await parseJson(response);

  if (!response.ok) {
    const responseSummary = isRecord(responseBody)
      ? ` ${JSON.stringify(responseBody).slice(0, 240)}`
      : "";
    throw new Error(
      `Ark video task polling failed with HTTP ${response.status}.${responseSummary}`,
    );
  }

  return responseBody;
};

const getResponsesApiText = (body: unknown) => {
  if (!isRecord(body)) {
    return undefined;
  }

  const outputText = getString(body.output_text);
  if (outputText) {
    return outputText;
  }

  const output = Array.isArray(body.output) ? body.output : [];
  for (const item of output) {
    if (!isRecord(item)) {
      continue;
    }
    const content = Array.isArray(item.content) ? item.content : [];
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

const generateTextWithArk = async (
  request: InspirationGenerateRequest,
  config: ProviderConfig,
): Promise<InspirationMaterial> => {
  const body = isArkProvider(config.provider)
    ? await postArkJson("/responses", config.apiKey, config.baseUrl, {
        model: config.model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: TEXT_STORYBOARD_SYSTEM_PROMPT,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: request.prompt,
              },
            ],
          },
        ],
        temperature: 0.7,
      })
    : await postArkJson("/chat/completions", config.apiKey, config.baseUrl, {
        model: config.model,
        messages: [
          {
            role: "system",
            content: TEXT_STORYBOARD_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: request.prompt,
          },
        ],
        temperature: 0.7,
      });

  const firstChoice =
    !isArkProvider(config.provider) && isRecord(body) ? firstRecord(body.choices) : undefined;
  const message = isRecord(firstChoice?.message) ? firstChoice.message : undefined;
  const content =
    getResponsesApiText(body) ??
    getString(isRecord(message) ? message.content : undefined) ??
    getString(firstChoice?.text) ??
    "Generated ecommerce inspiration.";

  return {
    id: createId("material", content),
    type: "text",
    title: "Copy plan",
    content,
    status: "ready",
    mimeType: "text/plain",
  };
};

const hasMinimumArkImagePixels = (size: string) => {
  const match = /^(\d+)x(\d+)$/i.exec(size.trim());
  if (!match) {
    return false;
  }

  const width = Number.parseInt(match[1]!, 10);
  const height = Number.parseInt(match[2]!, 10);
  return width > 0 && height > 0 && width * height >= MIN_ARK_IMAGE_PIXELS;
};

const fallbackImageSizeForAspectRatio = (aspectRatio: string) => {
  if (aspectRatio === "16:9") {
    return "2560x1440";
  }
  if (aspectRatio === "9:16") {
    return "1440x2560";
  }
  if (aspectRatio === "4:3") {
    return "2304x1728";
  }
  if (aspectRatio === "3:4") {
    return "1728x2304";
  }
  return "2048x2048";
};

const imageSizeFromOptions = (request: InspirationGenerateRequest) => {
  const aspectRatio = request.options?.image?.aspectRatio ?? "auto";
  if (aspectRatio === "16:9") {
    return fallbackImageSizeForAspectRatio(aspectRatio);
  }
  if (aspectRatio === "9:16") {
    return fallbackImageSizeForAspectRatio(aspectRatio);
  }
  if (aspectRatio === "4:3") {
    return fallbackImageSizeForAspectRatio(aspectRatio);
  }
  if (aspectRatio === "3:4") {
    return fallbackImageSizeForAspectRatio(aspectRatio);
  }

  const configuredSize = process.env.ARK_IMAGE_SIZE?.trim();
  if (configuredSize && hasMinimumArkImagePixels(configuredSize)) {
    return configuredSize;
  }

  return fallbackImageSizeForAspectRatio(aspectRatio);
};

const generateImageWithArk = async (
  request: InspirationGenerateRequest,
  config: ProviderConfig,
): Promise<InspirationMaterial[]> => {
  const count = request.options?.image?.count ?? 1;
  const referenceImages = request.options?.image?.referenceImages?.filter(Boolean) ?? [];
  const requestBody: Record<string, unknown> = {
    model: config.model,
    prompt: request.prompt,
    size: imageSizeFromOptions(request),
    n: count,
    response_format: "url",
    sequential_image_generation: "disabled",
    watermark: false,
  };
  if (referenceImages.length > 0) {
    requestBody.image = referenceImages;
  }

  const body = await postArkJson("/images/generations", config.apiKey, config.baseUrl, requestBody);

  const data = isRecord(body) && Array.isArray(body.data) ? body.data : [];
  const imageUrls = data
    .map((item) => {
      const record = isRecord(item) ? item : undefined;
      const url = getString(record?.url);
      const b64Json = getString(record?.b64_json);
      return url ?? (b64Json ? `data:image/png;base64,${b64Json}` : undefined);
    })
    .filter((url): url is string => Boolean(url));

  if (imageUrls.length === 0) {
    throw new Error("Ark image generation did not return an image URL or base64 payload.");
  }

  return imageUrls.map((imageUrl, index) => ({
    id: createId("material", `${request.prompt}:image:${index}`),
    type: "image",
    title: imageUrls.length > 1 ? `Image ${index + 1}` : "Visual concept",
    content: "Generated image material.",
    status: "ready",
    url: imageUrl,
    mimeType: "image/png",
  }));
};

const generateVideoWithArk = async (
  request: InspirationGenerateRequest,
  config: ProviderConfig,
): Promise<InspirationMaterial> => {
  const videoPath = process.env.ARK_VIDEO_GENERATION_PATH ?? "/contents/generations/tasks";
  const videoRequestBody: Record<string, unknown> = {
    model: config.model,
    content: [
      {
        type: "text",
        text: request.prompt,
      },
    ],
  };
  const videoOptions = request.options?.video;
  if (videoOptions?.aspectRatio && videoOptions.aspectRatio !== "auto") {
    videoRequestBody.ratio = videoOptions.aspectRatio;
  }
  if (videoOptions?.quality && videoOptions.quality !== "standard") {
    videoRequestBody.quality = videoOptions.quality;
  }
  const body = await postArkJson(videoPath, config.apiKey, config.baseUrl, videoRequestBody);

  const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
  const taskId =
    (isRecord(body) ? (getString(body.id) ?? getString(body.task_id)) : undefined) ??
    getString(data?.id) ??
    getString(data?.task_id) ??
    createId("ark_video_task", request.prompt);

  return {
    id: createId("material", taskId),
    type: "video",
    title: "Motion concept",
    content: "Video generation task submitted.",
    status: "processing",
    taskId,
    progress: 0,
    mimeType: "video/mp4",
  };
};

const taskStatusFromBody = (body: unknown) => {
  const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
  const rawStatus =
    (isRecord(body) ? getString(body.status) : undefined) ??
    getString(data?.status) ??
    getString(data?.state);
  const normalizedStatus = rawStatus?.trim().toLowerCase();

  if (!normalizedStatus) {
    return "processing" as const;
  }
  if (["succeeded", "success", "completed", "ready", "done"].includes(normalizedStatus)) {
    return "ready" as const;
  }
  if (["failed", "error", "cancelled", "canceled"].includes(normalizedStatus)) {
    return "failed" as const;
  }
  return "processing" as const;
};

const collectVideoUrls = (value: unknown, urls: string[] = []): string[] => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectVideoUrls(item, urls));
    return urls;
  }
  if (!isRecord(value)) {
    return urls;
  }

  Object.entries(value).forEach(([key, nestedValue]) => {
    const lowerKey = key.toLowerCase();
    if (
      typeof nestedValue === "string" &&
      nestedValue.trim() &&
      (lowerKey.includes("url") || lowerKey.includes("video")) &&
      /\.(mp4|webm|mov)(\?|#|$)/i.test(nestedValue)
    ) {
      urls.push(nestedValue);
      return;
    }
    collectVideoUrls(nestedValue, urls);
  });

  return urls;
};

const clampProgress = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

const progressFromValue = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampProgress(value <= 1 ? value * 100 : value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace("%", "").trim());
    if (Number.isFinite(parsed)) {
      return clampProgress(parsed <= 1 ? parsed * 100 : parsed);
    }
  }
  return undefined;
};

const collectProgressValues = (value: unknown, progressValues: number[] = []): number[] => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectProgressValues(item, progressValues));
    return progressValues;
  }
  if (!isRecord(value)) {
    return progressValues;
  }

  Object.entries(value).forEach(([key, nestedValue]) => {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey === "progress" ||
      lowerKey === "percent" ||
      lowerKey === "percentage" ||
      lowerKey === "task_progress" ||
      lowerKey === "taskprogress"
    ) {
      const progress = progressFromValue(nestedValue);
      if (progress !== undefined) {
        progressValues.push(progress);
      }
      return;
    }
    collectProgressValues(nestedValue, progressValues);
  });

  return progressValues;
};

const progressFromTaskBody = (
  body: unknown,
  status: InspirationMaterial["status"],
  hasVideoUrl: boolean,
) => {
  if (hasVideoUrl || status === "ready") {
    return 100;
  }
  if (status === "failed") {
    return 0;
  }
  return collectProgressValues(body)[0] ?? 10;
};

export const loadInspirationVideoTask = async (
  request: InspirationVideoTaskRequest,
): Promise<InspirationMaterial> => {
  const providerMode = (process.env.AI_PROVIDER_MODE ?? "ark").toLowerCase();
  const generationLikeRequest: InspirationGenerateRequest = {
    prompt: request.prompt,
    assetType: "video",
    apiConfig: request.apiConfig,
  };
  const config = getRequiredConfig(generationLikeRequest);

  if (providerMode === "mock" && !hasUserConfigInput(generationLikeRequest)) {
    return {
      id: createId("material", request.taskId),
      type: "video",
      title: "Motion concept",
      content: "Video generation task submitted.",
      status: "processing",
      taskId: request.taskId,
      progress: 10,
      mimeType: "video/mp4",
    };
  }
  if (
    !config ||
    (!hasUserConfigInput(generationLikeRequest) &&
      !["ark", "doubao", "real"].includes(providerMode))
  ) {
    throw new Error(
      "Real video inspiration polling is not configured. Set AI_PROVIDER_MODE=ark plus provider credentials, or explicitly set AI_PROVIDER_MODE=mock for demo fixtures.",
    );
  }

  try {
    const videoPath = process.env.ARK_VIDEO_GENERATION_PATH ?? "/contents/generations/tasks";
    const body = await getArkJson(
      `${videoPath}/${encodeURIComponent(request.taskId)}`,
      config.apiKey,
      config.baseUrl,
    );
    const status = taskStatusFromBody(body);
    const videoUrl = collectVideoUrls(body)[0];
    const materialStatus = videoUrl ? "ready" : status;

    return {
      id: createId("material", request.taskId),
      type: "video",
      title: "Motion concept",
      content:
        status === "ready"
          ? "Video generation completed."
          : status === "failed"
            ? "Video generation failed."
            : `Video generation task submitted: ${request.taskId}`,
      status: materialStatus,
      url: videoUrl,
      taskId: request.taskId,
      progress: progressFromTaskBody(body, materialStatus, Boolean(videoUrl)),
      mimeType: "video/mp4",
    };
  } catch (error) {
    return {
      id: createId("material", request.taskId),
      type: "video",
      title: "Motion concept",
      content: error instanceof Error ? error.message : "Video task polling failed.",
      status: "failed",
      taskId: request.taskId,
      progress: 0,
      mimeType: "video/mp4",
    };
  }
};

export const generateInspiration = async (
  request: InspirationGenerateRequest,
): Promise<InspirationGenerateResponse> => {
  const providerMode = (process.env.AI_PROVIDER_MODE ?? "ark").toLowerCase();
  if (!hasUserConfigInput(request) && providerMode === "mock") {
    return createFallbackResponse(request, "AI_PROVIDER_MODE is mock.");
  }
  if (!hasUserConfigInput(request) && !["ark", "doubao", "real"].includes(providerMode)) {
    throw new Error(
      `Unsupported AI_PROVIDER_MODE=${providerMode}. Use ark/doubao/real for business runs, or explicitly set mock for demo fixtures.`,
    );
  }

  const config = getRequiredConfig(request);
  if (!config) {
    throw new Error(
      hasUserConfigInput(request)
        ? "User API settings are incomplete."
        : "Ark provider environment variables are incomplete.",
    );
  }

  try {
    const materials =
      request.assetType === "text"
        ? [await generateTextWithArk(request, config)]
        : request.assetType === "image"
          ? await generateImageWithArk(request, config)
          : [await generateVideoWithArk(request, config)];

    return {
      id: createId("inspiration", `${request.assetType}:${request.prompt}`),
      prompt: request.prompt,
      assetType: request.assetType,
      model: getRequestModelName(request),
      provider: config.provider,
      fallback: {
        used: false,
      },
      materials,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Ark provider error.";
    throw new Error(message);
  }
};
