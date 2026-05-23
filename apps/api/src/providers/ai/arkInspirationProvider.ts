import type {
  InspirationAssetType,
  InspirationGenerateRequest,
  InspirationGenerateResponse,
  InspirationMaterial,
} from "@shopclip/shared";

const SEED_MODEL_NAME = "doubao-seed2.0-pro";
const IMAGE_MODEL_NAME = "doubao-seedream";
const SEEDANCE_MODEL_NAME = "doubao-seedance1.5-pro";
const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

type ProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
};

const getDefaultModelName = (assetType: InspirationAssetType) =>
  assetType === "video"
    ? SEEDANCE_MODEL_NAME
    : assetType === "image"
      ? (process.env.AI_IMAGE_MODEL_NAME?.trim() ?? IMAGE_MODEL_NAME)
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
    userConfig?.apiKey?.trim() ||
      userConfig?.model?.trim() ||
      userConfig?.apiBaseUrl?.trim() ||
      userConfig?.provider?.trim(),
  );
};

const getRequestModelName = (request: InspirationGenerateRequest) =>
  getUserConfigForAssetType(request)?.model?.trim() || getDefaultModelName(request.assetType);

const createId = (prefix: string, seed: string) => {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `${prefix}_${Date.now().toString(36)}_${hash.toString(36)}`;
};

const normalizePromptTitle = (prompt: string) =>
  prompt
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64)
    .replace(/[.。!！?？]$/, "");

