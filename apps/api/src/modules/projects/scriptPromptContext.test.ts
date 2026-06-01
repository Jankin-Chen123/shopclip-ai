import type {
  AssetMetadata,
  ReferenceVideo,
  ScriptGenerationRequest,
  ViralTemplate,
} from "@shopclip/shared";
import { describe, expect, it } from "vitest";

import { buildScriptAssetPromptLines, scriptGenerationPrompt } from "./router.js";
import type { ProjectSnapshot } from "./projectStore.js";

const makeProject = (project: Partial<ProjectSnapshot> = {}): ProjectSnapshot =>
  ({
    id: "project-script",
    title: "Cup launch",
    productName: "Cat Straw Cup",
    audience: "students and cup collectors",
    sellingPoints: ["颜值高", "可爱小猫图案", "新颖吸管设计"],
    tone: "friendly",
    style: "fast cute demo",
    targetDurationSeconds: 15,
    prepKeywords: ["颜值高"],
    assets: [],
    assetSlices: [],
    assetProcessingEvents: [],
    assetProcessingJobs: [],
    referenceVideos: [],
    viralTemplates: [],
    scripts: [],
    scenes: [],
    renderTasks: [],
    status: "ready",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...project,
  }) as ProjectSnapshot;

const makeReference = (reference: Partial<ReferenceVideo> = {}): ReferenceVideo => ({
  id: "reference-cup-1",
  sourceUrl: "https://example.test/cup-reference.mp4",
  sourcePlatform: "tiktok",
  sourceDeclaration: "Public reference URL; save structured analysis only.",
  title: "Cheap cup but cute",
  category: "水杯",
  publicStats: { likes: 1200, comments: 30, shares: 18, views: 60000 },
  status: "ready",
  analysis: {
    referenceId: "reference-cup-1",
    sourceUrl: "https://example.test/cup-reference.mp4",
    sourcePlatform: "tiktok",
    sourceDeclaration: "Public reference URL; save structured analysis only.",
    title: "Cheap cup but cute",
    publicStats: { likes: 1200, comments: 30, shares: 18, views: 60000 },
    durationSeconds: 12,
    category: "水杯",
    hookScore: 0.91,
    hookAnalysis: "Opens with a student budget surprise hook.",
    pacingAnalysis: "Fast hook, compact demo, detail proof, direct CTA.",
    emotionalArc: ["curiosity", "delight", "trust"],
    targetAudience: ["students", "budget buyers"],
    contentFormula: "price surprise + cute design reveal + straw demo + CTA",
    keyViralFactors: ["price_anchor", "cute_pattern", "straw_design_demo"],
    commerceNarrativeSegments: [
      {
        role: "hook",
        startSecond: 0,
        endSecond: 2,
        summary: "Calls out cheap purchase surprise.",
        copywriting: "冲着便宜买的，没想到这么好看。",
        visualPrompt: "Handheld reveal of a cute cat-pattern cup.",
      },
      {
        role: "demo",
        startSecond: 2,
        endSecond: 8,
        summary: "Shows the straw structure and lid detail.",
        copywriting: "这个吸管设计真的很方便。",
        visualPrompt: "Close-up straw and lid demo.",
      },
    ],
    recreationBlueprint: {
      visual: "Use merchant-owned cup close-ups and detail shots.",
      copywriting: "Keep lines short and surprise-driven.",
      shootingGuide: "Learn structure only; do not reuse source footage.",
    },
    commentInsights: ["Buyers ask if the straw is easy to clean."],
    derivedTemplates: ["cheap_surprise_cute_demo"],
  },
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  ...reference,
});

