import { describe, expect, it } from "vitest";

import {
  AssetMetadataSchema,
  AssetSearchResponseSchema,
  DashboardResponseSchema,
  ExternalAssetSearchRequestSchema,
  ExternalAssetSearchResponseSchema,
  ExternalAssetResultSchema,
  InspirationGenerateRequestSchema,
  InspirationGenerateResponseSchema,
  ProjectBriefSchema,
  RenderTaskSchema,
  ScriptResultSchema,
  StoryboardSceneSchema,
  TraceEventSchema,
} from "./schemas";

describe("shared contract schemas", () => {
  it("requires product brief fields used by generation", () => {
    const result = ProjectBriefSchema.safeParse({
      title: "Launch video",
      productName: "GlowGrip Phone Stand",
      audience: "TikTok Shop buyers",
      sellingPoints: ["folds flat", "stable on desks"],
      tone: "confident",
      style: "fast demo",
      targetDurationSeconds: 15,
    });

    expect(result.success).toBe(true);
  });

  it("rejects project briefs without selling points", () => {
    const result = ProjectBriefSchema.safeParse({
      title: "Launch video",
      productName: "GlowGrip Phone Stand",
      audience: "TikTok Shop buyers",
      sellingPoints: [],
      tone: "confident",
      style: "fast demo",
      targetDurationSeconds: 15,
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid enum statuses and asset types", () => {
    expect(
      AssetMetadataSchema.safeParse({
        id: "asset_demo_1",
        projectId: "project_demo",
        type: "audio",
        status: "ready",
        url: "/assets/demo.png",
        name: "Demo asset",
        tags: ["product"],
      }).success,
    ).toBe(false);

    expect(
      RenderTaskSchema.safeParse({
        id: "render_demo",
        projectId: "project_demo",
        status: "almost-done",
        progress: 95,
        previewUrl: "/exports/demo.mp4",
        createdAt: "2026-05-21T00:00:00.000Z",
        updatedAt: "2026-05-21T00:00:01.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid scene duration and scripts longer than 15 seconds", () => {
    expect(
      StoryboardSceneSchema.safeParse({
        id: "scene_1",
        projectId: "project_demo",
        order: 1,
        durationSeconds: 0,
        subtitle: "Snap it open",
        voiceover: "Snap it open",
        visualPrompt: "Close-up product demo",
        assetId: "asset_demo_1",
        status: "draft",
      }).success,
    ).toBe(false);

    expect(
      ScriptResultSchema.safeParse({
        id: "script_demo",
        projectId: "project_demo",
        hook: "Stop shaky product videos",
        narrative: "Show the pain, show the fix, close with offer.",
        constraints: ["Keep under 15 seconds"],
        scenes: [
          {
            id: "scene_1",
            projectId: "project_demo",
            order: 1,
            durationSeconds: 8,
            subtitle: "Before",
            voiceover: "Before",
            visualPrompt: "Phone sliding on desk",
            assetId: "asset_demo_1",
            status: "draft",
          },
          {
            id: "scene_2",
            projectId: "project_demo",
            order: 2,
            durationSeconds: 8,
            subtitle: "After",
            voiceover: "After",
            visualPrompt: "Phone locked in stand",
            assetId: "asset_demo_1",
            status: "draft",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates trace events and dashboard responses", () => {
    expect(
      TraceEventSchema.safeParse({
        id: "trace_demo_1",
        renderTaskId: "render_demo",
        status: "completed",
        step: "mock-render",
        message: "Preview asset created",
        createdAt: "2026-05-21T00:00:02.000Z",
      }).success,
    ).toBe(true);

    expect(
      DashboardResponseSchema.safeParse({
        projectId: "project_demo",
        summary: {
          predictedCompletionRate: 0.72,
          hookStrength: 0.86,
          subtitleClarity: 0.91,
          productFocus: 0.88,
        },
        funnel: [
          { stage: "Impression", value: 10000 },
          { stage: "Watch 3s", value: 6200 },
        ],
        factors: [
          {
            id: "factor_1",
            sceneId: "scene_1",
            factor: "Hook clarity",
            expectedImpact: "high",
            evidence: "Opens with a concrete pain point.",
            recommendation: "Keep the first subtitle short.",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("validates inspiration generation requests and responses without provider secrets", () => {
    expect(
      InspirationGenerateRequestSchema.safeParse({
        prompt: "Turn this product benefit into a TikTok Shop launch idea.",
        assetType: "image",
      }).success,
    ).toBe(true);

    expect(
      InspirationGenerateRequestSchema.safeParse({
        prompt: "x",
        assetType: "audio",
      }).success,
    ).toBe(false);

    expect(
      InspirationGenerateResponseSchema.safeParse({
        id: "inspiration_demo_1",
        prompt: "Turn this product benefit into a TikTok Shop launch idea.",
        assetType: "video",
        model: "doubao-seedance1.5-pro",
        provider: "mock-inspiration-provider",
        fallback: {
          used: true,
          reason: "AI_PROVIDER_MODE is mock.",
        },
        materials: [
          {
            id: "material_demo_1",
            type: "video",
            title: "Launch motion concept",
            content: "A 6-second vertical product reveal with captions.",
            status: "processing",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("validates normalized external asset search results", () => {
    expect(
      ExternalAssetResultSchema.safeParse({
        id: "pexels:123",
        source: "pexels",
        externalId: "123",
        type: "video",
        title: "Desk product demo",
        thumbnailUrl: "https://images.pexels.com/videos/123/thumbnail.jpg",
        previewUrl: "https://videos.pexels.com/video-files/123/preview.mp4",
        downloadUrl: "https://videos.pexels.com/video-files/123/download.mp4",
        externalUrl: "https://www.pexels.com/video/123/",
        authorName: "Pexels Creator",
        authorUrl: "https://www.pexels.com/@creator",
        licenseLabel: "Pexels License",
        licenseUrl: "https://www.pexels.com/license/",
        canUseCommercially: true,
        requiresAttribution: false,
        tags: ["desk", "product"],
        durationSeconds: 8,
        width: 1080,
        height: 1920,
      }).success,
    ).toBe(true);

    expect(
      ExternalAssetResultSchema.safeParse({
        id: "pixabay:456",
        source: "pixabay",
        externalId: "456",
        type: "image",
        title: "Product flat lay",
        thumbnailUrl: "https://cdn.pixabay.com/preview.jpg",
        externalUrl: "https://pixabay.com/photos/product-456/",
        licenseLabel: "Pixabay Content License",
        canUseCommercially: true,
        requiresAttribution: false,
      }).success,
    ).toBe(false);
  });

  it("validates Freesound audio external asset results and search requests", () => {
    expect(
      ExternalAssetResultSchema.safeParse({
        id: "freesound:sound:12345",
        source: "freesound",
        externalId: "12345",
        type: "audio",
        title: "Cash register button click",
        thumbnailUrl: "",
        previewUrl: "https://cdn.freesound.org/previews/12/12345_67890-hq.mp3",
        downloadUrl: "https://cdn.freesound.org/previews/12/12345_67890-hq.mp3",
        externalUrl: "https://freesound.org/people/creator/sounds/12345/",
        authorName: "Freesound Creator",
        authorUrl: "https://freesound.org/people/creator/",
        licenseLabel: "Creative Commons 0",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        canUseCommercially: true,
        requiresAttribution: false,
        tags: ["click", "cash register"],
        durationSeconds: 1.2,
      }).success,
    ).toBe(true);

    expect(
      ExternalAssetSearchRequestSchema.safeParse({
        query: "button click",
        type: "audio",
        providers: [{ source: "freesound", apiKey: "freesound-secret", enabled: true }],
      }).success,
    ).toBe(true);
  });

  it("allows asset search responses to include external provider matches", () => {
    expect(
      AssetSearchResponseSchema.safeParse({
        projectId: "project_demo",
        query: "desk product video",
        tags: [],
        results: [],
        externalResults: [
          {
            id: "pixabay:789",
            source: "pixabay",
            externalId: "789",
            type: "image",
            title: "Desk product shot",
            thumbnailUrl: "https://cdn.pixabay.com/preview.jpg",
            previewUrl: "https://cdn.pixabay.com/photo.jpg",
            externalUrl: "https://pixabay.com/photos/desk-789/",
            authorName: "Pixabay Creator",
            licenseLabel: "Pixabay Content License",
            licenseUrl: "https://pixabay.com/service/license-summary/",
            canUseCommercially: true,
            requiresAttribution: false,
            tags: ["desk", "product"],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("validates user-provided external asset search requests without exposing keys in responses", () => {
    const parsed = ExternalAssetSearchRequestSchema.safeParse({
      query: "desk product",
      type: "image",
      providers: [
        { source: "pexels", apiKey: "pexels-secret", enabled: true },
        { source: "pixabay", enabled: false },
      ],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(1);
      expect(parsed.data.perPage).toBe(12);
      expect(parsed.data.providers.at(0)?.apiKey).toBe("pexels-secret");
    }

    expect(
      ExternalAssetSearchResponseSchema.safeParse({
        query: "desk product",
        page: 1,
        perPage: 12,
        hasMore: true,
        externalResults: [
          {
            id: "pexels:photo:desk-packshot",
            source: "pexels",
            externalId: "desk-packshot",
            type: "image",
            title: "Desk stock product packshot",
            thumbnailUrl: "https://images.pexels.com/photos/1/thumb.jpeg",
            previewUrl: "https://images.pexels.com/photos/1/preview.jpeg",
            externalUrl: "https://www.pexels.com/photo/1/",
            authorName: "Pexels Creator",
            licenseLabel: "Pexels License",
            canUseCommercially: true,
            requiresAttribution: false,
            tags: ["desk"],
          },
        ],
      }).success,
    ).toBe(true);
  });
});
