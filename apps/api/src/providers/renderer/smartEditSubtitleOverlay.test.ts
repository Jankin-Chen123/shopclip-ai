import type { SmartEditSegment } from "@shopclip/shared";
import { describe, expect, it } from "vitest";

import { buildTimelineSubtitleAss, subtitleTextForSegment } from "./smartEditSubtitleOverlay.js";

const createSegment = (overrides: Partial<SmartEditSegment> = {}): SmartEditSegment => ({
  assetTags: [],
  captionHidden: false,
  captionStartOffsetSeconds: 0,
  durationSeconds: 3,
  enabled: true,
  id: "segment-1",
  order: 1,
  rationale: "Use the primary product shot.",
  sceneId: "scene-1",
  source: {
    imageUrl: "https://example.test/source.png",
    kind: "image-asset",
  },
  sourceAudioMuted: false,
  subtitle: "Readable caption",
  timelineStartSecond: 0,
  transition: "cut",
  voiceover: "Voiceover caption",
  voiceoverStartOffsetSeconds: 0,
  ...overrides,
});

describe("smart edit subtitle overlay", () => {
  it("uses readable subtitle text first", () => {
    expect(subtitleTextForSegment(createSegment())).toBe("Readable caption");
  });

  it("falls back to readable voiceover when subtitle text is replacement noise", () => {
    expect(
      subtitleTextForSegment(
        createSegment({
          subtitle: "????????",
          voiceover: "Voiceover caption",
        }),
      ),
    ).toBe("Voiceover caption");
  });

  it("returns empty text when both subtitle and voiceover are unreadable", () => {
    expect(
      subtitleTextForSegment(
        createSegment({
          subtitle: "????????",
          voiceover: "□□□□□□",
        }),
      ),
    ).toBe("");
  });

  it("builds styled ASS captions for global timeline text", () => {
    const ass = buildTimelineSubtitleAss(
      [
        {
          color: "#112233",
          endSecond: 2.5,
          fontSize: 48,
          positionYPercent: 20,
          startSecond: 0.5,
          text: "Line one\nLine two",
        },
      ],
      { height: 1280, width: 720 },
    );

    expect(ass).toContain("PlayResX: 720");
    expect(ass).toContain("PlayResY: 1280");
    expect(ass).toContain("Style: Text1,Noto Sans CJK SC,48,&H00332211");
    expect(ass).toContain("Dialogue: 0,0:00:00.50,0:00:02.50,Text1");
    expect(ass).toContain("Line one\\NLine two");
  });
});
