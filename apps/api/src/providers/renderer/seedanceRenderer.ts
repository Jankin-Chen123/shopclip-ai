import type {
  AssetMetadata,
  RenderTask,
  SceneRenderClip,
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
const DEFAULT_VIDEO_DURATIONS = [5, 10];

type SeedanceConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  path: string;
};

type SeedanceVideoSettings = VideoGenerationSettings;
type SeedanceImageInputMode = "none" | "first_frame" | "reference_image";

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

const parseImageInputMode = (): SeedanceImageInputMode => {
  const configuredMode = firstEnv("AI_VIDEO_IMAGE_INPUT_MODE", "AI_VIDEO_REFERENCE_IMAGE_MODE")
    ?.toLowerCase()
    .replace(/-/g, "_");
  if (
    configuredMode === "none" ||
    configuredMode === "first_frame" ||
    configuredMode === "reference_image"
  ) {
    return configuredMode;
  }

  const legacyReferenceImagesFlag = process.env.AI_VIDEO_REFERENCE_IMAGES?.trim();
  if (legacyReferenceImagesFlag) {
    return parseBooleanEnv("AI_VIDEO_REFERENCE_IMAGES", true) ? "first_frame" : "none";
  }

  return "first_frame";
};

const parseDurationListEnv = () => {
  const value = firstEnv("AI_VIDEO_ALLOWED_DURATIONS");
  if (!value) {
    return DEFAULT_VIDEO_DURATIONS;
  }

  const durations = value
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0)
    .sort((left, right) => left - right);
  return durations.length > 0 ? durations : DEFAULT_VIDEO_DURATIONS;
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

