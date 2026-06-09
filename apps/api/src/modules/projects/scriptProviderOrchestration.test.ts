import { describe, expect, it } from "vitest";
import type { AssetMetadata, ScriptGenerationRequest, ScriptResult } from "@shopclip/shared";

import type { ProjectSnapshot } from "./projectStore.js";
import type { ScriptPromptContext } from "./scriptPromptContext.js";
import { buildStructuredScriptFromTextProvider } from "./scriptProviderOrchestration.js";

const project = (): ProjectSnapshot => ({ id: "project-1" }) as ProjectSnapshot;
const asset = (): AssetMetadata => ({ id: "asset-1" }) as AssetMetadata;

const request: ScriptGenerationRequest = {
  assetIds: ["asset-1"],
  draftScript: "original draft",
  keywords: ["hero"],
  materials: [],
  productionMode: "automatic",
};

const providerScript = (narrative: string): Omit<ScriptResult, "id" | "projectId"> => ({
  hook: "Generated hook",
  narrative,
  constraints: [],
  scenes: [
    {
      id: "scene-1",
      projectId: "project-1",
      order: 1,
      durationSeconds: 5,
      subtitle: "Subtitle",
      voiceover: "Voiceover",
      visualPrompt: "Visual prompt",
      status: "generated",
    },
  ],
});

describe("buildStructuredScriptFromTextProvider", () => {
  it("structures successful model text with model source and replaces the draft script", async () => {
    const preparedAsset = asset();
    const promptContext = { template: { templateId: "template-1" } } as ScriptPromptContext;

    const result = await buildStructuredScriptFromTextProvider({
      project: project(),
      request,
      assets: [preparedAsset],
      promptContext,
      rewriteScript: async (_project, _request, _assets, receivedContext) => {
        expect(receivedContext).toBe(promptContext);
        return {
          fallback: { used: false, provider: "ark" },
          scriptText: "model generated script text",
        };
      },
      generateFallbackScriptForProject: () => {
        throw new Error("fallback generator should not be used for model text");
      },
      structureModelScriptForProject: (_project, context, provider) => {
        expect(provider).toBe("ark");
        expect(context.assets).toEqual([preparedAsset]);
        expect(context.request).toEqual({
          ...request,
          draftScript: "model generated script text",
        });
        expect(context.scriptSource).toBe("model");
        return { script: providerScript("structured from model") };
      },
    });

    expect(result).toEqual({
      fallback: { used: false, provider: "ark" },
      script: providerScript("structured from model"),
    });
  });

  it("uses fallback script generation when text provider returns fallback output", async () => {
    const preparedAsset = asset();

    const result = await buildStructuredScriptFromTextProvider({
      project: project(),
      request,
      assets: [preparedAsset],
      promptContext: {},
      rewriteScript: async () => ({
        fallback: { used: true, provider: "mock", reason: "AI_PROVIDER_MODE is mock" },
        scriptText: "fallback draft text",
      }),
      generateFallbackScriptForProject: (_project, context) => {
        expect(context.assets).toEqual([preparedAsset]);
        expect(context.request).toEqual(request);
        expect(context.scriptSource).toBe("fallback");
        return { script: providerScript("fallback structured script") };
      },
      structureModelScriptForProject: () => {
        throw new Error("model structuring should not run for fallback output");
      },
    });

    expect(result).toEqual({
      fallback: { used: true, provider: "mock", reason: "AI_PROVIDER_MODE is mock" },
      script: providerScript("fallback structured script"),
    });
  });
});
