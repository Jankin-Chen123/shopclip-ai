import { describe, expect, it } from "vitest";
import type { SmartEditPlan, SmartEditSegment } from "@shopclip/shared";

import {
  globalTimelineDurationSeconds,
  hasOverlappingSourceAudioClips,
  safeFileToken,
  sourceAudioTimelineClips,
} from "./smartEditSourceAudioPlan.js";

const segment = (
  id: string,
  overrides: Partial<SmartEditSegment> = {},
): SmartEditSegment =>
  ({
    assetTags: [],
    captionHidden: false,
    captionStartOffsetSeconds: 0,
    durationSeconds: 4,
    enabled: true,
    id,
    order: 1,
    rationale: "test segment",
    sceneId: `scene-${id}`,
    source: {
      kind: "video-slice",
      sceneClipAudioUrl: `https://cdn.example.test/${id}.m4a`,
      startSecond: 1,
      endSecond: 5,
    },
    sourceAudioMuted: false,
    subtitle: "caption",
    timelineStartSecond: 0,
    transition: "cut",
    voiceover: "",
    voiceoverStartOffsetSeconds: 0,
    ...overrides,
  }) as SmartEditSegment;

const plan = (overrides: Partial<SmartEditPlan> = {}): SmartEditPlan =>
  ({
    audio: {
      bgmTrack: "none",
      targetLanguage: "zh-CN",
      voice: "clear-host",
    },
    createdAt: "2026-06-09T00:00:00.000Z",
    id: "plan-1",
    projectId: "project-1",
    segments: [],
    strategy: "test",
    targetDurationSeconds: 8,
    ...overrides,
  }) as SmartEditPlan;

describe("smart edit source audio plan", () => {
  it("creates segment-backed source audio clips with trim, delay, rate, and volume controls", () => {
    const clips = sourceAudioTimelineClips(
      plan({
        segments: [
          segment("segment-video", {
            durationSeconds: 4,
            playbackRate: 2,
            sourceAudioDurationSeconds: 1.5,
            sourceAudioFadeInSeconds: 0.2,
            sourceAudioFadeOutSeconds: 0.3,
            sourceAudioStartOffsetSeconds: 0.7,
            sourceAudioVolume: 0.8,
            sourceAudioVolumeKeyframes: [
              { id: "source-volume-low", timeSecond: 0, volume: 0.4 },
              { id: "source-volume-high", timeSecond: 1.5, volume: 1.1 },
            ],
          }),
        ],
      }),
    );

    expect(clips).toEqual([
      {
        delaySeconds: 0.7,
        durationSeconds: 4,
        fadeInSeconds: 0.2,
        fadeOutSeconds: 0.3,
        id: "segment-video",
        mediaDurationSeconds: 1.5,
        playbackRate: 2,
        sourceUrl: "https://cdn.example.test/segment-video.m4a",
        startSecond: 0,
        trimEndSecond: 4,
        trimStartSecond: 1,
        volume: 0.8,
        volumeKeyframes: [
          { easing: "linear", id: "source-volume-low", timeSecond: 0, volume: 0.4 },
          { easing: "linear", id: "source-volume-high", timeSecond: 1.5, volume: 1.1 },
        ],
      },
    ]);
  });

  it("adds visible source-audio timeline elements and ignores muted or hidden ones", () => {
    const clips = sourceAudioTimelineClips(
      plan({
        segments: [
          segment("segment-muted", {
            sourceAudioMuted: true,
          }),
        ],
        timeline: {
          durationSeconds: 6,
          elements: [
            {
              durationSeconds: 2,
              id: "timeline-audio",
              kind: "audio",
              label: "Timeline audio",
              muted: false,
              playbackRate: 1.25,
              sourceUrl: "data:audio/wav;base64,aGVsbG8=",
              startSecond: 1.25,
              trackId: "audio-source",
              trimEndSecond: 2.5,
              trimStartSecond: 1,
            },
            {
              durationSeconds: 1,
              hidden: true,
              id: "hidden-audio",
              kind: "audio",
              label: "Hidden audio",
              sourceUrl: "data:audio/wav;base64,aGVsbG8=",
              startSecond: 3,
              trackId: "audio-source",
            },
          ],
          scale: 1,
          tracks: [
            { hidden: false, id: "audio-source", kind: "audio", label: "Source audio", locked: false, muted: false },
          ],
        },
      }),
    );

    expect(clips).toEqual([
      {
        delaySeconds: 0,
        durationSeconds: 2,
        fadeInSeconds: 0,
        fadeOutSeconds: 0,
        id: "timeline-audio",
        mediaDurationSeconds: 2,
        playbackRate: 1.25,
        sourceUrl: "data:audio/wav;base64,aGVsbG8=",
        startSecond: 1.25,
        trimEndSecond: 2.5,
        trimStartSecond: 1,
        volume: 1,
        volumeKeyframes: [],
      },
    ]);
  });

  it("detects overlap and computes global duration fallbacks", () => {
    const clips = [
      {
        delaySeconds: 0,
        durationSeconds: 2,
        fadeInSeconds: 0,
        fadeOutSeconds: 0,
        id: "clip-a",
        playbackRate: 1,
        sourceUrl: "a.wav",
        startSecond: 0,
        trimEndSecond: 2,
        trimStartSecond: 0,
        volume: 1,
        volumeKeyframes: [],
      },
      {
        delaySeconds: 1,
        durationSeconds: 2,
        fadeInSeconds: 0,
        fadeOutSeconds: 0,
        id: "clip-b",
        playbackRate: 1,
        sourceUrl: "b.wav",
        startSecond: 0,
        trimEndSecond: 2,
        trimStartSecond: 0,
        volume: 1,
        volumeKeyframes: [],
      },
    ];

    expect(hasOverlappingSourceAudioClips(clips)).toBe(true);
    expect(
      globalTimelineDurationSeconds(
        plan({
          targetDurationSeconds: 3,
          timeline: {
            durationSeconds: 0,
            elements: [],
            scale: 1,
            tracks: [],
          },
          segments: [
            segment("late", {
              durationSeconds: 2,
              timelineStartSecond: 5,
            }),
          ],
        }),
      ),
    ).toBe(7);
  });

  it("normalizes ids into safe file tokens", () => {
    expect(safeFileToken("audio clip 01!*")).toBe("audio-clip-01");
    expect(safeFileToken("???")).toBe("clip");
  });
});
