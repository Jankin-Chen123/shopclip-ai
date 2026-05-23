import { Router } from "express";
import type { Response } from "express";
import {
  ExternalAssetSearchRequestSchema,
  ProjectBriefSchema,
  ExternalAssetResultSchema,
  RenderRequestSchema,
  SceneUpdateSchema,
  ScriptResultSchema,
} from "@shopclip/shared";

import { createAssetSlices, inferAssetTags } from "../assets/tagging.js";
import { CreateAssetRequestSchema } from "../assets/validation.js";
import { buildMockDashboard } from "../dashboard/mockDashboard.js";
import { searchAssets } from "../retrieval/search.js";
import {
  createExternalAssetProvidersFromConfig,
  searchExternalAssets,
} from "../../providers/assets/externalAssetProviders.js";
import type { ExternalAssetSearchInput } from "../../providers/assets/externalAssetProviders.js";
import {
  generateEditingSuggestions,
  regenerateSceneFallback,
} from "../../providers/ai/editingAgentProvider.js";
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

const normalizeTag = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const mimeTypeForExternalAsset = (type: "image" | "video") =>
  type === "video" ? "video/mp4" : "image/jpeg";

export interface P0RouterOptions {
  store?: MemoryProjectStore;
  externalAssetSearch?: (input: ExternalAssetSearchInput) => Promise<unknown[]>;
}

