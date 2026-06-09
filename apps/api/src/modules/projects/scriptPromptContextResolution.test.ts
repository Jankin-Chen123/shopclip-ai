import { describe, expect, it } from "vitest";
import type { AssetMetadata, ReferenceVideo, ScriptGenerationRequest, ViralTemplate } from "@shopclip/shared";

import { resolveScriptPromptContext } from "./scriptPromptContextResolution.js";

const request = (overrides: Partial<ScriptGenerationRequest> = {}): ScriptGenerationRequest => ({
  assetIds: [],
  keywords: [],
  materials: [],
  productionMode: "automatic",
  ...overrides,
});

const reference = (overrides: Partial<ReferenceVideo> = {}): ReferenceVideo =>
  ({
    id: "reference-1",
    sourceUrl: "https://example.test/reference.mp4",
    sourcePlatform: "tiktok",
    sourceDeclaration: "Structured analysis only.",
    title: "Reference video",
    category: "cups",
    publicStats: { likes: 1, comments: 0, shares: 0, views: 10 },
    status: "ready",
    analysis: {
      referenceId: "reference-1",
      sourceUrl: "https://example.test/reference.mp4",
      sourcePlatform: "tiktok",
      sourceDeclaration: "Structured analysis only.",
      title: "Reference video",
      publicStats: { likes: 1, comments: 0, shares: 0, views: 10 },
      durationSeconds: 12,
      category: "cups",
      hookScore: 0.8,
      hookAnalysis: "Fast hook.",
      pacingAnalysis: "Fast demo.",
      emotionalArc: [],
      targetAudience: [],
      contentFormula: "hook-demo-cta",
      keyViralFactors: [],
      commerceNarrativeSegments: [],
      recreationBlueprint: {
        copywriting: "Short lines.",
        shootingGuide: "Use owned material.",
        visual: "Closeups.",
      },
      commentInsights: [],
      derivedTemplates: [],
    },
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  }) as ReferenceVideo;

const template = (overrides: Partial<ViralTemplate> = {}): ViralTemplate =>
  ({
    templateId: "template-1",
    name: "Hook demo CTA",
    category: "cups",
    strategy: "Open fast and prove the product.",
    factorSet: [],
    narrativeStructure: ["hook", "demo", "cta"],
    shotRequirements: [],
    copywritingRules: [],
    riskRules: [],
    sourceReferenceIds: [],
    ...overrides,
  }) as ViralTemplate;

const referenceScriptAsset = (referenceId = "reference-1"): AssetMetadata =>
  ({
    id: "asset-reference-script",
    metadata: {
      kind: "reference_script_asset",
      referenceId,
    },
  }) as AssetMetadata;

describe("resolveScriptPromptContext", () => {
  it("resolves selected reference, matching reference script asset, and selected template", async () => {
    const selectedReference = reference();
    const selectedTemplate = template();
    const selectedScriptAsset = referenceScriptAsset();

    const result = await resolveScriptPromptContext({
      request: request({
        productionMode: "viral-remix",
        referenceId: selectedReference.id,
        templateId: selectedTemplate.templateId,
      }),
      listAssets: async () => [selectedScriptAsset],
      listReferenceVideos: async () => [selectedReference],
      listViralTemplates: async () => [selectedTemplate],
    });

    expect(result).toEqual({
      context: {
        reference: selectedReference,
        referenceScriptAsset: selectedScriptAsset,
        template: selectedTemplate,
      },
    });
  });

  it("returns the existing required-reference error for viral remix requests without a reference", async () => {
    const result = await resolveScriptPromptContext({
      request: request({ productionMode: "viral-remix" }),
      listAssets: async () => [],
      listReferenceVideos: async () => [],
      listViralTemplates: async () => [],
    });

    expect(result).toEqual({
      context: {},
      error: {
        code: "REFERENCE_REQUIRED",
        message: "Viral remix script generation requires a selected reference video.",
        status: 400,
      },
    });
  });

  it("keeps the existing not-ready and missing-analysis validation for viral remix references", async () => {
    const notReady = await resolveScriptPromptContext({
      request: request({ productionMode: "viral-remix", referenceId: "reference-1" }),
      listAssets: async () => [],
      listReferenceVideos: async () => [reference({ status: "analyzing" })],
      listViralTemplates: async () => [],
    });

    expect(notReady).toEqual({
      context: {},
      error: {
        code: "REFERENCE_NOT_READY",
        message: "Reference video must finish analysis before viral remix script generation.",
        status: 400,
      },
    });

    const missingAnalysis = await resolveScriptPromptContext({
      request: request({ productionMode: "viral-remix", referenceId: "reference-1" }),
      listAssets: async () => [],
      listReferenceVideos: async () => [reference({ analysis: undefined })],
      listViralTemplates: async () => [],
    });

    expect(missingAnalysis).toEqual({
      context: {},
      error: {
        code: "REFERENCE_ANALYSIS_REQUIRED",
        message: "Reference video analysis is required for viral remix script generation.",
        status: 400,
      },
    });
  });

  it("returns the existing required-template error for template requests without a template", async () => {
    const result = await resolveScriptPromptContext({
      request: request({ productionMode: "template" }),
      listAssets: async () => [],
      listReferenceVideos: async () => [],
      listViralTemplates: async () => [],
    });

    expect(result).toEqual({
      context: {},
      error: {
        code: "VIRAL_TEMPLATE_REQUIRED",
        message: "Template script generation requires a selected viral template.",
        status: 400,
      },
    });
  });
});
