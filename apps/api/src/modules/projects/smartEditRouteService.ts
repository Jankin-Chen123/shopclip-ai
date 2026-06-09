import type { Router } from "express";
import {
  SmartEditRequestSchema,
  SmartEditSegmentRefreshRequestSchema,
} from "@shopclip/shared";

import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import { sendInvalidRequest, sendNotFound } from "./httpResponseUtils.js";
import type { ProjectStore } from "./projectStore.js";
import {
  runSmartEditJob,
  runSmartEditSegmentRefreshJob,
  type SmartEditComposer,
  type SmartEditPlanner,
} from "./smartEditJobService.js";

type RegisterSmartEditRoutesOptions = {
  router: Router;
  smartEditComposer: SmartEditComposer;
  smartEditPlanner: SmartEditPlanner;
  storageProvider: StorageProvider;
  store: ProjectStore;
};

export const registerSmartEditRoutes = ({
  router,
  smartEditComposer,
  smartEditPlanner,
  storageProvider,
  store,
}: RegisterSmartEditRoutesOptions): void => {
  router.post("/projects/:projectId/smart-edit", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    if (project.scenes.length === 0) {
      sendInvalidRequest(
        response,
        "STORYBOARD_REQUIRED",
        "Generate a storyboard before smart editing.",
      );
      return;
    }

    const parsedSmartEditRequest = SmartEditRequestSchema.safeParse(request.body ?? {});
    if (!parsedSmartEditRequest.success) {
      sendInvalidRequest(
        response,
        "INVALID_SMART_EDIT_REQUEST",
        "Smart edit settings are invalid.",
      );
      return;
    }

    const queuedEditRender = await store.addRenderTask(
      project.id,
      {
        mediaSettings: parsedSmartEditRequest.data.mediaSettings,
        progress: 0,
        provider: "smart-edit-ffmpeg",
        status: "queued",
        videoSettings: parsedSmartEditRequest.data.videoSettings,
      },
      [
        {
          status: "queued",
          step: "smart-edit-queued",
          message:
            "Smart edit job queued. The server will call the general model and ffmpeg in the background.",
        },
      ],
    );

    if (!queuedEditRender) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    void runSmartEditJob({
      project,
      renderTaskId: queuedEditRender.renderTask.id,
      requestData: parsedSmartEditRequest.data,
      smartEditComposer,
      smartEditPlanner,
      storageProvider,
      store,
    }).catch((error) => {
      console.error("[smart-edit] background job failed unexpectedly.", error);
    });

    response.status(202).json(queuedEditRender);
  });

  router.post(
    "/projects/:projectId/smart-edit/segments/:sceneId/refresh",
    async (request, response) => {
      const project = await store.getProject(request.params.projectId);
      if (!project) {
        sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
        return;
      }

      const targetScene = project.scenes.find((scene) => scene.id === request.params.sceneId);
      if (!targetScene) {
        sendNotFound(response, "SCENE_NOT_FOUND", "Storyboard scene was not found.");
        return;
      }

      const parsedRefreshRequest = SmartEditSegmentRefreshRequestSchema.safeParse(
        request.body ?? {},
      );
      if (!parsedRefreshRequest.success) {
        sendInvalidRequest(
          response,
          "INVALID_SMART_EDIT_REFRESH_REQUEST",
          "Smart edit segment refresh settings are invalid.",
        );
        return;
      }

      const refreshRequest = parsedRefreshRequest.data;
      const queuedEditRender = await store.addRenderTask(
        project.id,
        {
          mediaSettings: refreshRequest.mediaSettings,
          progress: 0,
          provider: "smart-edit-ffmpeg",
          smartEditPlan: refreshRequest.currentPlan,
          smartEditSegmentOutputs: refreshRequest.segmentOutputs,
          status: "queued",
          videoSettings: refreshRequest.videoSettings,
        },
        [
          {
            status: "queued",
            step: "smart-edit-segment-refresh-queued",
            message:
              "Smart edit segment refresh queued. The server will refresh the selected segment in the background.",
          },
        ],
      );

      if (!queuedEditRender) {
        sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
        return;
      }

      void runSmartEditSegmentRefreshJob({
        project,
        renderTaskId: queuedEditRender.renderTask.id,
        requestData: refreshRequest,
        smartEditComposer,
        smartEditPlanner,
        storageProvider,
        store,
        targetScene,
      }).catch((error) => {
        console.error("[smart-edit] background segment refresh failed unexpectedly.", error);
      });

      response.status(202).json(queuedEditRender);
    },
  );
};
