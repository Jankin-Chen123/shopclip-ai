import type { z } from "zod";

import type {
  AssetMetadataSchema,
  AssetProcessingEventSchema,
  AssetProcessingJobSchema,
  AssetQualitySignalsSchema,
  AssetRoleSchema,
  AssetSearchResponseSchema,
  AssetSearchResultSchema,
  AssetSliceSchema,
  AssetSourceSchema,
  AssetStatusSchema,
  AssetStorageProviderSchema,
  AssetTypeSchema,
  AssetUploadIntentSchema,
  CameraMovementSchema,
  CommerceNarrativeSegmentSchema,
  DashboardResponseSchema,
  EditingSuggestionSchema,
  ExternalAssetProviderConfigSchema,
  ExternalAssetProviderSchema,
  ExternalAssetResultSchema,
  ExternalAssetSearchRequestSchema,
  ExternalAssetSearchResponseSchema,
  InspirationAssetTypeSchema,
  InspirationGenerateRequestSchema,
  InspirationGenerateResponseSchema,
  InspirationMaterialSchema,
  InspirationMaterialStatusSchema,
  InspirationVideoTaskRequestSchema,
  InspirationVideoTaskResponseSchema,
  MediaSettingsSchema,
  ProductProfileSchema,
  ProductVisibilitySchema,
  ProjectBriefSchema,
  ProjectPrepUpdateSchema,
  ProjectSchema,
  ProjectStatusSchema,
  ProjectSummarySchema,
  ReferenceVideoSchema,
  ReferenceVideoStatusSchema,
  RenderRequestSchema,
  SceneRenderClipMaterialSchema,
  SceneRenderClipSchema,
  RenderTaskSchema,
  RenderTaskStatusSchema,
  SceneRegenerationRequestSchema,
  SceneRoleSchema,
  SceneStatusSchema,
  SceneUpdateSchema,
  ScriptGenerationMaterialSchema,
  ScriptGenerationRequestSchema,
  ScriptResultSchema,
  ShotTypeSchema,
  SmartEditAudioPlanSchema,
  SmartEditPlanSchema,
  SmartEditRequestSchema,
  SmartEditResultSchema,
  SmartEditEffectsSchema,
  SmartEditSegmentOutputSchema,
  SmartEditSegmentOverrideSchema,
  SmartEditSegmentRefreshRequestSchema,
  SmartEditSegmentSchema,
  SmartEditSourceSchema,
  SmartEditTimelineElementSchema,
  SmartEditTimelineSchema,
  SmartEditTimelineTrackSchema,
  SmartEditTransformSchema,
  SmartEditTransitionSchema,
  SmartEditVisualMaskSchema,
  SmartEditVisualKeyframeSchema,
  StoryboardSceneSchema,
  ReferenceVideoAnalysisSchema,
  StructuredAssetMetadataSchema,
  StructuredSliceMetadataSchema,
  TraceEventSchema,
  TraceEventStatusSchema,
  ViralTemplateSchema,
  VisualIdentitySchema,
  VideoGenerationSettingsSchema,
} from "./schemas.js";

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type AssetType = z.infer<typeof AssetTypeSchema>;
export type AssetStatus = z.infer<typeof AssetStatusSchema>;
export type AssetSource = z.infer<typeof AssetSourceSchema>;
export type AssetStorageProvider = z.infer<typeof AssetStorageProviderSchema>;
export type AssetRole = z.infer<typeof AssetRoleSchema>;
export type SceneRole = z.infer<typeof SceneRoleSchema>;
export type ProductVisibility = z.infer<typeof ProductVisibilitySchema>;
export type ShotType = z.infer<typeof ShotTypeSchema>;
export type CameraMovement = z.infer<typeof CameraMovementSchema>;
export type InspirationAssetType = z.infer<typeof InspirationAssetTypeSchema>;
export type InspirationMaterialStatus = z.infer<typeof InspirationMaterialStatusSchema>;
export type SceneStatus = z.infer<typeof SceneStatusSchema>;
export type RenderTaskStatus = z.infer<typeof RenderTaskStatusSchema>;
export type TraceEventStatus = z.infer<typeof TraceEventStatusSchema>;
export type ReferenceVideoStatus = z.infer<typeof ReferenceVideoStatusSchema>;

