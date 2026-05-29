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
import type { ProjectSnapshot, ProjectStore } from "./projectStore.js";

const now = (): string => new Date().toISOString();

export class MemoryProjectStore implements ProjectStore {
  private readonly projects = new Map<string, ProjectSnapshot>();
  private readonly globalAssets: AssetMetadata[] = [];
  private readonly globalAssetSlices: AssetSlice[] = [];
  private readonly globalAssetProcessingEvents: AssetProcessingEvent[] = [];
  private readonly globalAssetProcessingJobs: AssetProcessingJob[] = [];
  private readonly globalReferenceVideos: ReferenceVideo[] = [];
  private readonly viralTemplates: ViralTemplate[] = [];
  private readonly traceEvents = new Map<string, TraceEvent[]>();

  createProject(brief: ProjectBrief): ProjectSnapshot {
    const timestamp = now();
    const project: ProjectSnapshot = {
      ...brief,
      prepKeywords: [],
      id: randomUUID(),
      status: "draft",
      createdAt: timestamp,
      updatedAt: timestamp,
      assets: [],
      assetSlices: [],
      assetProcessingEvents: [],
      scripts: [],
      scenes: [],
      renderTasks: [],
      assetProcessingJobs: [],
      referenceVideos: [],
      viralTemplates: [],
    };

    this.projects.set(project.id, project);
    return project;
  }

  getProject(id: string): ProjectSnapshot | undefined {
    return this.projects.get(id);
  }

