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

const textProviderTimeoutFallback = (timeoutMs: number): ScriptTextProviderResult => ({
  fallback: {
    used: true,
    provider: "timeout-fallback",
    reason: `Text provider timed out after ${timeoutMs}ms.`,
  },
  scriptText: "",
});

const withTextProviderTimeout = async (
  providerResult: MaybePromise<ScriptTextProviderResult>,
  timeoutMs: number | undefined,
): Promise<ScriptTextProviderResult> => {
  if (!timeoutMs || timeoutMs <= 0) {
    return providerResult;
  }

  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const guardedProviderResult = Promise.resolve(providerResult).catch((error: unknown) => {
    if (timedOut) {
      return textProviderTimeoutFallback(timeoutMs);
    }
    throw error;
  });
  const timeoutResult = new Promise<ScriptTextProviderResult>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      resolve(textProviderTimeoutFallback(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([guardedProviderResult, timeoutResult]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const buildStructuredScriptFromTextProvider = async ({
  project,
  request,
  assets,
  promptContext,
  rewriteScript,
  generateFallbackScriptForProject,
  structureModelScriptForProject,
  textProviderTimeoutMs,
}: {
  project: ProjectSnapshot;
  request: ScriptGenerationRequest;
  assets: AssetMetadata[];
  promptContext: ScriptPromptContext;
  textProviderTimeoutMs?: number;
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
  const textProviderResult = await withTextProviderTimeout(
    rewriteScript(project, request, assets, promptContext),
    textProviderTimeoutMs,
  );
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
