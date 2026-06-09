import {
  ScriptResultSchema,
  type AssetMetadata,
  type ScriptGenerationRequest,
  type ScriptResult,
} from "@shopclip/shared";

import type { MaybePromise, ProjectSnapshot } from "./projectStore.js";

export type StoryboardRouteHttpError = {
  code: string;
  message: string;
  status: 400 | 404;
};

export type StoryboardRouteResult =
  | { kind: "ready"; script: ScriptResult }
  | { kind: "error"; error: StoryboardRouteHttpError };

type GeneratedScriptDraft = Omit<ScriptResult, "id" | "projectId">;

type RenderStoryboardScenes = (
  project: ProjectSnapshot,
  script: GeneratedScriptDraft,
  request: ScriptGenerationRequest | undefined,
  assets: AssetMetadata[],
) => MaybePromise<GeneratedScriptDraft>;

const invalidScriptAssetsError = (): StoryboardRouteHttpError => ({
  code: "INVALID_SCRIPT_ASSETS",
  message: "One or more requested assets do not exist or cannot be used in this project.",
  status: 400,
});

const invalidGeneratedScriptError = (): StoryboardRouteHttpError => ({
  code: "INVALID_GENERATED_SCRIPT",
  message: "Generated storyboard failed contract validation.",
  status: 400,
});

export const buildStoryboardRequestFromScript = (
  project: ProjectSnapshot,
  script: Pick<ScriptResult, "narrative">,
): ScriptGenerationRequest => ({
  assetIds: [],
  draftScript: script.narrative,
  keywords: project.prepKeywords,
  materials: [],
  productionMode: "automatic",
});

const parsePersistedScript = (script: ScriptResult): StoryboardRouteResult => {
  const parsedScript = ScriptResultSchema.safeParse(script);
  return parsedScript.success
    ? { kind: "ready", script: parsedScript.data }
    : { kind: "error", error: invalidGeneratedScriptError() };
};

export const generateFallbackStoryboardForScript = async ({
  project,
  script,
  resolvePreparedAssets,
  generateFallbackScriptForProject,
  renderStoryboardSceneImagesForScript,
  updateScriptScenes,
}: {
  project: ProjectSnapshot;
  script: ScriptResult;
  resolvePreparedAssets: (
    project: ProjectSnapshot,
    request: ScriptGenerationRequest,
  ) => MaybePromise<{ assets: AssetMetadata[]; invalidAssetIds: string[] }>;
  generateFallbackScriptForProject: (
    project: ProjectSnapshot,
    context: {
      assets: AssetMetadata[];
      request: ScriptGenerationRequest;
      scriptSource: "fallback";
    },
  ) => { script: GeneratedScriptDraft };
  renderStoryboardSceneImagesForScript: RenderStoryboardScenes;
  updateScriptScenes: (
    scriptId: string,
    scenes: GeneratedScriptDraft["scenes"],
    constraints: string[],
  ) => MaybePromise<ScriptResult | undefined>;
}): Promise<StoryboardRouteResult> => {
  const storyboardRequest = buildStoryboardRequestFromScript(project, script);
  const preparedAssetResult = await resolvePreparedAssets(project, storyboardRequest);
  if (preparedAssetResult.invalidAssetIds.length > 0) {
    return { kind: "error", error: invalidScriptAssetsError() };
  }

  const providerResult = generateFallbackScriptForProject(project, {
    assets: preparedAssetResult.assets,
    request: storyboardRequest,
    scriptSource: "fallback",
  });
  const scriptWithSceneImages = await renderStoryboardSceneImagesForScript(
    project,
    providerResult.script,
    storyboardRequest,
    preparedAssetResult.assets,
  );
  const updatedScript = await updateScriptScenes(
    script.id,
    scriptWithSceneImages.scenes,
    scriptWithSceneImages.constraints,
  );

  return updatedScript
    ? parsePersistedScript(updatedScript)
    : {
        kind: "error",
        error: {
          code: "SCRIPT_NOT_FOUND",
          message: "Script was not found.",
          status: 404,
        },
      };
};

export const storeGeneratedStoryboardScript = async ({
  project,
  providerScript,
  request,
  assets,
  renderStoryboardSceneImagesForScript,
  addScript,
}: {
  project: ProjectSnapshot;
  providerScript: GeneratedScriptDraft;
  request: ScriptGenerationRequest;
  assets: AssetMetadata[];
  renderStoryboardSceneImagesForScript: RenderStoryboardScenes;
  addScript: (projectId: string, script: GeneratedScriptDraft) => MaybePromise<ScriptResult | undefined>;
}): Promise<StoryboardRouteResult> => {
  const scriptWithSceneImages = await renderStoryboardSceneImagesForScript(
    project,
    providerScript,
    request,
    assets,
  );
  const storedScript = await addScript(project.id, scriptWithSceneImages);

  return storedScript
    ? parsePersistedScript(storedScript)
    : {
        kind: "error",
        error: {
          code: "PROJECT_NOT_FOUND",
          message: "Project was not found.",
          status: 404,
        },
      };
};
