import type {
  AssetMetadata,
  AssetProcessingEvent,
  AssetProcessingJob,
  AssetSlice,
  ProjectSummary,
  ReferenceVideo,
  ReferenceVideoAnalysis,
  RenderTask,
  ScriptResult,
  StoryboardScene,
  TraceEvent,
  ViralTemplate,
} from "@shopclip/shared";

import type { ProjectSnapshot } from "./projectStore.js";

const isImageAsset = (asset: AssetMetadata): boolean =>
  asset.type === "image" || Boolean(asset.mimeType?.startsWith("image/"));

export const toMemoryProjectSummary = (project: ProjectSnapshot): ProjectSummary => {
  const coverAsset = project.assets.find(isImageAsset);
  return {
    id: project.id,
    title: project.title,
    productName: project.productName,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    assetCount: project.assets.length,
    coverAssetId: coverAsset?.id,
    coverAssetUrl: coverAsset?.url,
    sceneCount: project.scenes.length,
  };
};

export const clearAssetReferences = (
  project: Pick<ProjectSnapshot, "scenes" | "scripts">,
  assetIds: ReadonlySet<string>,
): {
  changed: boolean;
  scenes: StoryboardScene[];
  scripts: ScriptResult[];
} => {
  const scenes = project.scenes.map((scene) =>
    scene.assetId && assetIds.has(scene.assetId) ? { ...scene, assetId: undefined } : scene,
  );
  const scripts = project.scripts.map((script) => ({
    ...script,
    scenes: script.scenes.map((scene) =>
      scene.assetId && assetIds.has(scene.assetId) ? { ...scene, assetId: undefined } : scene,
    ),
  }));
  const changed =
    scenes.some((scene, index) => scene.assetId !== project.scenes[index]?.assetId) ||
    scripts.some((script, scriptIndex) =>
      script.scenes.some(
        (scene, sceneIndex) =>
          scene.assetId !== project.scripts[scriptIndex]?.scenes[sceneIndex]?.assetId,
      ),
    );

  return { changed, scenes, scripts };
};

export const removeAssetsById = (
  assets: AssetMetadata[],
  assetIds: ReadonlySet<string>,
): {
  assets: AssetMetadata[];
  deletedAssets: AssetMetadata[];
} => ({
  assets: assets.filter((asset) => !assetIds.has(asset.id)),
  deletedAssets: assets.filter((asset) => assetIds.has(asset.id)),
});

export const removeAssetSlicesByAssetId = (
  slices: AssetSlice[],
  assetIds: ReadonlySet<string>,
): AssetSlice[] => slices.filter((slice) => !assetIds.has(slice.assetId));

export const removeAssetJobsByAssetId = (
  jobs: AssetProcessingJob[],
  assetIds: ReadonlySet<string>,
): AssetProcessingJob[] => jobs.filter((job) => !assetIds.has(job.assetId));

export const removeAssetEventsByAssetId = (
  events: AssetProcessingEvent[],
  assetIds: ReadonlySet<string>,
): AssetProcessingEvent[] => events.filter((event) => !assetIds.has(event.assetId));

export const removeProjectAssetsById = (
  project: Pick<
    ProjectSnapshot,
    "assetProcessingEvents" | "assetProcessingJobs" | "assetSlices" | "assets" | "scenes" | "scripts"
  >,
  assetIds: ReadonlySet<string>,
): {
  assetProcessingEvents: AssetProcessingEvent[];
  assetProcessingJobs: AssetProcessingJob[];
  assetSlices: AssetSlice[];
  assets: AssetMetadata[];
  changed: boolean;
  deletedAssets: AssetMetadata[];
  scenes: StoryboardScene[];
  scripts: ScriptResult[];
} => {
  const assetRemoval = removeAssetsById(project.assets, assetIds);
  const clearedReferences = clearAssetReferences(project, assetIds);
  return {
    assetProcessingEvents: removeAssetEventsByAssetId(project.assetProcessingEvents, assetIds),
    assetProcessingJobs: removeAssetJobsByAssetId(project.assetProcessingJobs, assetIds),
    assetSlices: removeAssetSlicesByAssetId(project.assetSlices, assetIds),
    assets: assetRemoval.assets,
    changed: assetRemoval.deletedAssets.length > 0 || clearedReferences.changed,
    deletedAssets: assetRemoval.deletedAssets,
    scenes: clearedReferences.scenes,
    scripts: clearedReferences.scripts,
  };
};

export const isReferenceOwnedAsset = (
  asset: AssetMetadata,
  reference: ReferenceVideo,
): boolean => {
  const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  return (
    (metadata.kind === "reference_script_asset" && metadata.referenceId === reference.id) ||
    (asset.id === reference.sourceAssetId && asset.source === "public_reference")
  );
};

