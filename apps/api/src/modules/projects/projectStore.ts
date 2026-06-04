import type {
  AssetMetadata,
  AssetProcessingEvent,
  AssetProcessingJob,
  AssetSlice,
  EditingSuggestion,
  Project,
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

export interface ProjectSnapshot extends Project {
  assets: AssetMetadata[];
  assetSlices: AssetSlice[];
  assetProcessingEvents: AssetProcessingEvent[];
  assetProcessingJobs: AssetProcessingJob[];
  referenceVideos: ReferenceVideo[];
  viralTemplates: ViralTemplate[];
  scripts: ScriptResult[];
  scenes: StoryboardScene[];
  renderTasks: RenderTask[];
}

export type MaybePromise<T> = T | Promise<T>;

export interface DeleteReferenceVideoResult {
  deletedAssets: AssetMetadata[];
  deletedReference: ReferenceVideo;
  deletedTemplateIds: string[];
}

export interface ProjectStore {
  appendTraceEvent(
    traceKey: string,
    event: Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">,
  ): MaybePromise<TraceEvent>;
  addAsset(
    projectId: string | undefined,
    asset: Omit<AssetMetadata, "id" | "projectId" | "createdAt" | "updatedAt">,
    createSlices?: (asset: AssetMetadata) => Array<Omit<AssetSlice, "id" | "assetId">>,
  ): MaybePromise<AssetMetadata | undefined>;
  addAssetWithId(
    projectId: string | undefined,
    assetId: string,
    asset: Omit<AssetMetadata, "id" | "projectId" | "createdAt" | "updatedAt">,
    createSlices?: (asset: AssetMetadata) => Array<Omit<AssetSlice, "id" | "assetId">>,
  ): MaybePromise<AssetMetadata | undefined>;
  addAssetProcessingJob(
    projectId: string | undefined,
    job: Omit<AssetProcessingJob, "createdAt">,
  ): MaybePromise<AssetProcessingJob | undefined>;
  addAssetProcessingEvent(
    jobId: string,
    event: Omit<AssetProcessingEvent, "id" | "jobId" | "createdAt">,
  ): MaybePromise<AssetProcessingEvent | undefined>;
  addAssetSlices(
    assetId: string,
    slices: Array<Omit<AssetSlice, "id" | "assetId">>,
  ): MaybePromise<AssetSlice[]>;
  addReferenceVideo(
    projectId: string | undefined,
    reference: Omit<ReferenceVideo, "id" | "projectId" | "analysis" | "createdAt" | "updatedAt">,
  ): MaybePromise<ReferenceVideo | undefined>;
  addRenderTask(
    projectId: string,
    renderTask: Omit<RenderTask, "id" | "projectId" | "createdAt" | "updatedAt">,
    traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">>,
  ): MaybePromise<{ renderTask: RenderTask; traceEvents: TraceEvent[] } | undefined>;
  addScript(
    projectId: string,
    script: Omit<ScriptResult, "id" | "projectId">,
  ): MaybePromise<ScriptResult | undefined>;
  updateScriptScenes(
    scriptId: string,
    scenes: StoryboardScene[],
    constraints?: string[],
  ): MaybePromise<ScriptResult | undefined>;
  updateScriptDisplayName(
    scriptId: string,
    displayName: string | undefined,
  ): MaybePromise<ScriptResult | undefined>;
  addViralTemplate(template: ViralTemplate): MaybePromise<ViralTemplate>;
  createProject(brief: ProjectBrief): MaybePromise<ProjectSnapshot>;
  deleteAssets(assetIds: string[]): MaybePromise<AssetMetadata[]>;
  deleteProject(projectId: string): MaybePromise<boolean>;
  deleteReferenceVideo(referenceId: string): MaybePromise<DeleteReferenceVideoResult | undefined>;
  deleteRenderTask(renderTaskId: string): MaybePromise<RenderTask | undefined>;
  deleteScript(scriptId: string): MaybePromise<ScriptResult | undefined>;
  deleteScene(sceneId: string): MaybePromise<StoryboardScene[] | undefined>;
  getAssetProcessingJob(jobId: string): MaybePromise<AssetProcessingJob | undefined>;
  getAsset(assetId: string): MaybePromise<AssetMetadata | undefined>;
  getLatestAssetProcessingJob(assetId: string): MaybePromise<AssetProcessingJob | undefined>;
  getProject(id: string): MaybePromise<ProjectSnapshot | undefined>;
  listAssetProcessingEvents(jobId: string): MaybePromise<AssetProcessingEvent[]>;
  listProjects(): MaybePromise<ProjectSummary[]>;
  listAssets(): MaybePromise<{ assets: AssetMetadata[]; assetSlices: AssetSlice[] }>;
  listReferenceVideos(projectId?: string): MaybePromise<ReferenceVideo[]>;
  listViralTemplates(category?: string): MaybePromise<ViralTemplate[]>;
  getRenderTask(
    renderTaskId: string,
  ): MaybePromise<
    { project: ProjectSnapshot; renderTask: RenderTask; traceEvents: TraceEvent[] } | undefined
  >;
  getSceneContext(
    sceneId: string,
  ): MaybePromise<{ project: ProjectSnapshot; scene: StoryboardScene } | undefined>;
  getStoredSuggestion(
    sceneId: string,
    suggestionId: string,
    createSuggestions: () => EditingSuggestion[],
  ): MaybePromise<EditingSuggestion | undefined>;
  reorderScenes(projectId: string, sceneIds: string[]): MaybePromise<StoryboardScene[] | undefined>;
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
  ): MaybePromise<AssetMetadata | undefined>;
  updateAssetProcessingJob(
    jobId: string,
    update: Partial<Pick<AssetProcessingJob, "message" | "status" | "steps">>,
  ): MaybePromise<AssetProcessingJob | undefined>;
  updateAssetSlice(
    sliceId: string,
    update: Partial<Omit<AssetSlice, "id" | "assetId">>,
  ): MaybePromise<AssetSlice | undefined>;
  updateReferenceVideoAnalysis(
    referenceId: string,
    analysis: ReferenceVideoAnalysis,
  ): MaybePromise<ReferenceVideo | undefined>;
  updateReferenceVideo(
    referenceId: string,
    update: Partial<
      Pick<
        ReferenceVideo,
        "errorMessage" | "publicStats" | "sourceAssetId" | "sourceUrl" | "status"
      >
    >,
  ): MaybePromise<ReferenceVideo | undefined>;
  updateProjectPrepKeywords(
    projectId: string,
    keywords: string[],
  ): MaybePromise<ProjectSnapshot | undefined>;
  updateProjectBrief(
    projectId: string,
    brief: ProjectBrief,
  ): MaybePromise<ProjectSnapshot | undefined>;
  updateRenderTask(
    renderTaskId: string,
    update: Partial<Omit<RenderTask, "id" | "projectId" | "createdAt" | "updatedAt">>,
    traceEvents?: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">>,
  ): MaybePromise<{ renderTask: RenderTask; traceEvents: TraceEvent[] } | undefined>;
  updateScene(sceneId: string, update: SceneUpdate): MaybePromise<StoryboardScene | undefined>;
}
