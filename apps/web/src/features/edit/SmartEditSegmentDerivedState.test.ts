import type { AssetMetadata, AssetSlice, SmartEditSegment } from "@shopclip/shared";
import { describe, expect, it } from "vitest";

import {
  buildTimedSmartEditSegments,
  buildSmartEditTimelineMetrics,
  selectSmartEditAssetSlicesForSegment,
  selectSmartEditSegmentIds,
  selectSmartEditSegmentIdByOffset,
  selectSmartEditSegmentIdsOrUndefined,
  updateSelectedSmartEditSegments,
  smartEditPreviewSegmentLabel,
} from "./SmartEditSegmentDerivedState";

const segment = (id: string, patch: Partial<SmartEditSegment> = {}): SmartEditSegment =>
  ({
    id,
    source: {},
    ...patch,
  }) as SmartEditSegment;

describe("SmartEditSegmentDerivedState", () => {
  it("selects a segment id by offset from the current segment", () => {
    const sortedSegments = [segment("scene-1"), segment("scene-2"), segment("scene-3")];

    expect(
      selectSmartEditSegmentIdByOffset({
        offset: 1,
        selectedSegment: sortedSegments[1],
        sortedSegments,
      }),
    ).toBe("scene-3");
  });

  it("clamps segment offset selection to the available range", () => {
    const sortedSegments = [segment("scene-1"), segment("scene-2"), segment("scene-3")];

    expect(
      selectSmartEditSegmentIdByOffset({
        offset: -10,
        selectedSegment: sortedSegments[1],
        sortedSegments,
      }),
    ).toBe("scene-1");
    expect(
      selectSmartEditSegmentIdByOffset({
        offset: 10,
        selectedSegment: sortedSegments[1],
        sortedSegments,
      }),
    ).toBe("scene-3");
  });

  it("starts from the first segment when the selected segment is missing", () => {
    const sortedSegments = [segment("scene-1"), segment("scene-2"), segment("scene-3")];

    expect(
      selectSmartEditSegmentIdByOffset({
        offset: 1,
        selectedSegment: undefined,
        sortedSegments,
      }),
    ).toBe("scene-2");
  });

  it("returns undefined when no segments are available", () => {
    expect(
      selectSmartEditSegmentIdByOffset({
        offset: 1,
        selectedSegment: undefined,
        sortedSegments: [],
      }),
    ).toBeUndefined();
  });

  it("returns selected segment ids only when a batch has segments", () => {
    expect(
      selectSmartEditSegmentIdsOrUndefined([
        segment("scene-1"),
        segment("scene-2"),
      ]),
    ).toEqual(["scene-1", "scene-2"]);

    expect(selectSmartEditSegmentIdsOrUndefined([])).toBeUndefined();
  });

  it("updates only selected segments in a batch", () => {
    const segments = [
      segment("scene-1", { enabled: true }),
      segment("scene-2", { enabled: true }),
      segment("scene-3", { enabled: true }),
    ];

    expect(
      updateSelectedSmartEditSegments(segments, [segments[0]!, segments[2]!], (current) => ({
        ...current,
        enabled: false,
      })).map((current) => [current.id, current.enabled]),
    ).toEqual([
      ["scene-1", false],
      ["scene-2", true],
      ["scene-3", false],
    ]);
  });

  it("keeps the original segment list when no batch segments are selected", () => {
    const segments = [segment("scene-1"), segment("scene-2")];

    expect(updateSelectedSmartEditSegments(segments, [], (current) => current)).toBe(segments);
  });

  it("uses subtitle as the preview segment label when present", () => {
    expect(
      smartEditPreviewSegmentLabel(
        segment("scene-1", { subtitle: "Limited-time offer" }),
        [],
      ),
    ).toBe("Limited-time offer");
  });

  it("falls back to the selected segment source label for preview labels", () => {
    const assets = [
      {
        id: "asset-1",
        name: "Product spin.mp4",
      } as AssetMetadata,
    ];

    expect(
      smartEditPreviewSegmentLabel(
        segment("scene-1", { source: { assetId: "asset-1" } as SmartEditSegment["source"] }),
        assets,
      ),
    ).toBe("Product spin.mp4");
  });

  it("selects slices for the selected segment asset", () => {
    const slices = [
      { assetId: "asset-1", id: "slice-1" } as AssetSlice,
      { assetId: "asset-2", id: "slice-2" } as AssetSlice,
      { assetId: "asset-1", id: "slice-3" } as AssetSlice,
    ];

    expect(
      selectSmartEditAssetSlicesForSegment(
        slices,
        segment("scene-1", { source: { assetId: "asset-1" } as SmartEditSegment["source"] }),
      ).map((slice) => slice.id),
    ).toEqual(["slice-1", "slice-3"]);
  });

  it("selects segment ids in their current order", () => {
    expect(selectSmartEditSegmentIds([segment("scene-1"), segment("scene-2")])).toEqual([
      "scene-1",
      "scene-2",
    ]);
  });

  it("builds timed segment references from enabled timeline starts", () => {
    expect(
      buildTimedSmartEditSegments([
        segment("scene-1", { durationSeconds: 2, enabled: true, order: 0 }),
        segment("scene-2", { durationSeconds: 3, enabled: false, order: 1 }),
        segment("scene-3", { durationSeconds: 4, enabled: true, order: 2 }),
      ]),
    ).toEqual([
      {
        segment: segment("scene-1", { durationSeconds: 2, enabled: true, order: 0 }),
        startSecond: 0,
      },
      {
        segment: segment("scene-2", { durationSeconds: 3, enabled: false, order: 1 }),
        startSecond: 2,
      },
      {
        segment: segment("scene-3", { durationSeconds: 4, enabled: true, order: 2 }),
        startSecond: 2,
      },
    ]);
  });

  it("builds timeline metrics from enabled segments and zoom", () => {
    expect(
      buildSmartEditTimelineMetrics({
        playheadSeconds: 20,
        sortedSegments: [
          segment("scene-1", { durationSeconds: 3, enabled: true, startSecond: 0 }),
          segment("scene-2", { durationSeconds: 4, enabled: false, startSecond: 3 }),
          segment("scene-3", { durationSeconds: 5, enabled: true, startSecond: 7 }),
        ],
        timelineZoom: 2,
      }),
    ).toEqual({
      boundedPlayheadSeconds: 8,
      enabledDurationSeconds: 8,
      timelineDurationSeconds: 8,
      timelinePixelsPerSecond: 68,
      timelineWidth: 720,
    });
  });

  it("keeps empty timelines visible and clamps the playhead to the fallback duration", () => {
    expect(
      buildSmartEditTimelineMetrics({
        playheadSeconds: 5,
        sortedSegments: [],
        timelineZoom: 1,
      }),
    ).toEqual({
      boundedPlayheadSeconds: 1,
      enabledDurationSeconds: 0,
      timelineDurationSeconds: 1,
      timelinePixelsPerSecond: 34,
      timelineWidth: 720,
    });
  });
});
