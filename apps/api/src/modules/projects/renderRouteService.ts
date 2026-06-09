import { z } from "zod";
import type { Router } from "express";
import type { SceneRenderClip, TraceEvent } from "@shopclip/shared";
import { RenderRequestSchema } from "@shopclip/shared";

import type { RenderExportPublisher } from "../../providers/renderer/renderExportPublisher.js";
import { createCosRenderExportPublisher } from "../../providers/renderer/renderExportPublisher.js";
import type { materializeSceneClipsForSmartEdit } from "../../providers/renderer/sceneClipMaterializer.js";
import {
  createQueuedRenderWithConfiguredVideoProvider,
  createSeedanceRenderProvider,
} from "../../providers/renderer/seedanceRenderer.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import { sendInvalidRequest, sendNotFound } from "./httpResponseUtils.js";
import type { ProjectStore } from "./projectStore.js";
import {
  isSeedanceSceneDurationError,
  resolveProjectExport,
  retryFailedRenderTask,
} from "./renderTaskService.js";

export type SceneClipComposer = (
  projectId: string,
  clips: SceneRenderClip[],
) => Promise<string | undefined>;
export type SceneClipMaterializer = typeof materializeSceneClipsForSmartEdit;

type RegisterRenderRoutesOptions = {
  renderExportPublisher?: RenderExportPublisher;
  router: Router;
  sceneClipComposer?: SceneClipComposer;
  sceneClipMaterializer: SceneClipMaterializer;
  storageProvider: StorageProvider;
  store: ProjectStore;
};

const LibraryDisplayNameUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
});

