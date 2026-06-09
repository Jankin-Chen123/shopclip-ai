import { z } from "zod";
import type { Router } from "express";
import type { SceneRenderClip } from "@shopclip/shared";
import { RenderRequestSchema } from "@shopclip/shared";

import type { RenderExportPublisher } from "../../providers/renderer/renderExportPublisher.js";
import { createCosRenderExportPublisher } from "../../providers/renderer/renderExportPublisher.js";
import {
  createQueuedRenderWithConfiguredVideoProvider,
  createSeedanceRenderProvider,
} from "../../providers/renderer/seedanceRenderer.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import { sendInvalidRequest, sendNotFound } from "./httpResponseUtils.js";
import type { ProjectStore } from "./projectStore.js";
import {
  isActiveSeedanceRenderTask,
  pollActiveSeedanceRenderTask,
  refreshCompletedRenderMaterials,
  type SceneClipMaterializer as RenderTaskSceneClipMaterializer,
} from "./renderTaskPollingService.js";
import {
  isSeedanceSceneDurationError,
  resolveProjectExport,
  retryFailedRenderTask,
} from "./renderTaskService.js";

export type SceneClipComposer = (
  projectId: string,
  clips: SceneRenderClip[],
) => Promise<string | undefined>;
export type SceneClipMaterializer = RenderTaskSceneClipMaterializer;

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

    const refreshedMaterials = await refreshCompletedRenderMaterials({
      renderTask,
      sceneClipMaterializer,
      storageProvider,
      store,
    });
    if (refreshedMaterials) {
      response.json(refreshedMaterials);
      return;
    }

    if (isActiveSeedanceRenderTask(renderTask.renderTask)) {
      const polledRenderTask = await pollActiveSeedanceRenderTask({
        loadRenderTask: createSeedanceRenderProvider().loadRenderTask,
        publishRenderExport,
        renderTask,
        sceneClipMaterializer,
        storageProvider,
        store,
      });
      if (polledRenderTask) {
        response.json(polledRenderTask);
        return;
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
