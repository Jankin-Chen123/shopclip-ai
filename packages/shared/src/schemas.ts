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
export const ReferenceVideoStatusSchema = z.enum(["registered", "analyzing", "ready", "failed"]);

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
  prepKeywords: z.array(z.string().trim().min(1)).max(40).default([]),
  status: ProjectStatusSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const ProjectPrepUpdateSchema = z.object({
  keywords: z.array(z.string().trim().min(1)).max(40).default([]),
});

export const ProjectSummarySchema = ProjectSchema.pick({
  id: true,
  title: true,
  productName: true,
  status: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  assetCount: z.number().int().nonnegative(),
  coverAssetId: z.string().trim().min(1).optional(),
  coverAssetUrl: z.string().trim().min(1).optional(),
  sceneCount: z.number().int().nonnegative(),
});

export const AssetRoleSchema = z.enum([
  "hero_image",
  "detail_image",
  "packaging",
  "usage_demo",
  "lifestyle",
  "reference_video",
  "transition",
  "brand_doc",
]);

export const SceneRoleSchema = z.enum([
  "hook",
  "pain",
  "fear",
  "solution",
  "demo",
  "trust",
  "price",
  "cta",
  "closure",
  "transition",
]);

export const ProductVisibilitySchema = z.enum(["clear", "partial", "none", "uncertain"]);

export const ShotTypeSchema = z.enum([
  "close_up",
  "medium",
  "wide",
  "overhead",
  "first_person",
  "screen_recording",
  "packshot",
  "unknown",
]);

export const CameraMovementSchema = z.enum([
  "static",
  "pan",
  "tilt",
  "push_in",
  "pull_out",
  "handheld",
  "handheld_push_in",
  "zoom",
  "unknown",
]);

export const VisualIdentitySchema = z.object({
  colors: z.array(z.string().trim().min(1)).default([]),
  materials: z.array(z.string().trim().min(1)).default([]),
  shape: z.string().trim().min(1).optional(),
  logoText: z.string().trim().min(1).optional(),
  packaging: z.string().trim().min(1).optional(),
});

export const ProductProfileSchema = z.object({
  productName: z.string().trim().min(1),
  category: z.string().trim().min(1),
  targetAudience: z.array(z.string().trim().min(1)).default([]),
  sellingPoints: z.array(z.string().trim().min(1)).default([]),
  usageScenarios: z.array(z.string().trim().min(1)).default([]),
  visualIdentity: VisualIdentitySchema.default({ colors: [], materials: [] }),
  doNotMisrepresent: z.array(z.string().trim().min(1)).default([]),
  sourceAssetIds: z.array(z.string().trim().min(1)).default([]),
  confidence: z.number().min(0).max(1).default(0),
});

export const AssetQualitySignalsSchema = z.object({
  sharpness: z.number().min(0).max(1).optional(),
  stability: z.number().min(0).max(1).optional(),
  productVisibility: ProductVisibilitySchema.optional(),
  usableForAd: z.boolean().optional(),
});

export const StructuredAssetMetadataSchema = z.object({
  assetId: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
  type: AssetTypeSchema,
  source: AssetSourceSchema.default("merchant_upload"),
  sourceDeclaration: z.string().trim().min(1),
  objectKey: z.string().trim().min(1).optional(),
  thumbnailKey: z.string().trim().min(1).optional(),
  durationSeconds: z.number().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  format: z.string().trim().min(1).optional(),
  overallSummary: z.string().trim().min(1),
  role: AssetRoleSchema,
  globalTags: z.array(z.string().trim().min(1)).default([]),
  ocrText: z.string().trim().default(""),
  asrSummary: z.string().trim().default(""),
  visualStyle: z
    .object({
      colors: z.array(z.string().trim().min(1)).default([]),
      materials: z.array(z.string().trim().min(1)).default([]),
      lighting: z.string().trim().min(1).optional(),
      background: z.string().trim().min(1).optional(),
      mood: z.string().trim().min(1).optional(),
    })
    .default({ colors: [], materials: [] }),
  qualitySignals: AssetQualitySignalsSchema.default({}),
  complianceFlags: z.array(z.string().trim().min(1)).default([]),
  searchText: z.string().trim().min(1),
  embeddingText: z.string().trim().min(1),
  modelTrace: z
    .object({
      provider: z.string().trim().min(1),
      model: z.string().trim().min(1).optional(),
      confidence: z.number().min(0).max(1).optional(),
      fallbackUsed: z.boolean().optional(),
      error: z.string().trim().min(1).optional(),
    })
    .optional(),
});

