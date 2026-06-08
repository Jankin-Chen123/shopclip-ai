import { describe, expect, it } from "vitest";

import type { SmartEditTrackSegment } from "./SmartEditTimelineOperations";
import {
  hasSmartEditTimelineTextMaterials,
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
});
