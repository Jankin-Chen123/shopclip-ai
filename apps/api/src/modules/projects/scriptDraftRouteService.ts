import { ScriptResultSchema, type AssetMetadata, type ScriptGenerationRequest, type ScriptResult } from "@shopclip/shared";

import type { MaybePromise, ProjectSnapshot } from "./projectStore.js";

type GeneratedScriptDraft = Omit<ScriptResult, "id" | "projectId">;

export type ScriptDraftRouteHttpError = {
  code: string;
  message: string;
  status: 400 | 404;
};

export type ScriptDraftRouteResult =
  | { kind: "ready"; script: ScriptResult }
  | { kind: "error"; error: ScriptDraftRouteHttpError };

const parseSavedScript = (script: ScriptResult): ScriptDraftRouteResult => {
  const parsedScript = ScriptResultSchema.safeParse(script);
  return parsedScript.success
    ? { kind: "ready", script: parsedScript.data }
    : {
        kind: "error",
        error: {
          code: "INVALID_SAVED_SCRIPT",
          message: "Saved script failed contract validation.",
          status: 400,
        },
      };
};

export const storeFallbackDraftScript = async ({
  project,
  request,
  assets,
  generateFallbackScriptForProject,
  addScript,
}: {
  project: ProjectSnapshot;
  request: ScriptGenerationRequest;
  assets: AssetMetadata[];
  generateFallbackScriptForProject: (
    project: ProjectSnapshot,
    context: {
      assets: AssetMetadata[];
      request: ScriptGenerationRequest;
      scriptSource: "fallback";
    },
  ) => { script: GeneratedScriptDraft };
  addScript: (projectId: string, script: GeneratedScriptDraft) => MaybePromise<ScriptResult | undefined>;
}): Promise<ScriptDraftRouteResult> => {
  if (!request.draftScript?.trim()) {
    return {
      kind: "error",
      error: {
        code: "EMPTY_SCRIPT_DRAFT",
        message: "Script draft cannot be empty.",
        status: 400,
      },
    };
  }

  const providerResult = generateFallbackScriptForProject(project, {
    assets,
    request,
    scriptSource: "fallback",
  });
  const storedScript = await addScript(project.id, providerResult.script);
  if (!storedScript) {
    return {
      kind: "error",
      error: {
        code: "PROJECT_NOT_FOUND",
        message: "Project was not found.",
        status: 404,
      },
    };
  }

  return parseSavedScript(storedScript);
};
