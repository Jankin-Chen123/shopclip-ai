import type {
  AssetMetadata,
  RenderTask,
  TraceEvent,
  VideoGenerationSettings,
} from "@shopclip/shared";

import type { ProjectSnapshot } from "../../modules/projects/projectStore.js";
import { renderFallbackPreview } from "./mockRenderer.js";
import type { RenderFallbackOptions, RenderProviderResult } from "./mockRenderer.js";

const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_VIDEO_MODEL = "doubao-seedance-2-0-260128";
const DEFAULT_VIDEO_PATH = "/contents/generations/tasks";
const DEFAULT_VIDEO_RATIO = "9:16";
const DEFAULT_VIDEO_RESOLUTION = "720p";

const SEEDANCE_MODEL_ALIASES = new Map<string, string>([
  ["doubao-seedance1.5-pro", "doubao-seedance-1-5-pro-251215"],
  ["doubao-seedance-1.5-pro", "doubao-seedance-1-5-pro-251215"],
  ["doubao-seedance-1-5-pro", "doubao-seedance-1-5-pro-251215"],
  ["doubao-seedance-1-5-pro-251215", "doubao-seedance-1-5-pro-251215"],
  ["doubao-seedance2.0", "doubao-seedance-2-0-260128"],
  ["doubao-seedance-2.0", "doubao-seedance-2-0-260128"],
  ["doubao-seedance-2-0", "doubao-seedance-2-0-260128"],
  ["doubao-seedance-2-0-260128", "doubao-seedance-2-0-260128"],
]);

type SeedanceConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  path: string;
};

type SeedanceVideoSettings = VideoGenerationSettings;

