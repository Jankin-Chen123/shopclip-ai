import type { AssetStorageProvider as PrismaAssetStorageProvider, Prisma } from "@prisma/client";
import type {
  AssetMetadata,
  AssetProcessingEvent,
  AssetProcessingJob,
  AssetSlice,
  ProjectSummary,
  ReferenceVideo,
  RenderTask,
  ScriptResult,
  StoryboardScene,
  TraceEvent,
  ViralTemplate,
} from "@shopclip/shared";
import {
  MediaSettingsSchema,
  ReferenceVideoAnalysisSchema,
  RenderTaskSchema,
  StructuredSliceMetadataSchema,
  VideoGenerationSettingsSchema,
} from "@shopclip/shared";

import type { ProjectSnapshot } from "./projectStore.js";

export type AssetWithSlices = Prisma.AssetGetPayload<{ include: { slices: true } }>;

export type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: typeof projectInclude;
}>;

export type RenderTaskWithRelations = Prisma.RenderTaskGetPayload<{
  include: {
    traceEvents: true;
    project: { include: typeof projectInclude };
  };
}>;

export const projectInclude = {
  assets: { include: { slices: true } },
  assetProcessingEvents: true,
  assetProcessingJobs: true,
  referenceVideos: true,
  viralTemplates: true,
  scripts: { include: { scenes: true } },
  scenes: true,
  renderTasks: true,
} as const;

export const toIso = (date: Date): string => date.toISOString();

export const toDbStorageProvider = (
  provider?: AssetMetadata["storageProvider"],
): PrismaAssetStorageProvider | undefined =>
  provider?.replaceAll("-", "_") as PrismaAssetStorageProvider | undefined;

const fromDbStorageProvider = (
  provider?: string | null,
): AssetMetadata["storageProvider"] | undefined =>
  provider ? (provider.replaceAll("_", "-") as AssetMetadata["storageProvider"]) : undefined;

export const toAsset = (asset: AssetWithSlices): AssetMetadata => ({
  id: asset.id,
  projectId: asset.projectId ?? undefined,
  type: asset.type,
  status: asset.status,
  source: asset.source,
  storageProvider: fromDbStorageProvider(asset.storageProvider),
  objectKey: asset.objectKey ?? undefined,
  thumbnailKey: asset.thumbnailKey ?? undefined,
  url: asset.url,
  name: asset.name,
  mimeType: asset.mimeType ?? undefined,
  sizeBytes: asset.sizeBytes ?? undefined,
  tags: asset.tags,
  embeddingText: asset.embeddingText ?? undefined,
  metadata:
    asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
      ? (asset.metadata as Record<string, unknown>)
      : undefined,
  createdAt: toIso(asset.createdAt),
  updatedAt: toIso(asset.updatedAt),
});

export const toAssetSlice = (slice: AssetWithSlices["slices"][number]): AssetSlice => ({
  id: slice.id,
  assetId: slice.assetId,
  label: slice.label,
  startSecond: slice.startSecond ?? undefined,
  endSecond: slice.endSecond ?? undefined,
  tags: slice.tags,
  thumbnailKey: slice.thumbnailKey ?? undefined,
  embeddingText: slice.embeddingText ?? undefined,
  searchText: slice.searchText ?? undefined,
  metadata: StructuredSliceMetadataSchema.safeParse(slice.metadata).success
    ? StructuredSliceMetadataSchema.parse(slice.metadata)
    : undefined,
});

export const toAssetProcessingEvent = (
  event: ProjectWithRelations["assetProcessingEvents"][number],
): AssetProcessingEvent => ({
  id: event.id,
  jobId: event.jobId,
  assetId: event.assetId,
  step: event.step,
  status: event.status,
  message: event.message,
  progress: event.progress,
  retryable: event.retryable,
  createdAt: toIso(event.createdAt),
});

export const toAssetProcessingJob = (
  job: ProjectWithRelations["assetProcessingJobs"][number],
): AssetProcessingJob => ({
  id: job.id,
  assetId: job.assetId,
  status: job.status,
  steps: job.steps,
  message: job.message,
  createdAt: toIso(job.createdAt),
});

export const toScene = (scene: ProjectWithRelations["scenes"][number]): StoryboardScene => ({
  id: scene.id,
  projectId: scene.projectId,
  order: scene.order,
  durationSeconds: scene.durationSeconds,
  subtitle: scene.subtitle,
  voiceover: scene.voiceover,
  visualPrompt: scene.visualPrompt,
  assetRecallQuery: scene.assetRecallQuery ?? undefined,
  imageUrl: scene.imageUrl ?? undefined,
  assetId: scene.assetId ?? undefined,
  status: scene.status,
});

export const toScript = (script: ProjectWithRelations["scripts"][number]): ScriptResult => ({
  id: script.id,
  projectId: script.projectId,
  displayName: script.displayName ?? undefined,
  hook: script.hook,
  narrative: script.narrative,
  constraints: script.constraints,
  scenes: script.scenes.sort((left, right) => left.order - right.order).map(toScene),
});

