import { describe, expect, it } from "vitest";

import type { ReferenceVideoAnalysis, StructuredSliceMetadata } from "@shopclip/shared";

import { MemoryProjectStore } from "./memoryStore.js";

const createBrief = () => ({
  title: "Portable blender launch",
  productName: "BlendGo Portable Blender",
  audience: "Busy commuters",
  sellingPoints: ["USB-C charging", "leak-proof lid"],
  tone: "confident",
  style: "fast demo",
  targetDurationSeconds: 15,
});

const createSliceMetadata = (sliceId: string, assetId: string): StructuredSliceMetadata => ({
  sliceId,
  assetId,
  startSecond: 0,
  endSecond: 3,
  summary: "Hand adds fruit to the portable blender.",
  transcript: "Add fruit and tap once.",
  ocrText: "One tap smoothie",
  shotType: "close_up",
  cameraMovement: "handheld_push_in",
  composition: "Product centered with visible hand interaction.",
  transition: "hard_cut",
  mood: "fresh",
  action: "ingredient loading",
  keyElements: ["fruit", "hand", "button"],
  productVisibility: "clear",
  visibleProductParts: ["cup", "button"],
  suitableSceneRoles: ["demo", "trust"],
  qualitySignals: {
    sharpness: 0.86,
    stability: 0.72,
    productVisibility: "clear",
    usableForAd: true,
  },
  searchText: "close-up demo fruit button portable blender",
  embeddingText: "close-up demo of portable blender with fruit",
  frameKeys: [],
  cosFrameObjectKeys: [],
});

const createReferenceAnalysis = (): ReferenceVideoAnalysis => ({
  referenceId: "reference_blender_1",
  sourceUrl: "https://example.test/video/123",
  sourcePlatform: "tiktok",
  sourceDeclaration: "Public reference URL; save structured analysis only.",
  title: "Morning smoothie in 10 seconds",
  author: "demo_creator",
  publicStats: {
    likes: 120000,
    comments: 3200,
    shares: 8400,
    views: 1400000,
  },
  durationSeconds: 12,
  category: "Kitchen appliances",
  hookScore: 0.9,
  hookAnalysis: "Identity hook with immediate product action.",
  pacingAnalysis: "Fast hook, clear demo, short CTA.",
  emotionalArc: ["curiosity", "relief", "confidence"],
  targetAudience: ["commuters"],
  contentFormula: "Identity hook + fast demo + trust proof + CTA.",
  keyViralFactors: ["identity_label", "demo_proof"],
  commerceNarrativeSegments: [
    {
      role: "hook",
      startSecond: 0,
      endSecond: 2,
      summary: "Calls out commuters.",
      copywriting: "No breakfast time?",
      visualPrompt: "Creator holds blender next to a work bag.",
    },
  ],
  recreationBlueprint: {
    visual: "Use merchant-owned close-ups and handheld push-ins.",
    copywriting: "Open with a buyer identity question.",
    shootingGuide: "Recreate structure only; never remix the public source.",
  },
  commentInsights: ["Battery life questions appear often."],
  derivedTemplates: ["template_identity_demo"],
});

describe("structured project store", () => {
  it("stores structured slices, processing events, reference analyses, and viral templates", () => {
    const store = new MemoryProjectStore();
    const project = store.createProject(createBrief());
    const asset = store.addAsset(project.id, {
      type: "video",
      status: "uploaded",
      source: "merchant_upload",
      url: "/uploads/blender-demo.mp4",
      name: "blender-demo.mp4",
      tags: ["portable blender"],
    });
    expect(asset).toBeDefined();

    const slices = store.addAssetSlices(asset!.id, [
      {
        label: "Demo close-up",
        startSecond: 0,
        endSecond: 3,
        tags: ["demo"],
        thumbnailKey: "projects/demo/slices/slice_1.jpg",
        searchText: "portable blender demo",
        embeddingText: "portable blender fruit demo",
        metadata: createSliceMetadata("slice_demo_1", asset!.id),
      },
    ]);

    expect(slices).toHaveLength(1);
    expect(slices[0]?.metadata?.suitableSceneRoles).toContain("demo");

    const updatedSlice = store.updateAssetSlice(slices[0]!.id, {
      tags: ["demo", "proof"],
      embeddingText: "updated close-up proof demo",
    });
    expect(updatedSlice?.tags).toContain("proof");
    expect(updatedSlice?.embeddingText).toBe("updated close-up proof demo");

    const job = store.addAssetProcessingJob(project.id, {
      id: "job_asset_1",
      assetId: asset!.id,
      status: "processing",
      steps: ["probe"],
      message: "Processing started.",
    });
    expect(job).toBeDefined();

    const event = store.addAssetProcessingEvent(job!.id, {
      assetId: asset!.id,
      step: "probe",
      status: "completed",
      message: "Media metadata extracted.",
      progress: 20,
      retryable: false,
    });
    expect(event.step).toBe("probe");
    expect(store.listAssetProcessingEvents(job!.id)).toHaveLength(1);

    const reference = store.addReferenceVideo(project.id, {
      sourceUrl: "https://example.test/video/123",
      sourcePlatform: "tiktok",
      sourceDeclaration: "Public reference URL; save structured analysis only.",
      title: "Morning smoothie in 10 seconds",
      category: "Kitchen appliances",
      publicStats: { likes: 120000, comments: 3200, shares: 8400, views: 1400000 },
      status: "registered",
    });
    expect(reference?.status).toBe("registered");

    const analyzed = store.updateReferenceVideoAnalysis(reference!.id, createReferenceAnalysis());
    expect(analyzed?.status).toBe("ready");
    expect(analyzed?.analysis?.commerceNarrativeSegments[0]?.role).toBe("hook");

    const template = store.addViralTemplate({
      templateId: "template_identity_demo",
      name: "Identity Hook + Fast Demo",
      category: "Kitchen appliances",
      strategy: "Open with buyer identity, then show proof through fast demo.",
      factorSet: ["identity_label", "demo_proof"],
      narrativeStructure: ["hook", "demo", "trust", "cta"],
      shotRequirements: ["clear product close-up"],
      copywritingRules: ["Use one short question in the first two seconds."],
      riskRules: ["Avoid health claims."],
      sourceReferenceIds: [reference!.id],
    });

    expect(template.sourceReferenceIds).toEqual([reference!.id]);
    expect(store.listReferenceVideos(project.id)).toHaveLength(1);
  });
});
