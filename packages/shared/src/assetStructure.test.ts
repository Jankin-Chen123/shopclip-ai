import { describe, expect, it } from "vitest";

import {
  ProductProfileSchema,
  ReferenceVideoSchema,
  ReferenceVideoAnalysisSchema,
  StructuredAssetMetadataSchema,
  StructuredSliceMetadataSchema,
  ViralTemplateSchema,
} from "./schemas";

describe("multi-granularity asset structure schemas", () => {
  it("accepts structured metadata for a merchant product image", () => {
    const parsed = StructuredAssetMetadataSchema.safeParse({
      assetId: "asset_main_image",
      type: "image",
      source: "merchant_upload",
      sourceDeclaration: "Merchant-uploaded product hero image.",
      objectKey: "projects/demo/assets/main.png",
      width: 1080,
      height: 1920,
      format: "png",
      overallSummary: "Portable blender hero image with cup and blade visible.",
      role: "hero_image",
      globalTags: ["portable blender", "hero", "stainless blade"],
      ocrText: "Blend anywhere",
      visualStyle: {
        colors: ["mint", "white"],
        materials: ["plastic", "stainless steel"],
        lighting: "bright studio",
        background: "clean kitchen counter",
      },
      qualitySignals: {
        sharpness: 0.92,
        stability: 1,
        productVisibility: "clear",
        usableForAd: true,
      },
      complianceFlags: ["needs_claim_review"],
      searchText: "portable blender hero image mint blade blend anywhere",
      embeddingText: "hero product shot of a mint portable blender",
      modelTrace: {
        provider: "mock-vision",
        model: "deterministic",
        confidence: 0.84,
      },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.role : undefined).toBe("hero_image");
  });

  it("accepts product and slice metadata for video understanding", () => {
    expect(
      ProductProfileSchema.safeParse({
        productName: "BlendGo Portable Blender",
        category: "Kitchen appliances",
        targetAudience: ["commuters", "fitness buyers"],
        sellingPoints: ["USB-C charging", "leak-proof lid"],
        usageScenarios: ["office smoothie", "post-workout shake"],
        visualIdentity: {
          colors: ["mint", "white"],
          materials: ["plastic", "stainless steel"],
          shape: "compact cylinder",
          logoText: "BlendGo",
          packaging: "white retail box",
        },
        doNotMisrepresent: ["Do not claim medical benefits."],
        sourceAssetIds: ["asset_video_1"],
        confidence: 0.81,
      }).success,
    ).toBe(true);

    const parsed = StructuredSliceMetadataSchema.safeParse({
      sliceId: "slice_demo_1",
      assetId: "asset_video_1",
      startSecond: 3,
      endSecond: 6,
      thumbnailKey: "projects/demo/slices/slice_demo_1.jpg",
      frameKeys: ["projects/demo/frames/f003.jpg", "projects/demo/frames/f006.jpg"],
      summary: "Hand pours berries into the blender and taps the power button.",
      transcript: "Just add fruit and tap once.",
      ocrText: "One tap smoothie",
      shotType: "close_up",
      cameraMovement: "handheld_push_in",
      composition: "Product centered with hand interaction.",
      transition: "hard_cut",
      mood: "fresh",
      action: "ingredient loading and button press",
      keyElements: ["berries", "hand", "power button"],
      productVisibility: "clear",
      visibleProductParts: ["cup", "lid", "button"],
      suitableSceneRoles: ["demo", "trust"],
      qualitySignals: {
        sharpness: 0.88,
        stability: 0.74,
        productVisibility: "clear",
        usableForAd: true,
      },
      searchText: "close-up demo add fruit one tap smoothie",
      embeddingText: "close-up handheld product demo with fruit and button press",
      cosFrameObjectKeys: ["projects/demo/frames/f003.jpg"],
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.suitableSceneRoles : []).toContain("demo");
  });

  it("accepts reference video analysis and viral template structures", () => {
    const analysis = ReferenceVideoAnalysisSchema.safeParse({
      referenceId: "ref_portable_blender_1",
      sourceUrl: "https://example.test/video/123",
      sourcePlatform: "tiktok",
      sourceDeclaration: "Public reference URL; save structured analysis only.",
      title: "Morning smoothie in 10 seconds",
      author: "demo_creator",
      publicStats: {
        likes: 120000,
        comments: 3400,
        shares: 9000,
        views: 1500000,
      },
      durationSeconds: 12,
      category: "Kitchen appliances",
      hookScore: 0.91,
      hookAnalysis: "Starts with a direct identity label and visible product action.",
      pacingAnalysis: "Fast first cut, slower proof shot, direct CTA.",
      emotionalArc: ["curiosity", "relief", "confidence"],
      targetAudience: ["busy commuters"],
      contentFormula: "Identity hook + fast demo + trust proof + price anchor.",
      keyViralFactors: ["identity_label", "price_suspense", "demo_proof"],
      commerceNarrativeSegments: [
        {
          role: "hook",
          startSecond: 0,
          endSecond: 2,
          summary: "Calls out commuters with no breakfast time.",
          copywriting: "No time for breakfast?",
          visualPrompt: "Creator holds blender next to work bag.",
        },
        {
          role: "demo",
          startSecond: 2,
          endSecond: 8,
          summary: "Shows ingredients and blending.",
          copywriting: "Add fruit, tap once.",
          visualPrompt: "Close-up ingredient loading and button press.",
        },
      ],
      recreationBlueprint: {
        visual: "Use close-ups and fast handheld push-ins.",
        copywriting: "Open with a buyer identity label.",
        shootingGuide: "Do not remix the source video; recreate with merchant-owned assets.",
      },
      commentInsights: ["Buyers ask about cleaning and battery life."],
      derivedTemplates: ["template_identity_demo"],
    });

    expect(analysis.success).toBe(true);

    expect(
      ReferenceVideoSchema.safeParse({
        id: "ref_owned_upload_1",
        projectId: "project_1",
        sourceAssetId: "asset_self_shot_reference",
        sourceUrl: "/uploads/self-shot-reference-demo.mp4",
        sourcePlatform: "merchant_upload",
        sourceDeclaration: "Merchant-owned uploaded reference video.",
        title: "Self-shot commuter smoothie proof",
        category: "Kitchen appliances",
        publicStats: { likes: 0, comments: 0, shares: 0, views: 0 },
        status: "ready",
        analysis: analysis.success ? analysis.data : undefined,
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:00.000Z",
      }).success,
    ).toBe(true);

    expect(
      ViralTemplateSchema.safeParse({
        templateId: "template_identity_demo",
        name: "Identity Hook + Fast Demo",
        category: "Kitchen appliances",
        strategy: "Open with a precise buyer identity, then prove value through a quick demo.",
        factorSet: ["identity_label", "demo_proof", "price_anchor"],
        narrativeStructure: ["hook", "demo", "trust", "cta"],
        shotRequirements: ["clear product close-up", "hand interaction", "proof shot"],
        copywritingRules: ["Use one short question in the first two seconds."],
        riskRules: ["Avoid health claims."],
        sourceReferenceIds: ["ref_portable_blender_1"],
      }).success,
    ).toBe(true);
  });
});
