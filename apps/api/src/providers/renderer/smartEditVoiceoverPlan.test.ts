import { describe, expect, it } from "vitest";
import type { SmartEditPlan, SmartEditSegment } from "@shopclip/shared";

import { voiceoverTimelineClips } from "./smartEditVoiceoverPlan.js";

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
      startSecond: 1,
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

describe("smart edit voiceover plan", () => {
  it("creates segment-backed voiceover clips with offsets, fades, volume, and keyframes", () => {
    const clips = voiceoverTimelineClips(
      plan({
        segments: [
          segment("segment-voice", {
            durationSeconds: 4,
            timelineStartSecond: 2,
            voiceover: "  Narrate this product moment  ",
            voiceoverDurationSeconds: 1.6,
            voiceoverFadeInSeconds: 0.2,
            voiceoverFadeOutSeconds: 0.4,
            voiceoverStartOffsetSeconds: 0.5,
            voiceoverVolume: 0.55,
            voiceoverVolumeKeyframes: [
              { id: "voice-low", timeSecond: 0, volume: 0.3 },
              { id: "voice-high", timeSecond: 1.6, volume: 1.2 },
            ],
          }),
          segment("empty-voice", {
            order: 2,
            voiceover: "   ",
          }),
        ],
      }),
    );

    expect(clips).toEqual([
      {
        durationSeconds: 1.6,
        fadeInSeconds: 0.2,
        fadeOutSeconds: 0.4,
        id: "segment-voice",
        startSecond: 2.5,
        text: "Narrate this product moment",
        volume: 0.55,
        volumeKeyframes: [
          { easing: "linear", id: "voice-low", timeSecond: 0, volume: 0.3 },
          { easing: "linear", id: "voice-high", timeSecond: 1.6, volume: 1.2 },
        ],
      },
    ]);
  });

  it("includes visible global voice and caption timeline elements", () => {
    const clips = voiceoverTimelineClips(
      plan({
        timeline: {
          durationSeconds: 8,
          elements: [
            {
              audioFadeInSeconds: 0.1,
              audioFadeOutSeconds: 0.2,
              audioVolume: 0.7,
              durationSeconds: 2,
              id: "global-voice",
              kind: "audio",
              label: "Fallback label",
              muted: false,
              startSecond: 1,
              text: "Global voice line",
              trackId: "voice-track",
            },
            {
              durationSeconds: 1.5,
              id: "global-caption",
              kind: "text",
              label: "Caption fallback",
              muted: false,
              startSecond: 4,
              trackId: "text-copy",
            },
            {
              durationSeconds: 1,
              hidden: true,
              id: "hidden-voice",
              kind: "audio",
              label: "Hidden voice",
              startSecond: 5,
              trackId: "voice-track",
            },
          ],
          scale: 1,
          tracks: [
            { hidden: false, id: "voice-track", kind: "audio", label: "Voice", locked: false, muted: false },
            { hidden: false, id: "text-copy", kind: "text", label: "Text", locked: false, muted: false },
          ],
        },
      }),
    );

    expect(clips).toEqual([
      {
        durationSeconds: 2,
        fadeInSeconds: 0.1,
        fadeOutSeconds: 0.2,
        id: "global-voice",
        startSecond: 1,
        text: "Global voice line",
        volume: 0.7,
        volumeKeyframes: [],
      },
      {
        durationSeconds: 1.5,
        fadeInSeconds: 0,
        fadeOutSeconds: 0,
        id: "global-caption",
        startSecond: 4,
        text: "Caption fallback",
        volume: 1,
        volumeKeyframes: [],
      },
    ]);
  });
});
