import { Router } from "express";
import type { Response } from "express";
import { ProjectBriefSchema, ScriptResultSchema } from "@shopclip/shared";

import { CreateAssetRequestSchema } from "../assets/validation.js";
import { generateFallbackScript } from "../../providers/ai/mockScriptProvider.js";
import { renderFallbackPreview } from "../../providers/renderer/mockRenderer.js";
import { MemoryProjectStore } from "./memoryStore.js";

const sendNotFound = (response: Response, code: string, message: string) => {
  response.status(404).json({
    error: {
      code,
      message,
    },
  });
};

const sendInvalidRequest = (response: Response, code: string, message: string) => {
  response.status(400).json({
    error: {
      code,
      message,
    },
  });
};

export const createP0Router = (store = new MemoryProjectStore()): Router => {
  const router = Router();

  router.post("/projects", (request, response) => {
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
      project: store.createProject(parsedBrief.data),
    });
  });

  router.get("/projects/:projectId", (request, response) => {
    const project = store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.json({ project });
  });

  router.post("/projects/:projectId/assets", (request, response) => {
    const parsedAsset = CreateAssetRequestSchema.safeParse(request.body);
    if (!parsedAsset.success) {
      sendInvalidRequest(response, "INVALID_ASSET", "Asset metadata failed P0 image validation.");
      return;
    }

    const storedAsset = store.addAsset(request.params.projectId, {
      type: parsedAsset.data.type,
      status: "ready",
      url:
        parsedAsset.data.url ?? `/demo-assets/${request.params.projectId}/${parsedAsset.data.name}`,
      name: parsedAsset.data.name,
      mimeType: parsedAsset.data.mimeType,
      sizeBytes: parsedAsset.data.sizeBytes,
      tags: parsedAsset.data.tags,
    });

    if (!storedAsset) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.status(201).json({ asset: storedAsset });
  });

  router.post("/projects/:projectId/generate-script", (request, response) => {
    const project = store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const providerResult = generateFallbackScript(project);
    const storedScript = store.addScript(project.id, providerResult.script);
    if (!storedScript) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const parsedScript = ScriptResultSchema.safeParse(storedScript);
    if (!parsedScript.success) {
      sendInvalidRequest(
        response,
        "INVALID_GENERATED_SCRIPT",
        "Generated storyboard failed contract validation.",
      );
      return;
    }

    response.status(201).json({
      fallback: providerResult.fallback,
      script: parsedScript.data,
    });
  });

  router.post("/projects/:projectId/render", (request, response) => {
    const project = store.getProject(request.params.projectId);
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

    const renderResult = renderFallbackPreview(project);
    const storedRender = store.addRenderTask(
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

  router.get("/render-tasks/:renderTaskId", (request, response) => {
    const renderTask = store.getRenderTask(request.params.renderTaskId);
    if (!renderTask) {
      sendNotFound(response, "RENDER_TASK_NOT_FOUND", "Render task was not found.");
      return;
    }

    response.json(renderTask);
  });

  router.get("/projects/:projectId/export", (request, response) => {
    const project = store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const completedRender = [...project.renderTasks]
      .reverse()
      .find((renderTask) => renderTask.status === "completed");

    if (!completedRender?.exportUrl) {
      sendInvalidRequest(
        response,
        "EXPORT_NOT_READY",
        "Render a completed preview before exporting.",
      );
      return;
    }

    response.json({
      projectId: project.id,
      exportUrl: completedRender.exportUrl,
      downloadUrl: completedRender.exportUrl,
      contentType: "video/mp4",
      fallback: {
        used: true,
        provider: "mock-renderer",
      },
    });
  });

  return router;
};
