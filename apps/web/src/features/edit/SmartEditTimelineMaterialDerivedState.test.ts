import { describe, expect, it } from "vitest";

import type { SmartEditTrackSegment } from "./SmartEditTimelineOperations";
import {
  canMoveSelectedSmartEditTimelineMaterials,
  canResizeSelectedSmartEditTimelineMaterials,
  selectEditableSmartEditTimelineMaterialIdsOrUndefined,
  selectSmartEditClipboardCopySelection,
  selectSmartEditTimelineMaterialAlignAnchorSecond,
} from "./SmartEditTimelineMaterialDerivedState";

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

describe("SmartEditTimelineMaterialDerivedState", () => {
  it("selects editable standalone timeline material ids and ignores scene clips or locked tracks", () => {
    expect(
      selectEditableSmartEditTimelineMaterialIdsOrUndefined(
        [
          trackClip("caption-material"),
          trackClip("scene-caption", { segmentId: "scene-1" }),
          trackClip("voice-material", { trackId: "voice" }),
        ],
        (trackId) => trackId === "voice",
      ),
    ).toEqual(["caption-material"]);

    expect(
      selectEditableSmartEditTimelineMaterialIdsOrUndefined(
        [trackClip("scene-caption", { segmentId: "scene-1" })],
        () => false,
      ),
    ).toBeUndefined();
  });

  it("reports move and resize eligibility for selected timeline material batches", () => {
    const isTrackLocked = (trackId: string) => trackId === "voice";

    expect(
      canMoveSelectedSmartEditTimelineMaterials(
        [trackClip("caption-1"), trackClip("bgm-1", { trackId: "bgm" })],
        isTrackLocked,
      ),
    ).toBe(true);

    expect(
      canResizeSelectedSmartEditTimelineMaterials(
        [trackClip("caption-1"), trackClip("bgm-1", { trackId: "bgm" })],
        isTrackLocked,
      ),
    ).toBe(false);

    expect(
      canMoveSelectedSmartEditTimelineMaterials(
        [trackClip("caption-1"), trackClip("scene-caption", { segmentId: "scene-1" })],
        isTrackLocked,
      ),
    ).toBe(false);
  });

  it("prefers editable timeline materials over selected segments for clipboard copy", () => {
    expect(
      selectSmartEditClipboardCopySelection({
        isTrackLocked: (trackId) => trackId === "bgm",
        selectedSegments: [{ id: "scene-1" }],
        selectedTrackClips: [
          trackClip("caption-material"),
          trackClip("scene-caption", { segmentId: "scene-1" }),
          trackClip("bgm-material", { trackId: "bgm" }),
        ],
      }),
    ).toEqual({
      ids: ["caption-material"],
      kind: "timeline-elements",
    });
  });

  it("selects the align anchor from selected timeline materials", () => {
    const trackClips = [
      trackClip("caption-1", { durationSeconds: 2.345, startSecond: 4.2 }),
      trackClip("voice-1", { durationSeconds: 1.333, startSecond: 1.1, trackId: "voice" }),
    ];

    expect(selectSmartEditTimelineMaterialAlignAnchorSecond(trackClips, "start")).toBe(1.1);
    expect(selectSmartEditTimelineMaterialAlignAnchorSecond(trackClips, "end")).toBe(6.5);
    expect(selectSmartEditTimelineMaterialAlignAnchorSecond([], "start")).toBeUndefined();
  });
});