export const StructuredSliceMetadataSchema = z
  .object({
    sliceId: z.string().trim().min(1),
    assetId: z.string().trim().min(1),
    startSecond: z.number().min(0),
    endSecond: z.number().positive(),
    thumbnailKey: z.string().trim().min(1).optional(),
    frameKeys: z.array(z.string().trim().min(1)).default([]),
    summary: z.string().trim().min(1),
    transcript: z.string().trim().default(""),
    ocrText: z.string().trim().default(""),
    shotType: ShotTypeSchema.default("unknown"),
    cameraMovement: CameraMovementSchema.default("unknown"),
    composition: z.string().trim().default(""),
    transition: z.string().trim().default(""),
    mood: z.string().trim().default(""),
    action: z.string().trim().default(""),
    keyElements: z.array(z.string().trim().min(1)).default([]),
    productVisibility: ProductVisibilitySchema.default("uncertain"),
    visibleProductParts: z.array(z.string().trim().min(1)).default([]),
    suitableSceneRoles: z.array(SceneRoleSchema).default([]),
    qualitySignals: AssetQualitySignalsSchema.default({}),
    searchText: z.string().trim().min(1),
    embeddingText: z.string().trim().min(1),
    cosFrameObjectKeys: z.array(z.string().trim().min(1)).default([]),
  })
  .refine((slice) => slice.endSecond > slice.startSecond, {
    message: "Slice endSecond must be greater than startSecond.",
    path: ["endSecond"],
  });

export const CommerceNarrativeSegmentSchema = z
  .object({
    role: SceneRoleSchema,
    startSecond: z.number().min(0),
    endSecond: z.number().positive(),
    summary: z.string().trim().min(1),
    copywriting: z.string().trim().min(1),
    visualPrompt: z.string().trim().min(1),
  })
  .refine((segment) => segment.endSecond > segment.startSecond, {
    message: "Narrative segment endSecond must be greater than startSecond.",
    path: ["endSecond"],
  });

export const ReferenceVideoAnalysisSchema = z.object({
  referenceId: z.string().trim().min(1),
  sourceUrl: z.string().trim().min(1),
  sourcePlatform: z.string().trim().min(1),
  sourceDeclaration: z.string().trim().min(1),
  title: z.string().trim().min(1),
  author: z.string().trim().min(1).optional(),
  publicStats: z
    .object({
      likes: z.number().int().nonnegative().default(0),
      comments: z.number().int().nonnegative().default(0),
      shares: z.number().int().nonnegative().default(0),
      views: z.number().int().nonnegative().default(0),
    })
    .default({ likes: 0, comments: 0, shares: 0, views: 0 }),
  durationSeconds: z.number().positive().optional(),
  category: z.string().trim().min(1),
  hookScore: z.number().min(0).max(1),
  hookAnalysis: z.string().trim().min(1),
  pacingAnalysis: z.string().trim().min(1),
  emotionalArc: z.array(z.string().trim().min(1)).default([]),
  targetAudience: z.array(z.string().trim().min(1)).default([]),
  contentFormula: z.string().trim().min(1),
  keyViralFactors: z.array(z.string().trim().min(1)).default([]),
  commerceNarrativeSegments: z.array(CommerceNarrativeSegmentSchema).default([]),
  recreationBlueprint: z.object({
    visual: z.string().trim().min(1),
    copywriting: z.string().trim().min(1),
    shootingGuide: z.string().trim().min(1),
  }),
  commentInsights: z.array(z.string().trim().min(1)).default([]),
  derivedTemplates: z.array(z.string().trim().min(1)).default([]),
});

export const ReferenceVideoSchema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
  sourceAssetId: z.string().trim().min(1).optional(),
  sourceUrl: z.string().trim().min(1),
  sourcePlatform: z.string().trim().min(1),
  sourceDeclaration: z.string().trim().min(1),
  title: z.string().trim().min(1),
  author: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1),
  publicStats: ReferenceVideoAnalysisSchema.shape.publicStats,
  status: ReferenceVideoStatusSchema,
  analysis: ReferenceVideoAnalysisSchema.optional(),
  errorMessage: z.string().trim().min(1).optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const AssetProcessingEventSchema = z.object({
  id: z.string().trim().min(1),
  jobId: z.string().trim().min(1),
  assetId: z.string().trim().min(1),
  step: z.string().trim().min(1),
  status: TraceEventStatusSchema,
  message: z.string().trim().min(1),
  progress: z.number().min(0).max(100).default(0),
  retryable: z.boolean().default(false),
  createdAt: IsoDateTimeSchema,
});