type SeedanceTaskUpdate = {
  renderTask: Partial<RenderTask>;
  traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">>;
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

const parseBooleanEnv = (key: string, defaultValue: boolean) => {
  const value = process.env[key]?.trim().toLowerCase();
  if (!value) {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(value);
};

const parseNumberEnv = (key: string) => {
  const value = process.env[key]?.trim();
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const VIDEO_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"] as const;
const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;

const parseRatioEnv = (): VideoGenerationSettings["ratio"] => {
  const value = firstEnv("AI_VIDEO_RATIO");
  return VIDEO_RATIOS.includes(value as VideoGenerationSettings["ratio"])
    ? (value as VideoGenerationSettings["ratio"])
    : DEFAULT_VIDEO_RATIO;
};

const parseResolutionEnv = (): VideoGenerationSettings["resolution"] => {
  const value = firstEnv("AI_VIDEO_RESOLUTION");
  return VIDEO_RESOLUTIONS.includes(value as VideoGenerationSettings["resolution"])
    ? (value as VideoGenerationSettings["resolution"])
    : DEFAULT_VIDEO_RESOLUTION;
};

const normalizeBaseUrl = (value: string) => value.replace(/\/$/, "");

const normalizeSeedanceModel = (model: string) => {
  const trimmedModel = model.trim();
  return SEEDANCE_MODEL_ALIASES.get(trimmedModel.toLowerCase()) ?? trimmedModel;
};

const getSeedanceConfig = (): SeedanceConfig | undefined => {
  const apiKey = firstEnv("AI_VIDEO_API_KEY", "ARK_API_KEY", "AI_API_KEY");
  if (!apiKey) {
    return undefined;
  }

  return {
    apiKey,
    baseUrl: normalizeBaseUrl(process.env.ARK_API_BASE_URL ?? DEFAULT_ARK_BASE_URL),
    model: normalizeSeedanceModel(
      firstEnv("AI_VIDEO_MODEL_ID", "AI_VIDEO_ENDPOINT_ID") ?? DEFAULT_VIDEO_MODEL,
    ),
    path: firstEnv("ARK_VIDEO_GENERATION_PATH") ?? DEFAULT_VIDEO_PATH,
  };
};

const getDefaultVideoSettings = (): SeedanceVideoSettings => ({
  ratio: parseRatioEnv(),
  resolution: parseResolutionEnv(),
  generateAudio: parseBooleanEnv("AI_VIDEO_GENERATE_AUDIO", false),
  watermark: parseBooleanEnv("AI_VIDEO_WATERMARK", false),
  seed: parseNumberEnv("AI_VIDEO_SEED"),
});

const resolveVideoSettings = (
  requestSettings?: VideoGenerationSettings,
): SeedanceVideoSettings => {
  const defaults = getDefaultVideoSettings();
  return {
    ratio: requestSettings?.ratio ?? defaults.ratio,
    resolution: requestSettings?.resolution ?? defaults.resolution,
    generateAudio: requestSettings?.generateAudio ?? defaults.generateAudio,
    watermark: requestSettings?.watermark ?? defaults.watermark,
    seed: requestSettings?.seed ?? defaults.seed,
  };
};

const isSeedanceRenderEnabled = () => {
  const mode = firstEnv("VIDEO_RENDER_PROVIDER_MODE")?.toLowerCase();
  return mode === "seedance" || mode === "ark" || mode === "doubao" || mode === "real";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const parseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const requestArkJson = async (
  method: "GET" | "POST",
  config: SeedanceConfig,
  path: string,
  body?: Record<string, unknown>,
) => {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const responseBody = await parseJson(response);

  if (!response.ok) {
    const summary = isRecord(responseBody) ? ` ${JSON.stringify(responseBody).slice(0, 240)}` : "";
    throw new Error(`Seedance request failed with HTTP ${response.status}.${summary}`);
  }

  return responseBody;
};

const totalDurationSeconds = (project: ProjectSnapshot) =>
  Math.min(
    15,
    Math.max(1, Math.round(project.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0))),
  );

const promptForProject = (project: ProjectSnapshot) => {
  const scenes = project.scenes
    .sort((left, right) => left.order - right.order)
    .map(
      (scene) =>
        `${scene.order}. ${scene.durationSeconds}s | 画面: ${scene.visualPrompt} | 字幕: ${scene.subtitle}`,
    )
    .join("\n");

  return [
    "生成一条电商带货短视频，严格保持参考素材中的产品外观，不要添加不存在的 Logo 或包装文字。",
    `产品: ${project.productName}`,
    `目标人群: ${project.audience}`,
    `卖点: ${project.sellingPoints.join("、")}`,
    `语气: ${project.tone}`,
    `风格: ${project.style}`,
    "分镜:",
    scenes,
  ].join("\n");
};

const isPublicHttpUrl = (url: string | undefined) =>
  Boolean(url && /^https?:\/\//i.test(url.trim()));

const uniquePublicImageAssets = (project: ProjectSnapshot): AssetMetadata[] => {
  const selected = new Map<string, AssetMetadata>();
  for (const scene of project.scenes) {
    const asset = scene.assetId
      ? project.assets.find((candidate) => candidate.id === scene.assetId)
      : undefined;
    if (asset?.type === "image" && isPublicHttpUrl(asset.url)) {
      selected.set(asset.url, asset);
    }
  }
  for (const asset of project.assets) {
    if (asset.type === "image" && isPublicHttpUrl(asset.url)) {
      selected.set(asset.url, asset);
    }
  }
  return [...selected.values()].slice(0, 4);
};

const buildSeedanceRequestBody = (
  project: ProjectSnapshot,
  config: SeedanceConfig,
  videoSettings: SeedanceVideoSettings,
) => {
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: promptForProject(project),
    },
    ...uniquePublicImageAssets(project).map((asset) => ({
      type: "image_url",
      role: "reference_image",
      image_url: {
        url: asset.url,
      },
    })),
  ];

  return {
    model: config.model,
    content,
    ratio: videoSettings.ratio,
    resolution: videoSettings.resolution,
    duration: totalDurationSeconds(project),
    generate_audio: videoSettings.generateAudio,
    watermark: videoSettings.watermark,
    ...(videoSettings.seed === undefined ? {} : { seed: videoSettings.seed }),
  };
};

const taskIdFromBody = (body: unknown) => {
  const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
  return (
    (isRecord(body) ? (getString(body.id) ?? getString(body.task_id)) : undefined) ??
    getString(data?.id) ??
    getString(data?.task_id)
  );
};

const rawTaskStatus = (body: unknown) => {
  const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
  return (
    (isRecord(body) ? getString(body.status) : undefined) ??
    getString(data?.status) ??
    getString(data?.state)
  )?.toLowerCase();
};

const statusFromBody = (body: unknown): RenderTask["status"] => {
  const status = rawTaskStatus(body);
  if (!status) {
    return "running";
  }
  if (["succeeded", "success", "completed", "ready", "done"].includes(status)) {
    return "completed";
  }
  if (["failed", "error", "cancelled", "canceled"].includes(status)) {
    return "failed";
  }
  return "running";
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

const progressFromBody = (body: unknown, status: RenderTask["status"], hasVideoUrl: boolean) => {
  if (hasVideoUrl || status === "completed") {
    return 100;
  }
  if (status === "failed") {
    return 0;
  }
  const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
  const candidate =
    (isRecord(body) ? body.progress : undefined) ??
    data?.progress ??
    data?.percent ??
    data?.percentage;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return Math.max(10, Math.min(95, Math.round(candidate <= 1 ? candidate * 100 : candidate)));
  }
  return 30;
};

const errorMessageFromBody = (body: unknown) => {
  const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
  const error = isRecord(body) ? body.error : undefined;
  return (
    getString(isRecord(error) ? error.message : undefined) ??
    getString(isRecord(body) ? body.message : undefined) ??
    getString(data?.message)
  );
};

export const createSeedanceRenderProvider = () => {
  const config = getSeedanceConfig();
  if (!config) {
    throw new Error("Seedance render provider requires AI_VIDEO_API_KEY or ARK_API_KEY.");
  }

  return {
    async createTask(
      project: ProjectSnapshot,
      requestSettings?: VideoGenerationSettings,
    ): Promise<RenderProviderResult> {
      const videoSettings = resolveVideoSettings(requestSettings);
      const body = await requestArkJson(
        "POST",
        config,
        config.path,
        buildSeedanceRequestBody(project, config, videoSettings),
      );
      const providerTaskId = taskIdFromBody(body);
      const videoUrl = collectVideoUrls(body)[0];

      if (videoUrl) {
        return {
          renderTask: {
            status: "completed",
            progress: 100,
            previewUrl: videoUrl,
            exportUrl: videoUrl,
            provider: "volcengine-seedance",
            providerTaskId,
            videoSettings,
          },
          traceEvents: [
            {
              status: "queued",
              step: "render-queued",
              message: "Seedance video generation request queued.",
            },
            {
              status: "completed",
              step: "seedance-video-ready",
              message: "Seedance returned a renderable video URL immediately.",
            },
          ],
        };
      }

      if (!providerTaskId) {
        throw new Error("Seedance did not return a task id or video URL.");
      }

      return {
        renderTask: {
          status: "running",
          progress: 15,
          provider: "volcengine-seedance",
          providerTaskId,
          videoSettings,
        },
        traceEvents: [
          {
            status: "queued",
            step: "render-queued",
            message: "Seedance video generation request queued.",
          },
          {
            status: "running",
            step: "seedance-task-submitted",
            message: `Seedance task submitted: ${providerTaskId}.`,
          },
        ],
      };
    },

    async loadTask(providerTaskId: string): Promise<SeedanceTaskUpdate> {
      const body = await requestArkJson(
        "GET",
        config,
        `${config.path}/${encodeURIComponent(providerTaskId)}`,
      );
      const status = statusFromBody(body);
      const videoUrl = collectVideoUrls(body)[0];
      const materializedStatus = videoUrl ? "completed" : status;
      const progress = progressFromBody(body, materializedStatus, Boolean(videoUrl));

      if (materializedStatus === "failed") {
        return {
          renderTask: {
            status: "failed",
            progress,
            errorMessage: errorMessageFromBody(body) ?? "Seedance video generation failed.",
          },
          traceEvents: [
            {
              status: "failed",
              step: "seedance-video-failed",
              message: errorMessageFromBody(body) ?? "Seedance video generation failed.",
            },
          ],
        };
      }

      if (videoUrl) {
        return {
          renderTask: {
            status: "completed",
            progress: 100,
            previewUrl: videoUrl,
            exportUrl: videoUrl,
          },
          traceEvents: [
            {
              status: "completed",
              step: "seedance-video-ready",
              message: "Seedance video generation completed.",
            },
          ],
        };
      }

      return {
        renderTask: {
          status: "running",
          progress,
        },
        traceEvents: [
          {
            status: "running",
            step: "seedance-task-polled",
            message: `Seedance task ${providerTaskId} is still processing.`,
          },
        ],
      };
    },
  };
};

export const renderWithConfiguredVideoProvider = async (
  project: ProjectSnapshot,
  options: RenderFallbackOptions,
): Promise<RenderProviderResult> => {
  if (!isSeedanceRenderEnabled()) {
    return renderFallbackPreview(project, options);
  }

  try {
    return await createSeedanceRenderProvider().createTask(project, options.videoSettings);
  } catch (error) {
    const fallbackResult = renderFallbackPreview(project, options);
    return {
      renderTask: {
        ...fallbackResult.renderTask,
        provider: "mock-renderer",
      },
      traceEvents: [
        {
          status: "failed",
          step: "seedance-task-submit-failed",
          message:
            error instanceof Error
              ? `${error.message} Deterministic mock render fallback used.`
              : "Seedance task submission failed. Deterministic mock render fallback used.",
        },
        ...fallbackResult.traceEvents,
      ],
    };
  }
};
