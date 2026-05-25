import type {
  AssetMetadata,
  AssetProcessingJob,
  AssetSlice,
  EditingSuggestion,
  Project,
  ProjectBrief,
  RenderTask,
  SceneUpdate,
  ScriptResult,
  StoryboardScene,
  TraceEvent,
} from "@shopclip/shared";

export interface ProjectSnapshot extends Project {
  assets: AssetMetadata[];
  assetSlices: AssetSlice[];
  assetProcessingJobs: AssetProcessingJob[];
  scripts: ScriptResult[];
  scenes: StoryboardScene[];
  renderTasks: RenderTask[];
}

export type MaybePromise<T> = T | Promise<T>;

export interface ProjectStore {
  appendTraceEvent(
    traceKey: string,
    event: Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">,
  ): MaybePromise<TraceEvent>;
  addAsset(
    projectId: string,
    asset: Omit<AssetMetadata, "id" | "projectId" | "createdAt" | "updatedAt">,
    createSlices?: (asset: AssetMetadata) => Array<Omit<AssetSlice, "id" | "assetId">>,
  ): MaybePromise<AssetMetadata | undefined>;
  addAssetWithId(
    projectId: string,
    assetId: string,
    asset: Omit<AssetMetadata, "id" | "projectId" | "createdAt" | "updatedAt">,
    createSlices?: (asset: AssetMetadata) => Array<Omit<AssetSlice, "id" | "assetId">>,
  ): MaybePromise<AssetMetadata | undefined>;
  addAssetProcessingJob(
    projectId: string,
    job: Omit<AssetProcessingJob, "createdAt">,
  ): MaybePromise<AssetProcessingJob | undefined>;
  addRenderTask(
    projectId: string,
    renderTask: Omit<RenderTask, "id" | "projectId" | "createdAt" | "updatedAt">,
    traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">>,
  ): MaybePromise<{ renderTask: RenderTask; traceEvents: TraceEvent[] } | undefined>;
  addScript(
    projectId: string,
    script: Omit<ScriptResult, "id" | "projectId">,
  ): MaybePromise<ScriptResult | undefined>;
  createProject(brief: ProjectBrief): MaybePromise<ProjectSnapshot>;
  deleteScene(sceneId: string): MaybePromise<StoryboardScene[] | undefined>;
  getAssetProcessingJob(jobId: string): MaybePromise<AssetProcessingJob | undefined>;
  getLatestAssetProcessingJob(assetId: string): MaybePromise<AssetProcessingJob | undefined>;
  getProject(id: string): MaybePromise<ProjectSnapshot | undefined>;
  getRenderTask(
    renderTaskId: string,
  ): MaybePromise<{ project: ProjectSnapshot; renderTask: RenderTask; traceEvents: TraceEvent[] } | undefined>;
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
        "embeddingText" | "metadata" | "objectKey" | "status" | "tags" | "thumbnailKey" | "url"
      >
    >,
  ): MaybePromise<AssetMetadata | undefined>;
  updateAssetProcessingJob(
    jobId: string,
    update: Partial<Pick<AssetProcessingJob, "message" | "status" | "steps">>,
  ): MaybePromise<AssetProcessingJob | undefined>;
  updateScene(sceneId: string, update: SceneUpdate): MaybePromise<StoryboardScene | undefined>;
}