export const ViralTemplateSchema = z.object({
  templateId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  category: z.string().trim().min(1),
  strategy: z.string().trim().min(1),
  factorSet: z.array(z.string().trim().min(1)).default([]),
  narrativeStructure: z.array(SceneRoleSchema).min(1),
  shotRequirements: z.array(z.string().trim().min(1)).default([]),
  copywritingRules: z.array(z.string().trim().min(1)).default([]),
  riskRules: z.array(z.string().trim().min(1)).default([]),
  sourceReferenceIds: z.array(z.string().trim().min(1)).default([]),
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
  structuredMetadata: StructuredAssetMetadataSchema.optional(),
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
  thumbnailKey: z.string().trim().min(1).optional(),
  embeddingText: z.string().trim().min(1).optional(),
  searchText: z.string().trim().min(1).optional(),
  metadata: StructuredSliceMetadataSchema.optional(),
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
  type: z.enum(["image", "video", "audio", "text"]),
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
  credentialSource: z.enum(["custom", "official"]).default("custom"),
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

const UserModelApiSettingsSchema = z.object({
  credentialSource: z.enum(["custom", "official"]).default("custom"),
  provider: z.string().trim().min(1).max(120).optional(),
  apiBaseUrl: z.string().trim().url().max(500).optional(),
  model: z.string().trim().min(1).max(200).optional(),
  apiKey: z.string().trim().min(1).max(4000).optional(),
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
          referenceImages: z.array(z.string().trim().min(1)).max(14).default([]).optional(),
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
      general: UserModelApiSettingsSchema.optional(),
      image: UserModelApiSettingsSchema.optional(),
      video: UserModelApiSettingsSchema.optional(),
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
  assetRecallQuery: z.string().trim().min(1).optional(),
  imageUrl: z.string().trim().min(1).optional(),
  assetId: z.string().trim().min(1).optional(),
  status: SceneStatusSchema,
});

export const ScriptResultSchema = z
  .object({
    id: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
    displayName: z.string().trim().min(1).max(80).optional(),
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

export const ScriptGenerationMaterialSchema = z.object({
  assetId: z.string().trim().min(1).optional(),
  bucketId: z.string().trim().min(1).optional(),
  mimeType: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  sizeBytes: z.number().int().positive().optional(),
  source: z.enum(["file", "library"]).optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  type: z.string().trim().min(1).optional(),
});

export const ScriptGenerationRequestSchema = z.object({
  assetIds: z.array(z.string().trim().min(1)).max(50).default([]),
  draftScript: z.string().trim().max(5000).optional(),
  keywords: z.array(z.string().trim().min(1)).max(40).default([]),
  materials: z.array(ScriptGenerationMaterialSchema).max(80).default([]),
  productionMode: z.enum(["automatic", "viral-remix", "template", "agentic"]).default("automatic"),
  referenceId: z.string().trim().min(1).optional(),
  templateId: z.string().trim().min(1).optional(),
  apiConfig: InspirationGenerateRequestSchema.shape.apiConfig,
});

export const SceneUpdateSchema = z
  .object({
    durationSeconds: z.number().positive().max(15).optional(),
    subtitle: z.string().trim().min(1).optional(),
    voiceover: z.string().trim().min(1).optional(),
    visualPrompt: z.string().trim().min(1).optional(),
    assetRecallQuery: z.string().trim().min(1).nullable().optional(),
    imageUrl: z.string().trim().min(1).optional(),
    assetId: z.string().trim().min(1).nullable().optional(),
    status: SceneStatusSchema.optional(),
  })
  .refine((update) => Object.keys(update).length > 0, {
    message: "At least one scene field is required.",
  });

export const SceneRegenerationRequestSchema = z.object({
  scene: SceneUpdateSchema.optional(),
  apiConfig: InspirationGenerateRequestSchema.shape.apiConfig,
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

export const VideoGenerationSettingsSchema = z.object({
  ratio: z.enum(["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"]).default("9:16"),
  resolution: z.enum(["480p", "720p", "1080p"]).default("720p"),
  generateAudio: z.boolean().default(true),
  watermark: z.boolean().default(false),
  seed: z.number().int().min(-1).max(2_147_483_647).optional(),
});

export const RenderRequestSchema = z.object({
  mediaSettings: MediaSettingsSchema.default({
    bgmTrack: "creator-pop",
    subtitleStyle: "clean-lower-third",
    subtitlesEnabled: true,
    ttsVoice: "clear-host",
  }),
  videoSettings: VideoGenerationSettingsSchema.default({
    ratio: "9:16",
    resolution: "720p",
    generateAudio: true,
    watermark: false,
  }),
  simulateFailure: z.boolean().default(false),
});

export const SmartEditTransitionSchema = z.enum(["cut", "fade", "crossfade", "wipe"]);

export const SmartEditTimelineTrackSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(["video", "audio", "text", "bgm"]),
  label: z.string().trim().min(1),
  muted: z.boolean().default(false),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
});

export const SmartEditVisualEffectParamKeyframeSchema = z.object({
  id: z.string().trim().min(1),
  timeSecond: z.number().min(0).max(120),
  param: z.enum(["amount"]),
  value: z.number().min(-2).max(20),
  easing: z.enum(["linear", "hold"]).default("linear"),
});

export const SmartEditVisualEffectSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(["blur", "sharpen", "brightness", "contrast", "saturation", "vignette"]),
  enabled: z.boolean().default(true),
  params: z
    .object({
      amount: z.number().min(-2).max(20).default(1),
      radius: z.number().min(0).max(20).default(4),
    })
    .default({ amount: 1, radius: 4 }),
  keyframes: z.array(SmartEditVisualEffectParamKeyframeSchema).max(40).optional(),
});

export const SmartEditAudioVolumeKeyframeSchema = z.object({
  easing: z.enum(["linear", "hold"]).default("linear"),
  id: z.string().trim().min(1),
  timeSecond: z.number().min(0).max(120),
  volume: z.number().min(0).max(4),
});

export const SmartEditAudioWaveformBucketSchema = z.object({
  durationSeconds: z.number().positive().max(10),
  index: z.number().int().min(0),
  peak: z.number().min(0).max(1),
  rms: z.number().min(0).max(1),
  startSecond: z.number().min(0).max(600),
});

export const SmartEditAudioWaveformSchema = z.object({
  bucketDurationSeconds: z.number().positive().max(10),
  buckets: z.array(SmartEditAudioWaveformBucketSchema).min(1).max(240),
  durationSeconds: z.number().positive().max(600),
  sampleRate: z.number().int().positive().max(192000),
});

export const SmartEditTimelineElementSchema = z
  .object({
    id: z.string().trim().min(1),
    trackId: z.string().trim().min(1),
    kind: z.enum(["video", "audio", "text", "bgm"]),
    sceneId: z.string().trim().min(1).optional(),
    segmentId: z.string().trim().min(1).optional(),
    linkedGroupId: z.string().trim().min(1).optional(),
    sourceUrl: z.string().trim().min(1).optional(),
    sourceObjectKey: z.string().trim().min(1).optional(),
    text: z.string().trim().optional(),
    textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).optional(),
    textFontSize: z.number().min(12).max(72).optional(),
    textPositionYPercent: z.number().min(8).max(92).optional(),
    label: z.string().trim().min(1),
    startSecond: z.number().min(0),
    durationSeconds: z.number().positive().max(120),
    trimStartSecond: z.number().min(0).default(0),
    trimEndSecond: z.number().min(0).optional(),
    sourceDurationSeconds: z.number().positive().optional(),
    playbackRate: z.number().min(0.25).max(4).default(1),
    audioVolume: z.number().min(0).max(4).optional(),
    audioVolumeKeyframes: z.array(SmartEditAudioVolumeKeyframeSchema).max(40).optional(),
    audioWaveform: SmartEditAudioWaveformSchema.optional(),
    audioFadeInSeconds: z.number().min(0).max(10).optional(),
    audioFadeOutSeconds: z.number().min(0).max(10).optional(),
    muted: z.boolean().default(false),
    hidden: z.boolean().default(false),
    detachedAudio: z.boolean().default(false),
    visualEffects: z.array(SmartEditVisualEffectSchema).max(20).optional(),
  })
  .superRefine((element, context) => {
    if (
      element.trimEndSecond !== undefined &&
      element.trimEndSecond <= element.trimStartSecond
    ) {
      context.addIssue({
        code: "custom",
        message: "trimEndSecond must be greater than trimStartSecond.",
        path: ["trimEndSecond"],
      });
    }
  });

export const SmartEditTimelineSchema = z.object({
  scale: z.number().positive().default(1),
  durationSeconds: z.number().min(0).max(600),
  tracks: z.array(SmartEditTimelineTrackSchema).default([]),
  elements: z.array(SmartEditTimelineElementSchema).default([]),
});

export const SmartEditSourceSchema = z
  .object({
    assetId: z.string().trim().min(1).optional(),
    sliceId: z.string().trim().min(1).optional(),
    sceneClipUrl: z.string().trim().min(1).optional(),
    sceneClipVideoOnlyUrl: z.string().trim().min(1).optional(),
    sceneClipAudioUrl: z.string().trim().min(1).optional(),
    sceneClipAudioWaveform: SmartEditAudioWaveformSchema.optional(),
    imageUrl: z.string().trim().min(1).optional(),
    startSecond: z.number().min(0).optional(),
    endSecond: z.number().positive().optional(),
    kind: z.enum(["video-slice", "image-asset", "generated-scene-clip", "fallback-still"]),
  })
  .superRefine((source, context) => {
    if (!source.assetId && !source.sceneClipUrl && !source.imageUrl) {
      context.addIssue({
        code: "custom",
        message: "Smart edit source requires assetId, sceneClipUrl, or imageUrl.",
        path: ["assetId"],
      });
    }
    if (
      source.startSecond !== undefined &&
      source.endSecond !== undefined &&
      source.endSecond <= source.startSecond
    ) {
      context.addIssue({
        code: "custom",
        message: "Smart edit source endSecond must be greater than startSecond.",
        path: ["endSecond"],
      });
    }
  });

export const SmartEditTransformSchema = z.object({
  scale: z.number().min(0.1).max(4).default(1),
  rotateDegrees: z.number().min(-180).max(180).default(0),
  offsetXPercent: z.number().min(-100).max(100).default(0),
  offsetYPercent: z.number().min(-100).max(100).default(0),
  opacity: z.number().min(0).max(1).default(1),
});

export const SmartEditEffectsSchema = z.object({
  blur: z.number().min(0).max(20).default(0),
  sharpen: z.number().min(0).max(2).default(0),
  fadeInSeconds: z.number().min(0).max(5).default(0),
  fadeOutSeconds: z.number().min(0).max(5).default(0),
});

export const SmartEditVisualMaskSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(["rectangle", "ellipse"]),
  inverted: z.boolean().default(false),
  xPercent: z.number().min(0).max(100).default(50),
  yPercent: z.number().min(0).max(100).default(50),
  widthPercent: z.number().min(1).max(100).default(80),
  heightPercent: z.number().min(1).max(100).default(80),
});

