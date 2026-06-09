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
  applyReferenceVideoAnalysis,
  applyReferenceVideoUpdate,
  clearAssetReferences,
  isReferenceOwnedAsset,
  materializeScriptScenes,
  materializeTraceEvents,
  projectUsesTemplateReference,
  removeAssetEventsByAssetId,
  removeAssetJobsByAssetId,
  removeAssetsById,
  removeAssetSlicesByAssetId,
  removeProjectAssetsById,
  removeTemplatesForReference,
  removeSceneFromProject,
  reorderProjectScenes,
  replaceSceneInProject,
  syncScriptsToScenes,
  toMemoryProjectSummary,
  toProjectStatusFromRenderTask,
  upsertViralTemplate,
} from "./memoryProjectStoreUtils.js";

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
      .map(toMemoryProjectSummary)
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

    const globalAssetRemoval = removeAssetsById(this.globalAssets, requestedAssetIds);
    deletedAssets.push(...globalAssetRemoval.deletedAssets);
    this.globalAssets.splice(0, this.globalAssets.length, ...globalAssetRemoval.assets);
    this.globalAssetSlices.splice(
      0,
      this.globalAssetSlices.length,
      ...removeAssetSlicesByAssetId(this.globalAssetSlices, requestedAssetIds),
    );
    this.globalAssetProcessingJobs.splice(
      0,
      this.globalAssetProcessingJobs.length,
      ...removeAssetJobsByAssetId(this.globalAssetProcessingJobs, requestedAssetIds),
    );
    this.globalAssetProcessingEvents.splice(
      0,
      this.globalAssetProcessingEvents.length,
      ...removeAssetEventsByAssetId(this.globalAssetProcessingEvents, requestedAssetIds),
    );

    for (const project of this.projects.values()) {
      const projectAssetRemoval = removeProjectAssetsById(project, requestedAssetIds);
      deletedAssets.push(...projectAssetRemoval.deletedAssets);
      if (!projectAssetRemoval.changed) {
        continue;
      }

      project.assets = projectAssetRemoval.assets;
      project.assetSlices = projectAssetRemoval.assetSlices;
      project.assetProcessingJobs = projectAssetRemoval.assetProcessingJobs;
      project.assetProcessingEvents = projectAssetRemoval.assetProcessingEvents;
      project.scenes = projectAssetRemoval.scenes;
      project.scripts = projectAssetRemoval.scripts;
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
        const clearedReferences = clearAssetReferences(remainingProject, deletedAssetIds);
        remainingProject.scenes = clearedReferences.scenes;
        remainingProject.scripts = clearedReferences.scripts;
      }
    }

    return true;
  }

  deleteScript(scriptId: string): ScriptResult | undefined {
    const timestamp = now();
    for (const project of this.projects.values()) {
      const script = project.scripts.find((candidate) => candidate.id === scriptId);
      if (!script) {
        continue;
      }
      project.scripts = project.scripts.filter((candidate) => candidate.id !== scriptId);
      project.updatedAt = timestamp;
      return script;
    }
    return undefined;
  }

  deleteRenderTask(renderTaskId: string): RenderTask | undefined {
    const timestamp = now();
    for (const project of this.projects.values()) {
      const renderTask = project.renderTasks.find((candidate) => candidate.id === renderTaskId);
      if (!renderTask) {
        continue;
      }
      project.renderTasks = project.renderTasks.filter((candidate) => candidate.id !== renderTaskId);
      this.traceEvents.delete(renderTaskId);
      project.updatedAt = timestamp;
      return renderTask;
    }
    return undefined;
  }

  deleteReferenceVideo(referenceId: string): DeleteReferenceVideoResult | undefined {
    const timestamp = now();
    const globalReferenceIndex = this.globalReferenceVideos.findIndex(
      (reference) => reference.id === referenceId,
    );
    const projectWithReference = [...this.projects.values()].find((project) =>
      project.referenceVideos.some((reference) => reference.id === referenceId),
    );
    const projectReferenceIndex =
      projectWithReference?.referenceVideos.findIndex(
        (reference) => reference.id === referenceId,
      ) ?? -1;
    const deletedReference =
      globalReferenceIndex !== -1
        ? this.globalReferenceVideos[globalReferenceIndex]
        : projectReferenceIndex !== -1
          ? projectWithReference?.referenceVideos[projectReferenceIndex]
          : undefined;

    if (!deletedReference) {
      return undefined;
    }

    const allAssets = [
      ...this.globalAssets,
      ...[...this.projects.values()].flatMap((project) => project.assets),
    ];
    const deletedAssetIds = allAssets
      .filter((asset) => isReferenceOwnedAsset(asset, deletedReference))
      .map((asset) => asset.id);

    if (globalReferenceIndex !== -1) {
      this.globalReferenceVideos.splice(globalReferenceIndex, 1);
    } else if (projectWithReference && projectReferenceIndex !== -1) {
      projectWithReference.referenceVideos.splice(projectReferenceIndex, 1);
      projectWithReference.updatedAt = timestamp;
    }

    const deletedTemplateIds = this.deleteTemplatesForReference(referenceId);
    const deletedAssets = this.deleteAssets(deletedAssetIds);

    return {
      deletedAssets,
      deletedReference,
      deletedTemplateIds,
    };
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

  updateProjectBrief(projectId: string, brief: ProjectBrief): ProjectSnapshot | undefined {
    const project = this.projects.get(projectId);
    if (!project) {
      return undefined;
    }

    project.title = brief.title;
    project.productName = brief.productName;
    project.audience = brief.audience;
    project.sellingPoints = [...brief.sellingPoints];
    project.tone = brief.tone;
    project.style = brief.style;
    project.targetDurationSeconds = brief.targetDurationSeconds;
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
    const globalIndex = this.globalReferenceVideos.findIndex(
      (reference) => reference.id === referenceId,
    );
    if (globalIndex !== -1) {
      const updatedReference = applyReferenceVideoAnalysis(
        this.globalReferenceVideos[globalIndex]!,
        analysis,
        timestamp,
      );
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

      const updatedReference = applyReferenceVideoAnalysis(
        project.referenceVideos[referenceIndex]!,
        analysis,
        timestamp,
      );
      project.referenceVideos[referenceIndex] = updatedReference;
      project.updatedAt = timestamp;
      return updatedReference;
    }

    return undefined;
  }

  updateReferenceVideo(
    referenceId: string,
    update: Partial<
      Pick<
        ReferenceVideo,
        "errorMessage" | "publicStats" | "sourceAssetId" | "sourceUrl" | "status"
      >
    >,
  ): ReferenceVideo | undefined {
    const timestamp = now();

    const globalIndex = this.globalReferenceVideos.findIndex(
      (reference) => reference.id === referenceId,
    );
    if (globalIndex !== -1) {
      const updatedReference = applyReferenceVideoUpdate(
        this.globalReferenceVideos[globalIndex]!,
        update,
        timestamp,
      );
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

      const updatedReference = applyReferenceVideoUpdate(
        project.referenceVideos[referenceIndex]!,
        update,
        timestamp,
      );
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
    this.viralTemplates.splice(0, this.viralTemplates.length, ...upsertViralTemplate(this.viralTemplates, template));

    for (const project of this.projects.values()) {
      if (projectUsesTemplateReference(project, template)) {
        project.viralTemplates = upsertViralTemplate(project.viralTemplates, template);
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
      scenes: materializeScriptScenes(script.scenes, projectId, randomUUID),
    };

    project.scripts.push(storedScript);
    project.scenes = storedScript.scenes;
    project.status = "ready";
    project.updatedAt = now();
    return storedScript;
  }

  updateScriptScenes(
    scriptId: string,
    scenes: StoryboardScene[],
    constraints?: string[],
  ): ScriptResult | undefined {
    const timestamp = now();
    for (const project of this.projects.values()) {
      const scriptIndex = project.scripts.findIndex((candidate) => candidate.id === scriptId);
      if (scriptIndex < 0) {
        continue;
      }
      const currentScript = project.scripts[scriptIndex]!;
      const nextScenes = materializeScriptScenes(scenes, project.id, randomUUID);
      const nextScript: ScriptResult = {
        ...currentScript,
        constraints: constraints ?? currentScript.constraints,
        scenes: nextScenes,
      };
      project.scripts = project.scripts.map((script) =>
        script.id === scriptId ? nextScript : script,
      );
      project.scenes = nextScenes;
      project.status = "ready";
      project.updatedAt = timestamp;
      return nextScript;
    }
    return undefined;
  }

  updateScriptDisplayName(
    scriptId: string,
    displayName: string | undefined,
  ): ScriptResult | undefined {
    const timestamp = now();
    for (const project of this.projects.values()) {
      const scriptIndex = project.scripts.findIndex((candidate) => candidate.id === scriptId);
      if (scriptIndex < 0) {
        continue;
      }
      const updatedScript: ScriptResult = {
        ...project.scripts[scriptIndex]!,
        displayName,
      };
      project.scripts[scriptIndex] = updatedScript;
      project.updatedAt = timestamp;
      return updatedScript;
    }
    return undefined;
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
    const storedTraceEvents = materializeTraceEvents(
      storedRenderTask.id,
      traceEvents,
      randomUUID,
      now,
    );

    project.renderTasks.push(storedRenderTask);
    project.status = toProjectStatusFromRenderTask(storedRenderTask);
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

    const nextProjectScenes = replaceSceneInProject(match.project, updatedScene);
    match.project.scenes = nextProjectScenes.scenes;
    match.project.scripts = nextProjectScenes.scripts;
    match.project.updatedAt = now();
    return updatedScene;
  }

  reorderScenes(projectId: string, sceneIds: string[]): StoryboardScene[] | undefined {
    const project = this.projects.get(projectId);
    if (!project) {
      return undefined;
    }

    const reordered = reorderProjectScenes(project, sceneIds);
    if (!reordered) {
      return undefined;
    }

    project.scenes = reordered;
    project.scripts = syncScriptsToScenes(project.scripts, reordered);
    project.updatedAt = now();
    return reordered;
  }

  deleteScene(sceneId: string): StoryboardScene[] | undefined {
    const match = this.findSceneProject(sceneId);
    if (!match) {
      return undefined;
    }

    const remainingProjectScenes = removeSceneFromProject(match.project, sceneId);
    match.project.scenes = remainingProjectScenes.scenes;
    match.project.scripts = remainingProjectScenes.scripts;
    match.project.updatedAt = now();
    return remainingProjectScenes.scenes;
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
    const [storedTraceEvent] = materializeTraceEvents(traceKey, [event], randomUUID, now);

    this.traceEvents.set(traceKey, [
      ...(this.traceEvents.get(traceKey) ?? []),
      storedTraceEvent!,
    ]);
    return storedTraceEvent!;
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
      const storedTraceEvents = materializeTraceEvents(renderTaskId, traceEvents, randomUUID, now);
      this.traceEvents.set(renderTaskId, [
        ...(this.traceEvents.get(renderTaskId) ?? []),
        ...storedTraceEvents,
      ]);
      project.status = toProjectStatusFromRenderTask(updatedRenderTask);
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

  private deleteTemplatesForReference(referenceId: string): string[] {
    const deletedTemplateIds = new Set<string>();
    const globalTemplates = removeTemplatesForReference(this.viralTemplates, referenceId);
    globalTemplates.deletedTemplateIds.forEach((templateId) => deletedTemplateIds.add(templateId));
    this.viralTemplates.splice(0, this.viralTemplates.length, ...globalTemplates.templates);

    for (const project of this.projects.values()) {
      const projectTemplates = removeTemplatesForReference(project.viralTemplates, referenceId);
      projectTemplates.deletedTemplateIds.forEach((templateId) => deletedTemplateIds.add(templateId));
      if (projectTemplates.templates.length !== project.viralTemplates.length) {
        project.viralTemplates = projectTemplates.templates;
        project.updatedAt = now();
      }
    }

    return [...deletedTemplateIds];
  }

}
