import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SmartEditSegment } from "@shopclip/shared";

import {
  normalizeDuration,
  timelineSegmentStartSeconds,
} from "./smartEditTimelinePlan.js";
import {
  ffmpegXfadeTransition,
  transitionDurationSeconds,
  type OutputDimensions,
} from "./smartEditVisualFilters.js";

export type SmartEditVideoStitchCommandRunner = (
  command: string,
  args: string[],
) => Promise<void>;

const escapeConcatPath = (path: string): string => path.replace(/\\/g, "/").replace(/'/g, "'\\''");

const concatSegments = async (
  command: string,
  segmentPaths: string[],
  workdir: string,
  outputPath: string,
  run: SmartEditVideoStitchCommandRunner,
) => {
  const concatListPath = join(workdir, "smart-edit-clips.txt");
  await writeFile(
    concatListPath,
    segmentPaths.map((path) => `file '${escapeConcatPath(path)}'`).join("\n"),
    "utf8",
  );
  await run(command, [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
};

const createBlackVideoSegment = async (
  command: string,
  dimensions: OutputDimensions,
  durationSeconds: number,
  outputPath: string,
  run: SmartEditVideoStitchCommandRunner,
) => {
  await run(command, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=${dimensions.width}x${dimensions.height}:r=30:d=${durationSeconds.toFixed(2)}`,
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
    outputPath,
  ]);
};

export const stitchSegmentsWithTransitions = async (
  command: string,
  segments: Array<{ path: string; segment: SmartEditSegment }>,
  dimensions: OutputDimensions,
  workdir: string,
  outputPath: string,
  run: SmartEditVideoStitchCommandRunner,
) => {
  const timelineStarts = timelineSegmentStartSeconds(segments.map(({ segment }) => segment));
  const hasTimelineGap = segments.some(({ segment }, index) => {
    if (index === 0) {
      return (timelineStarts.get(segment.id) ?? 0) > 0.01;
    }
    const previous = segments[index - 1]!;
    const previousEnd =
      (timelineStarts.get(previous.segment.id) ?? 0) + normalizeDuration(previous.segment);
    return (timelineStarts.get(segment.id) ?? 0) - previousEnd > 0.01;
  });
  if (hasTimelineGap) {
    const pathsWithGaps: string[] = [];
    let cursor = 0;
    for (const [index, { path, segment }] of segments.entries()) {
      const start = timelineStarts.get(segment.id) ?? cursor;
      const gapDuration = start - cursor;
      if (gapDuration > 0.01) {
        const gapPath = join(workdir, `timeline-gap-${index + 1}.mp4`);
        await createBlackVideoSegment(command, dimensions, gapDuration, gapPath, run);
        pathsWithGaps.push(gapPath);
        cursor += gapDuration;
      }
      pathsWithGaps.push(path);
      cursor = Math.max(cursor, start) + normalizeDuration(segment);
    }
    await concatSegments(command, pathsWithGaps, workdir, outputPath, run);
    return;
  }

  const hasTimelineTransition = segments.some(({ segment }, index) => {
    if (index === 0) {
      return false;
    }
    return segment.transition === "crossfade" || segment.transition === "wipe";
  });
  if (!hasTimelineTransition || segments.length < 2) {
    await concatSegments(
      command,
      segments.map((segment) => segment.path),
      workdir,
      outputPath,
      run,
    );
    return;
  }

  const args = ["-y"];
  for (const { path } of segments) {
    args.push("-i", path);
  }

  const filterParts = segments.map((_, index) => `[${index}:v]setpts=PTS-STARTPTS[v${index}]`);
  let previousLabel = "v0";
  let cumulativeOffset = normalizeDuration(segments[0]!.segment);
  for (let index = 1; index < segments.length; index += 1) {
    const current = segments[index]!;
    const transitionDuration = transitionDurationSeconds(current.segment);
    const outputLabel = index === segments.length - 1 ? "vout" : `x${index}`;
    const transitionFilter =
      current.segment.transition === "crossfade" || current.segment.transition === "wipe"
        ? `xfade=transition=${ffmpegXfadeTransition(current.segment.transition)}:duration=${transitionDuration.toFixed(
            2,
          )}:offset=${Math.max(0, cumulativeOffset - transitionDuration).toFixed(2)}`
        : "concat=n=2:v=1:a=0";
    filterParts.push(`[${previousLabel}][v${index}]${transitionFilter}[${outputLabel}]`);
    previousLabel = outputLabel;
    cumulativeOffset += normalizeDuration(current.segment) - transitionDuration;
  }

  await run(command, [
    ...args,
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[vout]",
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
    outputPath,
  ]);
};
