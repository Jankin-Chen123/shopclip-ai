import { describe, expect, it } from "vitest";

import { upsertSmartEditKeyframeAtTime } from "./SmartEditSegmentUtils";

type TestKeyframe = {
  id: string;
  timeSecond: number;
};

describe("SmartEditSegmentUtils", () => {
  it("adds a keyframe and keeps keyframes sorted by time", () => {
    expect(
      upsertSmartEditKeyframeAtTime<TestKeyframe>({
        keyframe: { id: "middle", timeSecond: 2 },
        keyframes: [
          { id: "late", timeSecond: 4 },
          { id: "early", timeSecond: 1 },
        ],
      }),
    ).toEqual([
      { id: "early", timeSecond: 1 },
      { id: "middle", timeSecond: 2 },
      { id: "late", timeSecond: 4 },
    ]);
  });

  it("replaces keyframes that are close to the new keyframe time", () => {
    expect(
      upsertSmartEditKeyframeAtTime<TestKeyframe>({
        keyframe: { id: "replacement", timeSecond: 2 },
        keyframes: [
          { id: "near", timeSecond: 2.04 },
          { id: "far", timeSecond: 2.06 },
        ],
      }),
    ).toEqual([
      { id: "replacement", timeSecond: 2 },
      { id: "far", timeSecond: 2.06 },
    ]);
  });
});
