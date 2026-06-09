import { z } from "zod";
import type { Router, Response } from "express";
import type {
  AssetMetadata,
  ScriptGenerationRequest,
  ScriptResult,
} from "@shopclip/shared";
import { ScriptGenerationRequestSchema } from "@shopclip/shared";

import {
  sendInvalidRequest,
  sendNotFound,
  sendScriptGenerationFailure,
} from "./httpResponseUtils.js";
import type { structureModelScript } from "../../providers/ai/mockScriptProvider.js";
import type { MaybePromise, ProjectSnapshot, ProjectStore } from "./projectStore.js";
import {
  prepareScriptGenerationInputs,
  type ScriptPreparationHttpError,
} from "./scriptRequestPreparation.js";
import { storeFallbackDraftScript } from "./scriptDraftRouteService.js";
import { buildStructuredScriptFromTextProvider } from "./scriptProviderOrchestration.js";
import type { ScriptPromptContext } from "./scriptPromptContext.js";
import {
  generateFallbackStoryboardForScript,
  storeGeneratedStoryboardScript,
  type StoryboardRouteHttpError,
} from "./storyboardRouteService.js";

type PreparedAssetResolver = (
  project: ProjectSnapshot,
  request: ScriptGenerationRequest,
) => MaybePromise<{ assets: AssetMetadata[]; invalidAssetIds: string[] }>;

type PromptContextResolver = (
  request: ScriptGenerationRequest,
) => MaybePromise<{
  context: ScriptPromptContext;
  error?: ScriptPreparationHttpError;
}>;

type FallbackScriptGenerator = (
  project: ProjectSnapshot,
  context: {
    assets: AssetMetadata[];
    request: ScriptGenerationRequest;
    scriptSource?: "fallback";
  },
) => { script: Omit<ScriptResult, "id" | "projectId"> };

type ScriptRewriteProvider = (
  project: ProjectSnapshot,
  request: ScriptGenerationRequest,
  assets: AssetMetadata[],
  promptContext: ScriptPromptContext,
) => Promise<{
  fallback: { provider: string; used: boolean };
  scriptText: string;
}>;

type StoryboardRenderer = (
  project: ProjectSnapshot,
  script: Omit<ScriptResult, "id" | "projectId">,
  request: ScriptGenerationRequest | undefined,
  assets: AssetMetadata[],
) => MaybePromise<Omit<ScriptResult, "id" | "projectId">>;

type RegisterScriptRoutesOptions = {
  generateFallbackScriptForProject: FallbackScriptGenerator;
  renderStoryboardSceneImagesForScript: StoryboardRenderer;
  resolvePreparedAssets: PreparedAssetResolver;
  resolvePromptContext: PromptContextResolver;
  rewriteScript: ScriptRewriteProvider;
  router: Router;
  store: ProjectStore;
  structureModelScriptForProject: typeof structureModelScript;
};

const LibraryDisplayNameUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
});

const sendScriptPreparationError = (
  response: Response,
  error: ScriptPreparationHttpError,
): void => {
  if (error.status === 404) {
    sendNotFound(response, error.code, error.message);
  } else {
    sendInvalidRequest(response, error.code, error.message);
  }
};

const sendStoryboardRouteError = (
  response: Response,
  error: StoryboardRouteHttpError,
): void => {
  if (error.status === 404) {
    sendNotFound(response, error.code, error.message);
  } else {
    sendInvalidRequest(response, error.code, error.message);
  }
};

