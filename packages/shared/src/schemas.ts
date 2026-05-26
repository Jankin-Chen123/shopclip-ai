import { z } from "zod";

export const ProjectStatusSchema = z.enum(["draft", "ready", "rendering", "completed", "failed"]);

export const AssetTypeSchema = z.enum(["image", "video", "reference"]);
export const AssetStatusSchema = z.enum(["uploaded", "processing", "ready", "failed"]);
export const AssetSourceSchema = z.enum([
  "merchant_upload",
  "external_provider",
  "generated",
  "public_reference",
]);
export const AssetStorageProviderSchema = z.enum(["local", "mock-cos", "tencent-cos"]);
export const InspirationAssetTypeSchema = z.enum(["text", "image", "video"]);
export const InspirationMaterialStatusSchema = z.enum(["ready", "processing", "failed"]);
export const SceneStatusSchema = z.enum(["draft", "generated", "edited", "regenerating", "failed"]);
export const RenderTaskStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "retrying",
]);
export const TraceEventStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "retrying",
]);

export const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const ProjectBriefSchema = z.object({
  title: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  audience: z.string().trim().min(1),
  sellingPoints: z.array(z.string().trim().min(1)).min(1),
  tone: z.string().trim().min(1),
  style: z.string().trim().min(1),
  targetDurationSeconds: z.number().positive().max(15).default(15),
});

export const ProjectSchema = ProjectBriefSchema.extend({
  id: z.string().trim().min(1),
  status: ProjectStatusSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const AssetMetadataSchema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
  type: AssetTypeSchema,
  status: AssetStatusSchema,
  source: AssetSourceSchema.default("merchant_upload").optional(),
  storageProvider: AssetStorageProviderSchema.optional(),
  objectKey: z.string().trim().min(1).optional(),
  thumbnailKey: z.string().trim().min(1).optional(),
  url: z.string().trim().min(1),
  name: z.string().trim().min(1),
  mimeType: z.string().trim().min(1).optional(),
  sizeBytes: z.number().int().positive().optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  embeddingText: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: IsoDateTimeSchema.optional(),
  updatedAt: IsoDateTimeSchema.optional(),
});

export const AssetUploadIntentSchema = z.object({
  provider: AssetStorageProviderSchema,
  bucket: z.string().trim().min(1),
  region: z.string().trim().min(1),
  objectKey: z.string().trim().min(1),
  uploadUrl: z.string().trim().min(1),
  publicUrl: z.string().trim().min(1),
  method: z.enum(["PUT"]).default("PUT"),
  headers: z.record(z.string(), z.string()).default({}),
  expiresAt: IsoDateTimeSchema,
});

export const AssetProcessingJobSchema = z.object({
  id: z.string().trim().min(1),
  assetId: z.string().trim().min(1),
  status: AssetStatusSchema,
  steps: z.array(z.string().trim().min(1)).default([]),
  message: z.string().trim().min(1),
  createdAt: IsoDateTimeSchema,
});

export const AssetSliceSchema = z.object({
  id: z.string().trim().min(1),
  assetId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  startSecond: z.number().min(0).optional(),
  endSecond: z.number().positive().optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
});

export const AssetSearchResultSchema = z.object({
  asset: AssetMetadataSchema,
  slices: z.array(AssetSliceSchema).default([]),
  score: z.number().min(0),
  reasons: z.array(z.string().trim().min(1)).default([]),
});

export const ExternalAssetProviderSchema = z.enum(["pexels", "pixabay", "freesound"]);

export const ExternalAssetResultSchema = z.object({
  id: z.string().trim().min(1),
  source: ExternalAssetProviderSchema,
  externalId: z.string().trim().min(1),
  type: z.enum(["image", "video", "audio"]),
  title: z.string().trim().min(1),
  thumbnailUrl: z.string().trim().default(""),
  previewUrl: z.string().trim().min(1),
  downloadUrl: z.string().trim().min(1).optional(),
  externalUrl: z.string().trim().min(1),
  authorName: z.string().trim().min(1),
  authorUrl: z.string().trim().min(1).optional(),
  licenseLabel: z.string().trim().min(1),
  licenseUrl: z.string().trim().min(1).optional(),
  canUseCommercially: z.boolean(),
  requiresAttribution: z.boolean(),
  tags: z.array(z.string().trim().min(1)).default([]),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().positive().optional(),
});