export const registerRenderRoutes = ({
  renderExportPublisher,
  router,
  sceneClipComposer,
  sceneClipMaterializer,
  storageProvider,
  store,
}: RegisterRenderRoutesOptions): void => {
  const publishRenderExport =
    renderExportPublisher ??
    sceneClipComposer ??
    createCosRenderExportPublisher({ storageProvider });
  const materializeCompletedSceneClips = async (
    projectId: string,
    renderTaskId: string,
    sceneClips: SceneRenderClip[] | undefined,
  ): Promise<{
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
    const readyCount =
      materialized?.filter((clip) => clip.material?.status === "ready").length ?? 0;
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

  router.post("/projects/:projectId/render", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    if (project.scenes.length === 0) {
      sendInvalidRequest(
        response,
        "STORYBOARD_REQUIRED",
        "Generate a storyboard before rendering.",
      );
      return;
    }

    const parsedRenderRequest = RenderRequestSchema.safeParse(request.body ?? {});
    if (!parsedRenderRequest.success) {
      sendInvalidRequest(response, "INVALID_RENDER_REQUEST", "Render media settings are invalid.");
      return;
    }

    let renderResult: ReturnType<typeof createQueuedRenderWithConfiguredVideoProvider>;
    try {
      renderResult = createQueuedRenderWithConfiguredVideoProvider(
        project,
        parsedRenderRequest.data,
      );
    } catch (error) {
      if (isSeedanceSceneDurationError(error)) {
        sendInvalidRequest(response, "INVALID_SCENE_DURATION", error.message);
        return;
      }
      throw error;
    }
    const storedRender = await store.addRenderTask(
      project.id,
      renderResult.renderTask,
      renderResult.traceEvents,
    );
    if (!storedRender) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.status(201).json(storedRender);
  });

  router.patch("/render-tasks/:renderTaskId", async (request, response) => {
    const parsedUpdate = LibraryDisplayNameUpdateSchema.safeParse(request.body ?? {});
    if (!parsedUpdate.success) {
      sendInvalidRequest(
        response,
        "INVALID_RENDER_TASK_DISPLAY_NAME",
        "Video display name is invalid.",
      );
      return;
    }

    const updatedRenderTask = await store.updateRenderTask(request.params.renderTaskId, {
      displayName: parsedUpdate.data.displayName,
    });
    if (!updatedRenderTask) {
      sendNotFound(response, "RENDER_TASK_NOT_FOUND", "Render task was not found.");
      return;
    }

    response.json(updatedRenderTask);
  });

  router.delete("/render-tasks/:renderTaskId", async (request, response) => {
    const deletedRenderTask = await store.deleteRenderTask(request.params.renderTaskId);
    if (!deletedRenderTask) {
      sendNotFound(response, "RENDER_TASK_NOT_FOUND", "Render task was not found.");
      return;
    }

    response.json({ deletedRenderTask });
  });

  router.get("/render-tasks/:renderTaskId", async (request, response) => {
    const renderTask = await store.getRenderTask(request.params.renderTaskId);
    if (!renderTask) {
      sendNotFound(response, "RENDER_TASK_NOT_FOUND", "Render task was not found.");
      return;
    }

    if (
      renderTask.renderTask.provider === "volcengine-seedance" &&
      renderTask.renderTask.status === "completed" &&
      renderTask.renderTask.sceneClips?.some(
        (clip) => clip.status === "completed" && clip.videoUrl && !clip.material,
      )
    ) {
      const traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">> = [];
      try {
        const materialized = await materializeCompletedSceneClips(
          renderTask.project.id,
          renderTask.renderTask.id,
          renderTask.renderTask.sceneClips,
        );
        traceEvents.push(...materialized.traceEvents);
        const updated = await store.updateRenderTask(
          renderTask.renderTask.id,
          { sceneClips: materialized.sceneClips },
          traceEvents,
        );
        if (updated) {
          response.json(updated);
          return;
        }
      } catch (error) {
        traceEvents.push({
          status: "failed",
          step: "scene-clip-materialize-failed",
          message: error instanceof Error ? error.message : "Scene clip materialization failed.",
        });
        const updated = await store.updateRenderTask(
          renderTask.renderTask.id,
          {},
          traceEvents,
        );
        if (updated) {
          response.json(updated);
          return;
        }
      }
    }

    if (
      renderTask.renderTask.provider === "volcengine-seedance" &&
      !["completed", "failed"].includes(renderTask.renderTask.status)
    ) {
      try {
        const provider = createSeedanceRenderProvider();
        const providerResult = await provider.loadRenderTask(
          renderTask.project,
          renderTask.renderTask,
        );
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
              message:
                error instanceof Error ? error.message : "Final render export publishing failed.",
            });
          }
          try {
            const materialized = await materializeCompletedSceneClips(
              renderTask.project.id,
              renderTask.renderTask.id,
              providerResult.renderTask.sceneClips,
            );
            providerResult.renderTask.sceneClips = materialized.sceneClips;
            providerResult.traceEvents.push(...materialized.traceEvents);
          } catch (error) {
            providerResult.traceEvents.push({
              status: "failed",
              step: "scene-clip-materialize-failed",
              message:
                error instanceof Error ? error.message : "Scene clip materialization failed.",
            });
          }
        }
        const updated = await store.updateRenderTask(
          renderTask.renderTask.id,
          providerResult.renderTask,
          providerResult.traceEvents,
        );
        if (updated) {
          response.json(updated);
          return;
        }
      } catch (error) {
        const storedTrace = await store.updateRenderTask(
          renderTask.renderTask.id,
          {
            status: "failed",
            progress: renderTask.renderTask.progress,
            errorMessage:
              error instanceof Error ? error.message : "Seedance render polling failed.",
          },
          [
            {
              status: "failed",
              step: "seedance-task-poll-failed",
              message: error instanceof Error ? error.message : "Seedance render polling failed.",
            },
          ],
        );
        if (storedTrace) {
          response.json(storedTrace);
          return;
        }
      }
    }

    response.json({
      renderTask: renderTask.renderTask,
      traceEvents: renderTask.traceEvents,
    });
  });

  router.post("/render-tasks/:renderTaskId/retry", async (request, response) => {
    const parsedRenderRequest = RenderRequestSchema.safeParse(request.body ?? {});
    if (!parsedRenderRequest.success) {
      sendInvalidRequest(response, "INVALID_RENDER_REQUEST", "Render media settings are invalid.");
      return;
    }

    const retryResult = await retryFailedRenderTask({
      renderTaskId: request.params.renderTaskId,
      requestData: parsedRenderRequest.data,
      store,
    });
    if (retryResult.kind === "not-found") {
      sendNotFound(response, "RENDER_TASK_NOT_FOUND", "Render task was not found.");
      return;
    }
    if (retryResult.kind === "not-retryable") {
      sendInvalidRequest(
        response,
        "RENDER_NOT_RETRYABLE",
        "Only failed render tasks can be retried.",
      );
      return;
    }
    if (retryResult.kind === "project-not-found") {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }
    if (retryResult.kind === "invalid-scene-duration") {
      sendInvalidRequest(response, "INVALID_SCENE_DURATION", retryResult.message);
      return;
    }

    response.status(201).json(retryResult.render);
  });

  router.get("/projects/:projectId/export", async (request, response) => {
    const exportResult = await resolveProjectExport({
      projectId: request.params.projectId,
      publishRenderExport,
      store,
    });
    if (exportResult.kind === "project-not-found") {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }
    if (exportResult.kind === "compose-failed") {
      response.status(502).json({
        error: {
          code: "EXPORT_COMPOSE_FAILED",
          message: exportResult.message,
        },
      });
      return;
    }
    if (exportResult.kind === "not-ready") {
      sendInvalidRequest(
        response,
        "EXPORT_NOT_READY",
        "Render a completed preview before exporting.",
      );
      return;
    }

    response.json(exportResult.body);
  });
};