export const toRenderTask = (task: ProjectWithRelations["renderTasks"][number]): RenderTask => ({
  id: task.id,
  projectId: task.projectId,
  displayName: task.displayName ?? undefined,
  status: task.status,
  progress: task.progress,
  previewUrl: task.previewUrl ?? undefined,
  exportUrl: task.exportUrl ?? undefined,
  errorMessage: task.errorMessage ?? undefined,
  provider: task.provider ?? undefined,
  providerTaskId: task.providerTaskId ?? undefined,
  sceneClips: Array.isArray(task.sceneClips)
    ? RenderTaskSchema.parse({
        id: task.id,
        projectId: task.projectId,
        status: task.status,
        progress: task.progress,
        sceneClips: task.sceneClips,
        createdAt: toIso(task.createdAt),
        updatedAt: toIso(task.updatedAt),
      }).sceneClips
    : undefined,
  mediaSettings: MediaSettingsSchema.safeParse(task.mediaSettings).success
    ? MediaSettingsSchema.parse(task.mediaSettings)
    : undefined,
  videoSettings: VideoGenerationSettingsSchema.safeParse(task.videoSettings).success
    ? VideoGenerationSettingsSchema.parse(task.videoSettings)
    : undefined,
  smartEditPlan: RenderTaskSchema.shape.smartEditPlan.safeParse(task.smartEditPlan).success
    ? RenderTaskSchema.shape.smartEditPlan.parse(task.smartEditPlan)
    : undefined,
  smartEditSegmentOutputs: RenderTaskSchema.shape.smartEditSegmentOutputs.safeParse(
    task.smartEditSegmentOutputs,
  ).success
    ? RenderTaskSchema.shape.smartEditSegmentOutputs.parse(task.smartEditSegmentOutputs)
    : undefined,
  retryOfRenderTaskId: task.retryOfRenderTaskId ?? undefined,
  createdAt: toIso(task.createdAt),
  updatedAt: toIso(task.updatedAt),
});

export const toTraceEvent = (event: RenderTaskWithRelations["traceEvents"][number]): TraceEvent => ({
  id: event.id,
  renderTaskId: event.renderTaskId,
  status: event.status,
  step: event.step,
  message: event.message,
  retryOfTraceEventId: event.retryOfTraceEventId ?? undefined,
  createdAt: toIso(event.createdAt),
});

export const toReferenceVideo = (
  reference: ProjectWithRelations["referenceVideos"][number],
): ReferenceVideo => ({
  id: reference.id,
  projectId: reference.projectId ?? undefined,
  sourceAssetId: reference.sourceAssetId ?? undefined,
  sourceUrl: reference.sourceUrl,
  sourcePlatform: reference.sourcePlatform,
  sourceDeclaration: reference.sourceDeclaration,
  title: reference.title,
  author: reference.author ?? undefined,
  category: reference.category,
  publicStats:
    reference.publicStats &&
    typeof reference.publicStats === "object" &&
    !Array.isArray(reference.publicStats)
      ? (reference.publicStats as ReferenceVideo["publicStats"])
      : { likes: 0, comments: 0, shares: 0, views: 0 },
  status: reference.status,
  analysis: ReferenceVideoAnalysisSchema.safeParse(reference.analysis).success
    ? ReferenceVideoAnalysisSchema.parse(reference.analysis)
    : undefined,
  errorMessage: reference.errorMessage ?? undefined,
  createdAt: toIso(reference.createdAt),
  updatedAt: toIso(reference.updatedAt),
});

export const toViralTemplate = (
  template: ProjectWithRelations["viralTemplates"][number],
): ViralTemplate => ({
  templateId: template.id,
  name: template.name,
  category: template.category,
  strategy: template.strategy,
  factorSet: template.factorSet,
  narrativeStructure: template.narrativeStructure as ViralTemplate["narrativeStructure"],
  shotRequirements: template.shotRequirements,
  copywritingRules: template.copywritingRules,
  riskRules: template.riskRules,
  sourceReferenceIds: template.sourceReferenceIds,
});

export const toProjectSnapshot = (project: ProjectWithRelations): ProjectSnapshot => {
  const assets = project.assets.map(toAsset);
  const assetSlices = project.assets.flatMap((asset) => asset.slices.map(toAssetSlice));
  return {
    id: project.id,
    title: project.title,
    productName: project.productName,
    audience: project.audience,
    sellingPoints: project.sellingPoints,
    tone: project.tone,
    style: project.style,
    targetDurationSeconds: project.targetDurationSeconds,
    prepKeywords: project.prepKeywords,
    status: project.status,
    createdAt: toIso(project.createdAt),
    updatedAt: toIso(project.updatedAt),
    assets,
    assetSlices,
    assetProcessingEvents: project.assetProcessingEvents.map(toAssetProcessingEvent),
    assetProcessingJobs: project.assetProcessingJobs.map(toAssetProcessingJob),
    referenceVideos: project.referenceVideos.map(toReferenceVideo),
    viralTemplates: project.viralTemplates.map(toViralTemplate),
    scripts: project.scripts.map(toScript),
    scenes: project.scenes.sort((left, right) => left.order - right.order).map(toScene),
    renderTasks: project.renderTasks.map(toRenderTask),
  };
};

export const toProjectSummary = (
  project: Pick<
    ProjectWithRelations,
    "id" | "title" | "productName" | "status" | "createdAt" | "updatedAt"
  > & {
    _count: { assets: number; scenes: number };
    assets: Array<Pick<AssetMetadata, "id" | "url">>;
  },
): ProjectSummary => ({
  id: project.id,
  title: project.title,
  productName: project.productName,
  status: project.status,
  createdAt: toIso(project.createdAt),
  updatedAt: toIso(project.updatedAt),
  assetCount: project._count.assets,
  coverAssetId: project.assets[0]?.id,
  coverAssetUrl: project.assets[0]?.url,
  sceneCount: project._count.scenes,
});