export const SmartEditVisualKeyframeSchema = z.object({
  id: z.string().trim().min(1),
  timeSecond: z.number().min(0).max(120),
  transform: SmartEditTransformSchema,
  effects: SmartEditEffectsSchema.optional(),
  easing: z.enum(["linear", "hold"]).default("linear"),
});

export const SmartEditSegmentOverrideSchema = z.object({
  sceneId: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  durationSeconds: z.number().min(0.25).max(120).optional(),
  timelineStartSecond: z.number().min(0).max(600).optional(),
  playbackRate: z.number().min(0.25).max(4).default(1),
  sourceAudioMuted: z.boolean().default(false),
  sourceAudioStartOffsetSeconds: z.number().min(0).max(120).default(0),
  sourceAudioDurationSeconds: z.number().positive().max(120).optional(),
  sourceAudioVolume: z.number().min(0).max(4).optional(),
  sourceAudioVolumeKeyframes: z.array(SmartEditAudioVolumeKeyframeSchema).max(40).optional(),
  sourceAudioFadeInSeconds: z.number().min(0).max(10).optional(),
  sourceAudioFadeOutSeconds: z.number().min(0).max(10).optional(),
  captionHidden: z.boolean().default(false),
  captionStartOffsetSeconds: z.number().min(0).max(120).default(0),
  captionDurationSeconds: z.number().positive().max(120).optional(),
  voiceoverStartOffsetSeconds: z.number().min(0).max(120).default(0),
  voiceoverDurationSeconds: z.number().positive().max(120).optional(),
  voiceoverVolume: z.number().min(0).max(4).optional(),
  voiceoverVolumeKeyframes: z.array(SmartEditAudioVolumeKeyframeSchema).max(40).optional(),
  voiceoverFadeInSeconds: z.number().min(0).max(10).optional(),
  voiceoverFadeOutSeconds: z.number().min(0).max(10).optional(),
  transition: SmartEditTransitionSchema.default("cut"),
  subtitle: z.string().trim().min(1).optional(),
  voiceover: z.string().trim().min(1).optional(),
  source: SmartEditSourceSchema.optional(),
  transform: SmartEditTransformSchema.optional(),
  effects: SmartEditEffectsSchema.optional(),
  visualEffects: z.array(SmartEditVisualEffectSchema).max(20).optional(),
  visualMask: SmartEditVisualMaskSchema.optional(),
  visualKeyframes: z.array(SmartEditVisualKeyframeSchema).max(40).optional(),
});

