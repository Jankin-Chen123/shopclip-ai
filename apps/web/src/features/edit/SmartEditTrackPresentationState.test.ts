import { describe, expect, it } from "vitest";

import type { SmartEditPlan } from "@shopclip/shared";
import type { SmartEditTrack, SmartEditTrackSegment } from "./SmartEditTimelineOperations";
import {
  buildSmartEditTrackLabels,
  isSmartEditTimelineTrackLocked,
  smartEditTimelineTrackIdForTrack,
  smartEditTrackPresentationState,
} from "./SmartEditTrackPresentationState";

const trackClip = (
  id: string,
  patch: Partial<SmartEditTrackSegment> = {},
): SmartEditTrackSegment =>
  ({
    durationSeconds: 1,
    id,
    startSecond: 0,
    trackId: "caption",
    ...patch,
  }) as SmartEditTrackSegment;

const planWithTimeline = (timeline: NonNullable<SmartEditPlan["timeline"]>): SmartEditPlan =>
  ({
    id: "plan-1",
    scenes: [],
    segments: [],
    timeline,
  }) as SmartEditPlan;

describe("SmartEditTrackPresentationState", () => {
  it("builds localized track labels by editor track id", () => {
    expect(
      buildSmartEditTrackLabels({
        bgmTrack: "Music",
        captionTrack: "Captions",
        sourceAudioTrack: "Source audio",
        videoTrack: "Video",
        voiceTrack: "Voice",
      }),
    ).toEqual({
      bgm: "Music",
      caption: "Captions",
      sourceAudio: "Source audio",
      video: "Video",
      voice: "Voice",
    });
  });

  it("maps editor track ids to Smart Edit timeline track ids", () => {
    expect(smartEditTimelineTrackIdForTrack("sourceAudio")).toBe("audio-source");
    expect(smartEditTimelineTrackIdForTrack("caption")).toBe("text-copy");
    expect(smartEditTimelineTrackIdForTrack("video")).toBe("video-main");
    expect(smartEditTimelineTrackIdForTrack("bgm")).toBe("bgm-bed");
    expect(smartEditTimelineTrackIdForTrack("voice")).toBe("voiceover");
  });

  it("reads locked track state from the plan timeline", () => {
    const plan = planWithTimeline({
      elements: [],
      tracks: [{ id: "voiceover", locked: true, muted: false, hidden: false }],
    });

    expect(isSmartEditTimelineTrackLocked(plan, "voice")).toBe(true);
    expect(isSmartEditTimelineTrackLocked(plan, "caption")).toBe(false);
  });

  it("combines timeline track settings with segment fallback presentation state", () => {
    const track: SmartEditTrack = {
      id: "caption",
      segments: [
        trackClip("caption-1", { hidden: true, muted: true }),
        trackClip("caption-2", { hidden: true, muted: true }),
      ],
    };
    const plan = planWithTimeline({
      elements: [
        {
          durationSeconds: 1,
          id: "caption-1",
          kind: "text",
          startSecond: 0,
          text: "caption",
          trackId: "caption",
        },
      ],
      tracks: [{ id: "text-copy", locked: true, muted: false, hidden: undefined }],
    });

    expect(smartEditTrackPresentationState({ plan, track })).toEqual({
      hidden: true,
      locked: true,
      muted: false,
      selectableTrackMaterialCount: 1,
    });
  });
});
