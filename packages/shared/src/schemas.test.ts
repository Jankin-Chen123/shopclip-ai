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
  ProjectSummarySchema,
  RenderRequestSchema,
  RenderTaskSchema,
  ScriptGenerationRequestSchema,
  ScriptResultSchema,
  SmartEditPlanSchema,
  SmartEditRequestSchema,
  SmartEditResultSchema,
  SmartEditSegmentSchema,
  SmartEditSegmentRefreshRequestSchema,
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

  it("accepts compact project history summaries", () => {
    const result = ProjectSummarySchema.safeParse({
      id: "project_demo",
      title: "Desk launch clip",
      productName: "GlowGrip Phone Stand",
      status: "ready",
      createdAt: "2026-05-21T00:00:00.000Z",
      updatedAt: "2026-05-21T00:05:00.000Z",
      assetCount: 2,
      sceneCount: 4,
    });

    expect(result.success).toBe(true);
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

  it("accepts render tasks with per-scene video clips", () => {
    const result = RenderTaskSchema.safeParse({
      id: "render_demo",
      projectId: "project_demo",
      status: "completed",
      progress: 100,
      previewUrl: "https://cdn.example.test/scene-1.mp4",
      exportUrl: "https://cdn.example.test/scene-1.mp4",
      provider: "volcengine-seedance",
      sceneClips: [
        {
          sceneId: "scene_1",
          order: 1,
          subtitle: "Hook",
          status: "completed",
          progress: 100,
          providerTaskId: "cgt-scene-1",
          videoUrl: "https://cdn.example.test/scene-1.mp4",
        },
      ],
      createdAt: "2026-05-21T00:00:00.000Z",
      updatedAt: "2026-05-21T00:00:01.000Z",
    });

    expect(result.success).toBe(true);
    expect(result.data?.sceneClips).toHaveLength(1);
  });

  it("defaults generated videos to include audio across render and smart edit requests", () => {
    const renderRequest = RenderRequestSchema.parse({});
    expect(renderRequest.videoSettings.generateAudio).toBe(true);

    const smartEditRequest = SmartEditRequestSchema.parse({});
    expect(smartEditRequest.videoSettings.generateAudio).toBe(true);

    const smartEditRefreshRequest = SmartEditSegmentRefreshRequestSchema.safeParse({
      currentPlan: {
        id: "edit_plan_1",
        projectId: "project_demo",
        strategy: "Use generated materials.",
        targetDurationSeconds: 4,
        segments: [
          {
            id: "segment_1",
            sceneId: "scene_1",
            order: 1,
            enabled: true,
            durationSeconds: 4,
            transition: "cut",
            subtitle: "Show the product.",
            voiceover: "Show the product.",
            source: {
              sceneClipUrl: "https://cdn.example.test/scene-1.mp4",
              startSecond: 0,
              endSecond: 4,
              kind: "generated-scene-clip",
            },
            assetTags: [],
            rationale: "Use the generated scene material.",
          },
        ],
        audio: {
          bgmTrack: "creator-pop",
          voice: "clear-host",
        },
        createdAt: "2026-05-21T00:00:00.000Z",
      },
      segmentOutputs: [
        {
          segmentId: "segment_1",
          sceneId: "scene_1",
          objectKey: "renders/demo/scene-1.mp4",
          videoUrl: "https://cdn.example.test/scene-1.mp4",
        },
      ],
    });

    expect(smartEditRefreshRequest.success).toBe(true);
    expect(smartEditRefreshRequest.data?.videoSettings.generateAudio).toBe(true);
  });

  it("accepts generated video display names on render requests", () => {
    const renderRequest = RenderRequestSchema.parse({
      displayName: "高转化水杯短视频脚本",
    });

    expect(renderRequest.displayName).toBe("高转化水杯短视频脚本");
  });

  it("validates real smart edit requests, plans, and results", () => {
    const request = SmartEditRequestSchema.safeParse({
      locale: "zh-CN",
      targetLanguage: "zh-CN",
      mediaSettings: {
        bgmTrack: "creator-pop",
        subtitleStyle: "clean-lower-third",
        subtitlesEnabled: true,
        ttsVoice: "clear-host",
      },
      videoSettings: {
        ratio: "9:16",
        resolution: "720p",
        generateAudio: true,
        watermark: false,
      },
      segments: [
        {
          sceneId: "scene_1",
          enabled: true,
          durationSeconds: 4,
          transition: "fade",
          subtitle: "谁能拒绝这个杯盖设计",
          voiceover: "谁能拒绝这个杯盖设计",
          source: {
            assetId: "asset_video_1",
            sliceId: "slice_1",
            startSecond: 2,
            endSecond: 6,
            kind: "video-slice",
          },
        },
      ],
    });

    expect(request.success).toBe(true);

    const plan = SmartEditPlanSchema.safeParse({
      id: "edit_plan_1",
      projectId: "project_demo",
      strategy: "Use slice-level product demos, short fades, Chinese captions, and BGM.",
      targetDurationSeconds: 8,
      segments: [
        {
          id: "segment_1",
          sceneId: "scene_1",
          order: 1,
          enabled: true,
          durationSeconds: 4,
          transition: "fade",
          subtitle: "谁能拒绝这个杯盖设计",
          voiceover: "谁能拒绝这个杯盖设计",
          source: {
            assetId: "asset_video_1",
            sliceId: "slice_1",
            startSecond: 2,
            endSecond: 6,
            kind: "video-slice",
          },
          transform: {
            scale: 1.18,
            rotateDegrees: -3,
            offsetXPercent: 8,
            offsetYPercent: -6,
            opacity: 0.82,
          },
          effects: {
            blur: 1.5,
            sharpen: 0.4,
            fadeInSeconds: 0.25,
            fadeOutSeconds: 0.35,
          },
          visualEffects: [
            {
              id: "effect_blur_stack",
              type: "blur",
              enabled: true,
              params: {
                amount: 4.5,
                radius: 6,
              },
            },
            {
              id: "effect_saturation_stack",
              type: "saturation",
              enabled: false,
              params: {
                amount: 1.4,
                radius: 4,
              },
              keyframes: [
                {
                  id: "effect_saturation_kf_start",
                  easing: "linear",
                  param: "amount",
                  timeSecond: 0,
                  value: 0.9,
                },
                {
                  id: "effect_saturation_kf_peak",
                  easing: "hold",
                  param: "amount",
                  timeSecond: 2.4,
                  value: 1.6,
                },
              ],
            },
          ],
          visualMask: {
            id: "mask_product_focus",
            type: "ellipse",
            inverted: false,
            xPercent: 50,
            yPercent: 46,
            widthPercent: 72,
            heightPercent: 58,
          },
          visualKeyframes: [
            {
              id: "kf_intro_push",
              easing: "linear",
              timeSecond: 0,
              transform: {
                scale: 1,
                rotateDegrees: 0,
                offsetXPercent: 0,
                offsetYPercent: 0,
                opacity: 1,
              },
            },
            {
              id: "kf_product_closeup",
              easing: "linear",
              timeSecond: 2.4,
              transform: {
                scale: 1.35,
                rotateDegrees: -3,
                offsetXPercent: 12,
                offsetYPercent: -8,
                opacity: 0.75,
              },
              effects: {
                blur: 0.8,
                sharpen: 0.5,
                fadeInSeconds: 0,
                fadeOutSeconds: 0,
              },
            },
          ],
          assetTags: ["demo", "closeup"],
          rationale: "The selected slice shows the lid action clearly.",
        },
      ],
      audio: {
        bgmTrack: "creator-pop",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      createdAt: "2026-06-02T00:00:00.000Z",
    });

    expect(plan.success).toBe(true);
    expect(plan.success ? plan.data.segments[0]?.transform?.scale : undefined).toBe(1.18);
    expect(plan.success ? plan.data.segments[0]?.effects?.blur : undefined).toBe(1.5);
    expect(plan.success ? plan.data.segments[0]?.visualEffects?.map((effect) => effect.type) : undefined).toEqual([
      "blur",
      "saturation",
    ]);
    expect(
      plan.success
        ? plan.data.segments[0]?.visualEffects?.[1]?.keyframes?.map((keyframe) => keyframe.value)
        : undefined,
    ).toEqual([0.9, 1.6]);
    expect(plan.success ? plan.data.segments[0]?.visualMask?.type : undefined).toBe("ellipse");
    expect(plan.success ? plan.data.segments[0]?.visualMask?.widthPercent : undefined).toBe(72);
    expect(plan.success ? plan.data.segments[0]?.visualKeyframes?.map((keyframe) => keyframe.id) : undefined).toEqual([
      "kf_intro_push",
      "kf_product_closeup",
    ]);

    expect(
      SmartEditSegmentSchema.safeParse({
        ...(plan.success ? plan.data.segments[0] : {}),
        transform: {
          scale: 0,
          rotateDegrees: 361,
          offsetXPercent: 250,
          offsetYPercent: -250,
          opacity: 1.4,
        },
        effects: {
          blur: 50,
          sharpen: 4,
          fadeInSeconds: 10,
          fadeOutSeconds: 10,
        },
        visualEffects: [
          {
            id: "bad_effect",
            type: "unknown",
            enabled: true,
            params: {
              amount: 50,
              radius: -1,
            },
          },
        ],
        visualKeyframes: [
          {
            id: "bad_keyframe",
            easing: "linear",
            timeSecond: 121,
            transform: {
              scale: 6,
              rotateDegrees: 0,
              offsetXPercent: 0,
              offsetYPercent: 0,
              opacity: 1,
            },
          },
        ],
        visualMask: {
          id: "bad_mask",
          type: "ellipse",
          inverted: false,
          xPercent: 150,
          yPercent: -20,
          widthPercent: 0,
          heightPercent: 140,
        },
      }).success,
    ).toBe(false);

    expect(
      SmartEditResultSchema.safeParse({
        plan: plan.success ? plan.data : undefined,
        previewUrl: "https://cdn.example.test/edit-preview.mp4",
        exportUrl: "https://cdn.example.test/edit-export.mp4",
        renderTaskId: "render_1",
        traceEvents: [
          {
            id: "trace_1",
            renderTaskId: "render_1",
            status: "completed",
            step: "smart-edit-compose",
            message: "Edited video composed with ffmpeg.",
            createdAt: "2026-06-02T00:00:01.000Z",
          },
        ],
      }).success,
    ).toBe(true);
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

  it("accepts generated image URLs on storyboard scenes", () => {
    const result = StoryboardSceneSchema.safeParse({
      id: "scene_1",
      projectId: "project_demo",
      order: 1,
      durationSeconds: 4,
      subtitle: "Snap it open",
      voiceover: "Snap it open",
      visualPrompt: "Close-up product demo",
      imageUrl: "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E",
      assetId: "asset_demo_1",
      status: "generated",
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.data.imageUrl : undefined).toContain("data:image/svg+xml");
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

  it("accepts up to 14 reference images for image generation requests", () => {
    const accepted = InspirationGenerateRequestSchema.safeParse({
      prompt: "用参考图生成一张产品分镜图。",
      assetType: "image",
      options: {
        image: {
          referenceImages: Array.from(
            { length: 14 },
            (_, index) => `https://cdn.example.test/reference-${index + 1}.png`,
          ),
        },
      },
    });

    expect(accepted.success).toBe(true);
    expect(accepted.success ? accepted.data.options?.image?.referenceImages : undefined).toHaveLength(
      14,
    );

    const rejected = InspirationGenerateRequestSchema.safeParse({
      prompt: "用参考图生成一张产品分镜图。",
      assetType: "image",
      options: {
        image: {
          referenceImages: Array.from(
            { length: 15 },
            (_, index) => `https://cdn.example.test/reference-${index + 1}.png`,
          ),
        },
      },
    });

    expect(rejected.success).toBe(false);
  });

  it("accepts user API settings for script generation requests", () => {
    const parsed = ScriptGenerationRequestSchema.safeParse({
      assetIds: ["asset-product-main"],
      draftScript: "请基于素材生成脚本。",
      keywords: ["便携", "防漏"],
      materials: [
        {
          assetId: "asset-product-main",
          name: "产品主图",
          type: "image",
        },
      ],
      apiConfig: {
        general: {
          provider: "openai-compatible",
          apiBaseUrl: "https://api.example.test/v1",
          model: "custom-text-model",
          apiKey: "user-api-key",
        },
      },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.apiConfig?.general?.model : undefined).toBe(
      "custom-text-model",
    );
  });

  it("allows timeline edit segment durations while rejecting impossible clip lengths", () => {
    const segment = {
      id: "segment-1",
      sceneId: "scene-1",
      order: 1,
      enabled: true,
      durationSeconds: 4,
      transition: "cut",
      subtitle: "Readable caption",
      voiceover: "Readable caption",
      source: {
        assetId: "asset-1",
        imageUrl: "https://cdn.example.test/cup.png",
        kind: "image-asset",
      },
      assetTags: ["hero"],
      rationale: "Use the strongest product visual.",
    };

    expect(SmartEditSegmentSchema.safeParse(segment).success).toBe(true);
    expect(
      SmartEditSegmentSchema.safeParse({ ...segment, durationSeconds: 0.1 }).success,
    ).toBe(false);
    expect(SmartEditSegmentSchema.safeParse({ ...segment, durationSeconds: 0.25 }).success).toBe(
      true,
    );
    expect(SmartEditSegmentSchema.safeParse({ ...segment, durationSeconds: 3.5 }).success).toBe(
      true,
    );
    expect(
      SmartEditSegmentSchema.safeParse({ ...segment, durationSeconds: 120.5 }).success,
    ).toBe(false);
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

  it("validates text external asset results for script imports", () => {
    expect(
      ExternalAssetResultSchema.safeParse({
        id: "pexels:text:script-1",
        source: "pexels",
        externalId: "script-1",
        type: "text",
        title: "Launch script",
        thumbnailUrl: "",
        previewUrl: "https://www.pexels.com/script/preview.txt",
        downloadUrl: "https://www.pexels.com/script/download.txt",
        externalUrl: "https://www.pexels.com/script/script-1/",
        authorName: "Script Creator",
        licenseLabel: "Pexels License",
        canUseCommercially: true,
        requiresAttribution: false,
        tags: ["script"],
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

  it("validates external asset provider official credential requests without browser keys", () => {
    const parsed = ExternalAssetSearchRequestSchema.safeParse({
      query: "desk product",
      type: "image",
      providers: [
        { source: "pexels", credentialSource: "official", enabled: true },
        {
          source: "pixabay",
          credentialSource: "custom",
          apiKey: "pixabay-secret",
          enabled: true,
        },
      ],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.providers.at(0)?.credentialSource).toBe("official");
      expect(parsed.data.providers.at(0)?.apiKey).toBeUndefined();
      expect(parsed.data.providers.at(1)?.credentialSource).toBe("custom");
    }
  });

  it("accepts persistent smart edit timeline elements with independent media timing", () => {
    const plan = SmartEditPlanSchema.parse({
      id: "plan-elements",
      projectId: "project-elements",
      strategy: "Keep independently edited timeline elements instead of rebuilding from segments.",
      targetDurationSeconds: 10,
      createdAt: "2026-06-05T00:00:00.000Z",
      audio: {
        bgmTrack: "none",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [
        {
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          enabled: true,
          durationSeconds: 4,
          timelineStartSecond: 0,
          playbackRate: 1,
          sourceAudioMuted: false,
          sourceAudioVolume: 0.72,
          sourceAudioVolumeKeyframes: [
            { id: "source-volume-low", timeSecond: 0, volume: 0.4 },
            { id: "source-volume-peak", timeSecond: 1.2, volume: 0.9 },
          ],
          sourceAudioFadeInSeconds: 0.25,
          sourceAudioFadeOutSeconds: 0.35,
          captionHidden: false,
          captionStartOffsetSeconds: 0,
          voiceoverStartOffsetSeconds: 0,
          voiceoverVolume: 1.2,
          voiceoverVolumeKeyframes: [
            { id: "voice-volume-low", timeSecond: 0.2, volume: 0.8 },
            { id: "voice-volume-high", timeSecond: 1.5, volume: 1.4 },
          ],
          voiceoverFadeInSeconds: 0.2,
          voiceoverFadeOutSeconds: 0.3,
          transition: "cut",
          subtitle: "Default caption",
          voiceover: "Default voice",
          source: {
            kind: "generated-scene-clip",
            sceneClipUrl: "https://cdn.example.test/scene.mp4",
            sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-video.mp4",
            sceneClipAudioUrl: "https://cdn.example.test/scene-audio.m4a",
            sceneClipAudioWaveform: {
              sampleRate: 8000,
              durationSeconds: 4,
              bucketDurationSeconds: 1,
              buckets: [
                { index: 0, startSecond: 0, durationSeconds: 1, rms: 0.12, peak: 0.3 },
                { index: 1, startSecond: 1, durationSeconds: 1, rms: 0.42, peak: 0.98 },
              ],
            },
          },
          assetTags: ["demo"],
          rationale: "Use the generated scene clip.",
        },
      ],
      timeline: {
        scale: 1,
        durationSeconds: 10,
        tracks: [
          {
            id: "video-main",
            kind: "video",
            label: "Video",
          },
          {
            id: "audio-source",
            kind: "audio",
            label: "Source audio",
          },
          {
            id: "text-copy",
            kind: "text",
            label: "Text",
          },
        ],
        elements: [
          {
            id: "clip-video-1",
            trackId: "video-main",
            kind: "video",
            sceneId: "scene-1",
            segmentId: "segment-1",
            linkedGroupId: "linked-scene-1",
            sourceUrl: "https://cdn.example.test/scene-video.mp4",
            label: "Independent video",
            startSecond: 1.2,
            durationSeconds: 3.5,
            trimStartSecond: 0.4,
            trimEndSecond: 3.9,
            playbackRate: 1.25,
          },
          {
            id: "clip-audio-1",
            trackId: "audio-source",
            kind: "audio",
            sceneId: "scene-1",
            segmentId: "segment-1",
            linkedGroupId: "linked-scene-1",
            sourceUrl: "https://cdn.example.test/scene-audio.m4a",
            label: "Independent audio",
            startSecond: 0.5,
            durationSeconds: 2.25,
            trimStartSecond: 0.2,
            audioFadeInSeconds: 0.3,
            audioFadeOutSeconds: 0.4,
            audioVolume: 0.65,
            audioVolumeKeyframes: [
              { id: "element-volume-start", timeSecond: 0, volume: 0.5 },
              { id: "element-volume-end", timeSecond: 1.1, volume: 0.85 },
            ],
            audioWaveform: {
              sampleRate: 8000,
              durationSeconds: 2.25,
              bucketDurationSeconds: 0.75,
              buckets: [
                { index: 0, startSecond: 0, durationSeconds: 0.75, rms: 0.18, peak: 0.4 },
                { index: 1, startSecond: 0.75, durationSeconds: 0.75, rms: 0.55, peak: 1 },
              ],
            },
            muted: false,
            detachedAudio: true,
          },
          {
            id: "clip-text-1",
            trackId: "text-copy",
            kind: "text",
            sceneId: "scene-1",
            segmentId: "segment-1",
            text: "Persistent caption",
            label: "Persistent caption",
            startSecond: 2.4,
            durationSeconds: 1.4,
            trimStartSecond: 0,
            hidden: false,
          },
        ],
      },
    });

    expect(plan.timeline?.elements.map((element) => [element.id, element.startSecond])).toEqual([
      ["clip-video-1", 1.2],
      ["clip-audio-1", 0.5],
      ["clip-text-1", 2.4],
    ]);
    expect(plan.timeline?.elements.find((element) => element.kind === "text")?.text).toBe(
      "Persistent caption",
    );
    expect(plan.timeline?.elements.filter((element) => element.linkedGroupId === "linked-scene-1")).toHaveLength(2);
    expect(plan.timeline?.elements.find((element) => element.id === "clip-audio-1")).toMatchObject({
      audioFadeInSeconds: 0.3,
      audioFadeOutSeconds: 0.4,
      audioVolume: 0.65,
      audioVolumeKeyframes: [
        expect.objectContaining({ id: "element-volume-start", volume: 0.5 }),
        expect.objectContaining({ id: "element-volume-end", volume: 0.85 }),
      ],
      audioWaveform: expect.objectContaining({
        sampleRate: 8000,
        buckets: [expect.objectContaining({ rms: 0.18 }), expect.objectContaining({ peak: 1 })],
      }),
    });
    expect(plan.segments[0]).toMatchObject({
      sourceAudioFadeInSeconds: 0.25,
      sourceAudioFadeOutSeconds: 0.35,
      sourceAudioVolume: 0.72,
      voiceoverFadeInSeconds: 0.2,
      voiceoverFadeOutSeconds: 0.3,
      voiceoverVolume: 1.2,
    });
  });

  it("validates smart edit results and segment refresh requests with reusable segment outputs", () => {
    const plan = {
      id: "plan-1",
      projectId: "project-1",
      strategy: "Reuse existing segment outputs and refresh one scene.",
      targetDurationSeconds: 8,
      createdAt: "2026-06-02T00:00:00.000Z",
      audio: {
        bgmTrack: "creator-pop",
        targetLanguage: "zh-CN",
        voice: "clear-host",
      },
      segments: [
        {
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          enabled: true,
          durationSeconds: 4,
          transition: "cut",
          subtitle: "开头钩子",
          voiceover: "开头钩子",
          source: {
            assetId: "asset-1",
            imageUrl: "https://cdn.example.test/asset-1.png",
            kind: "image-asset",
          },
          assetTags: ["hero"],
          rationale: "Use the hero packshot.",
        },
        {
          id: "segment-2",
          sceneId: "scene-2",
          order: 2,
          enabled: true,
          durationSeconds: 4,
          transition: "fade",
          subtitle: "行动引导",
          voiceover: "行动引导",
          source: {
            assetId: "asset-2",
            imageUrl: "https://cdn.example.test/asset-2.png",
            kind: "image-asset",
          },
          assetTags: ["cta"],
          rationale: "Use the CTA packshot.",
        },
      ],
    };
    const segmentOutputs = [
      {
        objectKey: "projects/project-1/smart-edits/export-1/segments/segment-1.mp4",
        sceneId: "scene-1",
        segmentId: "segment-1",
        videoUrl: "https://cdn.example.test/segment-1.mp4",
      },
      {
        objectKey: "projects/project-1/smart-edits/export-1/segments/segment-2.mp4",
        sceneId: "scene-2",
        segmentId: "segment-2",
        videoUrl: "https://cdn.example.test/segment-2.mp4",
      },
    ];

    expect(
      SmartEditResultSchema.safeParse({
        plan,
        segmentOutputs,
        renderTaskId: "render-1",
        previewUrl: "https://cdn.example.test/export.mp4",
        exportUrl: "https://cdn.example.test/export.mp4",
        traceEvents: [],
      }).success,
    ).toBe(true);

    expect(
      SmartEditSegmentRefreshRequestSchema.safeParse({
        currentPlan: plan,
        segmentOutputs,
        segment: {
          sceneId: "scene-2",
          subtitle: "刷新后的行动引导",
          transition: "crossfade",
        },
      }).success,
    ).toBe(true);
  });
});