export const ExternalAssetProviderConfigSchema = z.object({
  source: ExternalAssetProviderSchema,
  apiKey: z.string().trim().min(1).max(4000).optional(),
  enabled: z.boolean().default(true),
});

export const ExternalAssetSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(300),
  page: z.number().int().positive().max(200).default(1),
  perPage: z.number().int().positive().max(24).default(12),
  type: z.enum(["image", "video", "audio", "script"]).optional(),
  providers: z.array(ExternalAssetProviderConfigSchema).max(8).default([]),
});

export const ExternalAssetSearchResponseSchema = z.object({
  query: z.string().trim().min(1),
  page: z.number().int().positive().default(1),
  perPage: z.number().int().positive().max(24).default(12),
  hasMore: z.boolean().default(false),
  externalResults: z.array(ExternalAssetResultSchema).default([]),
});

export const AssetSearchResponseSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  query: z.string().default(""),
  tags: z.array(z.string().trim().min(1)).default([]),
  results: z.array(AssetSearchResultSchema),
  externalResults: z.array(ExternalAssetResultSchema).default([]),
});

export const InspirationGenerateRequestSchema = z.object({
  prompt: z.string().trim().min(2).max(2000),
  assetType: InspirationAssetTypeSchema,
  options: z
    .object({
      image: z
        .object({
          count: z.number().int().min(1).max(4).default(1),
          aspectRatio: z.enum(["auto", "1:1", "4:3", "3:4", "16:9", "9:16"]).default("auto"),
          quality: z.enum(["standard", "hd", "2k"]).default("standard"),
        })
        .optional(),
      video: z
        .object({
          aspectRatio: z.enum(["auto", "1:1", "16:9", "9:16"]).default("auto"),
          quality: z.enum(["standard", "hd", "2k"]).default("standard"),
        })
        .optional(),
    })
    .optional(),
  apiConfig: z
    .object({
      general: z
        .object({
          provider: z.string().trim().min(1).max(120).optional(),
          apiBaseUrl: z.string().trim().url().max(500).optional(),
          model: z.string().trim().min(1).max(200).optional(),
          apiKey: z.string().trim().min(1).max(4000).optional(),
        })
        .optional(),
      image: z
        .object({
          provider: z.string().trim().min(1).max(120).optional(),
          apiBaseUrl: z.string().trim().url().max(500).optional(),
          model: z.string().trim().min(1).max(200).optional(),
          apiKey: z.string().trim().min(1).max(4000).optional(),
        })
        .optional(),
      video: z
        .object({
          provider: z.string().trim().min(1).max(120).optional(),
          apiBaseUrl: z.string().trim().url().max(500).optional(),
          model: z.string().trim().min(1).max(200).optional(),
          apiKey: z.string().trim().min(1).max(4000).optional(),
        })
        .optional(),
    })
    .optional(),
});

export const InspirationMaterialSchema = z.object({
  id: z.string().trim().min(1),
  type: InspirationAssetTypeSchema,
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  status: InspirationMaterialStatusSchema,
  url: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
  progress: z.number().min(0).max(100).optional(),
  mimeType: z.string().trim().min(1).optional(),
});

export const InspirationGenerateResponseSchema = z.object({
  id: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  assetType: InspirationAssetTypeSchema,
  model: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  fallback: z.object({
    used: z.boolean(),
    reason: z.string().trim().min(1).optional(),
  }),
  materials: z.array(InspirationMaterialSchema).min(1),
});

export const InspirationVideoTaskRequestSchema = z.object({
  taskId: z.string().trim().min(1),
  prompt: z.string().trim().min(2).max(2000),
  apiConfig: InspirationGenerateRequestSchema.shape.apiConfig,
});

export const InspirationVideoTaskResponseSchema = z.object({
  material: InspirationMaterialSchema,
});