  listProjects(): ProjectSummary[] {
    return [...this.projects.values()]
      .map((project) => ({
        id: project.id,
        title: project.title,
        productName: project.productName,
        status: project.status,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        assetCount: project.assets.length,
        sceneCount: project.scenes.length,
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  addAsset(
    projectId: string | undefined,
    asset: Omit<AssetMetadata, "id" | "projectId" | "createdAt" | "updatedAt">,
    createSlices: (asset: AssetMetadata) => Array<Omit<AssetSlice, "id" | "assetId">> = () => [],
  ): AssetMetadata | undefined {
    return this.addAssetWithId(projectId, randomUUID(), asset, createSlices);
  }

  addAssetWithId(
    projectId: string | undefined,
    assetId: string,
    asset: Omit<AssetMetadata, "id" | "projectId" | "createdAt" | "updatedAt">,
    createSlices: (asset: AssetMetadata) => Array<Omit<AssetSlice, "id" | "assetId">> = () => [],
  ): AssetMetadata | undefined {
    const project = projectId ? this.projects.get(projectId) : undefined;
    if (projectId && !project) {
      return undefined;
    }

    const timestamp = now();
    const storedAsset: AssetMetadata = {
      ...asset,
      id: assetId,
      projectId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const storedSlices = createSlices(storedAsset).map((slice) => ({
      ...slice,
      id: randomUUID(),
      assetId: storedAsset.id,
    }));

    if (project) {
      project.assets.push(storedAsset);
      project.assetSlices.push(...storedSlices);
      project.updatedAt = timestamp;
    } else {
      this.globalAssets.push(storedAsset);
      this.globalAssetSlices.push(...storedSlices);
    }
    return storedAsset;
  }

  addAssetSlices(assetId: string, slices: Array<Omit<AssetSlice, "id" | "assetId">>): AssetSlice[] {
    const match = this.findAssetProject(assetId);
    if (!match) {
      return [];
    }

    const storedSlices = slices.map((slice) => ({
      ...slice,
      id: randomUUID(),
      assetId,
    }));
    if (match.project) {
      match.project.assetSlices.push(...storedSlices);
      match.project.updatedAt = now();
    } else {
      this.globalAssetSlices.push(...storedSlices);
    }
    return storedSlices;
  }

  updateAssetSlice(
    sliceId: string,
    update: Partial<Omit<AssetSlice, "id" | "assetId">>,
  ): AssetSlice | undefined {
    const globalIndex = this.globalAssetSlices.findIndex((slice) => slice.id === sliceId);
    if (globalIndex !== -1) {
      const updatedSlice = {
        ...this.globalAssetSlices[globalIndex]!,
        ...update,
      };
      this.globalAssetSlices[globalIndex] = updatedSlice;
      return updatedSlice;
    }

    for (const project of this.projects.values()) {
      const sliceIndex = project.assetSlices.findIndex((slice) => slice.id === sliceId);
      if (sliceIndex === -1) {
        continue;
      }

      const updatedSlice = {
        ...project.assetSlices[sliceIndex]!,
        ...update,
      };
      project.assetSlices[sliceIndex] = updatedSlice;
      project.updatedAt = now();
      return updatedSlice;
    }

    return undefined;
  }

  updateAsset(
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
  ): AssetMetadata | undefined {
    const match = this.findAssetProject(assetId);
    if (!match) {
      return undefined;
    }

    const timestamp = now();
    const updatedAsset: AssetMetadata = {
      ...match.asset,
      ...update,
      metadata: {
        ...(match.asset.metadata ?? {}),
        ...(update.metadata ?? {}),
      },
      updatedAt: timestamp,
    };

    if (match.project) {
      match.project.assets = match.project.assets.map((asset) =>
        asset.id === assetId ? updatedAsset : asset,
      );
      match.project.updatedAt = timestamp;
    } else {
      const index = this.globalAssets.findIndex((asset) => asset.id === assetId);
      this.globalAssets[index] = updatedAsset;
    }
    return updatedAsset;
  }

  deleteAssets(assetIds: string[]): AssetMetadata[] {
    const requestedAssetIds = new Set(assetIds);
    const deletedAssets: AssetMetadata[] = [];
    const timestamp = now();

    this.globalAssets
      .filter((asset) => requestedAssetIds.has(asset.id))
      .forEach((asset) => deletedAssets.push(asset));
    for (let index = this.globalAssets.length - 1; index >= 0; index -= 1) {
      if (requestedAssetIds.has(this.globalAssets[index]?.id ?? "")) {
        this.globalAssets.splice(index, 1);
      }
    }
    for (let index = this.globalAssetSlices.length - 1; index >= 0; index -= 1) {
      if (requestedAssetIds.has(this.globalAssetSlices[index]?.assetId ?? "")) {
        this.globalAssetSlices.splice(index, 1);
      }
    }
    for (let index = this.globalAssetProcessingJobs.length - 1; index >= 0; index -= 1) {
      if (requestedAssetIds.has(this.globalAssetProcessingJobs[index]?.assetId ?? "")) {
        this.globalAssetProcessingJobs.splice(index, 1);
      }
    }
    for (let index = this.globalAssetProcessingEvents.length - 1; index >= 0; index -= 1) {
      if (requestedAssetIds.has(this.globalAssetProcessingEvents[index]?.assetId ?? "")) {
        this.globalAssetProcessingEvents.splice(index, 1);
      }
    }

    for (const project of this.projects.values()) {
      const projectDeletedAssets = project.assets.filter((asset) => requestedAssetIds.has(asset.id));
      deletedAssets.push(...projectDeletedAssets);
      const nextAssets = project.assets.filter((asset) => !requestedAssetIds.has(asset.id));
      const nextAssetSlices = project.assetSlices.filter(
        (slice) => !requestedAssetIds.has(slice.assetId),
      );
      const nextAssetProcessingJobs = project.assetProcessingJobs.filter(
        (job) => !requestedAssetIds.has(job.assetId),
      );
      const nextAssetProcessingEvents = project.assetProcessingEvents.filter(
        (event) => !requestedAssetIds.has(event.assetId),
      );
      const nextScenes = project.scenes.map((scene) =>
        scene.assetId && requestedAssetIds.has(scene.assetId)
          ? { ...scene, assetId: undefined }
          : scene,
      );
      const nextScripts = project.scripts.map((script) => ({
        ...script,
        scenes: script.scenes.map((scene) =>
          scene.assetId && requestedAssetIds.has(scene.assetId)
            ? { ...scene, assetId: undefined }
            : scene,
        ),
      }));

      const changed =
        projectDeletedAssets.length > 0 ||
        nextScenes.some((scene, index) => scene.assetId !== project.scenes[index]?.assetId) ||
        nextScripts.some((script, scriptIndex) =>
          script.scenes.some(
            (scene, sceneIndex) =>
              scene.assetId !== project.scripts[scriptIndex]?.scenes[sceneIndex]?.assetId,
          ),
        );
      if (!changed) {
        continue;
      }

      project.assets = nextAssets;
      project.assetSlices = nextAssetSlices;
      project.assetProcessingJobs = nextAssetProcessingJobs;
      project.assetProcessingEvents = nextAssetProcessingEvents;
      project.scenes = nextScenes;
      project.scripts = nextScripts;
      project.updatedAt = timestamp;
    }

    return deletedAssets;
  }

  deleteProject(projectId: string): boolean {
    const project = this.projects.get(projectId);
    if (!project) {
      return false;
    }

    const deletedAssetIds = new Set(project.assets.map((asset) => asset.id));
    for (const renderTask of project.renderTasks) {
      this.traceEvents.delete(renderTask.id);
    }
    this.projects.delete(projectId);

    if (deletedAssetIds.size > 0) {
      for (const remainingProject of this.projects.values()) {
        remainingProject.scenes = remainingProject.scenes.map((scene) =>
          scene.assetId && deletedAssetIds.has(scene.assetId)
            ? { ...scene, assetId: undefined }
            : scene,
        );
        remainingProject.scripts = remainingProject.scripts.map((script) => ({
          ...script,
          scenes: script.scenes.map((scene) =>
            scene.assetId && deletedAssetIds.has(scene.assetId)
              ? { ...scene, assetId: undefined }
              : scene,
          ),
        }));
      }
    }

    return true;
  }

  addAssetProcessingJob(
    projectId: string | undefined,
    job: Omit<AssetProcessingJob, "createdAt">,
  ): AssetProcessingJob | undefined {
    const project = projectId ? this.projects.get(projectId) : undefined;
    if (projectId && !project) {
      return undefined;
    }

    const storedJob: AssetProcessingJob = {
      ...job,
      createdAt: now(),
    };
    if (project) {
      project.assetProcessingJobs.push(storedJob);
      project.updatedAt = now();
    } else {
      this.globalAssetProcessingJobs.push(storedJob);
    }
    return storedJob;
  }

  addAssetProcessingEvent(
    jobId: string,
    event: Omit<AssetProcessingEvent, "id" | "jobId" | "createdAt">,
  ): AssetProcessingEvent | undefined {
    const job = this.getAssetProcessingJob(jobId);
    if (!job) {
      return undefined;
    }

    const storedEvent: AssetProcessingEvent = {
      ...event,
      id: randomUUID(),
      jobId,
      createdAt: now(),
    };
    const project = this.findAssetProject(event.assetId)?.project;
    if (project) {
      project.assetProcessingEvents.push(storedEvent);
      project.updatedAt = now();
    } else {
      this.globalAssetProcessingEvents.push(storedEvent);
    }
    return storedEvent;
  }

  listAssetProcessingEvents(jobId: string): AssetProcessingEvent[] {
    const projectEvents = [...this.projects.values()].flatMap(
      (project) => project.assetProcessingEvents,
    );
    return [...this.globalAssetProcessingEvents, ...projectEvents].filter(
      (event) => event.jobId === jobId,
    );
  }

  getAssetProcessingJob(jobId: string): AssetProcessingJob | undefined {
    const globalJob = this.globalAssetProcessingJobs.find((candidate) => candidate.id === jobId);
    if (globalJob) {
      return globalJob;
    }

    for (const project of this.projects.values()) {
      const job = project.assetProcessingJobs.find((candidate) => candidate.id === jobId);
      if (job) {
        return job;
      }
    }

    return undefined;
  }

  getAsset(assetId: string): AssetMetadata | undefined {
    const globalAsset = this.globalAssets.find((candidate) => candidate.id === assetId);
    if (globalAsset) {
      return globalAsset;
    }
    return this.findAssetProject(assetId)?.asset;
  }

  getLatestAssetProcessingJob(assetId: string): AssetProcessingJob | undefined {
    const globalLatest = this.globalAssetProcessingJobs
      .filter((candidate) => candidate.assetId === assetId)
      .at(-1);
    if (globalLatest) {
      return globalLatest;
    }

    for (const project of this.projects.values()) {
      const jobs = project.assetProcessingJobs.filter((candidate) => candidate.assetId === assetId);
      const latest = jobs.at(-1);
      if (latest) {
        return latest;
      }
    }

    return undefined;
  }

  updateAssetProcessingJob(
    jobId: string,
    update: Partial<Pick<AssetProcessingJob, "message" | "status" | "steps">>,
  ): AssetProcessingJob | undefined {
    const globalJob = this.globalAssetProcessingJobs.find((candidate) => candidate.id === jobId);
    if (globalJob) {
      const updatedJob: AssetProcessingJob = {
        ...globalJob,
        ...update,
      };
      const index = this.globalAssetProcessingJobs.findIndex((candidate) => candidate.id === jobId);
      this.globalAssetProcessingJobs[index] = updatedJob;
      return updatedJob;
    }

    for (const project of this.projects.values()) {
      const job = project.assetProcessingJobs.find((candidate) => candidate.id === jobId);
      if (!job) {
        continue;
      }

      const updatedJob: AssetProcessingJob = {
        ...job,
        ...update,
      };
      project.assetProcessingJobs = project.assetProcessingJobs.map((candidate) =>
        candidate.id === jobId ? updatedJob : candidate,
      );
      project.updatedAt = now();
      return updatedJob;
    }

    return undefined;
  }

  updateProjectPrepKeywords(projectId: string, keywords: string[]): ProjectSnapshot | undefined {
    const project = this.projects.get(projectId);
    if (!project) {
      return undefined;
    }

    project.prepKeywords = [...keywords];
    project.updatedAt = now();
    return project;
  }

  addReferenceVideo(
    projectId: string | undefined,
    reference: Omit<ReferenceVideo, "id" | "projectId" | "analysis" | "createdAt" | "updatedAt">,
  ): ReferenceVideo | undefined {
    const project = projectId ? this.projects.get(projectId) : undefined;
    if (projectId && !project) {
      return undefined;
    }

    const timestamp = now();
    const storedReference: ReferenceVideo = {
      ...reference,
      id: randomUUID(),
      projectId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (project) {
      project.referenceVideos.push(storedReference);
      project.updatedAt = timestamp;
    } else {
      this.globalReferenceVideos.push(storedReference);
    }
    return storedReference;
  }

  updateReferenceVideoAnalysis(
    referenceId: string,
    analysis: ReferenceVideoAnalysis,
  ): ReferenceVideo | undefined {
    const timestamp = now();
    const globalIndex = this.globalReferenceVideos.findIndex((reference) => reference.id === referenceId);
    if (globalIndex !== -1) {
      const updatedReference: ReferenceVideo = {
        ...this.globalReferenceVideos[globalIndex]!,
        analysis,
        status: "ready",
        updatedAt: timestamp,
      };
      this.globalReferenceVideos[globalIndex] = updatedReference;
      return updatedReference;
    }

    for (const project of this.projects.values()) {
      const referenceIndex = project.referenceVideos.findIndex(
        (reference) => reference.id === referenceId,
      );
      if (referenceIndex === -1) {
        continue;
      }

      const updatedReference: ReferenceVideo = {
        ...project.referenceVideos[referenceIndex]!,
        analysis,
        status: "ready",
        updatedAt: timestamp,
      };
      project.referenceVideos[referenceIndex] = updatedReference;
      project.updatedAt = timestamp;
      return updatedReference;
    }

    return undefined;
  }

  listReferenceVideos(projectId?: string): ReferenceVideo[] {
    if (projectId) {
      return this.projects.get(projectId)?.referenceVideos ?? [];
    }

    return [
      ...this.globalReferenceVideos,
      ...[...this.projects.values()].flatMap((project) => project.referenceVideos),
    ];
  }

  addViralTemplate(template: ViralTemplate): ViralTemplate {
    const existingIndex = this.viralTemplates.findIndex(
      (candidate) => candidate.templateId === template.templateId,
    );
    if (existingIndex === -1) {
      this.viralTemplates.push(template);
    } else {
      this.viralTemplates[existingIndex] = template;
    }

    for (const project of this.projects.values()) {
      const usesProjectReference = project.referenceVideos.some((reference) =>
        template.sourceReferenceIds.includes(reference.id),
      );
      if (usesProjectReference) {
        const projectTemplateIndex = project.viralTemplates.findIndex(
          (candidate) => candidate.templateId === template.templateId,
        );
        if (projectTemplateIndex === -1) {
          project.viralTemplates.push(template);
        } else {
          project.viralTemplates[projectTemplateIndex] = template;
        }
      }
    }
    return template;
  }

  listViralTemplates(category?: string): ViralTemplate[] {
    return this.viralTemplates.filter((template) => !category || template.category === category);
  }

  addScript(
    projectId: string,
    script: Omit<ScriptResult, "id" | "projectId">,
  ): ScriptResult | undefined {
    const project = this.projects.get(projectId);
    if (!project) {
      return undefined;
    }

    const storedScript: ScriptResult = {
      ...script,
      id: randomUUID(),
      projectId,
      scenes: script.scenes.map((scene) => ({
        ...scene,
        id: randomUUID(),
        projectId,
      })),
    };

    project.scripts.push(storedScript);
    project.scenes = storedScript.scenes;
    project.status = "ready";
    project.updatedAt = now();
    return storedScript;
  }

  addRenderTask(
    projectId: string,
    renderTask: Omit<RenderTask, "id" | "projectId" | "createdAt" | "updatedAt">,
    traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">>,
  ): { renderTask: RenderTask; traceEvents: TraceEvent[] } | undefined {
    const project = this.projects.get(projectId);
    if (!project) {
      return undefined;
    }

    const timestamp = now();
    const storedRenderTask: RenderTask = {
      ...renderTask,
      id: randomUUID(),
      projectId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const storedTraceEvents: TraceEvent[] = traceEvents.map((event) => ({
      ...event,
      id: randomUUID(),
      renderTaskId: storedRenderTask.id,
      createdAt: now(),
    }));

    project.renderTasks.push(storedRenderTask);
    project.status =
      storedRenderTask.status === "completed"
        ? "completed"
        : storedRenderTask.status === "failed"
          ? "failed"
          : "rendering";
    project.updatedAt = timestamp;
    this.traceEvents.set(storedRenderTask.id, storedTraceEvents);

    return {
      renderTask: storedRenderTask,
      traceEvents: storedTraceEvents,
    };
  }

  updateScene(sceneId: string, update: SceneUpdate): StoryboardScene | undefined {
    const match = this.findSceneProject(sceneId);
    if (!match) {
      return undefined;
    }

    const updatedScene: StoryboardScene = {
      ...match.scene,
      ...update,
      assetRecallQuery:
        update.assetRecallQuery === null
          ? undefined
          : (update.assetRecallQuery ?? match.scene.assetRecallQuery),
      assetId: update.assetId === null ? undefined : (update.assetId ?? match.scene.assetId),
      status: update.status ?? "edited",
    };

    this.replaceScene(match.project, updatedScene);
    match.project.updatedAt = now();
    return updatedScene;
  }

  reorderScenes(projectId: string, sceneIds: string[]): StoryboardScene[] | undefined {
    const project = this.projects.get(projectId);
    if (!project) {
      return undefined;
    }

    if (
      sceneIds.length !== project.scenes.length ||
      sceneIds.some((sceneId) => !project.scenes.some((scene) => scene.id === sceneId))
    ) {
      return undefined;
    }

    const reordered = sceneIds.map((sceneId, index) => ({
      ...project.scenes.find((scene) => scene.id === sceneId)!,
      order: index + 1,
    }));

    project.scenes = reordered;
    project.scripts = project.scripts.map((script) => ({
      ...script,
      scenes: reordered.filter((scene) =>
        script.scenes.some((scriptScene) => scriptScene.id === scene.id),
      ),
    }));
    project.updatedAt = now();
    return reordered;
  }

  deleteScene(sceneId: string): StoryboardScene[] | undefined {
    const match = this.findSceneProject(sceneId);
    if (!match) {
      return undefined;
    }

    const remainingScenes = match.project.scenes
      .filter((scene) => scene.id !== sceneId)
      .map((scene, index) => ({ ...scene, order: index + 1 }));

    match.project.scenes = remainingScenes;
    match.project.scripts = match.project.scripts.map((script) => ({
      ...script,
      scenes: script.scenes
        .filter((scene) => scene.id !== sceneId)
        .map((scene) => remainingScenes.find((remaining) => remaining.id === scene.id))
        .filter((scene): scene is StoryboardScene => Boolean(scene)),
    }));
    match.project.updatedAt = now();
    return remainingScenes;
  }

  getSceneContext(
    sceneId: string,
  ): { project: ProjectSnapshot; scene: StoryboardScene } | undefined {
    return this.findSceneProject(sceneId);
  }

  appendTraceEvent(
    traceKey: string,
    event: Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">,
  ): TraceEvent {
    const storedTraceEvent: TraceEvent = {
      ...event,
      id: randomUUID(),
      renderTaskId: traceKey,
      createdAt: now(),
    };

    this.traceEvents.set(traceKey, [...(this.traceEvents.get(traceKey) ?? []), storedTraceEvent]);
    return storedTraceEvent;
  }

  getStoredSuggestion(
    sceneId: string,
    suggestionId: string,
    createSuggestions: () => EditingSuggestion[],
  ): EditingSuggestion | undefined {
    return createSuggestions().find((suggestion) => suggestion.id === suggestionId);
  }

  getRenderTask(
    renderTaskId: string,
  ): { project: ProjectSnapshot; renderTask: RenderTask; traceEvents: TraceEvent[] } | undefined {
    for (const project of this.projects.values()) {
      const renderTask = project.renderTasks.find((candidate) => candidate.id === renderTaskId);
      if (renderTask) {
        return {
          project,
          renderTask,
          traceEvents: this.traceEvents.get(renderTaskId) ?? [],
        };
      }
    }

    return undefined;
  }

  updateRenderTask(
    renderTaskId: string,
    update: Partial<Omit<RenderTask, "id" | "projectId" | "createdAt" | "updatedAt">>,
    traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">> = [],
  ): { renderTask: RenderTask; traceEvents: TraceEvent[] } | undefined {
    for (const project of this.projects.values()) {
      const renderTaskIndex = project.renderTasks.findIndex(
        (candidate) => candidate.id === renderTaskId,
      );
      if (renderTaskIndex === -1) {
        continue;
      }

      const timestamp = now();
      const current = project.renderTasks[renderTaskIndex]!;
      const updatedRenderTask: RenderTask = {
        ...current,
        ...update,
        updatedAt: timestamp,
      };
      project.renderTasks[renderTaskIndex] = updatedRenderTask;
      const storedTraceEvents: TraceEvent[] = traceEvents.map((event) => ({
        ...event,
        id: randomUUID(),
        renderTaskId,
        createdAt: now(),
      }));
      this.traceEvents.set(renderTaskId, [
        ...(this.traceEvents.get(renderTaskId) ?? []),
        ...storedTraceEvents,
      ]);
      project.status =
        updatedRenderTask.status === "completed"
          ? "completed"
          : updatedRenderTask.status === "failed"
            ? "failed"
            : "rendering";
      project.updatedAt = timestamp;

      return {
        renderTask: updatedRenderTask,
        traceEvents: this.traceEvents.get(renderTaskId) ?? [],
      };
    }

    return undefined;
  }

  listAssets(): { assets: AssetMetadata[]; assetSlices: AssetSlice[] } {
    const projectAssets = [...this.projects.values()].flatMap((project) => project.assets);
    const projectSlices = [...this.projects.values()].flatMap((project) => project.assetSlices);

    return {
      assets: [...this.globalAssets, ...projectAssets],
      assetSlices: [...this.globalAssetSlices, ...projectSlices],
    };
  }

  private findSceneProject(
    sceneId: string,
  ): { project: ProjectSnapshot; scene: StoryboardScene } | undefined {
    for (const project of this.projects.values()) {
      const scene = project.scenes.find((candidate) => candidate.id === sceneId);
      if (scene) {
        return { project, scene };
      }
    }

    return undefined;
  }

  private findAssetProject(
    assetId: string,
  ): { project?: ProjectSnapshot; asset: AssetMetadata } | undefined {
    const globalAsset = this.globalAssets.find((candidate) => candidate.id === assetId);
    if (globalAsset) {
      return { asset: globalAsset };
    }

    for (const project of this.projects.values()) {
      const asset = project.assets.find((candidate) => candidate.id === assetId);
      if (asset) {
        return { project, asset };
      }
    }

    return undefined;
  }

  private replaceScene(project: ProjectSnapshot, updatedScene: StoryboardScene): void {
    project.scenes = project.scenes.map((scene) =>
      scene.id === updatedScene.id ? updatedScene : scene,
    );
    project.scripts = project.scripts.map((script) => ({
      ...script,
      scenes: script.scenes.map((scene) => (scene.id === updatedScene.id ? updatedScene : scene)),
    }));
  }
}
