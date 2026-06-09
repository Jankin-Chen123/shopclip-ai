import { PrismaClient } from "@prisma/client";
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

import type { DeleteReferenceVideoResult, ProjectSnapshot, ProjectStore } from "./projectStore.js";
import {
  projectInclude,
  toAsset,
  toAssetProcessingEvent,
  toAssetProcessingJob,
  toAssetSlice,
  toProjectSnapshot,
  toProjectSummary,
  toReferenceVideo,
  toRenderTask,
  toScene,
  toScript,
  toTraceEvent,
  toViralTemplate,
} from "./prismaProjectMappers.js";
import {
  orderByRequestedIds,
  toAssetCreateData,
  toAssetSliceCreateData,
  toAssetSliceUpdateData,
  toAssetUpdateData,
  toJsonObject,
  toProjectStatusFromRenderTask,
  toReferenceAnalysisUpdateData,
  toReferenceVideoCreateData,
  toReferenceVideoUpdateData,
  toRenderTaskCreateData,
  toRenderTaskUpdateData,
  toSceneUpdateData,
  toScriptSceneCreateData,
  toTraceEventCreateData,
  toViralTemplateCreateData,
  toViralTemplateUpdateData,
} from "./prismaProjectWriteData.js";

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

    return projects.map(toProjectSummary);
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
      data: toAssetCreateData(projectId, assetId, asset, createSlices(projectedAsset), randomUUID),
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
          data: { ...toAssetSliceCreateData(slice, randomUUID), assetId },
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
      data: toAssetSliceUpdateData(update),
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

    const updated = await this.prisma.asset.update({
      where: { id: assetId },
      data: toAssetUpdateData(update, toJsonObject(current.metadata)),
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

    return orderByRequestedIds(assetIds, assets.map(toAsset));
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

  async deleteScript(scriptId: string): Promise<ScriptResult | undefined> {
    const script = await this.prisma.script.findUnique({
      where: { id: scriptId },
      include: { scenes: true },
    });
    if (!script) {
      return undefined;
    }

    await this.prisma.$transaction([
      this.prisma.storyboardScene.updateMany({
        where: { scriptId },
        data: { scriptId: null },
      }),
      this.prisma.script.delete({
        where: { id: scriptId },
      }),
    ]);

    return toScript(script);
  }

  async deleteRenderTask(renderTaskId: string): Promise<RenderTask | undefined> {
    const renderTask = await this.prisma.renderTask.findUnique({
      where: { id: renderTaskId },
    });
    if (!renderTask) {
      return undefined;
    }

    await this.prisma.renderTask.delete({
      where: { id: renderTaskId },
    });

    return toRenderTask(renderTask);
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
      data: toReferenceVideoCreateData(projectId, randomUUID(), reference),
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
      data: toReferenceAnalysisUpdateData(analysis, randomUUID),
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
      data: toReferenceVideoUpdateData(update),
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
      create: toViralTemplateCreateData(template, reference?.projectId),
      update: toViralTemplateUpdateData(template, reference?.projectId),
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
          displayName: script.displayName,
          hook: script.hook,
          narrative: script.narrative,
          constraints: script.constraints,
          scenes: {
            create: script.scenes.map((scene) =>
              toScriptSceneCreateData(scene, projectId, randomUUID),
            ),
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

  async updateScriptScenes(
    scriptId: string,
    scenes: StoryboardScene[],
    constraints?: string[],
  ): Promise<ScriptResult | undefined> {
    const script = await this.prisma.script.findUnique({
      where: { id: scriptId },
      include: { scenes: true },
    });
    if (!script) {
      return undefined;
    }

    const updated = await this.prisma.$transaction(async (prisma) => {
      await prisma.storyboardScene.deleteMany({
        where: { projectId: script.projectId },
      });
      return prisma.script.update({
        where: { id: scriptId },
        data: {
          constraints: constraints ?? script.constraints,
          scenes: {
            create: scenes.map((scene) =>
              toScriptSceneCreateData(scene, script.projectId, randomUUID),
            ),
          },
          project: {
            update: {
              status: "ready",
            },
          },
        },
        include: { scenes: true },
      });
    });

    return toScript(updated);
  }

  async updateScriptDisplayName(
    scriptId: string,
    displayName: string | undefined,
  ): Promise<ScriptResult | undefined> {
    const updated = await this.prisma.script
      .update({
        where: { id: scriptId },
        data: {
          displayName,
          project: {
            update: {
              updatedAt: new Date(),
            },
          },
        },
        include: { scenes: true },
      })
      .catch(() => undefined);
    return updated ? toScript(updated) : undefined;
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
      data: toRenderTaskCreateData(projectId, renderTask, traceEvents, randomUUID),
      include: { traceEvents: true },
    });
    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: toProjectStatusFromRenderTask(renderTask) },
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
      data: toSceneUpdateData(update),
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
      data: { ...toTraceEventCreateData(event, randomUUID), renderTaskId: traceKey },
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
      data: toRenderTaskUpdateData(update, traceEvents, randomUUID),
      include: { traceEvents: true },
    });
    await this.prisma.project.update({
      where: { id: current.projectId },
      data: { status: toProjectStatusFromRenderTask(updated) },
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
