import { describe, expect, it } from "vitest";
import type { SmartEditPlan, SmartEditSegment } from "@shopclip/shared";

import {
  normalizeDuration,
  normalizePlaybackRate,
  normalizeTimelineStart,
  smartEditExecutableTimelinePlan,
  timelineSegmentStartSeconds,
} from "./smartEditTimelinePlan.js";

const segment = (overrides: Partial<SmartEditSegment> = {}): SmartEditSegment => ({
  assetTags: [],
  durationSeconds: 4,
  enabled: true,
  id: "segment-1",
  order: 1,
  playbackRate: 1,
  rationale: "Show the hero clip.",
  sceneId: "scene-1",
  source: {
    endSecond: 4,
    kind: "generated-scene-clip",
    sceneClipAudioUrl: "audio-original.mp4",
    sceneClipVideoOnlyUrl: "video-original.mp4",
    sceneClipUrl: "clip-original.mp4",
    startSecond: 0,
  },
  sourceAudioMuted: false,
  subtitle: "Original subtitle",
  timelineStartSecond: 0,
  transition: "cut",
  voiceover: "Original voice",
  voiceoverMuted: false,
  ...overrides,
});

const plan = (overrides: Partial<SmartEditPlan> = {}): SmartEditPlan => ({
  audio: { bgmTrack: "none" },
  createdAt: "2026-06-09T00:00:00.000Z",
  id: "plan-1",
  projectId: "project-1",
  segments: [segment()],
  strategy: "Render timeline.",
  targetDurationSeconds: 4,
  ...overrides,
});

const track = (id: string, kind: "video" | "audio" | "text") => ({
  hidden: false,
  id,
  kind,
  label: id,
  locked: false,
  muted: false,
});

