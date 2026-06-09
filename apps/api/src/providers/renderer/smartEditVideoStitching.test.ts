import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import type { SmartEditSegment } from "@shopclip/shared";

import {
  stitchSegmentsWithTransitions,
  type SmartEditVideoStitchCommandRunner,
} from "./smartEditVideoStitching.js";

const segment = (
  id: string,
  overrides: Partial<SmartEditSegment> = {},
): SmartEditSegment =>
  ({
    assetTags: [],
    captionHidden: false,
    captionStartOffsetSeconds: 0,
    durationSeconds: 2,
    enabled: true,
    id,
    order: 1,
    rationale: "test segment",
    sceneId: `scene-${id}`,
    source: {
      imageUrl: "data:image/png;base64,aGVsbG8=",
      kind: "image-asset",
    },
    sourceAudioMuted: false,
    subtitle: "caption",
    timelineStartSecond: 0,
    transition: "cut",
    voiceover: "",
    voiceoverStartOffsetSeconds: 0,
    ...overrides,
  }) as SmartEditSegment;

describe("smart edit video stitching", () => {
  it("fills timeline gaps with black video segments before concatenating", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "shopclip-video-stitch-"));
    const calls: Array<{ command: string; args: string[] }> = [];
    const run: SmartEditVideoStitchCommandRunner = async (command, args) => {
      calls.push({ command, args });
    };

    await stitchSegmentsWithTransitions(
      "ffmpeg",
      [
        { path: "first.mp4", segment: segment("first", { durationSeconds: 2 }) },
        {
          path: "second.mp4",
          segment: segment("second", { durationSeconds: 2, timelineStartSecond: 5 }),
        },
      ],
      { height: 480, width: 854 },
      workdir,
      "stitched.mp4",
      run,
    );

    expect(calls[0]).toEqual({
      command: "ffmpeg",
      args: [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=854x480:r=30:d=3.00",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        join(workdir, "timeline-gap-2.mp4"),
      ],
    });
    expect(calls[1]?.args).toContain(join(workdir, "smart-edit-clips.txt"));
    await expect(readFile(join(workdir, "smart-edit-clips.txt"), "utf8")).resolves.toBe(
      [
        "file 'first.mp4'",
        `file '${join(workdir, "timeline-gap-2.mp4").replace(/\\/g, "/")}'`,
        "file 'second.mp4'",
      ].join("\n"),
    );
  });

  it("uses xfade filters for crossfade and wipe transitions", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "shopclip-video-stitch-"));
    const calls: Array<{ command: string; args: string[] }> = [];
    const run: SmartEditVideoStitchCommandRunner = async (command, args) => {
      calls.push({ command, args });
    };

    await stitchSegmentsWithTransitions(
      "ffmpeg",
      [
        { path: "first.mp4", segment: segment("first", { durationSeconds: 3 }) },
        {
          path: "second.mp4",
          segment: segment("second", { durationSeconds: 3, transition: "crossfade" }),
        },
        {
          path: "third.mp4",
          segment: segment("third", { durationSeconds: 3, transition: "wipe" }),
        },
      ],
      { height: 480, width: 854 },
      workdir,
      "stitched.mp4",
      run,
    );

    expect(calls).toHaveLength(1);
    const filter = calls[0]?.args.at(calls[0]?.args.indexOf("-filter_complex") + 1);
    expect(filter).toContain("xfade=transition=fade:duration=0.45:offset=2.55");
    expect(filter).toContain("xfade=transition=wipeleft:duration=0.45:offset=5.10");
    expect(calls[0]?.args).toContain("[vout]");
  });
});
