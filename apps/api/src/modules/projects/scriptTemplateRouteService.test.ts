import { describe, expect, it } from "vitest";
import type { AssetMetadata, ViralTemplate } from "@shopclip/shared";

import type { ScriptTemplateAssetResolution } from "./projectAssetResolution.js";
import { extractAndStoreScriptTemplate } from "./scriptTemplateRouteService.js";

const asset = (id = "asset-1"): AssetMetadata => ({ id, name: id }) as AssetMetadata;

const template = (overrides: Partial<ViralTemplate> = {}): ViralTemplate => ({
  templateId: "template-1",
  name: "Hook demo CTA",
  category: "cups",
  strategy: "Open with a hook, prove, then CTA.",
  factorSet: [],
  narrativeStructure: ["hook", "demo", "cta"],
  shotRequirements: [],
  copywritingRules: [],
  riskRules: [],
  sourceReferenceIds: [],
  ...overrides,
});

const readyAssets = (assets = [asset()]): ScriptTemplateAssetResolution => ({
  kind: "ready",
  assets,
});

describe("extractAndStoreScriptTemplate", () => {
  it("maps missing script assets to the existing not-found response", async () => {
    let extracted = false;
    let stored = false;

    const result = await extractAndStoreScriptTemplate({
      request: { assetIds: ["missing"], category: "cups" },
      resolveTemplateAssets: async () => ({ kind: "not-found", missingAssetIds: ["missing"] }),
      extractTemplate: async () => {
        extracted = true;
        return template();
      },
      addViralTemplate: async () => {
        stored = true;
        return template();
      },
    });

    expect(extracted).toBe(false);
    expect(stored).toBe(false);
    expect(result).toEqual({
      kind: "error",
      error: {
        code: "SCRIPT_ASSET_NOT_FOUND",
        message: "One or more script assets were not found.",
        status: 404,
      },
    });
  });

  it("maps invalid script asset types to the existing script-asset-required response", async () => {
    const result = await extractAndStoreScriptTemplate({
      request: { assetIds: ["image-asset"], category: "cups" },
      resolveTemplateAssets: async () => ({ kind: "invalid-type", invalidAssetIds: ["image-asset"] }),
      extractTemplate: async () => template(),
      addViralTemplate: async () => template(),
    });

    expect(result).toEqual({
      kind: "error",
      error: {
        code: "SCRIPT_ASSET_REQUIRED",
        message: "Template extraction only supports script material assets.",
        status: 400,
      },
    });
  });

  it("extracts a template from resolved assets and stores the result", async () => {
    const scriptAsset = asset("script-asset");
    const storedTemplate = template({ templateId: "stored-template" });

    const result = await extractAndStoreScriptTemplate({
      request: {
        assetIds: [scriptAsset.id],
        category: "cups",
        templateName: "Cup hook",
        apiConfig: { general: { apiKey: "user-key", modelId: "model-1" } },
      },
      resolveTemplateAssets: async (assetIds) => {
        expect(assetIds).toEqual([scriptAsset.id]);
        return readyAssets([scriptAsset]);
      },
      extractTemplate: async (input) => {
        expect(input).toEqual({
          assets: [scriptAsset],
          category: "cups",
          templateName: "Cup hook",
          apiConfig: { general: { apiKey: "user-key", modelId: "model-1" } },
        });
        return template({ templateId: "extracted-template" });
      },
      addViralTemplate: async (extracted) => {
        expect(extracted.templateId).toBe("extracted-template");
        return storedTemplate;
      },
    });

    expect(result).toEqual({
      kind: "ready",
      template: storedTemplate,
    });
  });

  it("maps provider failures to the existing template extraction failure response", async () => {
    const result = await extractAndStoreScriptTemplate({
      request: { assetIds: ["script-asset"], category: "cups" },
      resolveTemplateAssets: async () => readyAssets(),
      extractTemplate: async () => {
        throw new Error("Provider failed");
      },
      addViralTemplate: async () => template(),
    });

    expect(result).toEqual({
      kind: "error",
      error: {
        code: "SCRIPT_TEMPLATE_EXTRACTION_FAILED",
        message: "Provider failed",
        status: 502,
      },
    });
  });
});