const getSeedanceConfig = (): SeedanceConfig | undefined => {
  const apiKey = firstEnv("AI_VIDEO_API_KEY", "ARK_API_KEY", "AI_API_KEY");
  if (!apiKey) {
    return undefined;
  }

  return {
    apiKey,
    baseUrl: normalizeBaseUrl(process.env.ARK_API_BASE_URL ?? DEFAULT_ARK_BASE_URL),
    model: firstEnv("AI_VIDEO_MODEL_ID", "AI_VIDEO_ENDPOINT_ID") ?? DEFAULT_VIDEO_MODEL,
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

const promptForProject = (project: ProjectSnapshot, scenes = project.scenes) => {
  const sceneLines = scenes
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
    sceneLines,
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

const resolveSeedanceDuration = (scene: ProjectSnapshot["scenes"][number]) => {
  const configuredDuration = parseNumberEnv("AI_VIDEO_DURATION");
  if (configuredDuration && configuredDuration > 0) {
    return configuredDuration;
  }

  const storyboardDuration = Math.max(1, Math.round(scene.durationSeconds));
  const allowedDurations = parseDurationListEnv();
  return (
    allowedDurations.find((duration) => duration >= storyboardDuration) ??
    allowedDurations[allowedDurations.length - 1] ??
    storyboardDuration
  );
};

const buildSeedanceRequestBody = (
  project: ProjectSnapshot,
  config: SeedanceConfig,
  videoSettings: SeedanceVideoSettings,
  scene: ProjectSnapshot["scenes"][number],
) => {
  const imageInputMode = parseImageInputMode();
  const sceneAsset = scene?.assetId
    ? project.assets.find((candidate) => candidate.id === scene.assetId)
    : undefined;
  const projectImageAssets = uniquePublicImageAssets(project);
  const imageAssets =
    imageInputMode === "none"
      ? []
      : [
          ...(sceneAsset?.type === "image" && isPublicHttpUrl(sceneAsset.url) ? [sceneAsset] : []),
          ...projectImageAssets.filter((asset) => asset.id !== sceneAsset?.id),
        ];
  const imageContent =
    imageInputMode === "reference_image"
      ? imageAssets.slice(0, 4).map((asset) => ({
          type: "image_url",
          role: "reference_image",
          image_url: {
            url: asset.url,
          },
        }))
      : imageAssets.slice(0, 1).map((asset) => ({
          type: "image_url",
          role: "first_frame",
          image_url: {
            url: asset.url,
          },
        }));
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: promptForProject(project, scene ? [scene] : project.scenes),
    },
    ...imageContent,
  ];

  return {
    model: config.model,
    content,
    ratio: videoSettings.ratio,
    resolution: videoSettings.resolution,
    duration: resolveSeedanceDuration(scene),
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

const clipTaskIdsFromProviderTaskId = (providerTaskId: string | undefined) =>
  providerTaskId
    ?.split(",")
    .map((taskId) => taskId.trim())
    .filter(Boolean) ?? [];

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

const queuedSceneClips = (project: ProjectSnapshot): SceneRenderClip[] =>
  [...project.scenes]
    .sort((left, right) => left.order - right.order)
    .map((scene) => ({
      sceneId: scene.id,
      order: scene.order,
      subtitle: scene.subtitle,
      status: "queued",
      progress: 0,
    }));

const providerTaskIdFromClips = (sceneClips: SceneRenderClip[]) => {
  const providerTaskIds = sceneClips
    .map((clip) => clip.providerTaskId)
    .filter((taskId): taskId is string => Boolean(taskId));
  return providerTaskIds.length > 0 ? providerTaskIds.join(",") : undefined;
};

const aggregateSceneClipProgress = (sceneClips: SceneRenderClip[]) =>
  sceneClips.length > 0
    ? Math.round(sceneClips.reduce((sum, clip) => sum + clip.progress, 0) / sceneClips.length)
    : 0;

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
      const scenes = [...project.scenes].sort((left, right) => left.order - right.order);
      const sceneClips: SceneRenderClip[] = [];
      for (const scene of scenes) {
        const body = await requestArkJson(
          "POST",
          config,
          config.path,
          buildSeedanceRequestBody(project, config, videoSettings, scene),
        );
        const providerTaskId = taskIdFromBody(body);
        const videoUrl = collectVideoUrls(body)[0];
        if (!providerTaskId && !videoUrl) {
          throw new Error(`Seedance did not return a task id or video URL for scene ${scene.order}.`);
        }
        sceneClips.push({
          sceneId: scene.id,
          order: scene.order,
          subtitle: scene.subtitle,
          status: videoUrl ? "completed" : "running",
          progress: videoUrl ? 100 : 15,
          providerTaskId,
          videoUrl,
          coverUrl: videoUrl,
        });
      }
      const providerTaskId = sceneClips
        .map((clip) => clip.providerTaskId)
        .filter((taskId): taskId is string => Boolean(taskId))
        .join(",");
      const completedClips = sceneClips.filter((clip) => clip.status === "completed");
      const firstVideoUrl = completedClips[0]?.videoUrl;
      const allCompleted = completedClips.length === sceneClips.length;

      return {
        renderTask: {
          status: allCompleted ? "completed" : "running",
          progress: allCompleted ? 100 : 15,
          previewUrl: firstVideoUrl,
          exportUrl: firstVideoUrl,
          provider: "volcengine-seedance",
          providerTaskId: providerTaskId || undefined,
          sceneClips,
          videoSettings,
        },
        traceEvents: [
          {
            status: "queued",
            step: "render-queued",
            message: "Seedance scene video generation requests queued.",
          },
          {
            status: allCompleted ? "completed" : "running",
            step: "seedance-scene-tasks-submitted",
            message: `Seedance scene tasks submitted: ${providerTaskId || "immediate-video-urls"}.`,
          },
        ],
      };
    },

    async loadTask(
      providerTaskId: string,
      sceneClips: SceneRenderClip[] = [],
    ): Promise<SeedanceTaskUpdate> {
      if (sceneClips.length > 0) {
        const updatedClips = await Promise.all(
          sceneClips.map(async (clip) => {
            if (clip.status === "completed" || !clip.providerTaskId) {
              return clip;
            }
            const body = await requestArkJson(
              "GET",
              config,
              `${config.path}/${encodeURIComponent(clip.providerTaskId)}`,
            );
            const status = statusFromBody(body);
            const videoUrl = collectVideoUrls(body)[0];
            const materializedStatus = videoUrl ? "completed" : status;
            return {
              ...clip,
              status: materializedStatus,
              progress: progressFromBody(body, materializedStatus, Boolean(videoUrl)),
              videoUrl: videoUrl ?? clip.videoUrl,
              coverUrl: videoUrl ?? clip.coverUrl,
              errorMessage:
                materializedStatus === "failed"
                  ? (errorMessageFromBody(body) ?? "Seedance scene video generation failed.")
                  : clip.errorMessage,
            };
          }),
        );
        const completedClips = updatedClips.filter((clip) => clip.status === "completed");
        const failedClip = updatedClips.find((clip) => clip.status === "failed");
        const firstVideoUrl = completedClips[0]?.videoUrl;
        const allCompleted = completedClips.length === updatedClips.length;
        const averageProgress = Math.round(
          updatedClips.reduce((sum, clip) => sum + clip.progress, 0) / updatedClips.length,
        );

        if (failedClip) {
          return {
            renderTask: {
              status: "failed",
              progress: averageProgress,
              errorMessage: failedClip.errorMessage ?? "Seedance scene video generation failed.",
              sceneClips: updatedClips,
            },
            traceEvents: [
              {
                status: "failed",
                step: "seedance-scene-video-failed",
                message: failedClip.errorMessage ?? "Seedance scene video generation failed.",
              },
            ],
          };
        }

        return {
          renderTask: {
            status: allCompleted ? "completed" : "running",
            progress: allCompleted ? 100 : Math.max(15, Math.min(95, averageProgress)),
            previewUrl: firstVideoUrl,
            exportUrl: firstVideoUrl,
            sceneClips: updatedClips,
          },
          traceEvents: [
            {
              status: allCompleted ? "completed" : "running",
              step: allCompleted ? "seedance-scene-clips-ready" : "seedance-scene-tasks-polled",
              message: allCompleted
                ? "All Seedance scene clips are ready."
                : "Seedance scene clips are still processing.",
            },
          ],
        };
      }

      const taskIds = clipTaskIdsFromProviderTaskId(providerTaskId);
      if (taskIds.length > 1) {
        return this.loadTask(
          providerTaskId,
          taskIds.map((taskId, index) => ({
            sceneId: `scene-${index + 1}`,
            order: index + 1,
            subtitle: `Scene ${index + 1}`,
            status: "running",
            progress: 15,
            providerTaskId: taskId,
          })),
        );
      }

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

    async loadRenderTask(
      project: ProjectSnapshot,
      renderTask: RenderTask,
    ): Promise<SeedanceTaskUpdate> {
      if (!renderTask.sceneClips || renderTask.sceneClips.length === 0) {
        if (!renderTask.providerTaskId) {
          return {
            renderTask: {
              status: "failed",
              progress: 0,
              errorMessage: "Seedance render task does not contain scene clips or provider task id.",
            },
            traceEvents: [
              {
                status: "failed",
                step: "seedance-task-state-invalid",
                message: "Seedance render task does not contain scene clips or provider task id.",
              },
            ],
          };
        }
        return this.loadTask(renderTask.providerTaskId);
      }

      const updatedClips = [...renderTask.sceneClips].sort((left, right) => left.order - right.order);
      const queuedClip = updatedClips.find(
        (clip) => clip.status === "queued" && !clip.providerTaskId,
      );
      const traceEvents: SeedanceTaskUpdate["traceEvents"] = [];

      if (queuedClip) {
        const scene = project.scenes.find((candidate) => candidate.id === queuedClip.sceneId);
        if (!scene) {
          const failedClip = {
            ...queuedClip,
            status: "failed" as const,
            progress: 0,
            errorMessage: `Storyboard scene ${queuedClip.sceneId} was not found.`,
          };
          updatedClips[updatedClips.indexOf(queuedClip)] = failedClip;
        } else {
          try {
            const body = await requestArkJson(
              "POST",
              config,
              config.path,
              buildSeedanceRequestBody(
                project,
                config,
                resolveVideoSettings(renderTask.videoSettings),
                scene,
              ),
            );
            const providerTaskId = taskIdFromBody(body);
            const videoUrl = collectVideoUrls(body)[0];
            if (!providerTaskId && !videoUrl) {
              throw new Error(
                `Seedance did not return a task id or video URL for scene ${scene.order}.`,
              );
            }
            updatedClips[updatedClips.indexOf(queuedClip)] = {
              ...queuedClip,
              status: videoUrl ? "completed" : "running",
              progress: videoUrl ? 100 : 15,
              providerTaskId,
              videoUrl,
              coverUrl: videoUrl,
            };
            traceEvents.push({
              status: videoUrl ? "completed" : "running",
              step: "seedance-scene-task-submitted",
              message: `Seedance scene ${scene.order} task submitted: ${providerTaskId || "immediate-video-url"}.`,
            });
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : `Seedance scene ${scene.order} task submission failed.`;
            updatedClips[updatedClips.indexOf(queuedClip)] = {
              ...queuedClip,
              status: "failed",
              progress: 0,
              errorMessage: message,
            };
            traceEvents.push({
              status: "failed",
              step: "seedance-scene-task-submit-failed",
              message,
            });
          }
        }
      }

      const polledClips = await Promise.all(
        updatedClips.map(async (clip) => {
          if (clip.status === "completed" || clip.status === "failed" || !clip.providerTaskId) {
            return clip;
          }
          const body = await requestArkJson(
            "GET",
            config,
            `${config.path}/${encodeURIComponent(clip.providerTaskId)}`,
          );
          const status = statusFromBody(body);
          const videoUrl = collectVideoUrls(body)[0];
          const materializedStatus = videoUrl ? "completed" : status;
          return {
            ...clip,
            status: materializedStatus,
            progress: progressFromBody(body, materializedStatus, Boolean(videoUrl)),
            videoUrl: videoUrl ?? clip.videoUrl,
            coverUrl: videoUrl ?? clip.coverUrl,
            errorMessage:
              materializedStatus === "failed"
                ? (errorMessageFromBody(body) ?? "Seedance scene video generation failed.")
                : clip.errorMessage,
          };
        }),
      );

      const failedClip = polledClips.find((clip) => clip.status === "failed");
      const completedClips = polledClips.filter((clip) => clip.status === "completed");
      const allCompleted = completedClips.length === polledClips.length;
      const firstVideoUrl = completedClips[0]?.videoUrl;
      const progress = aggregateSceneClipProgress(polledClips);

      if (failedClip) {
        return {
          renderTask: {
            status: "failed",
            progress,
            errorMessage: failedClip.errorMessage ?? "Seedance scene video generation failed.",
            providerTaskId: providerTaskIdFromClips(polledClips),
            sceneClips: polledClips,
          },
          traceEvents:
            traceEvents.length > 0
              ? traceEvents
              : [
                  {
                    status: "failed",
                    step: "seedance-scene-video-failed",
                    message:
                      failedClip.errorMessage ?? "Seedance scene video generation failed.",
                  },
                ],
        };
      }

      return {
        renderTask: {
          status: allCompleted ? "completed" : "running",
          progress: allCompleted ? 100 : Math.max(5, Math.min(95, progress)),
          previewUrl: firstVideoUrl,
          exportUrl: firstVideoUrl,
          providerTaskId: providerTaskIdFromClips(polledClips),
          sceneClips: polledClips,
        },
        traceEvents: [
          ...traceEvents,
          {
            status: allCompleted ? "completed" : "running",
            step: allCompleted ? "seedance-scene-clips-ready" : "seedance-scene-tasks-polled",
            message: allCompleted
              ? "All Seedance scene clips are ready."
              : "Seedance scene clips are still processing.",
          },
        ],
      };
    },
  };
};

export const createQueuedSeedanceRenderTask = (
  project: ProjectSnapshot,
  options: RenderFallbackOptions,
): RenderProviderResult => {
  const config = getSeedanceConfig();
  if (!config) {
    throw new Error("Seedance render provider requires AI_VIDEO_API_KEY or ARK_API_KEY.");
  }

  return {
    renderTask: {
      status: "queued",
      progress: 0,
      provider: "volcengine-seedance",
      sceneClips: queuedSceneClips(project),
      mediaSettings: options.mediaSettings,
      videoSettings: resolveVideoSettings(options.videoSettings),
      retryOfRenderTaskId: options.retryOfRenderTaskId,
    },
    traceEvents: [
      ...(options.retryOfRenderTaskId
        ? [
            {
              status: "retrying" as const,
              step: "render-retry-started",
              message: `Retrying failed render task ${options.retryOfRenderTaskId}.`,
              retryOfTraceEventId: options.retryOfTraceEventId,
            },
          ]
        : []),
      {
        status: "queued",
        step: "seedance-scene-render-queued",
        message: "Seedance scene video generation will be submitted during render polling.",
      },
    ],
  };
};

export const createQueuedRenderWithConfiguredVideoProvider = (
  project: ProjectSnapshot,
  options: RenderFallbackOptions,
): RenderProviderResult => {
  if (!isSeedanceRenderEnabled()) {
    return renderFallbackPreview(project, options);
  }

  try {
    return createQueuedSeedanceRenderTask(project, options);
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
          step: "seedance-task-queue-failed",
          message:
            error instanceof Error
              ? `${error.message} Deterministic mock render fallback used.`
              : "Seedance task queueing failed. Deterministic mock render fallback used.",
        },
        ...fallbackResult.traceEvents,
      ],
    };
  }
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
