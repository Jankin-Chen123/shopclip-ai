import type { RenderTask, SceneRenderClip, TraceEvent } from "@shopclip/shared";

import type { materializeSceneClipsForSmartEdit } from "../../providers/renderer/sceneClipMaterializer.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import type { ProjectSnapshot, ProjectStore } from "./projectStore.js";
import type { RenderExportPublisherFn } from "./renderTaskService.js";

type RenderTaskSnapshot = NonNullable<Awaited<ReturnType<ProjectStore["getRenderTask"]>>>;

export type SceneClipMaterializer = typeof materializeSceneClipsForSmartEdit;

export type SeedanceRenderTaskLoader = (
  project: ProjectSnapshot,
  renderTask: RenderTask,
) => Promise<{
  renderTask: Partial<Omit<RenderTask, "id" | "projectId" | "createdAt" | "updatedAt">>;
  traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">>;
}>;

const renderTaskNeedsSceneClipMaterials = (renderTask: RenderTask): boolean =>
  renderTask.provider === "volcengine-seedance" &&
  renderTask.status === "completed" &&
  Boolean(
    renderTask.sceneClips?.some(
      (clip) => clip.status === "completed" && clip.videoUrl && !clip.material,
    ),
  );

const activeSeedanceStatuses = new Set<RenderTask["status"]>([
  "queued",
  "running",
  "retrying",
]);

export const isActiveSeedanceRenderTask = (renderTask: RenderTask): boolean =>
  renderTask.provider === "volcengine-seedance" && activeSeedanceStatuses.has(renderTask.status);

export const materializeCompletedSceneClips = async ({
  projectId,
  renderTaskId,
  sceneClipMaterializer,
  sceneClips,
  storageProvider,
}: {
  projectId: string;
  renderTaskId: string;
  sceneClipMaterializer: SceneClipMaterializer;
  sceneClips: SceneRenderClip[] | undefined;
  storageProvider: StorageProvider;
}): Promise<{
  sceneClips: SceneRenderClip[] | undefined;
  traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">>;
}> => {
  const hasMissingCompletedMaterials = sceneClips?.some(
    (clip) => clip.status === "completed" && clip.videoUrl && !clip.material,
  );
  if (!hasMissingCompletedMaterials) {
    return { sceneClips, traceEvents: [] };
  }

  const materialized = await sceneClipMaterializer(projectId, renderTaskId, sceneClips, {
    storageProvider,
  });
  const readyCount = materialized?.filter((clip) => clip.material?.status === "ready").length ?? 0;
  const failedCount =
    materialized?.filter((clip) => clip.material?.status === "failed").length ?? 0;
  return {
    sceneClips: materialized,
    traceEvents: [
      {
        status: failedCount > 0 ? "retrying" : "completed",
        step: failedCount > 0 ? "scene-clip-materialize-partial" : "scene-clip-materialize",
        message:
          failedCount > 0
            ? `Prepared ${readyCount} scene clips for smart editing; ${failedCount} clip material separations failed.`
            : `Prepared ${readyCount} scene clips as video, audio, and text materials for smart editing.`,
      },
    ],
  };
};

export const refreshCompletedRenderMaterials = async ({
  renderTask,
  sceneClipMaterializer,
  storageProvider,
  store,
}: {
  renderTask: RenderTaskSnapshot;
  sceneClipMaterializer: SceneClipMaterializer;
  storageProvider: StorageProvider;
  store: ProjectStore;
}) => {
  if (!renderTaskNeedsSceneClipMaterials(renderTask.renderTask)) {
    return undefined;
  }

  try {
    const materialized = await materializeCompletedSceneClips({
      projectId: renderTask.project.id,
      renderTaskId: renderTask.renderTask.id,
      sceneClipMaterializer,
      sceneClips: renderTask.renderTask.sceneClips,
      storageProvider,
    });
    return store.updateRenderTask(
      renderTask.renderTask.id,
      { sceneClips: materialized.sceneClips },
      materialized.traceEvents,
    );
  } catch (error) {
    return store.updateRenderTask(renderTask.renderTask.id, {}, [
      {
        status: "failed",
        step: "scene-clip-materialize-failed",
        message: error instanceof Error ? error.message : "Scene clip materialization failed.",
      },
    ]);
  }
};

export const pollActiveSeedanceRenderTask = async ({
  loadRenderTask,
  publishRenderExport,
  renderTask,
  sceneClipMaterializer,
  storageProvider,
  store,
}: {
  loadRenderTask: SeedanceRenderTaskLoader;
  publishRenderExport: RenderExportPublisherFn;
  renderTask: RenderTaskSnapshot;
  sceneClipMaterializer: SceneClipMaterializer;
  storageProvider: StorageProvider;
  store: ProjectStore;
}) => {
  if (!isActiveSeedanceRenderTask(renderTask.renderTask)) {
    return undefined;
  }

  try {
    const providerResult = await loadRenderTask(renderTask.project, renderTask.renderTask);
    if (
      providerResult.renderTask.status === "completed" &&
      providerResult.renderTask.sceneClips &&
      providerResult.renderTask.sceneClips.length > 0
    ) {
      try {
        const exportUrl = await publishRenderExport(
          renderTask.project.id,
          providerResult.renderTask.sceneClips,
        );
        if (exportUrl) {
          providerResult.renderTask.exportUrl = exportUrl;
          providerResult.traceEvents.push({
            status: "completed",
            step: "render-export-published",
            message: "Seedance scene clips composed and published as a final export video.",
          });
        }
      } catch (error) {
        providerResult.traceEvents.push({
          status: "failed",
          step: "render-export-publish-failed",
          message: error instanceof Error ? error.message : "Final render export publishing failed.",
        });
      }

      try {
        const materialized = await materializeCompletedSceneClips({
          projectId: renderTask.project.id,
          renderTaskId: renderTask.renderTask.id,
          sceneClipMaterializer,
          sceneClips: providerResult.renderTask.sceneClips,
          storageProvider,
        });
        providerResult.renderTask.sceneClips = materialized.sceneClips;
        providerResult.traceEvents.push(...materialized.traceEvents);
      } catch (error) {
        providerResult.traceEvents.push({
          status: "failed",
          step: "scene-clip-materialize-failed",
          message: error instanceof Error ? error.message : "Scene clip materialization failed.",
        });
      }
    }

    return store.updateRenderTask(
      renderTask.renderTask.id,
      providerResult.renderTask,
      providerResult.traceEvents,
    );
  } catch (error) {
    return store.updateRenderTask(
      renderTask.renderTask.id,
      {
        status: "failed",
        progress: renderTask.renderTask.progress,
        errorMessage: error instanceof Error ? error.message : "Seedance render polling failed.",
      },
      [
        {
          status: "failed",
          step: "seedance-task-poll-failed",
          message: error instanceof Error ? error.message : "Seedance render polling failed.",
        },
      ],
    );
  }
};
