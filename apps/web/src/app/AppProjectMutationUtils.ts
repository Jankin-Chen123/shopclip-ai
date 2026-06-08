import type {
  AssetMetadata,
  AssetProcessingEvent,
  AssetProcessingJob,
  AssetSlice,
  Project,
  RenderTask,
  ScriptResult,
  StoryboardScene,
} from "@shopclip/shared";

import type { ProjectSnapshot } from "../lib/api";

const clearSceneAssetReferences = <T extends StoryboardScene>(
  scenes: T[],
  deletedAssetIds: Set<string>,
): T[] =>
  scenes.map((scene) =>
    scene.assetId && deletedAssetIds.has(scene.assetId)
      ? { ...scene, assetId: undefined }
      : scene,
  );

const belongsToProject = (
  project: ProjectSnapshot | undefined,
  asset: AssetMetadata,
): project is ProjectSnapshot => Boolean(project && asset.projectId === project.id);

const projectStatusAfterRenderTask = (renderTask: RenderTask): Project["status"] =>
  renderTask.status === "completed" ? "completed" : "rendering";

export const appendProjectRenderTask = (
  project: ProjectSnapshot | undefined,
  renderTask: RenderTask,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        renderTasks: [...project.renderTasks, renderTask],
        status: projectStatusAfterRenderTask(renderTask),
      }
    : project;

export const upsertProjectRenderTask = (
  project: ProjectSnapshot | undefined,
  renderTask: RenderTask,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        renderTasks: [
          ...project.renderTasks.filter((task) => task.id !== renderTask.id),
          renderTask,
        ],
        status: projectStatusAfterRenderTask(renderTask),
      }
    : project;

export const replaceProjectRenderTaskProgress = (
  project: ProjectSnapshot | undefined,
  renderTask: RenderTask,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        renderTasks: project.renderTasks.map((task) =>
          task.id === renderTask.id ? renderTask : task,
        ),
        status: renderTask.status === "completed" ? "completed" : project.status,
      }
    : project;

export const markProjectRenderTaskExported = (
  project: ProjectSnapshot | undefined,
  {
    exportUrl,
    renderTaskId,
  }: {
    exportUrl: string;
    renderTaskId: string | undefined;
  },
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        renderTasks: project.renderTasks.map((task) =>
          task.id === renderTaskId
            ? {
                ...task,
                exportUrl,
                previewUrl: exportUrl,
              }
            : task,
        ),
        status: "completed",
      }
    : project;

export const replaceProjectRenderTask = (
  project: ProjectSnapshot | undefined,
  renderTask: RenderTask,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        renderTasks: project.renderTasks.map((task) =>
          task.id === renderTask.id ? renderTask : task,
        ),
      }
    : project;

export const removeProjectRenderTask = (
  project: ProjectSnapshot | undefined,
  renderTaskId: string,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        renderTasks: project.renderTasks.filter((task) => task.id !== renderTaskId),
      }
    : project;

export const replaceProjectScript = (
  project: ProjectSnapshot | undefined,
  script: ScriptResult,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        scripts: project.scripts.map((candidate) =>
          candidate.id === script.id ? script : candidate,
        ),
      }
    : project;

export const replaceProjectScriptStoryboard = (
  project: ProjectSnapshot | undefined,
  script: ScriptResult,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        scenes: script.scenes,
        scripts: project.scripts.map((candidate) =>
          candidate.id === script.id ? script : candidate,
        ),
        status: "ready",
      }
    : project;

export const removeProjectScript = (
  project: ProjectSnapshot | undefined,
  scriptId: string,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        scripts: project.scripts.filter((candidate) => candidate.id !== scriptId),
      }
    : project;

export const appendProjectScript = (
  project: ProjectSnapshot | undefined,
  script: ScriptResult,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        scenes: script.scenes,
        scripts: [...project.scripts, script],
        status: "ready",
      }
    : project;

export const removeProjectAssets = (
  project: ProjectSnapshot | undefined,
  deletedAssetIds: Set<string>,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        assets: project.assets.filter((asset) => !deletedAssetIds.has(asset.id)),
        assetSlices: project.assetSlices.filter((slice) => !deletedAssetIds.has(slice.assetId)),
        scenes: clearSceneAssetReferences(project.scenes, deletedAssetIds),
        scripts: project.scripts.map((script) => ({
          ...script,
          scenes: clearSceneAssetReferences(script.scenes, deletedAssetIds),
        })),
      }
    : project;

export const appendProjectAsset = (
  project: ProjectSnapshot | undefined,
  asset: AssetMetadata,
): ProjectSnapshot | undefined =>
  belongsToProject(project, asset)
    ? {
        ...project,
        assets: [...project.assets, asset],
      }
    : project;

export const upsertProjectAsset = (
  project: ProjectSnapshot | undefined,
  asset: AssetMetadata,
): ProjectSnapshot | undefined =>
  belongsToProject(project, asset)
    ? {
        ...project,
        assets: [...project.assets.filter((candidate) => candidate.id !== asset.id), asset],
    }
    : project;

export const replaceProcessedProjectAsset = (
  project: ProjectSnapshot | undefined,
  processed: {
    asset: AssetMetadata;
    events: AssetProcessingEvent[];
    job: AssetProcessingJob;
    slices: AssetSlice[];
  },
): ProjectSnapshot | undefined =>
  belongsToProject(project, processed.asset)
    ? {
        ...project,
        assets: project.assets.map((asset) =>
          asset.id === processed.asset.id ? processed.asset : asset,
        ),
        assetSlices: [
          ...project.assetSlices.filter((slice) => slice.assetId !== processed.asset.id),
          ...processed.slices,
        ],
        assetProcessingEvents: [...project.assetProcessingEvents, ...processed.events],
        assetProcessingJobs: [...project.assetProcessingJobs, processed.job],
      }
    : project;

export const mergeImportedProjectAssets = ({
  assets,
  assetSlices,
  project,
}: {
  assets: AssetMetadata[];
  assetSlices: AssetSlice[];
  project: ProjectSnapshot | undefined;
}): ProjectSnapshot | undefined => {
  if (!project) {
    return project;
  }

  const projectAssets = assets.filter((asset) => asset.projectId === project.id);
  if (projectAssets.length === 0) {
    return project;
  }

  const importedSliceAssetIds = new Set(assetSlices.map((slice) => slice.assetId));
  const projectAssetIds = new Set(projectAssets.map((asset) => asset.id));
  return {
    ...project,
    assets: [...project.assets, ...projectAssets],
    assetSlices: [
      ...project.assetSlices.filter((slice) => !importedSliceAssetIds.has(slice.assetId)),
      ...assetSlices.filter((slice) => projectAssetIds.has(slice.assetId)),
    ],
  };
};

export const replaceProjectScenes = (
  project: ProjectSnapshot | undefined,
  scenes: StoryboardScene[],
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        scenes,
      }
    : project;

export const replaceProjectScene = (
  project: ProjectSnapshot | undefined,
  scene: StoryboardScene,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        scenes: project.scenes.map((candidate) => (candidate.id === scene.id ? scene : candidate)),
        scripts: project.scripts.map((script) => ({
          ...script,
          scenes: script.scenes.map((candidate) =>
            candidate.id === scene.id ? scene : candidate,
          ),
        })),
      }
    : project;