export const SmartEditRequestSchema = z.object({
  apiConfig: InspirationGenerateRequestSchema.shape.apiConfig,
  locale: z.string().trim().min(2).max(20).default("zh-CN"),
  targetLanguage: z.string().trim().min(2).max(20).optional(),
  mediaSettings: MediaSettingsSchema.default({
    bgmTrack: "creator-pop",
    subtitleStyle: "clean-lower-third",
    subtitlesEnabled: true,
    ttsVoice: "clear-host",
  }),
  videoSettings: VideoGenerationSettingsSchema.default({
    ratio: "9:16",
    resolution: "720p",
    generateAudio: true,
    watermark: false,
  }),
  segments: z.array(SmartEditSegmentOverrideSchema).max(40).default([]),
  currentPlan: z.lazy(() => SmartEditPlanSchema).optional(),
  instructions: z.string().trim().max(2000).optional(),
});

export const SmartEditSegmentSchema = z.object({
  id: z.string().trim().min(1),
  sceneId: z.string().trim().min(1),
  order: z.number().int().min(1),
  enabled: z.boolean().default(true),
  durationSeconds: z.number().min(0.25).max(120),
  timelineStartSecond: z.number().min(0).max(600).default(0),
  playbackRate: z.number().min(0.25).max(4).default(1),
  sourceAudioMuted: z.boolean().default(false),
  sourceAudioStartOffsetSeconds: z.number().min(0).max(120).default(0),
  sourceAudioDurationSeconds: z.number().positive().max(120).optional(),
  sourceAudioVolume: z.number().min(0).max(4).optional(),
  sourceAudioVolumeKeyframes: z.array(SmartEditAudioVolumeKeyframeSchema).max(40).optional(),
  sourceAudioFadeInSeconds: z.number().min(0).max(10).optional(),
  sourceAudioFadeOutSeconds: z.number().min(0).max(10).optional(),
  captionHidden: z.boolean().default(false),
  captionStartOffsetSeconds: z.number().min(0).max(120).default(0),
  captionDurationSeconds: z.number().positive().max(120).optional(),
  voiceoverStartOffsetSeconds: z.number().min(0).max(120).default(0),
  voiceoverDurationSeconds: z.number().positive().max(120).optional(),
  voiceoverVolume: z.number().min(0).max(4).optional(),
  voiceoverVolumeKeyframes: z.array(SmartEditAudioVolumeKeyframeSchema).max(40).optional(),
  voiceoverFadeInSeconds: z.number().min(0).max(10).optional(),
  voiceoverFadeOutSeconds: z.number().min(0).max(10).optional(),
  transition: SmartEditTransitionSchema.default("cut"),
  subtitle: z.string().trim().min(1),
  voiceover: z.string().trim().min(1),
  source: SmartEditSourceSchema,
  transform: SmartEditTransformSchema.optional(),
  effects: SmartEditEffectsSchema.optional(),
  visualEffects: z.array(SmartEditVisualEffectSchema).max(20).optional(),
  visualMask: SmartEditVisualMaskSchema.optional(),
  visualKeyframes: z.array(SmartEditVisualKeyframeSchema).max(40).optional(),
  assetTags: z.array(z.string().trim().min(1)).default([]),
  rationale: z.string().trim().min(1),
});

