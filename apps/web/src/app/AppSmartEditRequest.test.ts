import { describe, expect, it } from "vitest";
import type {
  MediaSettings,
  RenderTask,
  SmartEditPlan,
  SmartEditResult,
  StoryboardScene,
  VideoGenerationSettings,
} from "@shopclip/shared";

import type { UserApiConfig } from "../lib/api";
import {
  createSmartEditRequestPayload,
  selectRenderedSmartEditSceneSegments,
  selectSmartEditPlanSegmentOverride,
  selectSmartEditPlanSegmentOverrides,
} from "./AppSmartEditRequest";

const sceneWithId = (id: string): StoryboardScene => ({ id }) as StoryboardScene;
const apiConfig = {} as UserApiConfig;
const mediaSettings: MediaSettings = {
  bgmTrack: "creator-pop",
  subtitleStyle: "clean-lower-third",
  subtitlesEnabled: true,
  ttsVoice: "clear-host",
};
const videoSettings: VideoGenerationSettings = {
  generateAudio: true,
  ratio: "9:16",
  resolution: "720p",
  watermark: false,
};

describe("selectRenderedSmartEditSceneSegments", () => {
  it("maps completed rendered scene clips into Smart Edit segment overrides", () => {
    const renderTask = {
      status: "completed",
      sceneClips: [
        {
          sceneId: "scene-1",
          order: 1,
          subtitle: "Clip subtitle",
          videoUrl: "https://cdn.example.test/scene-1.mp4",
          material: {
            audioUrl: "https://cdn.example.test/scene-1.wav",
            materializedAt: "2026-06-08T00:00:00.000Z",
            status: "ready",
            text: "Material subtitle",
            videoOnlyUrl: "https://cdn.example.test/scene-1-video.mp4",
          },
        },
        {
          sceneId: "scene-2",
          order: 2,
          subtitle: "No video clip",
        },
      ],
    } as RenderTask;
    const scenes = [
      {
        ...sceneWithId("scene-1"),
        durationSeconds: 7,
        voiceover: "Scene voiceover",
      },
    ];

    expect(selectRenderedSmartEditSceneSegments(renderTask, scenes, undefined)).toEqual([
      {
        sceneId: "scene-1",
        durationSeconds: 7,
        enabled: true,
        timelineStartSecond: 0,
        playbackRate: 1,
        sourceAudioMuted: false,
        sourceAudioStartOffsetSeconds: 0,
        captionHidden: false,
        captionStartOffsetSeconds: 0,
        voiceoverStartOffsetSeconds: 0,
        source: {
          kind: "generated-scene-clip",
          sceneClipAudioUrl: "https://cdn.example.test/scene-1.wav",
          sceneClipAudioWaveform: undefined,
          sceneClipUrl: "https://cdn.example.test/scene-1.mp4",
          sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-1-video.mp4",
        },
        subtitle: "Material subtitle",
        transition: "cut",
        voiceover: "Scene voiceover",
      },
    ]);
  });

  it("falls back to clip subtitle and default duration when scene metadata is absent", () => {
    const renderTask = {
      status: "completed",
      sceneClips: [
        {
          sceneId: "scene-2",
          order: 2,
          subtitle: "Clip subtitle",
          videoUrl: "https://cdn.example.test/scene-2.mp4",
        },
      ],
    } as RenderTask;

    expect(selectRenderedSmartEditSceneSegments(renderTask, [], undefined)).toEqual([
      {
        sceneId: "scene-2",
        durationSeconds: 4,
        enabled: true,
        timelineStartSecond: 0,
        playbackRate: 1,
        sourceAudioMuted: false,
        sourceAudioStartOffsetSeconds: 0,
        captionHidden: false,
        captionStartOffsetSeconds: 0,
        voiceoverStartOffsetSeconds: 0,
        source: {
          kind: "generated-scene-clip",
          sceneClipAudioUrl: undefined,
          sceneClipAudioWaveform: undefined,
          sceneClipUrl: "https://cdn.example.test/scene-2.mp4",
          sceneClipVideoOnlyUrl: undefined,
        },
        subtitle: "Clip subtitle",
        transition: "fade",
        voiceover: "Clip subtitle",
      },
    ]);
  });

  it("does not seed rendered segments while an existing Smart Edit result is active", () => {
    expect(
      selectRenderedSmartEditSceneSegments(
        {
          status: "completed",
          sceneClips: [
            {
              sceneId: "scene-1",
              order: 1,
              subtitle: "Clip subtitle",
              videoUrl: "https://cdn.example.test/scene-1.mp4",
            },
          ],
        } as RenderTask,
        [sceneWithId("scene-1")],
        {} as SmartEditResult,
      ),
    ).toEqual([]);
  });

  it("returns no rendered segments before render completion", () => {
    expect(
      selectRenderedSmartEditSceneSegments(
        {
          status: "running",
          sceneClips: [
            {
              sceneId: "scene-1",
              order: 1,
              subtitle: "Clip subtitle",
              videoUrl: "https://cdn.example.test/scene-1.mp4",
            },
          ],
        } as RenderTask,
        [sceneWithId("scene-1")],
        undefined,
      ),
    ).toEqual([]);
  });
});

