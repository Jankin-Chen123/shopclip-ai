import { z } from "zod";

export const ProjectStatusSchema = z.enum(["draft", "ready", "rendering", "completed", "failed"]);

export const AssetTypeSchema = z.enum(["image", "video", "reference"]);
export const AssetStatusSchema = z.enum(["uploaded", "processing", "ready", "failed"]);
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
  projectId: z.string().trim().min(1),
  type: AssetTypeSchema,
  status: AssetStatusSchema,
  url: z.string().trim().min(1),
  name: z.string().trim().min(1),
  mimeType: z.string().trim().min(1).optional(),
  sizeBytes: z.number().int().positive().optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  createdAt: IsoDateTimeSchema.optional(),
  updatedAt: IsoDateTimeSchema.optional(),
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

export const AssetSearchResponseSchema = z.object({
  projectId: z.string().trim().min(1),
  query: z.string().default(""),
  tags: z.array(z.string().trim().min(1)).default([]),
  results: z.array(AssetSearchResultSchema),
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