export const SmartEditAudioPlanSchema = z.object({
  bgmTrack: MediaSettingsSchema.shape.bgmTrack.default("creator-pop"),
  targetLanguage: z.string().trim().min(2).max(20).optional(),
  voice: MediaSettingsSchema.shape.ttsVoice.default("clear-host"),
});

export const SmartEditPlanSchema = z
  .object({
    id: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
    strategy: z.string().trim().min(1),
    targetDurationSeconds: z.number().positive().max(600),
    segments: z.array(SmartEditSegmentSchema).min(1).max(40),
    audio: SmartEditAudioPlanSchema,
    timeline: SmartEditTimelineSchema.optional(),
    createdAt: IsoDateTimeSchema,
  })
  .superRefine((plan, context) => {
    const enabledDuration = plan.segments
      .filter((segment) => segment.enabled)
      .reduce((sum, segment) => sum + segment.durationSeconds, 0);
    if (enabledDuration > plan.targetDurationSeconds + 0.001) {
      context.addIssue({
        code: "custom",
        message: "Enabled smart edit segments exceed targetDurationSeconds.",
        path: ["segments"],
      });
    }
  });

export const SmartEditSegmentOutputSchema = z.object({
  segmentId: z.string().trim().min(1),
  sceneId: z.string().trim().min(1),
  objectKey: z.string().trim().min(1),
  videoUrl: z.string().trim().min(1),
});

