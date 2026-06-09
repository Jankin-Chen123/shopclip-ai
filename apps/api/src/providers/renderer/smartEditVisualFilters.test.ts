import { describe, expect, it } from "vitest";
import type { SmartEditSegment } from "@shopclip/shared";

import {
  buildSegmentVideoFilter,
  ffmpegXfadeTransition,
  smartEditOutputDimensions,
} from "./smartEditVisualFilters.js";

const segment = (overrides: Partial<SmartEditSegment> = {}): SmartEditSegment =>
  ({
    assetTags: [],
    captionHidden: false,
    captionStartOffsetSeconds: 0,
    durationSeconds: 4,
    enabled: true,
    id: "segment-1",
    order: 1,
    rationale: "test segment",
    sceneId: "scene-1",
    source: {
      imageUrl: "data:image/png;base64,aGVsbG8=",
      kind: "image-asset",
    },
    sourceAudioMuted: false,
    subtitle: "caption",
    timelineStartSecond: 0,
    transition: "cut",
    voiceover: "voiceover",
    voiceoverStartOffsetSeconds: 0,
    ...overrides,
  }) as SmartEditSegment;

describe("smart edit visual filters", () => {
  it("derives even output dimensions from render settings", () => {
    expect(
      smartEditOutputDimensions({
        generateAudio: false,
        ratio: "16:9",
        resolution: "480p",
        watermark: false,
      }),
    ).toEqual({ height: 480, width: 854 });

    expect(
      smartEditOutputDimensions({
        generateAudio: false,
        ratio: "bad-ratio",
        resolution: "720p",
        watermark: false,
      }),
    ).toEqual({ height: 1280, width: 720 });
  });

  it("builds transform, effect, and fade filters without invoking ffmpeg", () => {
    const filter = buildSegmentVideoFilter(
      segment({
        effects: {
          blur: 1.6,
          fadeInSeconds: 0.4,
          fadeOutSeconds: 0.5,
          sharpen: 0.7,
        },
        transform: {
          offsetXPercent: 12,
          offsetYPercent: -8,
          opacity: 0.72,
          rotateDegrees: -4,
          scale: 1.25,
        },
      }),
      { height: 1280, width: 720 },
    );

    expect(filter).toContain("scale=900:1600");
    expect(filter).toContain("crop=720:1280:x='(in_w-720)/2+86'");
    expect(filter).toContain("rotate=-0.0698");
    expect(filter).toContain("format=yuva420p,colorchannelmixer=aa=0.720");
    expect(filter).toContain("gblur=sigma=1.60");
    expect(filter).toContain("unsharp=5:5:0.70:5:5:0.00");
    expect(filter).toContain("fade=t=in:st=0:d=0.40");
    expect(filter).toContain("fade=t=out:st=3.50:d=0.50");
  });

  it("preserves visual effect ordering and keyframe expressions", () => {
    const filter = buildSegmentVideoFilter(
      segment({
        durationSeconds: 4,
        visualEffects: [
          {
            enabled: true,
            id: "effect-brightness",
            keyframes: [
              { easing: "linear", id: "kf-1", param: "amount", timeSecond: 0, value: -0.2 },
              { easing: "linear", id: "kf-2", param: "amount", timeSecond: 4, value: 0.4 },
            ],
            params: { amount: 0.2, radius: 4 },
            type: "brightness",
          },
          {
            enabled: false,
            id: "effect-disabled-blur",
            params: { amount: 9, radius: 4 },
            type: "blur",
          },
          {
            enabled: true,
            id: "effect-saturation",
            params: { amount: 1.35, radius: 4 },
            type: "saturation",
          },
        ],
      }),
      { height: 1280, width: 720 },
    );

    expect(filter).toContain("eq=brightness='");
    expect(filter).toContain("eq=saturation=1.35");
    expect(filter).not.toContain("gblur=sigma=9.00");
    expect(filter.indexOf("eq=brightness='")).toBeLessThan(
      filter.indexOf("eq=saturation=1.35"),
    );
  });

  it("maps smart edit transitions to ffmpeg xfade transitions", () => {
    expect(ffmpegXfadeTransition("wipe")).toBe("wipeleft");
    expect(ffmpegXfadeTransition("crossfade")).toBe("fade");
    expect(ffmpegXfadeTransition("fade")).toBe("fade");
    expect(ffmpegXfadeTransition("cut")).toBe("fade");
  });
});
