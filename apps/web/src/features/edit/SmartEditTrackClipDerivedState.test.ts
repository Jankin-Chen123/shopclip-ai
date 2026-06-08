import { describe, expect, it } from "vitest";

import type { SmartEditTrack, SmartEditTrackSegment } from "./SmartEditTimelineOperations";
import {
  buildSmartEditTrackEditPoints,
  findSmartEditTrackClip,
  selectSmartEditTrackClipIdsAtSecond,
  selectSmartEditTrackClipSnapPoints,
  selectSmartEditTrackClipsById,
} from "./SmartEditTrackClipDerivedState";

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

const trackSegments: SmartEditTrack[] = [
  {
    id: "caption",
    segments: [
      trackClip("caption-1", { durationSeconds: 1.234, startSecond: 0.456 }),
      trackClip("caption-2", { durationSeconds: 2, startSecond: 3 }),
    ],
  },
  {
    id: "voice",
    segments: [trackClip("voice-1", { durationSeconds: 0.333, startSecond: 5, trackId: "voice" })],
  },
];

describe("SmartEditTrackClipDerivedState", () => {
  it("builds bounded sorted edit points from track clip starts and ends", () => {
    expect(buildSmartEditTrackEditPoints(5.2, trackSegments)).toEqual([
      0,
      0.5,
      1.7,
      3,
      5,
      5.2,
    ]);
  });

  it("finds and selects track clips by id", () => {
    expect(findSmartEditTrackClip(trackSegments, "voice-1")?.trackId).toBe("voice");
    expect(
      selectSmartEditTrackClipsById(trackSegments, new Set(["caption-2", "missing"])).map(
        (trackClip) => trackClip.id,
      ),
    ).toEqual(["caption-2"]);
  });

  it("selects unlocked track clip ids at the playhead", () => {
    expect(
      selectSmartEditTrackClipIdsAtSecond({
        isTrackLocked: (trackId) => trackId === "voice",
        playheadSecond: 3.5,
        trackSegments,
      }),
    ).toEqual(["caption-2"]);
  });

  it("builds snap points from non-excluded clip starts and ends", () => {
    expect(
      selectSmartEditTrackClipSnapPoints({
        referenceSecond: 2.5,
        excludedClipIds: new Set(["caption-2"]),
        trackSegments,
      }),
    ).toEqual([2.5, 0.456, 1.7, 5, 5.3]);
  });
});