export const SceneRenderClipMaterialSchema = z.object({
  audioObjectKey: z.string().trim().min(1).optional(),
  audioUrl: z.string().trim().min(1).optional(),
  audioWaveform: SmartEditAudioWaveformSchema.optional(),
  materializedAt: IsoDateTimeSchema,
  status: z.enum(["ready", "failed"]),
  text: z.string().trim().default(""),
  videoObjectKey: z.string().trim().min(1).optional(),
  videoOnlyUrl: z.string().trim().min(1).optional(),
  errorMessage: z.string().trim().min(1).optional(),
});

export const SmartEditSegmentRefreshRequestSchema = z.object({
  apiConfig: InspirationGenerateRequestSchema.shape.apiConfig,
  currentPlan: SmartEditPlanSchema,
  segmentOutputs: z.array(SmartEditSegmentOutputSchema).min(1).max(40),
  segment: SmartEditSegmentOverrideSchema.optional(),
  locale: z.string().trim().min(2).max(20).default("zh-CN"),
  targetLanguage: z.string().trim().min(2).max(20).optional(),
  mediaSettings: MediaSettingsSchema.default({
    bgmTrack: "creator-pop",
    subtitleStyle: "clean-lower-third",
    subtitlesEnabled: true,
    ttsVoice: "clear-host",
  }),
  videoSettings: VideoGenerationSettingsSchema.default({
    ratio: "9:16",
    resolution: "720p",
    generateAudio: true,
    watermark: false,
  }),
  instructions: z.string().trim().max(2000).optional(),
});

export const SceneRenderClipSchema = z.object({
  sceneId: z.string().trim().min(1),
  order: z.number().int().min(1),
  subtitle: z.string().trim().min(1),
  status: RenderTaskStatusSchema,
  progress: z.number().min(0).max(100).default(0),
  providerTaskId: z.string().trim().min(1).optional(),
  videoUrl: z.string().trim().min(1).optional(),
  coverUrl: z.string().trim().min(1).optional(),
  material: SceneRenderClipMaterialSchema.optional(),
  errorMessage: z.string().trim().min(1).optional(),
});

export const RenderTaskSchema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  displayName: z.string().trim().min(1).max(80).optional(),
  status: RenderTaskStatusSchema,
  progress: z.number().min(0).max(100),
  previewUrl: z.string().trim().min(1).optional(),
  exportUrl: z.string().trim().min(1).optional(),
  errorMessage: z.string().trim().min(1).optional(),
  provider: z.string().trim().min(1).optional(),
  providerTaskId: z.string().trim().min(1).optional(),
  sceneClips: z.array(SceneRenderClipSchema).optional(),
  mediaSettings: MediaSettingsSchema.optional(),
  videoSettings: VideoGenerationSettingsSchema.optional(),
  smartEditPlan: SmartEditPlanSchema.optional(),
  smartEditSegmentOutputs: z.array(SmartEditSegmentOutputSchema).optional(),
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

export const SmartEditResultSchema = z.object({
  segmentOutputs: z.array(SmartEditSegmentOutputSchema).default([]),
  plan: SmartEditPlanSchema,
  renderTaskId: z.string().trim().min(1),
  previewUrl: z.string().trim().min(1),
  exportUrl: z.string().trim().min(1),
  traceEvents: z.array(TraceEventSchema).default([]),
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
