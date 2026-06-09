import type { Router } from "express";
import {
  ProjectBriefSchema,
  ProjectPrepUpdateSchema,
} from "@shopclip/shared";

import { buildMockDashboard } from "../dashboard/mockDashboard.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import { sendInvalidRequest, sendNotFound } from "./httpResponseUtils.js";
import { deleteStoredAssetObjects } from "./projectAssetUtils.js";
import type { ProjectStore } from "./projectStore.js";

type RegisterProjectCoreRoutesOptions = {
  router: Router;
  storageProvider: StorageProvider;
  store: ProjectStore;
};

export const registerProjectCoreRoutes = ({
  router,
  storageProvider,
  store,
}: RegisterProjectCoreRoutesOptions): void => {
  router.post("/projects", async (request, response) => {
    const parsedBrief = ProjectBriefSchema.safeParse(request.body);
    if (!parsedBrief.success) {
      sendInvalidRequest(
        response,
        "INVALID_PROJECT_BRIEF",
        "Project brief is missing required fields or has invalid values.",
      );
      return;
    }

    response.status(201).json({
      project: await store.createProject(parsedBrief.data),
    });
  });

  router.get("/projects", async (_request, response) => {
    response.json({
      projects: await store.listProjects(),
    });
  });

  router.get("/projects/:projectId", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.json({ project });
  });

  router.patch("/projects/:projectId/prep", async (request, response) => {
    const parsedUpdate = ProjectPrepUpdateSchema.safeParse(request.body ?? {});
    if (!parsedUpdate.success) {
      sendInvalidRequest(
        response,
        "INVALID_PROJECT_PREP",
        "Project preparation settings are invalid.",
      );
      return;
    }

    const project = await store.updateProjectPrepKeywords(
      request.params.projectId,
      parsedUpdate.data.keywords,
    );
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.json({ project });
  });

  router.patch("/projects/:projectId", async (request, response) => {
    const parsedBrief = ProjectBriefSchema.safeParse(request.body ?? {});
    if (!parsedBrief.success) {
      sendInvalidRequest(
        response,
        "INVALID_PROJECT_BRIEF",
        "Project brief update failed validation.",
      );
      return;
    }

    const project = await store.updateProjectBrief(request.params.projectId, parsedBrief.data);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.json({ project });
  });

  router.delete("/projects/:projectId", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    try {
      await deleteStoredAssetObjects(storageProvider, project.assets);
    } catch (error) {
      response.status(502).json({
        error: {
          code: "STORAGE_DELETE_FAILED",
          message: error instanceof Error ? error.message : "Storage delete failed.",
        },
      });
      return;
    }

    const deleted = await store.deleteProject(project.id);
    if (!deleted) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.json({
      deletedProject: {
        id: project.id,
        title: project.title,
        productName: project.productName,
        status: project.status,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        assetCount: project.assets.length,
        coverAssetId: project.assets.find(
          (asset) => asset.type === "image" || asset.mimeType?.startsWith("image/"),
        )?.id,
        coverAssetUrl: project.assets.find(
          (asset) => asset.type === "image" || asset.mimeType?.startsWith("image/"),
        )?.url,
        sceneCount: project.scenes.length,
      },
      deletedAssets: project.assets,
    });
  });

  router.get("/projects/:projectId/dashboard", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.json(buildMockDashboard(project));
  });
};
