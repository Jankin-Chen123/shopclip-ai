import { describe, expect, it } from "vitest";

import type { SmartEditTrackSegment } from "./SmartEditTimelineOperations";
import {
  hasSmartEditTimelineTextMaterials,
  selectEditableSmartEditTimelineMaterials,
  selectEditableSmartEditTimelineMaterialIdsOrUndefined,
  selectMovableSmartEditTimelineMaterialIdsOrUndefined,
  selectRemovableSmartEditTimelineMaterialIds,
  selectSmartEditClipboardCopySelection,
  selectSmartEditTimelineMaterialAlignAnchorSecond,
  selectSmartEditTimelineTextMaterialIds,
  smartEditTimelineTextMaterialCount,
} from "./SmartEditTrackDerivedState";

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

describe("SmartEditTrackDerivedState", () => {
  it("selects only standalone caption timeline material ids", () => {
    const trackClips = [
      trackClip("caption-material"),
      trackClip("caption-scene", { segmentId: "scene-1" }),
      trackClip("voice-material", { trackId: "voice" }),
    ];

    expect(selectSmartEditTimelineTextMaterialIds(trackClips)).toEqual([
      "caption-material",
    ]);
  });

  it("counts selected text timeline materials", () => {
    const trackClips = [
      trackClip("caption-1"),
      trackClip("caption-2"),
      trackClip("video-1", { trackId: "video" }),
    ];

    expect(smartEditTimelineTextMaterialCount(trackClips)).toBe(2);
    expect(hasSmartEditTimelineTextMaterials(trackClips)).toBe(true);
  });

  it("reports no selected text timeline materials for scene captions", () => {
    const trackClips = [
      trackClip("caption-scene", { segmentId: "scene-1" }),
      trackClip("video-material", { trackId: "video" }),
    ];

    expect(smartEditTimelineTextMaterialCount(trackClips)).toBe(0);
    expect(hasSmartEditTimelineTextMaterials(trackClips)).toBe(false);
  });

  it("selects removable standalone timeline material ids only when the whole batch is removable", () => {
    const isTrackLocked = (trackId: string) => trackId === "bgm";

    expect(
      selectRemovableSmartEditTimelineMaterialIds({
        isTrackLocked,
        selectedTrackClips: [
          trackClip("caption-1"),
          trackClip("voice-1", { trackId: "voice" }),
        ],
      }),
    ).toEqual(["caption-1", "voice-1"]);

    expect(
      selectRemovableSmartEditTimelineMaterialIds({
        isTrackLocked,
        selectedTrackClips: [
          trackClip("caption-1"),
          trackClip("scene-caption", { segmentId: "scene-1" }),
        ],
      }),
    ).toEqual([]);

    expect(
      selectRemovableSmartEditTimelineMaterialIds({
        isTrackLocked,
        selectedTrackClips: [trackClip("caption-1"), trackClip("bgm-1", { trackId: "bgm" })],
      }),
    ).toEqual([]);

    expect(
      selectRemovableSmartEditTimelineMaterialIds({
        isTrackLocked,
        selectedTrackClips: [trackClip("single-caption")],
      }),
    ).toEqual([]);
  });

  it("returns editable timeline material ids only when selected materials are actionable", () => {
    const isTrackLocked = (trackId: string) => trackId === "bgm";

    expect(
      selectEditableSmartEditTimelineMaterialIdsOrUndefined(
        [
          trackClip("caption-material"),
          trackClip("scene-caption", { segmentId: "scene-1" }),
          trackClip("bgm-material", { trackId: "bgm" }),
        ],
        isTrackLocked,
      ),
    ).toEqual(["caption-material"]);

    expect(
      selectEditableSmartEditTimelineMaterialIdsOrUndefined(
        [
          trackClip("scene-caption", { segmentId: "scene-1" }),
          trackClip("bgm-material", { trackId: "bgm" }),
        ],
        isTrackLocked,
      ),
    ).toBeUndefined();

    expect(selectEditableSmartEditTimelineMaterialIdsOrUndefined([], isTrackLocked)).toBeUndefined();
  });

  it("selects editable timeline materials for commands that need clip timing", () => {
    const isTrackLocked = (trackId: string) => trackId === "bgm";

    expect(
      selectEditableSmartEditTimelineMaterials(
        [
          trackClip("caption-material", { startSecond: 3 }),
          trackClip("scene-caption", { segmentId: "scene-1", startSecond: 1 }),
          trackClip("bgm-material", { startSecond: 2, trackId: "bgm" }),
          trackClip("voice-material", { startSecond: 4, trackId: "voice" }),
        ],
        isTrackLocked,
      ).map((trackClip) => trackClip.id),
    ).toEqual(["caption-material", "voice-material"]);
  });

  it("returns movable timeline material ids only when selected materials can move", () => {
    const isTrackLocked = (trackId: string) => trackId === "bgm";

    expect(
      selectMovableSmartEditTimelineMaterialIdsOrUndefined(
        [
          trackClip("caption-material"),
          trackClip("scene-caption", { segmentId: "scene-1" }),
          trackClip("bgm-material", { trackId: "bgm" }),
          trackClip("voice-material", { trackId: "voice" }),
        ],
        isTrackLocked,
      ),
    ).toEqual(["caption-material", "voice-material"]);

    expect(
      selectMovableSmartEditTimelineMaterialIdsOrUndefined(
        [
          trackClip("scene-caption", { segmentId: "scene-1" }),
          trackClip("bgm-material", { trackId: "bgm" }),
        ],
        isTrackLocked,
      ),
    ).toBeUndefined();
  });

  it("selects the alignment anchor for selected timeline materials", () => {
    const trackClips = [
      trackClip("caption-1", { durationSeconds: 2.345, startSecond: 4.2 }),
      trackClip("voice-1", { durationSeconds: 1.333, startSecond: 1.1, trackId: "voice" }),
    ];

    expect(selectSmartEditTimelineMaterialAlignAnchorSecond(trackClips, "start")).toBe(1.1);
    expect(selectSmartEditTimelineMaterialAlignAnchorSecond(trackClips, "end")).toBe(6.5);
    expect(selectSmartEditTimelineMaterialAlignAnchorSecond([], "start")).toBeUndefined();
  });

  it("prefers editable timeline materials when choosing clipboard copy content", () => {
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

  it("falls back to selected clips for clipboard copy when no editable material is selected", () => {
    expect(
      selectSmartEditClipboardCopySelection({
        isTrackLocked: () => false,
        selectedSegments: [{ id: "scene-1" }, { id: "scene-2" }],
        selectedTrackClips: [trackClip("scene-caption", { segmentId: "scene-1" })],
      }),
    ).toEqual({
      ids: ["scene-1", "scene-2"],
      kind: "segments",
    });
  });

  it("returns undefined when there is nothing to copy", () => {
    expect(
      selectSmartEditClipboardCopySelection({
        isTrackLocked: () => false,
        selectedSegments: [],
        selectedTrackClips: [],
      }),
    ).toBeUndefined();
  });
});