export const applyReferenceVideoAnalysis = (
  reference: ReferenceVideo,
  analysis: ReferenceVideoAnalysis,
  timestamp: string,
): ReferenceVideo => ({
  ...reference,
  analysis,
  status: "ready",
  updatedAt: timestamp,
});

export const applyReferenceVideoUpdate = (
  reference: ReferenceVideo,
  update: Partial<
    Pick<ReferenceVideo, "errorMessage" | "publicStats" | "sourceAssetId" | "sourceUrl" | "status">
  >,
  timestamp: string,
): ReferenceVideo => {
  const nextReference: ReferenceVideo = {
    ...reference,
    ...update,
    updatedAt: timestamp,
  };
  if (update.errorMessage === undefined && update.status && update.status !== "failed") {
    delete nextReference.errorMessage;
  }
  return nextReference;
};

export const upsertViralTemplate = (
  templates: ViralTemplate[],
  template: ViralTemplate,
): ViralTemplate[] => {
  const existingIndex = templates.findIndex(
    (candidate) => candidate.templateId === template.templateId,
  );
  if (existingIndex === -1) {
    return [...templates, template];
  }

  return templates.map((candidate, index) => (index === existingIndex ? template : candidate));
};

export const projectUsesTemplateReference = (
  project: Pick<ProjectSnapshot, "referenceVideos">,
  template: ViralTemplate,
): boolean =>
  project.referenceVideos.some((reference) => template.sourceReferenceIds.includes(reference.id));

export const removeTemplatesForReference = (
  templates: ViralTemplate[],
  referenceId: string,
): {
  deletedTemplateIds: string[];
  templates: ViralTemplate[];
} => {
  const deletedTemplateIds = templates
    .filter((template) => template.sourceReferenceIds.includes(referenceId))
    .map((template) => template.templateId);
  return {
    deletedTemplateIds,
    templates: templates.filter((template) => !template.sourceReferenceIds.includes(referenceId)),
  };
};

export const materializeScriptScenes = (
  scenes: StoryboardScene[],
  projectId: string,
  createId: () => string,
): StoryboardScene[] =>
  scenes.map((scene) => ({
    ...scene,
    id: createId(),
    projectId,
  }));

export const toProjectStatusFromRenderTask = (
  renderTask: Pick<RenderTask, "status">,
): ProjectSnapshot["status"] =>
  renderTask.status === "completed"
    ? "completed"
    : renderTask.status === "failed"
      ? "failed"
      : "rendering";

export const materializeTraceEvents = (
  traceKey: string,
  events: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">>,
  createId: () => string,
  createTimestamp: () => string,
): TraceEvent[] =>
  events.map((event) => ({
    ...event,
    id: createId(),
    renderTaskId: traceKey,
    createdAt: createTimestamp(),
  }));

export const replaceSceneInProject = (
  project: Pick<ProjectSnapshot, "scenes" | "scripts">,
  updatedScene: StoryboardScene,
): Pick<ProjectSnapshot, "scenes" | "scripts"> => ({
  scenes: project.scenes.map((scene) => (scene.id === updatedScene.id ? updatedScene : scene)),
  scripts: project.scripts.map((script) => ({
    ...script,
    scenes: script.scenes.map((scene) => (scene.id === updatedScene.id ? updatedScene : scene)),
  })),
});

export const reorderProjectScenes = (
  project: Pick<ProjectSnapshot, "scenes" | "scripts">,
  sceneIds: string[],
): StoryboardScene[] | undefined => {
  if (
    sceneIds.length !== project.scenes.length ||
    sceneIds.some((sceneId) => !project.scenes.some((scene) => scene.id === sceneId))
  ) {
    return undefined;
  }

  return sceneIds.map((sceneId, index) => ({
    ...project.scenes.find((scene) => scene.id === sceneId)!,
    order: index + 1,
  }));
};

export const syncScriptsToScenes = (
  scripts: ScriptResult[],
  scenes: StoryboardScene[],
): ScriptResult[] =>
  scripts.map((script) => ({
    ...script,
    scenes: scenes.filter((scene) =>
      script.scenes.some((scriptScene) => scriptScene.id === scene.id),
    ),
  }));

export const removeSceneFromProject = (
  project: Pick<ProjectSnapshot, "scenes" | "scripts">,
  sceneId: string,
): Pick<ProjectSnapshot, "scenes" | "scripts"> => {
  const scenes = project.scenes
    .filter((scene) => scene.id !== sceneId)
    .map((scene, index) => ({ ...scene, order: index + 1 }));

  return {
    scenes,
    scripts: syncScriptsToScenes(
      project.scripts.map((script) => ({
        ...script,
        scenes: script.scenes.filter((scene) => scene.id !== sceneId),
      })),
      scenes,
    ),
  };
};