export const registerScriptRoutes = ({
  generateFallbackScriptForProject,
  renderStoryboardSceneImagesForScript,
  resolvePreparedAssets,
  resolvePromptContext,
  rewriteScript,
  router,
  store,
  structureModelScriptForProject,
}: RegisterScriptRoutesOptions): void => {
  router.post("/projects/:projectId/rewrite-script", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const parsedRequest = ScriptGenerationRequestSchema.safeParse(request.body ?? {});
    if (!parsedRequest.success) {
      sendInvalidRequest(
        response,
        "INVALID_SCRIPT_REQUEST",
        "Script generation request is invalid.",
      );
      return;
    }

    const scriptInputs = await prepareScriptGenerationInputs({
      project,
      request: parsedRequest.data,
      requestBody: request.body,
      resolvePreparedAssets,
      resolvePromptContext,
      updateProjectPrepKeywords: (projectId, keywords) =>
        store.updateProjectPrepKeywords(projectId, keywords),
    });
    if (scriptInputs.kind === "error") {
      sendScriptPreparationError(response, scriptInputs.error);
      return;
    }
    const { assets: preparedAssets, promptContext, workingProject } = scriptInputs;
    let providerResult: Awaited<ReturnType<typeof rewriteScript>>;
    try {
      providerResult = await rewriteScript(
        workingProject,
        parsedRequest.data,
        preparedAssets,
        promptContext,
      );
    } catch (error) {
      sendScriptGenerationFailure(response, error);
      return;
    }

    response.status(201).json(providerResult);
  });

  router.post("/projects/:projectId/scripts", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const parsedRequest = ScriptGenerationRequestSchema.safeParse(request.body ?? {});
    if (!parsedRequest.success) {
      sendInvalidRequest(
        response,
        "INVALID_SCRIPT_REQUEST",
        "Script generation request is invalid.",
      );
      return;
    }

    const scriptInputs = await prepareScriptGenerationInputs({
      project,
      request: parsedRequest.data,
      requestBody: request.body,
      resolvePreparedAssets,
      resolvePromptContext,
      updateProjectPrepKeywords: (projectId, keywords) =>
        store.updateProjectPrepKeywords(projectId, keywords),
    });
    if (scriptInputs.kind === "error") {
      sendScriptPreparationError(response, scriptInputs.error);
      return;
    }

    const draftResult = await storeFallbackDraftScript({
      project: scriptInputs.workingProject,
      request: parsedRequest.data,
      assets: scriptInputs.assets,
      generateFallbackScriptForProject,
      addScript: (projectId, script) => store.addScript(projectId, script),
    });
    if (draftResult.kind === "error") {
      sendStoryboardRouteError(response, draftResult.error);
      return;
    }

    response.status(201).json({ script: draftResult.script });
  });

  router.post("/projects/:projectId/scripts/:scriptId/storyboard", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const script = project.scripts.find((candidate) => candidate.id === request.params.scriptId);
    if (!script) {
      sendNotFound(response, "SCRIPT_NOT_FOUND", "Script was not found.");
      return;
    }

    const storyboardResult = await generateFallbackStoryboardForScript({
      project,
      script,
      resolvePreparedAssets,
      generateFallbackScriptForProject,
      renderStoryboardSceneImagesForScript,
      updateScriptScenes: (scriptId, scenes, constraints) =>
        store.updateScriptScenes(scriptId, scenes, constraints),
    });
    if (storyboardResult.kind === "error") {
      sendStoryboardRouteError(response, storyboardResult.error);
      return;
    }

    response.status(201).json({ script: storyboardResult.script });
  });

  router.post("/projects/:projectId/generate-script", async (request, response) => {
    const project = await store.getProject(request.params.projectId);
    if (!project) {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }

    const parsedRequest = ScriptGenerationRequestSchema.safeParse(request.body ?? {});
    if (!parsedRequest.success) {
      sendInvalidRequest(
        response,
        "INVALID_SCRIPT_REQUEST",
        "Script generation request is invalid.",
      );
      return;
    }

    const scriptInputs = await prepareScriptGenerationInputs({
      project,
      request: parsedRequest.data,
      requestBody: request.body,
      resolvePreparedAssets,
      resolvePromptContext,
      updateProjectPrepKeywords: (projectId, keywords) =>
        store.updateProjectPrepKeywords(projectId, keywords),
    });
    if (scriptInputs.kind === "error") {
      sendScriptPreparationError(response, scriptInputs.error);
      return;
    }
    const { assets: preparedAssets, promptContext, workingProject } = scriptInputs;
    let providerResult: Awaited<ReturnType<typeof buildStructuredScriptFromTextProvider>>;
    try {
      providerResult = await buildStructuredScriptFromTextProvider({
        project: workingProject,
        request: parsedRequest.data,
        assets: preparedAssets,
        promptContext,
        rewriteScript,
        generateFallbackScriptForProject,
        structureModelScriptForProject,
      });
    } catch (error) {
      sendScriptGenerationFailure(response, error);
      return;
    }
    const storyboardResult = await storeGeneratedStoryboardScript({
      project: workingProject,
      providerScript: providerResult.script,
      request: parsedRequest.data,
      assets: preparedAssets,
      renderStoryboardSceneImagesForScript,
      addScript: (projectId, script) => store.addScript(projectId, script),
    });
    if (storyboardResult.kind === "error") {
      sendStoryboardRouteError(response, storyboardResult.error);
      return;
    }

    response.status(201).json({
      fallback: providerResult.fallback,
      script: storyboardResult.script,
    });
  });

  router.patch("/scripts/:scriptId", async (request, response) => {
    const parsedUpdate = LibraryDisplayNameUpdateSchema.safeParse(request.body ?? {});
    if (!parsedUpdate.success) {
      sendInvalidRequest(response, "INVALID_SCRIPT_DISPLAY_NAME", "Script display name is invalid.");
      return;
    }

    const updatedScript = await store.updateScriptDisplayName(
      request.params.scriptId,
      parsedUpdate.data.displayName,
    );
    if (!updatedScript) {
      sendNotFound(response, "SCRIPT_NOT_FOUND", "Script was not found.");
      return;
    }

    response.json({ script: updatedScript });
  });

  router.delete("/scripts/:scriptId", async (request, response) => {
    const deletedScript = await store.deleteScript(request.params.scriptId);
    if (!deletedScript) {
      sendNotFound(response, "SCRIPT_NOT_FOUND", "Script was not found.");
      return;
    }

    response.json({ deletedScript });
  });
};