describe("smartEditTimelinePlan", () => {
  it("normalizes bounded segment timing values used by composer callers", () => {
    expect(normalizeDuration(segment({ durationSeconds: 0.01 }))).toBe(0.1);
    expect(normalizeDuration(segment({ durationSeconds: 400 }))).toBe(120);
    expect(normalizePlaybackRate(segment({ playbackRate: 0.01 }))).toBe(0.25);
    expect(normalizePlaybackRate(segment({ playbackRate: 9 }))).toBe(4);
    expect(normalizeTimelineStart(segment({ timelineStartSecond: -10 }))).toBe(0);
    expect(normalizeTimelineStart(segment({ timelineStartSecond: 999 }))).toBe(600);
  });

  it("keeps implicit segment starts sequential and preserves explicit manual starts", () => {
    const first = segment({ id: "first", durationSeconds: 2, timelineStartSecond: 0 });
    const second = segment({ id: "second", durationSeconds: 3, timelineStartSecond: 0 });
    expect([...timelineSegmentStartSeconds([first, second]).entries()]).toEqual([
      ["first", 0],
      ["second", 2],
    ]);

    expect([
      ...timelineSegmentStartSeconds([
        first,
        { ...second, timelineStartSecond: 6 },
      ]).entries(),
    ]).toEqual([
      ["first", 0],
      ["second", 6],
    ]);
  });

  it("turns persistent video elements into executable independent segments", () => {
    const executable = smartEditExecutableTimelinePlan(
      plan({
        timeline: {
          durationSeconds: 6,
          elements: [
            {
              detachedAudio: false,
              durationSeconds: 2,
              hidden: false,
              id: "clip-a",
              kind: "video",
              label: "Clip A",
              muted: false,
              playbackRate: 1.5,
              sceneId: "scene-1",
              segmentId: "segment-1",
              sourceUrl: "timeline-a.mp4",
              startSecond: 1,
              trackId: "video-main",
              trimStartSecond: 2,
              visualEffects: [{ enabled: true, id: "fx-a", params: { amount: 1 }, type: "blur" }],
            },
            {
              detachedAudio: false,
              durationSeconds: 3,
              hidden: false,
              id: "clip-b",
              kind: "video",
              label: "Clip B",
              muted: false,
              playbackRate: 1,
              sceneId: "scene-1",
              segmentId: "segment-1",
              sourceUrl: "timeline-b.mp4",
              startSecond: 3,
              trackId: "video-main",
              trimEndSecond: 8,
              trimStartSecond: 5,
            },
          ],
          scale: 1,
          tracks: [track("video-main", "video")],
        },
      }),
    );

    expect(executable.targetDurationSeconds).toBe(6);
    expect(executable.segments.map((item) => item.id)).toEqual(["clip-a", "clip-b"]);
    expect(executable.segments[0]).toMatchObject({
      durationSeconds: 2,
      order: 1,
      playbackRate: 1.5,
      source: {
        endSecond: 5,
        sceneClipVideoOnlyUrl: "timeline-a.mp4",
        startSecond: 2,
      },
      timelineStartSecond: 1,
      visualEffects: [{ id: "fx-a" }],
    });
    expect(executable.segments[1]?.source).toMatchObject({
      endSecond: 8,
      sceneClipVideoOnlyUrl: "timeline-b.mp4",
      startSecond: 5,
    });
  });

  it("bridges persisted source audio, caption, and voice elements into segment overrides", () => {
    const executable = smartEditExecutableTimelinePlan(
      plan({
        timeline: {
          durationSeconds: 5,
          elements: [
            {
              detachedAudio: false,
              durationSeconds: 4,
              hidden: false,
              id: "video-1",
              kind: "video",
              label: "Video",
              muted: false,
              playbackRate: 1,
              sceneId: "scene-1",
              segmentId: "segment-1",
              sourceUrl: "timeline-video.mp4",
              startSecond: 1,
              trackId: "video-main",
              trimStartSecond: 0.5,
            },
            {
              detachedAudio: false,
              durationSeconds: 2.5,
              hidden: false,
              id: "audio-1",
              kind: "audio",
              label: "Source audio",
              muted: true,
              playbackRate: 1,
              sceneId: "scene-1",
              segmentId: "segment-1",
              sourceUrl: "timeline-audio.m4a",
              startSecond: 1.75,
              trackId: "audio-source",
              trimStartSecond: 0,
              audioFadeInSeconds: 0.2,
              audioFadeOutSeconds: 0.3,
              audioVolume: 0.7,
            },
            {
              detachedAudio: false,
              durationSeconds: 1.2,
              hidden: true,
              id: "caption-1",
              kind: "text",
              label: "Caption fallback",
              muted: false,
              playbackRate: 1,
              sceneId: "scene-1",
              segmentId: "segment-1",
              startSecond: 2,
              text: "Timeline caption",
              textColor: "#112233",
              textFontSize: 48,
              textPositionYPercent: 22,
              trackId: "text-copy",
              trimStartSecond: 0,
            },
            {
              detachedAudio: false,
              durationSeconds: 1.5,
              hidden: false,
              id: "voice-1",
              kind: "audio",
              label: "Voice fallback",
              muted: false,
              playbackRate: 1,
              sceneId: "scene-1",
              segmentId: "segment-1",
              startSecond: 2.5,
              text: "Timeline voice",
              trackId: "voiceover",
              trimStartSecond: 0,
              audioVolume: 0.8,
            },
          ],
          scale: 1,
          tracks: [
            track("video-main", "video"),
            track("audio-source", "audio"),
            track("text-copy", "text"),
            track("voiceover", "audio"),
          ],
        },
      }),
    );

    expect(executable.segments[0]).toMatchObject({
      captionDurationSeconds: 1.2,
      captionHidden: true,
      captionStartOffsetSeconds: 1,
      captionTextColor: "#112233",
      captionTextFontSize: 48,
      captionTextPositionYPercent: 22,
      source: {
        sceneClipAudioUrl: "timeline-audio.m4a",
        sceneClipVideoOnlyUrl: "timeline-video.mp4",
        startSecond: 0.5,
      },
      sourceAudioDurationSeconds: 2.5,
      sourceAudioFadeInSeconds: 0.2,
      sourceAudioFadeOutSeconds: 0.3,
      sourceAudioMuted: true,
      sourceAudioStartOffsetSeconds: 0.75,
      sourceAudioVolume: 0.7,
      subtitle: "Timeline caption",
      voiceover: "Timeline voice",
      voiceoverDurationSeconds: 1.5,
      voiceoverStartOffsetSeconds: 1.5,
      voiceoverVolume: 0.8,
    });
  });
});