const createMockMaterial = (request: InspirationGenerateRequest): InspirationMaterial => {
  const title = normalizePromptTitle(request.prompt);
  const id = createId("material", `${request.assetType}:${request.prompt}`);

  if (request.assetType === "text") {
    return {
      id,
      type: "text",
      title: `${title} copy plan`,
      content: [
        `Hook: ${title}`,
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
      title: `${title} visual concept`,
      content: `A polished ecommerce hero image prompt for: ${request.prompt}`,
      status: "ready",
      mimeType: "image/png",
    };
  }

  return {
    id,
    type: "video",
    title: `${title} motion concept`,
    content: `A vertical 6-second product reveal video brief for: ${request.prompt}`,
    status: "processing",
    mimeType: "video/mp4",
  };
};

const createFailedMaterial = (request: InspirationGenerateRequest): InspirationMaterial => {
  const title = normalizePromptTitle(request.prompt);
  const id = createId("material", `failed:${request.assetType}:${request.prompt}`);

  return {
    id,
    type: request.assetType,
    title: `${title} generation failed`,
    content:
      request.assetType === "image"
        ? "Image generation did not return a renderable image artifact."
        : request.assetType === "video"
          ? "Video generation did not return a renderable video artifact or task."
          : "Text generation did not return usable content.",
    status: "failed",
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
  if (userConfig?.apiKey?.trim() && userConfig.model?.trim() && userConfig.apiBaseUrl?.trim()) {
    return {
      apiKey: userConfig.apiKey.trim(),
      model: userConfig.model.trim(),
      baseUrl: userConfig.apiBaseUrl.trim().replace(/\/$/, ""),
      provider: userConfig.provider?.trim() || "user-configured-provider",
    };
  }

  if (hasUserConfigInput(request)) {
    return undefined;
  }

  const apiKey =
    request.assetType === "image"
      ? (process.env.AI_IMAGE_API_KEY?.trim() ?? process.env.AI_API_KEY?.trim())
      : process.env.AI_API_KEY?.trim();
  const model = (() => {
    if (request.assetType === "video") {
      return process.env.AI_VIDEO_ENDPOINT_ID?.trim();
    }
    if (request.assetType === "image") {
      return process.env.AI_IMAGE_ENDPOINT_ID?.trim();
    }
    return process.env.AI_TEXT_ENDPOINT_ID?.trim();
  })();

  if (!apiKey || !model) {
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
    throw new Error(`Ark request failed with HTTP ${response.status}.`);
  }

  return responseBody;
};

const generateTextWithArk = async (
  request: InspirationGenerateRequest,
  config: ProviderConfig,
): Promise<InspirationMaterial> => {
  const body = await postArkJson("/chat/completions", config.apiKey, config.baseUrl, {
    model: config.model,
    messages: [
      {
        role: "system",
        content:
          "You create concise ecommerce short-video inspiration. Return practical copy, visual direction, and CTA.",
      },
      {
        role: "user",
        content: request.prompt,
      },
    ],
    temperature: 0.7,
  });

  const firstChoice = isRecord(body) ? firstRecord(body.choices) : undefined;
  const message = isRecord(firstChoice?.message) ? firstChoice.message : undefined;
  const content =
    getString(isRecord(message) ? message.content : undefined) ??
    getString(firstChoice?.text) ??
    "Generated ecommerce inspiration.";

  return {
    id: createId("material", content),
    type: "text",
    title: `${normalizePromptTitle(request.prompt)} copy plan`,
    content,
    status: "ready",
    mimeType: "text/plain",
  };
};

const generateImageWithArk = async (
  request: InspirationGenerateRequest,
  config: ProviderConfig,
): Promise<InspirationMaterial> => {
  const body = await postArkJson("/images/generations", config.apiKey, config.baseUrl, {
    model: config.model,
    prompt: request.prompt,
    size: process.env.ARK_IMAGE_SIZE ?? "1024x1024",
    response_format: "url",
  });

  const data = isRecord(body) ? firstRecord(body.data) : undefined;
  const url = getString(data?.url);
  const b64Json = getString(data?.b64_json);
  const imageUrl = url ?? (b64Json ? `data:image/png;base64,${b64Json}` : undefined);

  if (!imageUrl) {
    throw new Error("Ark image generation did not return an image URL or base64 payload.");
  }

  return {
    id: createId("material", `${request.prompt}:image`),
    type: "image",
    title: `${normalizePromptTitle(request.prompt)} visual concept`,
    content: `Generated image material for: ${request.prompt}`,
    status: "ready",
    url: imageUrl,
    mimeType: "image/png",
  };
};

const generateVideoWithArk = async (
  request: InspirationGenerateRequest,
  config: ProviderConfig,
): Promise<InspirationMaterial> => {
  const videoPath = process.env.ARK_VIDEO_GENERATION_PATH ?? "/contents/generations/tasks";
  const body = await postArkJson(videoPath, config.apiKey, config.baseUrl, {
    model: config.model,
    content: [
      {
        type: "text",
        text: request.prompt,
      },
    ],
  });

  const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
  const taskId =
    (isRecord(body) ? (getString(body.id) ?? getString(body.task_id)) : undefined) ??
    getString(data?.id) ??
    getString(data?.task_id) ??
    createId("ark_video_task", request.prompt);

  return {
    id: createId("material", taskId),
    type: "video",
    title: `${normalizePromptTitle(request.prompt)} motion concept`,
    content: `Video generation task submitted: ${taskId}`,
    status: "processing",
    mimeType: "video/mp4",
  };
};

export const generateInspiration = async (
  request: InspirationGenerateRequest,
): Promise<InspirationGenerateResponse> => {
  const providerMode = (process.env.AI_PROVIDER_MODE ?? "mock").toLowerCase();
  if (!hasUserConfigInput(request) && !["ark", "doubao", "real"].includes(providerMode)) {
    return createFallbackResponse(request, "AI_PROVIDER_MODE is mock.");
  }

  const config = getRequiredConfig(request);
  if (!config) {
    return createFallbackResponse(
      request,
      hasUserConfigInput(request)
        ? "User API settings are incomplete."
        : "Ark provider environment variables are incomplete.",
      providerMode !== "mock",
    );
  }

  try {
    const material =
      request.assetType === "text"
        ? await generateTextWithArk(request, config)
        : request.assetType === "image"
          ? await generateImageWithArk(request, config)
          : await generateVideoWithArk(request, config);

    return {
      id: createId("inspiration", `${request.assetType}:${request.prompt}`),
      prompt: request.prompt,
      assetType: request.assetType,
      model: getRequestModelName(request),
      provider: config.provider,
      fallback: {
        used: false,
      },
      materials: [material],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Ark provider error.";
    return createFallbackResponse(
      request,
      `${message} Deterministic fallback used.`,
      true,
    );
  }
};
