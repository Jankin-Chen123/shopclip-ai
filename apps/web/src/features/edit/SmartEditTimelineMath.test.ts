import { describe, expect, it } from "vitest";

import {
  clampSnappedTimelineSecond,
  nextTimelineScrollLeftForPlayhead,
  timelineSecondsFromPixelDistance,
} from "./SmartEditTimelineMath";

describe("clampSnappedTimelineSecond", () => {
  it("snaps and clamps seconds to the timeline duration", () => {
    expect(clampSnappedTimelineSecond(2.26, 10)).toBe(2.3);
    expect(clampSnappedTimelineSecond(-0.4, 10)).toBe(0);
    expect(clampSnappedTimelineSecond(12.2, 10)).toBe(10);
  });
});

describe("timelineSecondsFromPixelDistance", () => {
  it("converts pixel distance to snapped timeline seconds", () => {
    expect(timelineSecondsFromPixelDistance(125, 50)).toBe(2.5);
    expect(timelineSecondsFromPixelDistance(-16, 40)).toBe(-0.4);
  });

  it("returns zero when pixels-per-second is not usable", () => {
    expect(timelineSecondsFromPixelDistance(125, 0)).toBe(0);
    expect(timelineSecondsFromPixelDistance(125, -4)).toBe(0);
  });
});

describe("nextTimelineScrollLeftForPlayhead", () => {
  it("does not scroll when the playhead is already inside the guarded visible range", () => {
    expect(
      nextTimelineScrollLeftForPlayhead({
        clientWidth: 400,
        playheadX: 260,
        scrollLeft: 100,
        scrollWidth: 1200,
      }),
    ).toBeUndefined();
  });

  it("centers the playhead when it is outside the guarded visible range", () => {
    expect(
      nextTimelineScrollLeftForPlayhead({
        clientWidth: 400,
        playheadX: 700,
        scrollLeft: 100,
        scrollWidth: 1200,
      }),
    ).toBe(500);
  });

  it("clamps the next scroll position to the available scroll range", () => {
    expect(
      nextTimelineScrollLeftForPlayhead({
        clientWidth: 400,
        playheadX: 30,
        scrollLeft: 500,
        scrollWidth: 1200,
      }),
    ).toBe(0);

    expect(
      nextTimelineScrollLeftForPlayhead({
        clientWidth: 400,
        playheadX: 1180,
        scrollLeft: 100,
        scrollWidth: 1200,
      }),
    ).toBe(800);
  });

  it("does not scroll non-scrollable or invalid containers", () => {
    expect(
      nextTimelineScrollLeftForPlayhead({
        clientWidth: 0,
        playheadX: 100,
        scrollLeft: 0,
        scrollWidth: 1200,
      }),
    ).toBeUndefined();

    expect(
      nextTimelineScrollLeftForPlayhead({
        clientWidth: 400,
        playheadX: 100,
        scrollLeft: 0,
        scrollWidth: 400,
      }),
    ).toBeUndefined();
  });
});
