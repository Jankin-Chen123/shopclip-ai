import type { AssetMetadata, ScriptGenerationRequest, ScriptResult } from "@shopclip/shared";

import type { MaybePromise, ProjectSnapshot } from "./projectStore.js";
import type { ScriptPromptContext } from "./scriptPromptContext.js";

type GeneratedScriptDraft = Omit<ScriptResult, "id" | "projectId">;

export type ScriptTextProviderFallback = {
  provider: string;
  reason?: string;
  used: boolean;
};

export type ScriptTextProviderResult = {
  fallback: ScriptTextProviderFallback;
  scriptText: string;
};

type ScriptContext = {
  assets: AssetMetadata[];
  request: ScriptGenerationRequest;
  scriptSource: "fallback" | "model";
};

export const buildStructuredScriptFromTextProvider = async ({
  project,
  request,
  assets,
  promptContext,
  rewriteScript,
  generateFallbackScriptForProject,
  structureModelScriptForProject,
}: {
  project: ProjectSnapshot;
  request: ScriptGenerationRequest;
  assets: AssetMetadata[];
  promptContext: ScriptPromptContext;
  rewriteScript: (
    project: ProjectSnapshot,
    request: ScriptGenerationRequest,
    assets: AssetMetadata[],
    promptContext: ScriptPromptContext,
  ) => MaybePromise<ScriptTextProviderResult>;
  generateFallbackScriptForProject: (
    project: ProjectSnapshot,
    context: ScriptContext & { scriptSource: "fallback" },
  ) => { script: GeneratedScriptDraft };
  structureModelScriptForProject: (
    project: ProjectSnapshot,
    context: ScriptContext & { scriptSource: "model" },
    provider: string,
  ) => { script: GeneratedScriptDraft };
}): Promise<{ fallback: ScriptTextProviderFallback; script: GeneratedScriptDraft }> => {
  const textProviderResult = await rewriteScript(project, request, assets, promptContext);
  if (textProviderResult.fallback.used) {
    return {
      fallback: textProviderResult.fallback,
      script: generateFallbackScriptForProject(project, {
        assets,
        request,
        scriptSource: "fallback",
      }).script,
    };
  }

  return {
    fallback: textProviderResult.fallback,
    script: structureModelScriptForProject(
      project,
      {
        assets,
        request: {
          ...request,
          draftScript: textProviderResult.scriptText,
        },
        scriptSource: "model",
      },
      textProviderResult.fallback.provider,
    ).script,
  };
};
