import { PrismaClient } from "@prisma/client";
import type { AssetStorageProvider as PrismaAssetStorageProvider, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type {
  AssetMetadata,
  AssetProcessingEvent,
  AssetProcessingJob,
  AssetSlice,
  EditingSuggestion,
  ProjectBrief,
  ProjectSummary,
  ReferenceVideo,
  ReferenceVideoAnalysis,
  RenderTask,
  SceneUpdate,
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

import type { DeleteReferenceVideoResult, ProjectSnapshot, ProjectStore } from "./projectStore.js";

type AssetWithSlices = Prisma.AssetGetPayload<{ include: { slices: true } }>;

type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: {
    assets: { include: { slices: true } };
    assetProcessingEvents: true;
    assetProcessingJobs: true;
    referenceVideos: true;
    viralTemplates: true;
    scripts: { include: { scenes: true } };
    scenes: true;
    renderTasks: true;
  };
}>;

type RenderTaskWithRelations = Prisma.RenderTaskGetPayload<{
  include: {
    traceEvents: true;
    project: {
      include: {
        assets: { include: { slices: true } };
        assetProcessingEvents: true;
        assetProcessingJobs: true;
        referenceVideos: true;
        viralTemplates: true;
        scripts: { include: { scenes: true } };
        scenes: true;
        renderTasks: true;
      };
    };
  };
}>;

const toIso = (date: Date): string => date.toISOString();

const toDbStorageProvider = (
  provider?: AssetMetadata["storageProvider"],
): PrismaAssetStorageProvider | undefined =>
  provider?.replaceAll("-", "_") as PrismaAssetStorageProvider | undefined;

const fromDbStorageProvider = (
  provider?: string | null,
): AssetMetadata["storageProvider"] | undefined =>
  provider ? (provider.replaceAll("_", "-") as AssetMetadata["storageProvider"]) : undefined;

const toAsset = (asset: AssetWithSlices): AssetMetadata => ({
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

const toAssetSlice = (slice: AssetWithSlices["slices"][number]): AssetSlice => ({
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

const toAssetProcessingEvent = (
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

const toAssetProcessingJob = (
  job: ProjectWithRelations["assetProcessingJobs"][number],
): AssetProcessingJob => ({
  id: job.id,
  assetId: job.assetId,
  status: job.status,
  steps: job.steps,
  message: job.message,
  createdAt: toIso(job.createdAt),
});

const toScene = (scene: ProjectWithRelations["scenes"][number]): StoryboardScene => ({
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

const toScript = (script: ProjectWithRelations["scripts"][number]): ScriptResult => ({
  id: script.id,
  projectId: script.projectId,
  hook: script.hook,
  narrative: script.narrative,
  constraints: script.constraints,
  scenes: script.scenes.sort((left, right) => left.order - right.order).map(toScene),
});

const toRenderTask = (task: ProjectWithRelations["renderTasks"][number]): RenderTask => ({
  id: task.id,
  projectId: task.projectId,
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

const toTraceEvent = (event: RenderTaskWithRelations["traceEvents"][number]): TraceEvent => ({
  id: event.id,
  renderTaskId: event.renderTaskId,
  status: event.status,
  step: event.step,
  message: event.message,
  retryOfTraceEventId: event.retryOfTraceEventId ?? undefined,
  createdAt: toIso(event.createdAt),
});

const toReferenceVideo = (
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

const toViralTemplate = (
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

const toProjectSnapshot = (project: ProjectWithRelations): ProjectSnapshot => {
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

const projectInclude = {
  assets: { include: { slices: true } },
  assetProcessingEvents: true,
  assetProcessingJobs: true,
  referenceVideos: true,
  viralTemplates: true,
  scripts: { include: { scenes: true } },
  scenes: true,
  renderTasks: true,
} as const;

export class PrismaProjectStore implements ProjectStore {
  constructor(private readonly prisma = new PrismaClient()) {}

  async createProject(brief: ProjectBrief): Promise<ProjectSnapshot> {
    const project = await this.prisma.project.create({
      data: {
        ...brief,
        prepKeywords: [],
      },
      include: projectInclude,
    });
    return toProjectSnapshot(project);
  }

  async getProject(id: string): Promise<ProjectSnapshot | undefined> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: projectInclude,
    });
    return project ? toProjectSnapshot(project) : undefined;
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const projects = await this.prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        productName: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            assets: true,
            scenes: true,
          },
        },
        assets: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            mimeType: true,
            type: true,
            url: true,
          },
          where: {
            OR: [{ type: "image" }, { mimeType: { startsWith: "image/" } }],
          },
          take: 1,
        },
      },
    });

    return projects.map((project) => ({
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
    }));
  }

  async addAsset(
    projectId: string | undefined,
    asset: Omit<AssetMetadata, "id" | "projectId" | "createdAt" | "updatedAt">,
    createSlices: (asset: AssetMetadata) => Array<Omit<AssetSlice, "id" | "assetId">> = () => [],
  ): Promise<AssetMetadata | undefined> {
    return this.addAssetWithId(projectId, randomUUID(), asset, createSlices);
  }

  async updateProjectBrief(
    projectId: string,
    brief: ProjectBrief,
  ): Promise<ProjectSnapshot | undefined> {
    const existing = await this.prisma.project.findUnique({
      select: { id: true },
      where: { id: projectId },
    });
    if (!existing) {
      return undefined;
    }

    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        audience: brief.audience,
        productName: brief.productName,
        sellingPoints: brief.sellingPoints,
        style: brief.style,
        targetDurationSeconds: brief.targetDurationSeconds,
        title: brief.title,
        tone: brief.tone,
      },
      include: projectInclude,
    });
    return toProjectSnapshot(project);
  }

  async addAssetWithId(
    projectId: string | undefined,
    assetId: string,
    asset: Omit<AssetMetadata, "id" | "projectId" | "createdAt" | "updatedAt">,
    createSlices: (asset: AssetMetadata) => Array<Omit<AssetSlice, "id" | "assetId">> = () => [],
  ): Promise<AssetMetadata | undefined> {
    const project = projectId
      ? await this.prisma.project.findUnique({ where: { id: projectId } })
      : undefined;
    if (projectId && !project) {
      return undefined;
    }

    const timestamp = new Date().toISOString();
    const projectedAsset: AssetMetadata = {
      ...asset,
      id: assetId,
      projectId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const created = await this.prisma.asset.create({
      data: {
        id: assetId,
        projectId,
        type: asset.type,
        status: asset.status,
        source: asset.source ?? "merchant_upload",
        storageProvider: toDbStorageProvider(asset.storageProvider),
        objectKey: asset.objectKey,
        thumbnailKey: asset.thumbnailKey,
        url: asset.url,
        name: asset.name,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        tags: asset.tags,
        embeddingText: asset.embeddingText,
        metadata: asset.metadata as Prisma.InputJsonValue | undefined,
        slices: {
          create: createSlices(projectedAsset).map((slice) => ({
            id: randomUUID(),
            label: slice.label,
            startSecond: slice.startSecond,
            endSecond: slice.endSecond,
            tags: slice.tags,
            thumbnailKey: slice.thumbnailKey,
            embeddingText: slice.embeddingText,
            searchText: slice.searchText,
            metadata: slice.metadata as Prisma.InputJsonValue | undefined,
          })),
        },
      },
      include: { slices: true },
    });
    return toAsset(created);
  }

  async addAssetSlices(
    assetId: string,
    slices: Array<Omit<AssetSlice, "id" | "assetId">>,
  ): Promise<AssetSlice[]> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return [];
    }

    const created = await Promise.all(
      slices.map((slice) =>
        this.prisma.assetSlice.create({
          data: {
            id: randomUUID(),
            assetId,
            label: slice.label,
            startSecond: slice.startSecond,
            endSecond: slice.endSecond,
            tags: slice.tags,
            thumbnailKey: slice.thumbnailKey,
            embeddingText: slice.embeddingText,
            searchText: slice.searchText,
            metadata: slice.metadata as Prisma.InputJsonValue | undefined,
          },
        }),
      ),
    );
    return created.map(toAssetSlice);
  }

  async updateAssetSlice(
    sliceId: string,
    update: Partial<Omit<AssetSlice, "id" | "assetId">>,
  ): Promise<AssetSlice | undefined> {
    const current = await this.prisma.assetSlice.findUnique({ where: { id: sliceId } });
    if (!current) {
      return undefined;
    }

    const updated = await this.prisma.assetSlice.update({
      where: { id: sliceId },
      data: {
        label: update.label,
        startSecond: update.startSecond,
        endSecond: update.endSecond,
        tags: update.tags,
        thumbnailKey: update.thumbnailKey,
        embeddingText: update.embeddingText,
        searchText: update.searchText,
        metadata: update.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    return toAssetSlice(updated);
  }

  async updateAsset(
    assetId: string,
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
  ): Promise<AssetMetadata | undefined> {
    const current = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { slices: true },
    });
    if (!current) {
      return undefined;
    }

    const currentMetadata =
      current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? (current.metadata as Record<string, unknown>)
        : {};
    const updated = await this.prisma.asset.update({
      where: { id: assetId },
      data: {
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
      },
      include: { slices: true },
    });
    return toAsset(updated);
  }

  async deleteAssets(assetIds: string[]): Promise<AssetMetadata[]> {
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: assetIds } },
      include: { slices: true },
    });
    if (assets.length === 0) {
      return [];
    }

    await this.prisma.$transaction([
      this.prisma.storyboardScene.updateMany({
        where: { assetId: { in: assetIds } },
        data: { assetId: null },
      }),
      this.prisma.asset.deleteMany({
        where: { id: { in: assets.map((asset) => asset.id) } },
      }),
    ]);

    const assetById = new Map(assets.map((asset) => [asset.id, toAsset(asset)]));
    return assetIds.flatMap((assetId) => {
      const asset = assetById.get(assetId);
      return asset ? [asset] : [];
    });
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      return false;
    }

    await this.prisma.$transaction([
      this.prisma.asset.deleteMany({
        where: { projectId },
      }),
      this.prisma.project.delete({
        where: { id: projectId },
      }),
    ]);
    return true;
  }

  async deleteReferenceVideo(referenceId: string): Promise<DeleteReferenceVideoResult | undefined> {
    const reference = await this.prisma.referenceVideo.findUnique({ where: { id: referenceId } });
    if (!reference) {
      return undefined;
    }

    const publicReferenceAssets = await this.prisma.asset.findMany({
      where: { source: "public_reference" },
      include: { slices: true },
    });
    const assetsToDelete = publicReferenceAssets.filter((asset) => {
      const metadata =
        asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
          ? (asset.metadata as Record<string, unknown>)
          : {};
      return (
        (metadata.kind === "reference_script_asset" && metadata.referenceId === referenceId) ||
        (asset.id === reference.sourceAssetId && asset.source === "public_reference")
      );
    });
    const templatesToDelete = await this.prisma.viralTemplate.findMany({
      where: { sourceReferenceIds: { has: referenceId } },
      select: { id: true },
    });
    const deletedAssetIds = assetsToDelete.map((asset) => asset.id);
    const deletedTemplateIds = templatesToDelete.map((template) => template.id);

    await this.prisma.$transaction(async (prisma) => {
      if (deletedTemplateIds.length > 0) {
        await prisma.viralTemplate.deleteMany({
          where: { id: { in: deletedTemplateIds } },
        });
      }
      await prisma.referenceVideo.delete({
        where: { id: referenceId },
      });
      if (deletedAssetIds.length > 0) {
        await prisma.asset.deleteMany({
          where: { id: { in: deletedAssetIds } },
        });
      }
    });

    return {
      deletedAssets: assetsToDelete.map(toAsset),
      deletedReference: toReferenceVideo(reference),
      deletedTemplateIds,
    };
  }

  async addAssetProcessingJob(
    projectId: string | undefined,
    job: Omit<AssetProcessingJob, "createdAt">,
  ): Promise<AssetProcessingJob | undefined> {
    const project = projectId
      ? await this.prisma.project.findUnique({ where: { id: projectId } })
      : undefined;
    if (projectId && !project) {
      return undefined;
    }

    const created = await this.prisma.assetProcessingJob.create({
      data: {
        id: job.id,
        projectId,
        assetId: job.assetId,
        status: job.status,
        steps: job.steps,
        message: job.message,
      },
    });
    return toAssetProcessingJob(created);
  }

  async addAssetProcessingEvent(
    jobId: string,
    event: Omit<AssetProcessingEvent, "id" | "jobId" | "createdAt">,
  ): Promise<AssetProcessingEvent | undefined> {
    const job = await this.prisma.assetProcessingJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return undefined;
    }

    const created = await this.prisma.assetProcessingEvent.create({
      data: {
        id: randomUUID(),
        projectId: job.projectId,
        jobId,
        assetId: event.assetId,
        step: event.step,
        status: event.status,
        message: event.message,
        progress: event.progress,
        retryable: event.retryable,
      },
    });
    return toAssetProcessingEvent(created);
  }

  async listAssetProcessingEvents(jobId: string): Promise<AssetProcessingEvent[]> {
    const events = await this.prisma.assetProcessingEvent.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
    });
    return events.map(toAssetProcessingEvent);
  }

  async getAssetProcessingJob(jobId: string): Promise<AssetProcessingJob | undefined> {
    const job = await this.prisma.assetProcessingJob.findUnique({ where: { id: jobId } });
    return job ? toAssetProcessingJob(job) : undefined;
  }

  async getAsset(assetId: string): Promise<AssetMetadata | undefined> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { slices: true },
    });
    return asset ? toAsset(asset) : undefined;
  }

  async getLatestAssetProcessingJob(assetId: string): Promise<AssetProcessingJob | undefined> {
    const job = await this.prisma.assetProcessingJob.findFirst({
      where: { assetId },
      orderBy: { createdAt: "desc" },
    });
    return job ? toAssetProcessingJob(job) : undefined;
  }

  async updateAssetProcessingJob(
    jobId: string,
    update: Partial<Pick<AssetProcessingJob, "message" | "status" | "steps">>,
  ): Promise<AssetProcessingJob | undefined> {
    const current = await this.prisma.assetProcessingJob.findUnique({ where: { id: jobId } });
    if (!current) {
      return undefined;
    }
    const updated = await this.prisma.assetProcessingJob.update({
      where: { id: jobId },
      data: update,
    });
    return toAssetProcessingJob(updated);
  }

  async updateProjectPrepKeywords(
    projectId: string,
    keywords: string[],
  ): Promise<ProjectSnapshot | undefined> {
    const project = await this.prisma.project
      .update({
        where: { id: projectId },
        data: { prepKeywords: keywords },
        include: projectInclude,
      })
      .catch(() => undefined);

    return project ? toProjectSnapshot(project) : undefined;
  }

  async addReferenceVideo(
    projectId: string | undefined,
    reference: Omit<ReferenceVideo, "id" | "projectId" | "analysis" | "createdAt" | "updatedAt">,
  ): Promise<ReferenceVideo | undefined> {
    const project = projectId
      ? await this.prisma.project.findUnique({ where: { id: projectId } })
      : undefined;
    if (projectId && !project) {
      return undefined;
    }

    const created = await this.prisma.referenceVideo.create({
      data: {
        id: randomUUID(),
        projectId,
        sourceAssetId: reference.sourceAssetId,
        sourceUrl: reference.sourceUrl,
        sourcePlatform: reference.sourcePlatform,
        sourceDeclaration: reference.sourceDeclaration,
        title: reference.title,
        author: reference.author,
        category: reference.category,
        publicStats: reference.publicStats as Prisma.InputJsonValue,
        status: reference.status,
        errorMessage: reference.errorMessage,
      },
    });
    return toReferenceVideo(created);
  }

  async updateReferenceVideoAnalysis(
    referenceId: string,
    analysis: ReferenceVideoAnalysis,
  ): Promise<ReferenceVideo | undefined> {
    const current = await this.prisma.referenceVideo.findUnique({ where: { id: referenceId } });
    if (!current) {
      return undefined;
    }

    const updated = await this.prisma.referenceVideo.update({
      where: { id: referenceId },
      data: {
        status: "ready",
        analysis: analysis as Prisma.InputJsonValue,
        publicStats: analysis.publicStats as Prisma.InputJsonValue,
        segments: {
          deleteMany: {},
          create: analysis.commerceNarrativeSegments.map((segment) => ({
            id: randomUUID(),
            role: segment.role,
            startSecond: segment.startSecond,
            endSecond: segment.endSecond,
            summary: segment.summary,
            copywriting: segment.copywriting,
            visualPrompt: segment.visualPrompt,
          })),
        },
      },
    });
    return toReferenceVideo(updated);
  }

  async updateReferenceVideo(
    referenceId: string,
    update: Partial<
      Pick<
        ReferenceVideo,
        "errorMessage" | "publicStats" | "sourceAssetId" | "sourceUrl" | "status"
      >
    >,
  ): Promise<ReferenceVideo | undefined> {
    const current = await this.prisma.referenceVideo.findUnique({ where: { id: referenceId } });
    if (!current) {
      return undefined;
    }

    const updated = await this.prisma.referenceVideo.update({
      where: { id: referenceId },
      data: {
        errorMessage:
          update.errorMessage === undefined && update.status && update.status !== "failed"
            ? null
            : update.errorMessage,
        publicStats: update.publicStats as Prisma.InputJsonValue | undefined,
        sourceAssetId: update.sourceAssetId,
        sourceUrl: update.sourceUrl,
        status: update.status,
      },
    });
    return toReferenceVideo(updated);
  }

  async listReferenceVideos(projectId?: string): Promise<ReferenceVideo[]> {
    const references = await this.prisma.referenceVideo.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: "desc" },
    });
    return references.map(toReferenceVideo);
  }

  async addViralTemplate(template: ViralTemplate): Promise<ViralTemplate> {
    const reference = template.sourceReferenceIds[0]
      ? await this.prisma.referenceVideo.findUnique({
          where: { id: template.sourceReferenceIds[0] },
          select: { projectId: true },
        })
      : undefined;
    const upserted = await this.prisma.viralTemplate.upsert({
      where: { id: template.templateId },
      create: {
        id: template.templateId,
        projectId: reference?.projectId,
        name: template.name,
        category: template.category,
        strategy: template.strategy,
        factorSet: template.factorSet,
        narrativeStructure: template.narrativeStructure,
        shotRequirements: template.shotRequirements,
        copywritingRules: template.copywritingRules,
        riskRules: template.riskRules,
        sourceReferenceIds: template.sourceReferenceIds,
      },
      update: {
        projectId: reference?.projectId,
        name: template.name,
        category: template.category,
        strategy: template.strategy,
        factorSet: template.factorSet,
        narrativeStructure: template.narrativeStructure,
        shotRequirements: template.shotRequirements,
        copywritingRules: template.copywritingRules,
        riskRules: template.riskRules,
        sourceReferenceIds: template.sourceReferenceIds,
      },
    });
    return toViralTemplate(upserted);
  }

  async listViralTemplates(category?: string): Promise<ViralTemplate[]> {
    const templates = await this.prisma.viralTemplate.findMany({
      where: category ? { category } : undefined,
      orderBy: { updatedAt: "desc" },
    });
    return templates.map(toViralTemplate);
  }

  async addScript(
    projectId: string,
    script: Omit<ScriptResult, "id" | "projectId">,
  ): Promise<ScriptResult | undefined> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return undefined;
    }
    const scriptId = randomUUID();
    const created = await this.prisma.$transaction(async (prisma) => {
      await prisma.storyboardScene.deleteMany({
        where: { projectId },
      });
      const nextScript = await prisma.script.create({
        data: {
          id: scriptId,
          projectId,
          hook: script.hook,
          narrative: script.narrative,
          constraints: script.constraints,
          scenes: {
            create: script.scenes.map((scene) => ({
              id: randomUUID(),
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
            })),
          },
        },
        include: { scenes: true },
      });
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "ready" },
      });
      return nextScript;
    });
    return toScript(created);
  }

  async addRenderTask(
    projectId: string,
    renderTask: Omit<RenderTask, "id" | "projectId" | "createdAt" | "updatedAt">,
    traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">>,
  ): Promise<{ renderTask: RenderTask; traceEvents: TraceEvent[] } | undefined> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return undefined;
    }

    const created = await this.prisma.renderTask.create({
      data: {
        id: randomUUID(),
        projectId,
        status: renderTask.status,
        progress: renderTask.progress,
        previewUrl: renderTask.previewUrl,
        exportUrl: renderTask.exportUrl,
        errorMessage: renderTask.errorMessage,
        provider: renderTask.provider,
        providerTaskId: renderTask.providerTaskId,
        sceneClips: renderTask.sceneClips,
        mediaSettings: renderTask.mediaSettings,
        videoSettings: renderTask.videoSettings,
        smartEditPlan: renderTask.smartEditPlan,
        smartEditSegmentOutputs: renderTask.smartEditSegmentOutputs,
        retryOfRenderTaskId: renderTask.retryOfRenderTaskId,
        traceEvents: {
          create: traceEvents.map((event) => ({
            id: randomUUID(),
            status: event.status,
            step: event.step,
            message: event.message,
            retryOfTraceEventId: event.retryOfTraceEventId,
          })),
        },
      },
      include: { traceEvents: true },
    });
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status:
          renderTask.status === "completed"
            ? "completed"
            : renderTask.status === "failed"
              ? "failed"
              : "rendering",
      },
    });

    return {
      renderTask: toRenderTask(created),
      traceEvents: created.traceEvents.map(toTraceEvent),
    };
  }

  async updateScene(sceneId: string, update: SceneUpdate): Promise<StoryboardScene | undefined> {
    const current = await this.prisma.storyboardScene.findUnique({ where: { id: sceneId } });
    if (!current) {
      return undefined;
    }
    const updated = await this.prisma.storyboardScene.update({
      where: { id: sceneId },
      data: {
        durationSeconds: update.durationSeconds,
        subtitle: update.subtitle,
        voiceover: update.voiceover,
        visualPrompt: update.visualPrompt,
        assetRecallQuery: update.assetRecallQuery === null ? null : update.assetRecallQuery,
        imageUrl: update.imageUrl,
        assetId: update.assetId === null ? null : update.assetId,
        status: update.status ?? "edited",
      },
    });
    return toScene(updated);
  }

  async reorderScenes(
    projectId: string,
    sceneIds: string[],
  ): Promise<StoryboardScene[] | undefined> {
    const scenes = await this.prisma.storyboardScene.findMany({ where: { projectId } });
    if (
      sceneIds.length !== scenes.length ||
      sceneIds.some((sceneId) => !scenes.some((scene) => scene.id === sceneId))
    ) {
      return undefined;
    }

    await this.prisma.$transaction(
      sceneIds.map((sceneId, index) =>
        this.prisma.storyboardScene.update({
          where: { id: sceneId },
          data: { order: index + 1 },
        }),
      ),
    );
    const updatedScenes = await this.prisma.storyboardScene.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
    });
    return updatedScenes.map(toScene);
  }

  async deleteScene(sceneId: string): Promise<StoryboardScene[] | undefined> {
    const scene = await this.prisma.storyboardScene.findUnique({ where: { id: sceneId } });
    if (!scene) {
      return undefined;
    }
    await this.prisma.storyboardScene.delete({ where: { id: sceneId } });
    const remaining = await this.prisma.storyboardScene.findMany({
      where: { projectId: scene.projectId },
      orderBy: { order: "asc" },
    });
    await this.prisma.$transaction(
      remaining.map((candidate, index) =>
        this.prisma.storyboardScene.update({
          where: { id: candidate.id },
          data: { order: index + 1 },
        }),
      ),
    );
    const updated = await this.prisma.storyboardScene.findMany({
      where: { projectId: scene.projectId },
      orderBy: { order: "asc" },
    });
    return updated.map(toScene);
  }

  async getSceneContext(
    sceneId: string,
  ): Promise<{ project: ProjectSnapshot; scene: StoryboardScene } | undefined> {
    const scene = await this.prisma.storyboardScene.findUnique({ where: { id: sceneId } });
    if (!scene) {
      return undefined;
    }
    const project = await this.getProject(scene.projectId);
    if (!project) {
      return undefined;
    }
    return {
      project,
      scene: toScene(scene),
    };
  }

  async appendTraceEvent(
    traceKey: string,
    event: Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">,
  ): Promise<TraceEvent> {
    const renderTask = await this.prisma.renderTask.findUnique({ where: { id: traceKey } });
    if (!renderTask) {
      return {
        ...event,
        id: randomUUID(),
        renderTaskId: traceKey,
        createdAt: new Date().toISOString(),
      };
    }

    const created = await this.prisma.traceEvent.create({
      data: {
        id: randomUUID(),
        renderTaskId: traceKey,
        status: event.status,
        step: event.step,
        message: event.message,
        retryOfTraceEventId: event.retryOfTraceEventId,
      },
    });
    return toTraceEvent(created);
  }

  async updateRenderTask(
    renderTaskId: string,
    update: Partial<Omit<RenderTask, "id" | "projectId" | "createdAt" | "updatedAt">>,
    traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">> = [],
  ): Promise<{ renderTask: RenderTask; traceEvents: TraceEvent[] } | undefined> {
    const current = await this.prisma.renderTask.findUnique({
      where: { id: renderTaskId },
      include: {
        project: true,
      },
    });
    if (!current) {
      return undefined;
    }

    const updated = await this.prisma.renderTask.update({
      where: { id: renderTaskId },
      data: {
        status: update.status,
        progress: update.progress,
        previewUrl: update.previewUrl,
        exportUrl: update.exportUrl,
        errorMessage: update.errorMessage,
        provider: update.provider,
        providerTaskId: update.providerTaskId,
        sceneClips: update.sceneClips,
        mediaSettings: update.mediaSettings,
        videoSettings: update.videoSettings,
        smartEditPlan: update.smartEditPlan,
        smartEditSegmentOutputs: update.smartEditSegmentOutputs,
        retryOfRenderTaskId: update.retryOfRenderTaskId,
        traceEvents: {
          create: traceEvents.map((event) => ({
            id: randomUUID(),
            status: event.status,
            step: event.step,
            message: event.message,
            retryOfTraceEventId: event.retryOfTraceEventId,
          })),
        },
      },
      include: { traceEvents: true },
    });
    await this.prisma.project.update({
      where: { id: current.projectId },
      data: {
        status:
          updated.status === "completed"
            ? "completed"
            : updated.status === "failed"
              ? "failed"
              : "rendering",
      },
    });

    return {
      renderTask: toRenderTask(updated),
      traceEvents: updated.traceEvents.map(toTraceEvent),
    };
  }

  getStoredSuggestion(
    _sceneId: string,
    suggestionId: string,
    createSuggestions: () => EditingSuggestion[],
  ): EditingSuggestion | undefined {
    return createSuggestions().find((suggestion) => suggestion.id === suggestionId);
  }

  async getRenderTask(
    renderTaskId: string,
  ): Promise<
    { project: ProjectSnapshot; renderTask: RenderTask; traceEvents: TraceEvent[] } | undefined
  > {
    const renderTask = await this.prisma.renderTask.findUnique({
      where: { id: renderTaskId },
      include: {
        traceEvents: true,
        project: {
          include: projectInclude,
        },
      },
    });
    if (!renderTask) {
      return undefined;
    }
    return {
      project: toProjectSnapshot(renderTask.project),
      renderTask: toRenderTask(renderTask),
      traceEvents: renderTask.traceEvents.map(toTraceEvent),
    };
  }

  async listAssets(): Promise<{ assets: AssetMetadata[]; assetSlices: AssetSlice[] }> {
    const assets = await this.prisma.asset.findMany({
      include: { slices: true },
      orderBy: { createdAt: "asc" },
    });

    return {
      assets: assets.map(toAsset),
      assetSlices: assets.flatMap((asset) => asset.slices.map(toAssetSlice)),
    };
  }
}
