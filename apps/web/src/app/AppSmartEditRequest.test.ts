import { describe, expect, it } from "vitest";
import type {
  RenderTask,
  SmartEditPlan,
  SmartEditResult,
  StoryboardScene,
} from "@shopclip/shared";

import {
  selectRenderedSmartEditSceneSegments,
  selectSmartEditPlanSegmentOverrides,
} from "./AppSmartEditRequest";

const sceneWithId = (id: string): StoryboardScene => ({ id }) as StoryboardScene;

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