export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;
export type ProjectPrepUpdate = z.infer<typeof ProjectPrepUpdateSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
export type VisualIdentity = z.infer<typeof VisualIdentitySchema>;
export type ProductProfile = z.infer<typeof ProductProfileSchema>;
export type AssetQualitySignals = z.infer<typeof AssetQualitySignalsSchema>;
export type StructuredAssetMetadata = z.infer<typeof StructuredAssetMetadataSchema>;
export type StructuredSliceMetadata = z.infer<typeof StructuredSliceMetadataSchema>;
export type CommerceNarrativeSegment = z.infer<typeof CommerceNarrativeSegmentSchema>;
export type ReferenceVideoAnalysis = z.infer<typeof ReferenceVideoAnalysisSchema>;
export type ReferenceVideo = z.infer<typeof ReferenceVideoSchema>;
export type ViralTemplate = z.infer<typeof ViralTemplateSchema>;
export type AssetMetadata = z.infer<typeof AssetMetadataSchema>;
export type AssetUploadIntent = z.infer<typeof AssetUploadIntentSchema>;
export type AssetProcessingEvent = z.infer<typeof AssetProcessingEventSchema>;
export type AssetProcessingJob = z.infer<typeof AssetProcessingJobSchema>;
export type AssetSlice = z.infer<typeof AssetSliceSchema>;
export type AssetSearchResult = z.infer<typeof AssetSearchResultSchema>;
export type AssetSearchResponse = z.infer<typeof AssetSearchResponseSchema>;
export type ExternalAssetProviderName = z.infer<typeof ExternalAssetProviderSchema>;
export type ExternalAssetProviderConfig = z.infer<typeof ExternalAssetProviderConfigSchema>;
export type ExternalAssetResult = z.infer<typeof ExternalAssetResultSchema>;
export type ExternalAssetSearchRequest = z.infer<typeof ExternalAssetSearchRequestSchema>;
export type ExternalAssetSearchResponse = z.infer<typeof ExternalAssetSearchResponseSchema>;
export type InspirationGenerateRequest = z.infer<typeof InspirationGenerateRequestSchema>;
export type InspirationMaterial = z.infer<typeof InspirationMaterialSchema>;
export type InspirationGenerateResponse = z.infer<typeof InspirationGenerateResponseSchema>;
export type InspirationVideoTaskRequest = z.infer<typeof InspirationVideoTaskRequestSchema>;
export type InspirationVideoTaskResponse = z.infer<typeof InspirationVideoTaskResponseSchema>;
export type StoryboardScene = z.infer<typeof StoryboardSceneSchema>;
export type ScriptResult = z.infer<typeof ScriptResultSchema>;
export type ScriptGenerationMaterial = z.infer<typeof ScriptGenerationMaterialSchema>;
export type ScriptGenerationRequest = z.infer<typeof ScriptGenerationRequestSchema>;
export type SceneUpdate = z.infer<typeof SceneUpdateSchema>;
export type SceneRegenerationRequest = z.infer<typeof SceneRegenerationRequestSchema>;
export type EditingSuggestion = z.infer<typeof EditingSuggestionSchema>;
export type MediaSettings = z.infer<typeof MediaSettingsSchema>;
export type VideoGenerationSettings = z.infer<typeof VideoGenerationSettingsSchema>;
export type RenderRequest = z.infer<typeof RenderRequestSchema>;
export type SmartEditTransition = z.infer<typeof SmartEditTransitionSchema>;
export type SmartEditSource = z.infer<typeof SmartEditSourceSchema>;
export type SmartEditTransform = z.infer<typeof SmartEditTransformSchema>;
export type SmartEditEffects = z.infer<typeof SmartEditEffectsSchema>;
export type SmartEditVisualMask = z.infer<typeof SmartEditVisualMaskSchema>;
export type SmartEditVisualKeyframe = z.infer<typeof SmartEditVisualKeyframeSchema>;
export type SmartEditTimelineTrack = z.infer<typeof SmartEditTimelineTrackSchema>;
export type SmartEditTimelineElement = z.infer<typeof SmartEditTimelineElementSchema>;
export type SmartEditTimeline = z.infer<typeof SmartEditTimelineSchema>;
export type SmartEditSegmentOverride = z.infer<typeof SmartEditSegmentOverrideSchema>;
export type SmartEditSegmentOutput = z.infer<typeof SmartEditSegmentOutputSchema>;
export type SmartEditSegmentRefreshRequest = z.infer<
  typeof SmartEditSegmentRefreshRequestSchema
>;
export type SmartEditRequest = z.infer<typeof SmartEditRequestSchema>;
export type SmartEditSegment = z.infer<typeof SmartEditSegmentSchema>;
export type SmartEditAudioPlan = z.infer<typeof SmartEditAudioPlanSchema>;
export type SmartEditPlan = z.infer<typeof SmartEditPlanSchema>;
export type SmartEditResult = z.infer<typeof SmartEditResultSchema>;
export type SceneRenderClipMaterial = z.infer<typeof SceneRenderClipMaterialSchema>;
export type SceneRenderClip = z.infer<typeof SceneRenderClipSchema>;
export type RenderTask = z.infer<typeof RenderTaskSchema>;
export type TraceEvent = z.infer<typeof TraceEventSchema>;
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
