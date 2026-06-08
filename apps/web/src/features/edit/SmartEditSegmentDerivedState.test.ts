import type { AssetMetadata, AssetSlice, SmartEditSegment } from "@shopclip/shared";
import { describe, expect, it } from "vitest";

import {
  selectSmartEditAssetSlicesForSegment,
  selectSmartEditSegmentIdByOffset,
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
});