describe("selectSmartEditPlanSegmentOverrides", () => {
  it("maps editable Smart Edit plan segment fields into request overrides", () => {
    const plan = {
      segments: [
        {
          id: "segment-1",
          sceneId: "scene-1",
          order: 1,
          enabled: false,
          durationSeconds: 6,
          timelineStartSecond: 1,
          playbackRate: 1.25,
          captionHidden: true,
          captionStartOffsetSeconds: 0.5,
          captionDurationSeconds: 5,
          captionTextColor: "#ffffff",
          captionTextFontSize: 28,
          captionTextPositionYPercent: 76,
          voiceoverStartOffsetSeconds: 0.25,
          voiceoverDurationSeconds: 4.5,
          voiceoverVolume: 0.8,
          voiceoverVolumeKeyframes: [
            { id: "voice-kf-1", timeSecond: 0, volume: 0.2 },
          ],
          voiceoverFadeInSeconds: 0.3,
          voiceoverFadeOutSeconds: 0.4,
          source: {
            kind: "generated-scene-clip",
            sceneClipUrl: "https://cdn.example.test/scene-1.mp4",
          },
          sourceAudioMuted: true,
          sourceAudioStartOffsetSeconds: 0.75,
          sourceAudioDurationSeconds: 3.5,
          sourceAudioVolume: 0.6,
          sourceAudioVolumeKeyframes: [
            { id: "source-kf-1", timeSecond: 0, volume: 0.3 },
          ],
          sourceAudioFadeInSeconds: 0.2,
          sourceAudioFadeOutSeconds: 0.5,
          subtitle: "Segment subtitle",
          transition: "fade",
          voiceover: "Segment voiceover",
          assetTags: ["unused-request-field"],
          rationale: "Unused request field",
        },
      ],
    } as SmartEditPlan;

    expect(selectSmartEditPlanSegmentOverrides(plan)).toEqual([
      {
        sceneId: "scene-1",
        durationSeconds: 6,
        enabled: false,
        timelineStartSecond: 1,
        playbackRate: 1.25,
        captionHidden: true,
        captionStartOffsetSeconds: 0.5,
        captionDurationSeconds: 5,
        captionTextColor: "#ffffff",
        captionTextFontSize: 28,
        captionTextPositionYPercent: 76,
        voiceoverStartOffsetSeconds: 0.25,
        voiceoverDurationSeconds: 4.5,
        voiceoverVolume: 0.8,
        voiceoverVolumeKeyframes: [{ id: "voice-kf-1", timeSecond: 0, volume: 0.2 }],
        voiceoverFadeInSeconds: 0.3,
        voiceoverFadeOutSeconds: 0.4,
        source: {
          kind: "generated-scene-clip",
          sceneClipUrl: "https://cdn.example.test/scene-1.mp4",
        },
        sourceAudioMuted: true,
        sourceAudioStartOffsetSeconds: 0.75,
        sourceAudioDurationSeconds: 3.5,
        sourceAudioVolume: 0.6,
        sourceAudioVolumeKeyframes: [{ id: "source-kf-1", timeSecond: 0, volume: 0.3 }],
        sourceAudioFadeInSeconds: 0.2,
        sourceAudioFadeOutSeconds: 0.5,
        subtitle: "Segment subtitle",
        transition: "fade",
        voiceover: "Segment voiceover",
      },
    ]);
  });

  it("returns undefined when there is no active Smart Edit plan", () => {
    expect(selectSmartEditPlanSegmentOverrides(undefined)).toBeUndefined();
  });
});

