import { describe, expect, it } from "vitest";

import {
  atempoFilter,
  audioFadeFilters,
  audioVolumeFilter,
  normalizeAudioVolume,
  smartEditBgmProfile,
} from "./smartEditAudioFilters.js";

describe("smart edit audio filters", () => {
  it("splits playback rates into ffmpeg atempo-safe factors", () => {
    expect(atempoFilter(2)).toBe("atempo=2.0000");
    expect(atempoFilter(4)).toBe("atempo=2.0000,atempo=2.0000");
    expect(atempoFilter(0.25)).toBe("atempo=0.5000,atempo=0.5000");
  });

  it("clamps audio fades to the clip duration", () => {
    expect(audioFadeFilters(1.5, 0.25, 0.35)).toEqual([
      "afade=t=in:st=0:d=0.25",
      "afade=t=out:st=1.15:d=0.35",
    ]);
    expect(audioFadeFilters(1, 2, 0)).toEqual([]);
  });

  it("normalizes fixed audio volume", () => {
    expect(normalizeAudioVolume(undefined)).toBe(1);
    expect(normalizeAudioVolume(-1)).toBe(0);
    expect(normalizeAudioVolume(8)).toBe(4);
    expect(audioVolumeFilter(0.55, undefined, 2)).toEqual(["volume=0.550"]);
  });

  it("builds frame-evaluated volume keyframe filters", () => {
    const [filter] = audioVolumeFilter(
      0.8,
      [
        { id: "end", timeSecond: 2.5, volume: 0.6 },
        { id: "start", timeSecond: -1, volume: 0.2 },
      ],
      2,
    );

    expect(filter).toContain("volume='if(lte(t\\,0.000)");
    expect(filter).toContain(":eval=frame");
    expect(filter).toContain("0.200");
    expect(filter).toContain("0.600");
  });

  it("maps BGM selections to generated ffmpeg music beds", () => {
    expect(smartEditBgmProfile("creator-pop")).toEqual({
      lavfi: "sine=frequency=523:sample_rate=44100",
      volume: 0.05,
    });
    expect(smartEditBgmProfile("soft-lift")).toEqual({
      lavfi: "sine=frequency=330:sample_rate=44100",
      volume: 0.035,
    });
    expect(smartEditBgmProfile("tech-pulse")).toEqual({
      lavfi: "sine=frequency=176:sample_rate=44100",
      volume: 0.045,
    });
    expect(smartEditBgmProfile("none")).toBeUndefined();
  });
});