const makeTemplate = (template: Partial<ViralTemplate> = {}): ViralTemplate => ({
  templateId: "template-cute-demo",
  name: "Cute budget surprise demo",
  category: "水杯",
  strategy: "Open with a cheap-but-cute surprise, prove the feature, then close with CTA.",
  factorSet: ["student identity", "price surprise", "cute pattern", "straw proof"],
  narrativeStructure: ["hook", "demo", "trust", "cta"],
  shotRequirements: ["0-2s reveal", "2-8s straw close-up", "final packshot"],
  copywritingRules: ["Use short spoken lines", "Avoid copying source wording verbatim"],
  riskRules: ["Do not reuse public source footage"],
  sourceReferenceIds: ["reference-cup-1"],
  ...template,
});

describe("buildScriptAssetPromptLines", () => {
  it("includes multi-granularity structured asset summaries for real script generation prompts", () => {
    const asset: AssetMetadata = {
      id: "asset-structured-cup",
      projectId: "project-script",
      type: "image",
      status: "ready",
      source: "merchant_upload",
      url: "https://cos.test/cup.png",
      name: "cup hero.png",
      mimeType: "image/png",
      tags: ["cup", "hero"],
      metadata: {
        structuredAsset: {
          assetId: "asset-structured-cup",
          projectId: "project-script",
          type: "image",
          source: "merchant_upload",
          sourceDeclaration: "Merchant-uploaded asset.",
          overallSummary: "A transparent plastic cup with a cat-ear lid and visible straw.",
          role: "hero_image",
          globalTags: ["transparent cup", "cat-ear lid"],
          ocrText: "BPA FREE",
          visualStyle: {
            colors: ["transparent", "pink"],
            materials: ["plastic"],
          },
          qualitySignals: {
            productVisibility: "clear",
            usableForAd: true,
          },
          complianceFlags: [],
          searchText: "transparent pink plastic cup cat-ear lid straw BPA FREE",
          embeddingText: "transparent pink plastic cup cat-ear lid straw BPA FREE",
        },
      },
    };
    const request: ScriptGenerationRequest = {
      assetIds: [asset.id],
      keywords: [],
      materials: [{ assetId: asset.id, bucketId: "hero", name: asset.name, type: "image" }],
      productionMode: "automatic",
    };

    const lines = buildScriptAssetPromptLines(request, [asset]);

    expect(lines.join("\n")).toContain("结构化摘要=A transparent plastic cup");
    expect(lines.join("\n")).toContain("素材角色=hero_image");
    expect(lines.join("\n")).toContain("OCR=BPA FREE");
    expect(lines.join("\n")).toContain("可见度=clear");
    expect(lines.join("\n")).toContain("检索语义=transparent pink plastic cup");
  });

  it("injects ready viral reference analysis into real script generation prompts", () => {
    const reference = makeReference();
    const request: ScriptGenerationRequest = {
      assetIds: [],
      keywords: ["颜值高"],
      materials: [],
      productionMode: "viral-remix",
      referenceId: reference.id,
    };

    const prompt = scriptGenerationPrompt(makeProject(), request, [], { reference });

    expect(prompt).toContain("Cheap cup but cute");
    expect(prompt).toContain("Opens with a student budget surprise hook.");
    expect(prompt).toContain("price surprise + cute design reveal + straw demo + CTA");
    expect(prompt).toContain("straw_design_demo");
    expect(prompt).toContain("Calls out cheap purchase surprise.");
    expect(prompt).toContain("Learn structure only; do not reuse source footage.");
  });

  it("injects selected viral template strategy and factors into real script generation prompts", () => {
    const template = makeTemplate();
    const request: ScriptGenerationRequest = {
      assetIds: [],
      keywords: ["可爱小猫图案"],
      materials: [],
      productionMode: "template",
      templateId: template.templateId,
    };

    const prompt = scriptGenerationPrompt(makeProject(), request, [], { template });

    expect(prompt).toContain("Cute budget surprise demo");
    expect(prompt).toContain("Open with a cheap-but-cute surprise");
    expect(prompt).toContain("student identity");
    expect(prompt).toContain("2-8s straw close-up");
    expect(prompt).toContain("Avoid copying source wording verbatim");
  });
});
