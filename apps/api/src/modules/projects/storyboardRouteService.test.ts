import { describe, expect, it } from "vitest";
import type {
  AssetMetadata,
  ScriptGenerationRequest,
  ScriptResult,
  StoryboardScene,
} from "@shopclip/shared";

import type { ProjectSnapshot } from "./projectStore.js";
import {
  buildStoryboardRequestFromScript,
  generateFallbackStoryboardForScript,
  storeGeneratedStoryboardScript,
} from "./storyboardRouteService.js";

const scene = (id = "scene-1"): StoryboardScene => ({
  id,
  projectId: "project-1",
  order: 1,
  durationSeconds: 5,
  subtitle: "Hook subtitle",
  voiceover: "Hook voiceover",
  visualPrompt: "Show the product clearly.",
  status: "generated",
});

const script = (overrides: Partial<ScriptResult> = {}): ScriptResult => ({
  id: "script-1",
  projectId: "project-1",
  hook: "Hook",
  narrative: "Narrative script",
  constraints: ["Keep product accurate"],
  scenes: [scene()],
  ...overrides,
});

const project = (overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot =>
  ({
    id: "project-1",
    prepKeywords: ["hero", "demo"],
    assets: [],
    productName: "Demo product",
    audience: "Merchants",
    sellingPoints: ["Fast"],
    tone: "Direct",
    style: "Studio",
    scripts: [script()],
    scenes: [],
    ...overrides,
  }) as ProjectSnapshot;

const asset = (id = "asset-1"): AssetMetadata => ({ id, projectId: "project-1" }) as AssetMetadata;

describe("storyboardRouteService", () => {
  it("builds an automatic storyboard request from the saved script narrative and project keywords", () => {
    expect(buildStoryboardRequestFromScript(project(), script())).toEqual({
      assetIds: [],
      draftScript: "Narrative script",
      keywords: ["hero", "demo"],
      materials: [],
      productionMode: "automatic",
    });
  });

  it("returns the existing script asset error before generating or updating when prepared assets are invalid", async () => {
    let generated = false;
    let updated = false;

    const result = await generateFallbackStoryboardForScript({
      project: project(),
      script: script(),
      resolvePreparedAssets: async () => ({ assets: [], invalidAssetIds: ["missing"] }),
      generateFallbackScriptForProject: () => {
        generated = true;
        return { script: script() };
      },
      renderStoryboardSceneImagesForScript: async (_project, renderedScript) => renderedScript,
      updateScriptScenes: async () => {
        updated = true;
        return script();
      },
    });

    expect(generated).toBe(false);
    expect(updated).toBe(false);
    expect(result).toEqual({
      kind: "error",
      error: {
        code: "INVALID_SCRIPT_ASSETS",
        message: "One or more requested assets do not exist or cannot be used in this project.",
        status: 400,
      },
    });
  });

  it("renders fallback storyboard scenes and returns the persisted script contract", async () => {
    const preparedAsset = asset();
    const renderedScene = { ...scene(), id: "rendered-scene", imageUrl: "https://cdn.test/scene.png" };
    let receivedRequest: ScriptGenerationRequest | undefined;

    const result = await generateFallbackStoryboardForScript({
      project: project(),
      script: script(),
      resolvePreparedAssets: async (_project, request) => {
        receivedRequest = request;
        return { assets: [preparedAsset], invalidAssetIds: [] };
      },
      generateFallbackScriptForProject: (_project, context) => {
        expect(context.assets).toEqual([preparedAsset]);
        expect(context.scriptSource).toBe("fallback");
        return {
          script: {
            hook: "Generated hook",
            narrative: "Generated narrative",
            constraints: ["Generated constraint"],
            scenes: [scene("generated-scene")],
          },
        };
      },
      renderStoryboardSceneImagesForScript: async (_project, renderedScript, request, assets) => {
        expect(request).toBe(receivedRequest);
        expect(assets).toEqual([preparedAsset]);
        return { ...renderedScript, scenes: [renderedScene] };
      },
      updateScriptScenes: async (scriptId, scenes, constraints) => {
        expect(scriptId).toBe("script-1");
        expect(scenes).toEqual([renderedScene]);
        expect(constraints).toEqual(["Generated constraint"]);
        return script({
          hook: "Generated hook",
          narrative: "Generated narrative",
          constraints,
          scenes,
        });
      },
    });

    expect(result).toEqual({
      kind: "ready",
      script: script({
        hook: "Generated hook",
        narrative: "Generated narrative",
        constraints: ["Generated constraint"],
        scenes: [renderedScene],
      }),
    });
  });

  it("maps invalid generated storyboard contracts after addScript to the shared generated-script error", async () => {
    const result = await storeGeneratedStoryboardScript({
      project: project(),
      providerScript: {
        hook: "Generated hook",
        narrative: "Generated narrative",
        constraints: [],
        scenes: [scene()],
      },
      request: {
        assetIds: [],
        draftScript: "draft",
        keywords: [],
        materials: [],
        productionMode: "automatic",
      },
      assets: [],
      renderStoryboardSceneImagesForScript: async (_project, renderedScript) => renderedScript,
      addScript: async () =>
        script({
          scenes: [],
        }),
    });

    expect(result).toEqual({
      kind: "error",
      error: {
        code: "INVALID_GENERATED_SCRIPT",
        message: "Generated storyboard failed contract validation.",
        status: 400,
      },
    });
  });
});
