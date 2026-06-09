import type { AssetMetadata, ScriptGenerationRequest } from "@shopclip/shared";

import type { MaybePromise, ProjectSnapshot } from "./projectStore.js";
import type { ScriptPromptContext } from "./scriptPromptContext.js";

export type ScriptPreparationHttpError = {
  code: string;
  message: string;
  status: 400 | 404;
};

export type ScriptPreparationResult =
  | {
      kind: "ready";
      assets: AssetMetadata[];
      promptContext: ScriptPromptContext;
      workingProject: ProjectSnapshot;
    }
  | {
      kind: "error";
      error: ScriptPreparationHttpError;
    };

export const hasExplicitRequestBodyField = (body: unknown, field: string): boolean =>
  Object.prototype.hasOwnProperty.call(body ?? {}, field);

export const prepareScriptGenerationInputs = async ({
  project,
  request,
  requestBody,
  resolvePreparedAssets,
  resolvePromptContext,
  updateProjectPrepKeywords,
}: {
  project: ProjectSnapshot;
  request: ScriptGenerationRequest;
  requestBody: unknown;
  resolvePreparedAssets: (
    project: ProjectSnapshot,
    request: ScriptGenerationRequest,
  ) => MaybePromise<{ assets: AssetMetadata[]; invalidAssetIds: string[] }>;
  resolvePromptContext: (
    request: ScriptGenerationRequest,
  ) => MaybePromise<{
    context: ScriptPromptContext;
    error?: ScriptPreparationHttpError;
  }>;
  updateProjectPrepKeywords: (
    projectId: string,
    keywords: string[],
  ) => MaybePromise<ProjectSnapshot | undefined>;
}): Promise<ScriptPreparationResult> => {
  const promptContextResult = await resolvePromptContext(request);
  if (promptContextResult.error) {
    return {
      error: promptContextResult.error,
      kind: "error",
    };
  }

  const workingProject = hasExplicitRequestBodyField(requestBody, "keywords")
    ? ((await updateProjectPrepKeywords(project.id, request.keywords)) ?? project)
    : project;

  const preparedAssetResult = await resolvePreparedAssets(workingProject, request);
  if (preparedAssetResult.invalidAssetIds.length > 0) {
    return {
      error: {
        code: "INVALID_SCRIPT_ASSETS",
        message: "One or more requested assets do not exist or cannot be used in this project.",
        status: 400,
      },
      kind: "error",
    };
  }

  return {
    assets: preparedAssetResult.assets,
    kind: "ready",
    promptContext: promptContextResult.context,
    workingProject,
  };
};
