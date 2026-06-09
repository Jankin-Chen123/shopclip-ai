import type { Prisma } from "@prisma/client";
import type {
  AssetMetadata,
  AssetSlice,
  ReferenceVideo,
  ReferenceVideoAnalysis,
  RenderTask,
  StoryboardScene,
  TraceEvent,
  ViralTemplate,
} from "@shopclip/shared";

import { toDbStorageProvider } from "./prismaProjectMappers.js";

export const toAssetSliceCreateData = (
  slice: Omit<AssetSlice, "id" | "assetId">,
  createId: () => string,
) => ({
  id: createId(),
  label: slice.label,
  startSecond: slice.startSecond,
  endSecond: slice.endSecond,
  tags: slice.tags,
  thumbnailKey: slice.thumbnailKey,
  embeddingText: slice.embeddingText,
  searchText: slice.searchText,
  metadata: slice.metadata as Prisma.InputJsonValue | undefined,
});

export const toAssetUpdateData = (
  update: Partial<
    Pick<
      AssetMetadata,
      | "embeddingText"
      | "metadata"
      | "mimeType"
      | "objectKey"
      | "sizeBytes"
      | "source"
      | "status"
      | "storageProvider"
      | "tags"
      | "thumbnailKey"
      | "url"
    >
  >,
  currentMetadata: Record<string, unknown>,
) => ({
  embeddingText: update.embeddingText,
  metadata: update.metadata
    ? ({ ...currentMetadata, ...update.metadata } as Prisma.InputJsonValue)
    : undefined,
  mimeType: update.mimeType,
  objectKey: update.objectKey,
  sizeBytes: update.sizeBytes,
  source: update.source,
  status: update.status,
  storageProvider: toDbStorageProvider(update.storageProvider),
  tags: update.tags,
  thumbnailKey: update.thumbnailKey,
  url: update.url,
});

export const toReferenceAnalysisUpdateData = (
  analysis: ReferenceVideoAnalysis,
  createId: () => string,
) => ({
  status: "ready" as const,
  analysis: analysis as Prisma.InputJsonValue,
  publicStats: analysis.publicStats as Prisma.InputJsonValue,
  segments: {
    deleteMany: {},
    create: analysis.commerceNarrativeSegments.map((segment) => ({
      id: createId(),
      role: segment.role,
      startSecond: segment.startSecond,
      endSecond: segment.endSecond,
      summary: segment.summary,
      copywriting: segment.copywriting,
      visualPrompt: segment.visualPrompt,
    })),
  },
});

export const toReferenceVideoUpdateData = (
  update: Partial<
    Pick<ReferenceVideo, "errorMessage" | "publicStats" | "sourceAssetId" | "sourceUrl" | "status">
  >,
) => ({
  errorMessage:
    update.errorMessage === undefined && update.status && update.status !== "failed"
      ? null
      : update.errorMessage,
  publicStats: update.publicStats as Prisma.InputJsonValue | undefined,
  sourceAssetId: update.sourceAssetId,
  sourceUrl: update.sourceUrl,
  status: update.status,
});

export const toViralTemplateCreateData = (
  template: ViralTemplate,
  projectId: string | null | undefined,
) => ({
  id: template.templateId,
  ...toViralTemplateUpdateData(template, projectId),
});

export const toViralTemplateUpdateData = (
  template: ViralTemplate,
  projectId: string | null | undefined,
) => ({
  projectId,
  name: template.name,
  category: template.category,
  strategy: template.strategy,
  factorSet: template.factorSet,
  narrativeStructure: template.narrativeStructure,
  shotRequirements: template.shotRequirements,
  copywritingRules: template.copywritingRules,
  riskRules: template.riskRules,
  sourceReferenceIds: template.sourceReferenceIds,
});

export const toScriptSceneCreateData = (
  scene: StoryboardScene,
  projectId: string,
  createId: () => string,
) => ({
  id: createId(),
  projectId,
  order: scene.order,
  durationSeconds: scene.durationSeconds,
  subtitle: scene.subtitle,
  voiceover: scene.voiceover,
  visualPrompt: scene.visualPrompt,
  assetRecallQuery: scene.assetRecallQuery,
  imageUrl: scene.imageUrl,
  assetId: scene.assetId,
  status: scene.status,
});

export const toTraceEventCreateData = (
  event: Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">,
  createId: () => string,
) => ({
  id: createId(),
  status: event.status,
  step: event.step,
  message: event.message,
  retryOfTraceEventId: event.retryOfTraceEventId,
});

export const toRenderTaskCreateData = (
  projectId: string,
  renderTask: Omit<RenderTask, "id" | "projectId" | "createdAt" | "updatedAt">,
  traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">>,
  createId: () => string,
) => ({
  id: createId(),
  projectId,
  displayName: renderTask.displayName,
  status: renderTask.status,
  progress: renderTask.progress,
  previewUrl: renderTask.previewUrl,
  exportUrl: renderTask.exportUrl,
  errorMessage: renderTask.errorMessage,
  provider: renderTask.provider,
  providerTaskId: renderTask.providerTaskId,
  sceneClips: renderTask.sceneClips as Prisma.InputJsonValue | undefined,
  mediaSettings: renderTask.mediaSettings as Prisma.InputJsonValue | undefined,
  videoSettings: renderTask.videoSettings as Prisma.InputJsonValue | undefined,
  smartEditPlan: renderTask.smartEditPlan as Prisma.InputJsonValue | undefined,
  smartEditSegmentOutputs: renderTask.smartEditSegmentOutputs as Prisma.InputJsonValue | undefined,
  retryOfRenderTaskId: renderTask.retryOfRenderTaskId,
  traceEvents: {
    create: traceEvents.map((event) => toTraceEventCreateData(event, createId)),
  },
});

export const toRenderTaskUpdateData = (
  update: Partial<Omit<RenderTask, "id" | "projectId" | "createdAt" | "updatedAt">>,
  traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">>,
  createId: () => string,
) => ({
  status: update.status,
  displayName: update.displayName,
  progress: update.progress,
  previewUrl: update.previewUrl,
  exportUrl: update.exportUrl,
  errorMessage: update.errorMessage,
  provider: update.provider,
  providerTaskId: update.providerTaskId,
  sceneClips: update.sceneClips as Prisma.InputJsonValue | undefined,
  mediaSettings: update.mediaSettings as Prisma.InputJsonValue | undefined,
  videoSettings: update.videoSettings as Prisma.InputJsonValue | undefined,
  smartEditPlan: update.smartEditPlan as Prisma.InputJsonValue | undefined,
  smartEditSegmentOutputs: update.smartEditSegmentOutputs as Prisma.InputJsonValue | undefined,
  retryOfRenderTaskId: update.retryOfRenderTaskId,
  traceEvents: {
    create: traceEvents.map((event) => toTraceEventCreateData(event, createId)),
  },
});