describe("selectSmartEditPlanSegmentOverride", () => {
  it("selects the requested segment override from the current Smart Edit plan", () => {
    const plan = {
      segments: [
        {
          id: "segment-1",
          sceneId: "scene-1",
          durationSeconds: 4,
          enabled: true,
          timelineStartSecond: 0,
          playbackRate: 1,
          captionHidden: false,
          captionStartOffsetSeconds: 0,
          voiceoverStartOffsetSeconds: 0,
          sourceAudioMuted: false,
          sourceAudioStartOffsetSeconds: 0,
          source: { kind: "generated-scene-clip", sceneClipUrl: "https://cdn.example.test/1.mp4" },
          subtitle: "First",
          transition: "cut",
          voiceover: "First voice",
        },
        {
          id: "segment-2",
          sceneId: "scene-2",
          durationSeconds: 6,
          enabled: false,
          timelineStartSecond: 5,
          playbackRate: 1.1,
          captionHidden: true,
          captionStartOffsetSeconds: 0.2,
          voiceoverStartOffsetSeconds: 0.1,
          sourceAudioMuted: true,
          sourceAudioStartOffsetSeconds: 0.3,
          source: { kind: "asset", assetId: "asset-1", url: "https://cdn.example.test/2.mp4" },
          subtitle: "Second",
          transition: "fade",
          voiceover: "Second voice",
        },
      ],
    } as SmartEditPlan;

    expect(selectSmartEditPlanSegmentOverride(plan, "segment-2")).toMatchObject({
      sceneId: "scene-2",
      durationSeconds: 6,
      enabled: false,
      transition: "fade",
    });
  });

  it("falls back to the first segment override when the selected segment id is absent", () => {
    const plan = {
      segments: [
        {
          id: "segment-1",
          sceneId: "scene-1",
          durationSeconds: 4,
          enabled: true,
          timelineStartSecond: 0,
          playbackRate: 1,
          captionHidden: false,
          captionStartOffsetSeconds: 0,
          voiceoverStartOffsetSeconds: 0,
          sourceAudioMuted: false,
          sourceAudioStartOffsetSeconds: 0,
          source: { kind: "generated-scene-clip", sceneClipUrl: "https://cdn.example.test/1.mp4" },
          subtitle: "First",
          transition: "cut",
          voiceover: "First voice",
        },
      ],
    } as SmartEditPlan;

    expect(selectSmartEditPlanSegmentOverride(plan, undefined)?.sceneId).toBe("scene-1");
    expect(selectSmartEditPlanSegmentOverride(plan, "missing")?.sceneId).toBe("scene-1");
  });
});

describe("createSmartEditRequestPayload", () => {
  it("builds a localized Smart Edit request from rendered scene clips", () => {
    const request = createSmartEditRequestPayload({
      apiConfig,
      instructions: "Tighten pacing",
      language: "zh",
      mediaSettings,
      renderTask: {
        status: "completed",
        sceneClips: [
          {
            sceneId: "scene-1",
            order: 1,
            subtitle: "Clip subtitle",
            videoUrl: "https://cdn.example.test/scene-1.mp4",
          },
        ],
      } as RenderTask,
      scenes: [
        {
          ...sceneWithId("scene-1"),
          durationSeconds: 5,
          voiceover: "Scene voiceover",
        },
      ],
      smartEditResult: undefined,
      targetLanguage: " en-US ",
      videoSettings,
    });

    expect(request).toMatchObject({
      apiConfig,
      currentPlan: undefined,
      instructions: "Tighten pacing",
      locale: "zh-CN",
      mediaSettings,
      targetLanguage: "en-US",
      videoSettings,
    });
    expect(request.segments).toEqual([
      expect.objectContaining({
        durationSeconds: 5,
        sceneId: "scene-1",
        subtitle: "Clip subtitle",
        transition: "cut",
        voiceover: "Scene voiceover",
      }),
    ]);
  });

  it("prefers active Smart Edit plan segment overrides over rendered scene clips", () => {
    const plan = {
      segments: [
        {
          sceneId: "scene-plan",
          durationSeconds: 6,
          enabled: true,
          timelineStartSecond: 2,
          playbackRate: 1,
          captionHidden: false,
          captionStartOffsetSeconds: 0,
          source: {
            kind: "generated-scene-clip",
            sceneClipUrl: "https://cdn.example.test/plan.mp4",
          },
          sourceAudioMuted: false,
          sourceAudioStartOffsetSeconds: 0,
          subtitle: "Plan subtitle",
          transition: "fade",
          voiceover: "Plan voiceover",
        },
      ],
    } as SmartEditPlan;

    const request = createSmartEditRequestPayload({
      apiConfig,
      instructions: "",
      language: "en",
      mediaSettings,
      renderTask: {
        status: "completed",
        sceneClips: [
          {
            sceneId: "scene-rendered",
            order: 1,
            subtitle: "Rendered subtitle",
            videoUrl: "https://cdn.example.test/rendered.mp4",
          },
        ],
      } as RenderTask,
      scenes: [sceneWithId("scene-rendered")],
      smartEditResult: { plan } as SmartEditResult,
      targetLanguage: "   ",
      videoSettings,
    });

    expect(request.currentPlan).toBe(plan);
    expect(request.instructions).toBeUndefined();
    expect(request.locale).toBe("en-US");
    expect(request.targetLanguage).toBeUndefined();
    expect(request.segments).toEqual([
      expect.objectContaining({
        sceneId: "scene-plan",
        subtitle: "Plan subtitle",
      }),
    ]);
  });
});
