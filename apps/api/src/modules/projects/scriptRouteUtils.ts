import type { Response } from "express";
import type { AssetMetadata, ScriptGenerationRequest } from "@shopclip/shared";
import { ScriptGenerationRequestSchema } from "@shopclip/shared";

import { sendInvalidRequest, sendNotFound } from "./httpResponseUtils.js";
import type { MaybePromise, ProjectSnapshot } from "./projectStore.js";
import {
  prepareScriptGenerationInputs,
  type ScriptPreparationHttpError,
} from "./scriptRequestPreparation.js";
import type { ScriptPromptContext } from "./scriptPromptContext.js";
import type { StoryboardRouteHttpError } from "./storyboardRouteService.js";

export type PreparedAssetResolver = (
  project: ProjectSnapshot,
  request: ScriptGenerationRequest,
) => MaybePromise<{ assets: AssetMetadata[]; invalidAssetIds: string[] }>;

export type PromptContextResolver = (
  request: ScriptGenerationRequest,
) => MaybePromise<{
  context: ScriptPromptContext;
  error?: ScriptPreparationHttpError;
}>;

type PreparedScriptRouteInputs =
  | {
      kind: "ready";
      assets: AssetMetadata[];
      promptContext: ScriptPromptContext;
      request: ScriptGenerationRequest;
      workingProject: ProjectSnapshot;
    }
  | { kind: "invalid-request" }
  | { kind: "preparation-error"; error: ScriptPreparationHttpError };

export const prepareScriptRouteInputs = async ({
  project,
  requestBody,
  resolvePreparedAssets,
  resolvePromptContext,
  updateProjectPrepKeywords,
}: {
  project: ProjectSnapshot;
  requestBody: unknown;
  resolvePreparedAssets: PreparedAssetResolver;
  resolvePromptContext: PromptContextResolver;
  updateProjectPrepKeywords: (
    projectId: string,
    keywords: string[],
  ) => MaybePromise<ProjectSnapshot | undefined>;
}): Promise<PreparedScriptRouteInputs> => {
  const parsedRequest = ScriptGenerationRequestSchema.safeParse(requestBody ?? {});
  if (!parsedRequest.success) {
    return { kind: "invalid-request" };
  }

  const scriptInputs = await prepareScriptGenerationInputs({
    project,
    request: parsedRequest.data,
    requestBody,
    resolvePreparedAssets,
    resolvePromptContext,
    updateProjectPrepKeywords,
  });
  if (scriptInputs.kind === "error") {
    return { kind: "preparation-error", error: scriptInputs.error };
  }

  return {
    kind: "ready",
    assets: scriptInputs.assets,
    promptContext: scriptInputs.promptContext,
    request: parsedRequest.data,
    workingProject: scriptInputs.workingProject,
  };
};

export const sendInvalidScriptRequest = (response: Response): void => {
  sendInvalidRequest(response, "INVALID_SCRIPT_REQUEST", "Script generation request is invalid.");
};

export const sendScriptPreparationError = (
  response: Response,
  error: ScriptPreparationHttpError,
): void => {
  if (error.status === 404) {
    sendNotFound(response, error.code, error.message);
  } else {
    sendInvalidRequest(response, error.code, error.message);
  }
};

export const sendStoryboardRouteError = (
  response: Response,
  error: StoryboardRouteHttpError,
): void => {
  if (error.status === 404) {
    sendNotFound(response, error.code, error.message);
  } else {
    sendInvalidRequest(response, error.code, error.message);
  }
};
