import type { z } from "zod";

import type {
  AssetMetadataSchema,
  AssetProcessingJobSchema,
  AssetSearchResponseSchema,
  AssetSearchResultSchema,
  AssetSliceSchema,
  AssetSourceSchema,
  AssetStatusSchema,
  AssetStorageProviderSchema,
  AssetTypeSchema,
  AssetUploadIntentSchema,
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
  ProjectBriefSchema,
  ProjectSchema,
  ProjectStatusSchema,
  RenderRequestSchema,
  RenderTaskSchema,
  RenderTaskStatusSchema,
  SceneStatusSchema,
  SceneUpdateSchema,
  ScriptResultSchema,
  StoryboardSceneSchema,
  TraceEventSchema,
  TraceEventStatusSchema,
} from "./schemas.js";

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type AssetType = z.infer<typeof AssetTypeSchema>;
export type AssetStatus = z.infer<typeof AssetStatusSchema>;
export type AssetSource = z.infer<typeof AssetSourceSchema>;
export type AssetStorageProvider = z.infer<typeof AssetStorageProviderSchema>;
export type InspirationAssetType = z.infer<typeof InspirationAssetTypeSchema>;
export type InspirationMaterialStatus = z.infer<typeof InspirationMaterialStatusSchema>;
export type SceneStatus = z.infer<typeof SceneStatusSchema>;
export type RenderTaskStatus = z.infer<typeof RenderTaskStatusSchema>;
export type TraceEventStatus = z.infer<typeof TraceEventStatusSchema>;

export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type AssetMetadata = z.infer<typeof AssetMetadataSchema>;
export type AssetUploadIntent = z.infer<typeof AssetUploadIntentSchema>;
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
export type SceneUpdate = z.infer<typeof SceneUpdateSchema>;
export type EditingSuggestion = z.infer<typeof EditingSuggestionSchema>;
export type MediaSettings = z.infer<typeof MediaSettingsSchema>;
export type RenderRequest = z.infer<typeof RenderRequestSchema>;
export type RenderTask = z.infer<typeof RenderTaskSchema>;
export type TraceEvent = z.infer<typeof TraceEventSchema>;
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