export const createP0Router = ({
  store = new MemoryProjectStore(),
  externalAssetSearch = searchExternalAssets,
}: P0RouterOptions = {}): Router => {
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

  router.get("/projects/:projectId/dashboard", (request, response) => {
    const project = store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.json(buildMockDashboard(project));
  });

  router.post("/projects/:projectId/assets", (request, response) => {
    const parsedAsset = CreateAssetRequestSchema.safeParse(request.body);
    if (!parsedAsset.success) {
      sendInvalidRequest(response, "INVALID_ASSET", "Asset metadata failed P0 image validation.");
      return;
    }

    const storedAsset = store.addAsset(
      request.params.projectId,
      {
        type: parsedAsset.data.type,
        status: "ready",
        url:
          parsedAsset.data.url ??
          `/demo-assets/${request.params.projectId}/${parsedAsset.data.name}`,
        name: parsedAsset.data.name,
        mimeType: parsedAsset.data.mimeType,
        sizeBytes: parsedAsset.data.sizeBytes,
        tags: inferAssetTags(parsedAsset.data),
      },
      createAssetSlices,
    );

    if (!storedAsset) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.status(201).json({ asset: storedAsset });
  });

  router.post("/projects/:projectId/assets/import-external", (request, response) => {
    const parsedExternalAsset = ExternalAssetResultSchema.safeParse(request.body);
    if (!parsedExternalAsset.success) {
      sendInvalidRequest(
        response,
        "INVALID_EXTERNAL_ASSET",
        "External asset metadata failed validation.",
      );
      return;
    }

    const externalAsset = parsedExternalAsset.data;
    const storedAsset = store.addAsset(
      request.params.projectId,
      {
        type: externalAsset.type,
        status: "ready",
        url: externalAsset.downloadUrl ?? externalAsset.previewUrl,
        name: externalAsset.title,
        mimeType: mimeTypeForExternalAsset(externalAsset.type),
        tags: inferAssetTags({
          name: externalAsset.title,
          mimeType: mimeTypeForExternalAsset(externalAsset.type),
          tags: [
            ...externalAsset.tags,
            "external",
            `source-${externalAsset.source}`,
            `external-id-${externalAsset.externalId}`,
            `license-${normalizeTag(externalAsset.licenseLabel)}`,
          ],
        }),
      },
      createAssetSlices,
    );

    if (!storedAsset) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.status(201).json({ asset: storedAsset });
  });

  router.get("/assets/search", async (request, response) => {
    const projectId =
      typeof request.query.projectId === "string" ? request.query.projectId.trim() : "";
    if (!projectId) {
      sendInvalidRequest(response, "PROJECT_ID_REQUIRED", "projectId is required.");
      return;
    }

    const project = store.getProject(projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const query = typeof request.query.q === "string" ? request.query.q : "";
    const tags =
      typeof request.query.tags === "string"
        ? request.query.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [];

    const externalResults = await externalAssetSearch({
      query,
      perPage: 8,
    });

    response.json({
      projectId,
      query,
      tags,
      results: searchAssets(project, { query, tags }),
      externalResults,
    });
  });

  router.post("/assets/external-search", async (request, response) => {
    const parsedSearch = ExternalAssetSearchRequestSchema.safeParse(request.body);
    if (!parsedSearch.success) {
      sendInvalidRequest(
        response,
        "INVALID_EXTERNAL_ASSET_SEARCH",
        "External asset search request failed validation.",
      );
      return;
    }

    const { query, perPage, providers, type } = parsedSearch.data;
    const providerInstances = createExternalAssetProvidersFromConfig(providers);
    const externalResults =
      providers.length > 0
        ? await searchExternalAssets({ query, perPage, type }, providerInstances)
        : await externalAssetSearch({ query, perPage, type });

    response.json({
      query,
      externalResults,
    });
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

    const parsedRenderRequest = RenderRequestSchema.safeParse(request.body ?? {});
    if (!parsedRenderRequest.success) {
      sendInvalidRequest(response, "INVALID_RENDER_REQUEST", "Render media settings are invalid.");
      return;
    }

    const renderResult = renderFallbackPreview(project, parsedRenderRequest.data);
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

    response.json({
      renderTask: renderTask.renderTask,
      traceEvents: renderTask.traceEvents,
    });
  });

  router.post("/render-tasks/:renderTaskId/retry", (request, response) => {
    const previousRender = store.getRenderTask(request.params.renderTaskId);
    if (!previousRender) {
      sendNotFound(response, "RENDER_TASK_NOT_FOUND", "Render task was not found.");
      return;
    }

    if (previousRender.renderTask.status !== "failed") {
      sendInvalidRequest(
        response,
        "RENDER_NOT_RETRYABLE",
        "Only failed render tasks can be retried.",
      );
      return;
    }

    const parsedRenderRequest = RenderRequestSchema.safeParse(request.body ?? {});
    if (!parsedRenderRequest.success) {
      sendInvalidRequest(response, "INVALID_RENDER_REQUEST", "Render media settings are invalid.");
      return;
    }

    const failedTrace = [...previousRender.traceEvents]
      .reverse()
      .find((event) => event.status === "failed");
    const renderResult = renderFallbackPreview(previousRender.project, {
      ...parsedRenderRequest.data,
      retryOfRenderTaskId: previousRender.renderTask.id,
      retryOfTraceEventId: failedTrace?.id,
    });
    const storedRender = store.addRenderTask(
      previousRender.project.id,
      renderResult.renderTask,
      renderResult.traceEvents,
    );
    if (!storedRender) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    response.status(201).json(storedRender);
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

  router.patch("/scenes/:sceneId", (request, response) => {
    const parsedUpdate = SceneUpdateSchema.safeParse(request.body);
    if (!parsedUpdate.success) {
      sendInvalidRequest(response, "INVALID_SCENE_UPDATE", "Scene update fields are invalid.");
      return;
    }

    const updatedScene = store.updateScene(request.params.sceneId, parsedUpdate.data);
    if (!updatedScene) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    response.json({ scene: updatedScene });
  });

  router.post("/projects/:projectId/scenes/reorder", (request, response) => {
    const sceneIds = Array.isArray(request.body?.sceneIds)
      ? request.body.sceneIds.filter(
          (sceneId: unknown): sceneId is string => typeof sceneId === "string",
        )
      : [];
    if (sceneIds.length === 0) {
      sendInvalidRequest(response, "INVALID_SCENE_ORDER", "sceneIds are required.");
      return;
    }

    const scenes = store.reorderScenes(request.params.projectId, sceneIds);
    if (!scenes) {
      sendInvalidRequest(
        response,
        "INVALID_SCENE_ORDER",
        "Scene order does not match project scenes.",
      );
      return;
    }

    response.json({ scenes });
  });

  router.delete("/scenes/:sceneId", (request, response) => {
    const scenes = store.deleteScene(request.params.sceneId);
    if (!scenes) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    response.json({ scenes });
  });

  router.post("/scenes/:sceneId/regenerate", (request, response) => {
    const context = store.getSceneContext(request.params.sceneId);
    if (!context) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    const regeneratedScene = regenerateSceneFallback(context.project, context.scene);
    const storedScene = store.updateScene(context.scene.id, regeneratedScene);
    if (!storedScene) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    const traceEvent = store.appendTraceEvent(`scene:${context.scene.id}`, {
      status: "completed",
      step: "scene-regenerated",
      message: `Regenerated scene ${context.scene.order} with deterministic editing fallback.`,
    });

    response.json({
      scene: storedScene,
      traceEvent,
    });
  });

  router.get("/scenes/:sceneId/suggestions", (request, response) => {
    const context = store.getSceneContext(request.params.sceneId);
    if (!context) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    response.json({
      suggestions: generateEditingSuggestions(
        context.project,
        context.scene,
        context.project.assets,
      ),
    });
  });

  router.post("/scenes/:sceneId/suggestions/:suggestionId/apply", (request, response) => {
    const context = store.getSceneContext(request.params.sceneId);
    if (!context) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    const suggestion = generateEditingSuggestions(
      context.project,
      context.scene,
      context.project.assets,
    ).find((candidate) => candidate.id === request.params.suggestionId);
    if (!suggestion) {
      sendNotFound(response, "SUGGESTION_NOT_FOUND", "Suggestion was not found.");
      return;
    }

    const storedScene = store.updateScene(context.scene.id, suggestion.update);
    if (!storedScene) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    const traceEvent = store.appendTraceEvent(`scene:${context.scene.id}`, {
      status: "completed",
      step: "agent-suggestion-applied",
      message: `Applied editing suggestion ${suggestion.id}: ${suggestion.title}.`,
    });

    response.json({
      scene: storedScene,
      traceEvent,
    });
  });

  return router;
};
