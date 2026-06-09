import { describe, expect, it } from "vitest";
import type { AssetMetadata, ScriptGenerationRequest, ScriptResult, StoryboardScene } from "@shopclip/shared";

import type { ProjectSnapshot } from "./projectStore.js";
import { storeFallbackDraftScript } from "./scriptDraftRouteService.js";

const scene = (): StoryboardScene => ({
  id: "scene-1",
  projectId: "project-1",
  order: 1,
  durationSeconds: 5,
  subtitle: "Subtitle",
  voiceover: "Voiceover",
  visualPrompt: "Visual prompt",
  status: "generated",
});

const script = (overrides: Partial<ScriptResult> = {}): ScriptResult => ({
  id: "script-1",
  projectId: "project-1",
  hook: "Hook",
  narrative: "Narrative",
  constraints: [],
  scenes: [scene()],
  ...overrides,
});

const project = (): ProjectSnapshot => ({ id: "project-1" }) as ProjectSnapshot;
const asset = (): AssetMetadata => ({ id: "asset-1" }) as AssetMetadata;

const request = (overrides: Partial<ScriptGenerationRequest> = {}): ScriptGenerationRequest => ({
  assetIds: [],
  draftScript: "A valid draft",
  keywords: [],
  materials: [],
  productionMode: "automatic",
  ...overrides,
});

describe("storeFallbackDraftScript", () => {
  it("returns the existing empty-draft error before generating or saving", async () => {
    let generated = false;
    let saved = false;

    const result = await storeFallbackDraftScript({
      project: project(),
      request: request({ draftScript: "   " }),
      assets: [],
      generateFallbackScriptForProject: () => {
        generated = true;
        return { script: script() };
      },
      addScript: async () => {
        saved = true;
        return script();
      },
    });

    expect(generated).toBe(false);
    expect(saved).toBe(false);
    expect(result).toEqual({
      kind: "error",
      error: {
        code: "EMPTY_SCRIPT_DRAFT",
        message: "Script draft cannot be empty.",
        status: 400,
      },
    });
  });

  it("uses prepared assets when generating fallback draft scripts and returns the saved contract", async () => {
    const preparedAsset = asset();

    const result = await storeFallbackDraftScript({
      project: project(),
      request: request(),
      assets: [preparedAsset],
      generateFallbackScriptForProject: (_project, context) => {
        expect(context.assets).toEqual([preparedAsset]);
        expect(context.request).toEqual(request());
        expect(context.scriptSource).toBe("fallback");
        return { script: { ...script(), id: undefined, projectId: undefined } as Omit<ScriptResult, "id" | "projectId"> };
      },
      addScript: async (projectId, draftScript) => {
        expect(projectId).toBe("project-1");
        expect(draftScript.narrative).toBe("Narrative");
        return script();
      },
    });

    expect(result).toEqual({
      kind: "ready",
      script: script(),
    });
  });

  it("maps missing project during save to the existing project not found error", async () => {
    const result = await storeFallbackDraftScript({
      project: project(),
      request: request(),
      assets: [],
      generateFallbackScriptForProject: () => ({ script: script() }),
      addScript: async () => undefined,
    });

    expect(result).toEqual({
      kind: "error",
      error: {
        code: "PROJECT_NOT_FOUND",
        message: "Project was not found.",
        status: 404,
      },
    });
  });

  it("maps invalid saved contracts to the existing saved-script error", async () => {
    const result = await storeFallbackDraftScript({
      project: project(),
      request: request(),
      assets: [],
      generateFallbackScriptForProject: () => ({ script: script() }),
      addScript: async () => script({ scenes: [] }),
    });

    expect(result).toEqual({
      kind: "error",
      error: {
        code: "INVALID_SAVED_SCRIPT",
        message: "Saved script failed contract validation.",
        status: 400,
      },
    });
  });
});
