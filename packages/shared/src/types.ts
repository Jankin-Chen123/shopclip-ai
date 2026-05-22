import type { z } from "zod";

import type {
  AssetMetadataSchema,
  AssetSearchResponseSchema,
  AssetSearchResultSchema,
  AssetSliceSchema,
  AssetStatusSchema,
  AssetTypeSchema,
  DashboardResponseSchema,
  EditingSuggestionSchema,
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
export type SceneStatus = z.infer<typeof SceneStatusSchema>;
export type RenderTaskStatus = z.infer<typeof RenderTaskStatusSchema>;
export type TraceEventStatus = z.infer<typeof TraceEventStatusSchema>;

export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type AssetMetadata = z.infer<typeof AssetMetadataSchema>;
export type AssetSlice = z.infer<typeof AssetSliceSchema>;
export type AssetSearchResult = z.infer<typeof AssetSearchResultSchema>;
export type AssetSearchResponse = z.infer<typeof AssetSearchResponseSchema>;
export type StoryboardScene = z.infer<typeof StoryboardSceneSchema>;
export type ScriptResult = z.infer<typeof ScriptResultSchema>;
export type SceneUpdate = z.infer<typeof SceneUpdateSchema>;
export type EditingSuggestion = z.infer<typeof EditingSuggestionSchema>;
export type MediaSettings = z.infer<typeof MediaSettingsSchema>;
export type RenderRequest = z.infer<typeof RenderRequestSchema>;
export type RenderTask = z.infer<typeof RenderTaskSchema>;
export type TraceEvent = z.infer<typeof TraceEventSchema>;
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
