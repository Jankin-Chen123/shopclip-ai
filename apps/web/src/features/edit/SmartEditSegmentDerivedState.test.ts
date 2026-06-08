import type { SmartEditSegment } from "@shopclip/shared";
import { describe, expect, it } from "vitest";

import { selectSmartEditSegmentIdByOffset } from "./SmartEditSegmentDerivedState";

const segment = (id: string): SmartEditSegment => ({ id } as SmartEditSegment);

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
});