export const StoryboardSceneSchema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  order: z.number().int().min(1),
  durationSeconds: z.number().positive().max(15),
  subtitle: z.string().trim().min(1),
  voiceover: z.string().trim().min(1),
  visualPrompt: z.string().trim().min(1),
  assetId: z.string().trim().min(1).optional(),
  status: SceneStatusSchema,
});

export const ScriptResultSchema = z
  .object({
    id: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
    hook: z.string().trim().min(1),
    narrative: z.string().trim().min(1),
    constraints: z.array(z.string().trim().min(1)).default([]),
    scenes: z.array(StoryboardSceneSchema).min(1),
  })
  .superRefine((script, context) => {
    const totalDurationSeconds = script.scenes.reduce(
      (sum, scene) => sum + scene.durationSeconds,
      0,
    );

    if (totalDurationSeconds > 15) {
      context.addIssue({
        code: "custom",
        message: "Storyboard scenes must not exceed 15 seconds total.",
        path: ["scenes"],
      });
    }
  });

export const SceneUpdateSchema = z
  .object({
    durationSeconds: z.number().positive().max(15).optional(),
    subtitle: z.string().trim().min(1).optional(),
    voiceover: z.string().trim().min(1).optional(),
    visualPrompt: z.string().trim().min(1).optional(),
    assetId: z.string().trim().min(1).nullable().optional(),
    status: SceneStatusSchema.optional(),
  })
  .refine((update) => Object.keys(update).length > 0, {
    message: "At least one scene field is required.",
  });

export const EditingSuggestionSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  explanation: z.string().trim().min(1),
  update: SceneUpdateSchema,
});

export const MediaSettingsSchema = z.object({
  ttsVoice: z.enum(["clear-host", "warm-creator", "energetic-seller"]).default("clear-host"),
  subtitleStyle: z
    .enum(["clean-lower-third", "high-contrast", "creator-caption"])
    .default("clean-lower-third"),
  subtitlesEnabled: z.boolean().default(true),
  bgmTrack: z.enum(["none", "creator-pop", "soft-lift", "tech-pulse"]).default("creator-pop"),
});

export const RenderRequestSchema = z.object({
  mediaSettings: MediaSettingsSchema.default({
    bgmTrack: "creator-pop",
    subtitleStyle: "clean-lower-third",
    subtitlesEnabled: true,
    ttsVoice: "clear-host",
  }),
  simulateFailure: z.boolean().default(false),
});

export const RenderTaskSchema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  status: RenderTaskStatusSchema,
  progress: z.number().min(0).max(100),
  previewUrl: z.string().trim().min(1).optional(),
  exportUrl: z.string().trim().min(1).optional(),
  errorMessage: z.string().trim().min(1).optional(),
  mediaSettings: MediaSettingsSchema.optional(),
  retryOfRenderTaskId: z.string().trim().min(1).optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const TraceEventSchema = z.object({
  id: z.string().trim().min(1),
  renderTaskId: z.string().trim().min(1),
  status: TraceEventStatusSchema,
  step: z.string().trim().min(1),
  message: z.string().trim().min(1),
  retryOfTraceEventId: z.string().trim().min(1).optional(),
  createdAt: IsoDateTimeSchema,
});

export const DashboardMetricSummarySchema = z.object({
  predictedCompletionRate: z.number().min(0).max(1),
  hookStrength: z.number().min(0).max(1),
  subtitleClarity: z.number().min(0).max(1),
  productFocus: z.number().min(0).max(1),
});

export const DashboardResponseSchema = z.object({
  projectId: z.string().trim().min(1),
  summary: DashboardMetricSummarySchema,
  funnel: z
    .array(
      z.object({
        stage: z.string().trim().min(1),
        value: z.number().min(0),
      }),
    )
    .min(1),
  factors: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        sceneId: z.string().trim().min(1).optional(),
        factor: z.string().trim().min(1),
        expectedImpact: z.enum(["low", "medium", "high"]),
        evidence: z.string().trim().min(1),
        recommendation: z.string().trim().min(1),
      }),
    )
    .min(1),
});
