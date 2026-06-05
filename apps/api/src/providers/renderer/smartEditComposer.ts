import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

import type {
  AssetMetadata,
  SmartEditPlan,
  SmartEditSegment,
  SmartEditSegmentOutput,
  VideoGenerationSettings,
} from "@shopclip/shared";

import type { StorageProvider } from "../storage/storageProvider.js";
import { buildSubtitleAss, buildSubtitleFilter, formatFfmpegExitError } from "./ffmpegComposer.js";

type CommandRunner = (command: string, args: string[]) => Promise<void>;

interface ComposeSmartEditOptions {
  command?: string;
  fetchImpl?: typeof fetch;
  runCommand?: CommandRunner;
  storageProvider: StorageProvider;
  subtitlesEnabled?: boolean;
  ttsCommand?: string;
  videoSettings?: VideoGenerationSettings;
}

export interface SmartEditLocalExport {
  exportId: string;
  localUrl: string;
  objectKey: string;
  outputPath: string;
  publicUrl: string;
  segmentOutputs: Array<{
    objectKey: string;
    outputPath: string;
    publicUrl: string;
    sceneId: string;
    segmentId: string;
  }>;
}

const commandFromEnv = () =>
  process.env.FFMPEG_PATH?.trim() || process.env.FFMPEG_BINARY?.trim() || "ffmpeg";

const ttsCommandFromEnv = () =>
  process.env.SMART_EDIT_TTS_COMMAND?.trim() ||
  process.env.TTS_BINARY?.trim() ||
  process.env.ESPEAK_BINARY?.trim() ||
  "espeak-ng";

const smartEditExportDir = () =>
  process.env.RENDER_EXPORT_DIR?.trim() || join(tmpdir(), "shopclip-ai-render-exports");

const runCommand: CommandRunner = (command, args) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(formatFfmpegExitError(code, signal, stderr));
    });
  });

const isRemoteUrl = (url: string): boolean => /^https?:\/\//iu.test(url);

const dataUrlMatch = (url: string) => /^data:([^;,]+)?(?:;[^,]*)?,(.*)$/iu.exec(url);

const extensionForUrl = (url: string, fallback: string) => {
  const path = url.split("?")[0] ?? "";
  const extension = extname(path).toLowerCase();
  return extension || fallback;
};

const materializeUrl = async (
  url: string,
  outputPath: string,
  fetchImpl: typeof fetch,
): Promise<string> => {
  const dataMatch = dataUrlMatch(url);
  if (dataMatch) {
    const payload = dataMatch[2] ?? "";
    const buffer = url.includes(";base64,")
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    await writeFile(outputPath, buffer);
    return outputPath;
  }

  if (!isRemoteUrl(url)) {
    return url;
  }

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to download smart edit source ${url}: HTTP ${response.status}.`);
  }
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return outputPath;
};

const assetForSegment = (
  segment: SmartEditSegment,
  assets: AssetMetadata[],
): AssetMetadata | undefined =>
  segment.source.assetId ? assets.find((asset) => asset.id === segment.source.assetId) : undefined;

const sourceUrlForSegment = (segment: SmartEditSegment, assets: AssetMetadata[]): string | undefined => {
  const asset = assetForSegment(segment, assets);
  return (
    segment.source.sceneClipVideoOnlyUrl ||
    segment.source.sceneClipUrl ||
    segment.source.imageUrl ||
    asset?.url
  );
};

const escapeConcatPath = (path: string): string => path.replace(/\\/g, "/").replace(/'/g, "'\\''");

const normalizeDuration = (segment: SmartEditSegment): number =>
  Math.max(0.1, Math.min(120, segment.durationSeconds));

const normalizePlaybackRate = (segment: SmartEditSegment): number =>
  Math.max(0.25, Math.min(4, segment.playbackRate ?? 1));

const normalizeTimelineStart = (segment: SmartEditSegment): number =>
  Math.max(0, Math.min(600, segment.timelineStartSecond ?? 0));

const normalizeInSegmentOffset = (offsetSeconds: number | undefined, segment: SmartEditSegment): number =>
  Math.max(0, Math.min(normalizeDuration(segment) - 0.01, offsetSeconds ?? 0));

const normalizeInSegmentClipDuration = (
  durationSeconds: number | undefined,
  offsetSeconds: number | undefined,
  segment: SmartEditSegment,
): number => {
  const startOffset = normalizeInSegmentOffset(offsetSeconds, segment);
  const maxDuration = Math.max(0.1, normalizeDuration(segment) - startOffset);
  return Math.max(0.1, Math.min(maxDuration, durationSeconds ?? maxDuration));
};

const timelineSegmentStartSeconds = (segments: SmartEditSegment[]): Map<string, number> => {
  const starts = new Map<string, number>();
  const hasManualStarts = segments.some((segment) => normalizeTimelineStart(segment) > 0);
  let cursor = 0;
  for (const segment of segments) {
    const requestedStart = normalizeTimelineStart(segment);
    const start = hasManualStarts ? requestedStart : cursor;
    starts.set(segment.id, start);
    cursor = Math.max(cursor, start + normalizeDuration(segment));
  }
  return starts;
};

type OutputDimensions = {
  height: number;
  width: number;
};

const even = (value: number): number => {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
};

export const smartEditOutputDimensions = (
  videoSettings?: VideoGenerationSettings,
): OutputDimensions => {
  const base = Number.parseInt(videoSettings?.resolution ?? "720p", 10) || 720;
  const ratio = videoSettings?.ratio ?? "9:16";
  const [ratioWidth = 9, ratioHeight = 16] = ratio.split(":").map((part) => Number(part));
  if (!Number.isFinite(ratioWidth) || !Number.isFinite(ratioHeight) || ratioWidth <= 0 || ratioHeight <= 0) {
    return { height: even(base * (16 / 9)), width: even(base) };
  }
  if (ratioWidth === ratioHeight) {
    return { height: even(base), width: even(base) };
  }
  if (ratioWidth > ratioHeight) {
    return {
      height: even(base),
      width: even(base * (ratioWidth / ratioHeight)),
    };
  }
  return {
    height: even(base * (ratioHeight / ratioWidth)),
    width: even(base),
  };
};

const normalizedTransform = (segment: SmartEditSegment) => ({
  offsetXPercent: Math.max(-100, Math.min(100, segment.transform?.offsetXPercent ?? 0)),
  offsetYPercent: Math.max(-100, Math.min(100, segment.transform?.offsetYPercent ?? 0)),
  opacity: Math.max(0, Math.min(1, segment.transform?.opacity ?? 1)),
  rotateDegrees: Math.max(-180, Math.min(180, segment.transform?.rotateDegrees ?? 0)),
  scale: Math.max(0.1, Math.min(4, segment.transform?.scale ?? 1)),
});

const normalizedEffects = (segment: SmartEditSegment) => ({
  blur: Math.max(0, Math.min(20, segment.effects?.blur ?? 0)),
  fadeInSeconds: Math.max(0, Math.min(5, segment.effects?.fadeInSeconds ?? 0)),
  fadeOutSeconds: Math.max(0, Math.min(5, segment.effects?.fadeOutSeconds ?? 0)),
  sharpen: Math.max(0, Math.min(2, segment.effects?.sharpen ?? 0)),
});

const buildScaleFilter = (segment: SmartEditSegment, dimensions: OutputDimensions): string => {
  const transform = normalizedTransform(segment);
  const scaledWidth = Math.max(2, Math.round((dimensions.width * transform.scale) / 2) * 2);
  const scaledHeight = Math.max(2, Math.round((dimensions.height * transform.scale) / 2) * 2);
  const offsetX = Math.round((dimensions.width * transform.offsetXPercent) / 100);
  const offsetY = Math.round((dimensions.height * transform.offsetYPercent) / 100);
  if (
    transform.scale === 1 &&
    offsetX === 0 &&
    offsetY === 0
  ) {
    return `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=increase,crop=${dimensions.width}:${dimensions.height},fps=30,format=yuv420p`;
  }
  return [
    `scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=increase`,
    `crop=${dimensions.width}:${dimensions.height}:x='(in_w-${dimensions.width})/2${offsetX >= 0 ? "+" : ""}${offsetX}':y='(in_h-${dimensions.height})/2${offsetY >= 0 ? "+" : ""}${offsetY}'`,
    "fps=30",
    "format=yuv420p",
  ].join(",");
};

const transitionDurationSeconds = (segment: SmartEditSegment): number => {
  if (segment.transition === "cut") {
    return 0;
  }
  return Math.min(0.45, Math.max(0.2, normalizeDuration(segment) / 5));
};

const ffmpegXfadeTransition = (transition: SmartEditSegment["transition"]): string => {
  if (transition === "wipe") {
    return "wipeleft";
  }
  return "fade";
};

const buildSegmentVideoFilter = (
  segment: SmartEditSegment,
  dimensions: OutputDimensions,
): string => {
  const transform = normalizedTransform(segment);
  const effects = normalizedEffects(segment);
  const filters = [buildScaleFilter(segment, dimensions)];
  if (transform.rotateDegrees !== 0) {
    filters.push(`rotate=${((transform.rotateDegrees * Math.PI) / 180).toFixed(4)}:fillcolor=black`);
  }
  if (transform.opacity < 1) {
    filters.push("format=yuva420p");
    filters.push(`colorchannelmixer=aa=${transform.opacity.toFixed(3)}`);
  }
  if (effects.blur > 0) {
    filters.push(`gblur=sigma=${effects.blur.toFixed(2)}`);
  }
  if (effects.sharpen > 0) {
    filters.push(`unsharp=5:5:${effects.sharpen.toFixed(2)}:5:5:0.00`);
  }
  const playbackRate = normalizePlaybackRate(segment);
  if (playbackRate !== 1) {
    filters.push(`setpts=${(1 / playbackRate).toFixed(4)}*PTS`);
  }
  const duration = normalizeDuration(segment);
  if (effects.fadeInSeconds > 0 && duration > effects.fadeInSeconds) {
    filters.push(`fade=t=in:st=0:d=${effects.fadeInSeconds.toFixed(2)}`);
  }
  if (effects.fadeOutSeconds > 0 && duration > effects.fadeOutSeconds) {
    filters.push(
      `fade=t=out:st=${Math.max(0, duration - effects.fadeOutSeconds).toFixed(2)}:d=${effects.fadeOutSeconds.toFixed(2)}`,
    );
  }
  const fadeDuration = transitionDurationSeconds(segment);
  if (segment.transition === "fade" && fadeDuration > 0 && duration > fadeDuration * 2) {
    filters.push(`fade=t=in:st=0:d=${fadeDuration.toFixed(2)}`);
    filters.push(`fade=t=out:st=${(duration - fadeDuration).toFixed(2)}:d=${fadeDuration.toFixed(2)}`);
  }
  if (transform.opacity < 1) {
    filters.push("format=yuv420p");
  }
  return filters.join(",");
};

const containsReadableText = (text: string): boolean => /[\p{L}\p{N}]/u.test(text);

const isMostlyReplacementSymbols = (text: string): boolean => {
  const compact = text.replace(/\s/gu, "");
  if (!compact) {
    return true;
  }
  const replacementSymbolCodePoints = new Set([0x003f, 0xfffd, 0x25a1, 0x25a0, 0x25c7, 0x25c6]);
  const symbolCount = [...compact].filter((character) =>
    replacementSymbolCodePoints.has(character.codePointAt(0) ?? 0),
  ).length;
  return symbolCount / compact.length >= 0.6;
};

const isLikelyMojibake = (text: string): boolean => {
  const compact = text.replace(/\s/gu, "");
  if (!compact) {
    return false;
  }

  const mojibakeMarkerMatches =
    compact.match(/[ÃÂ�]|(?:â[€€™€œ])|[鍊掕繃鏉ユ憞涔熶笉婕滄灏辩偣鍟搧]/gu) ?? [];
  const replacementMatches = compact.match(/[?？�□■◇◆]/gu) ?? [];
  const markerRatio = mojibakeMarkerMatches.length / compact.length;
  const replacementRatio = replacementMatches.length / compact.length;

  return markerRatio >= 0.35 || (markerRatio >= 0.2 && replacementRatio >= 0.05);
};

const isReadableSubtitleText = (text: string): boolean =>
  containsReadableText(text) && !isMostlyReplacementSymbols(text) && !isLikelyMojibake(text);

export const subtitleTextForSegment = (segment: SmartEditSegment): string => {
  const subtitle = segment.subtitle.trim();
  if (subtitle && isReadableSubtitleText(subtitle)) {
    return subtitle;
  }

  const voiceover = segment.voiceover.trim();
  if (voiceover && isReadableSubtitleText(voiceover)) {
    return voiceover;
  }

  return "";
};

const voiceForLanguage = (language: string | undefined): string => {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) {
    return "en-us";
  }
  if (normalized.startsWith("zh") || normalized.startsWith("cmn")) {
    return "cmn";
  }
  if (normalized.startsWith("en")) {
    return "en-us";
  }
  if (normalized.startsWith("ja")) {
    return "ja";
  }
  if (normalized.startsWith("ko")) {
    return "ko";
  }
  if (normalized.startsWith("es")) {
    return "es";
  }
  if (normalized.startsWith("fr")) {
    return "fr-fr";
  }
  return normalized;
};

const createSegmentVideo = async ({
  assets,
  command,
  fetchImpl,
  run,
  segment,
  subtitlesEnabled,
  dimensions,
  workdir,
}: {
  assets: AssetMetadata[];
  command: string;
  dimensions: OutputDimensions;
  fetchImpl: typeof fetch;
  run: CommandRunner;
  segment: SmartEditSegment;
  subtitlesEnabled: boolean;
  workdir: string;
}): Promise<string> => {
  const sourceUrl = sourceUrlForSegment(segment, assets);
  if (!sourceUrl) {
    throw new Error(`Smart edit segment ${segment.id} has no usable source URL.`);
  }

  if (
    segment.source.kind === "generated-scene-clip" &&
    segment.source.sceneClipUrl &&
    !segment.source.sceneClipVideoOnlyUrl &&
    !subtitlesEnabled &&
    segment.source.startSecond === undefined &&
    segment.source.endSecond === undefined &&
    normalizePlaybackRate(segment) === 1
  ) {
    return materializeUrl(
      segment.source.sceneClipUrl,
      join(workdir, `${segment.id}-reused.mp4`),
      fetchImpl,
    );
  }

  const asset = assetForSegment(segment, assets);
  const isImage =
    segment.source.kind === "image-asset" ||
    segment.source.kind === "fallback-still" ||
    asset?.type === "image";
  const sourcePath = await materializeUrl(
    sourceUrl,
    join(workdir, `${segment.id}-source${extensionForUrl(sourceUrl, isImage ? ".png" : ".mp4")}`),
    fetchImpl,
  );
  const rawOutputPath = join(workdir, `${segment.id}-raw.mp4`);
  const duration = normalizeDuration(segment);

  if (isImage) {
    await run(command, [
      "-y",
      "-loop",
      "1",
      "-t",
      String(duration),
      "-i",
      sourcePath,
      "-vf",
      buildSegmentVideoFilter(segment, dimensions),
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
      rawOutputPath,
    ]);
  } else {
    const args = ["-y"];
    if (segment.source.startSecond !== undefined) {
      args.push("-ss", String(segment.source.startSecond));
    }
    const sourceDuration =
      segment.source.startSecond !== undefined && segment.source.endSecond !== undefined
        ? Math.max(0.1, segment.source.endSecond - segment.source.startSecond)
        : duration * normalizePlaybackRate(segment);
    args.push(
      "-i",
      sourcePath,
      "-t",
      String(sourceDuration),
      "-vf",
      buildSegmentVideoFilter(segment, dimensions),
    );
    args.push(
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
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
      "-shortest",
      "-movflags",
      "+faststart",
      rawOutputPath,
    );
    await run(command, args);
  }

  const subtitleText = subtitleTextForSegment(segment);
  if (!subtitlesEnabled || segment.captionHidden || !subtitleText) {
    return rawOutputPath;
  }

  const subtitleAssPath = join(workdir, `${segment.id}.ass`);
  const captionedOutputPath = join(workdir, `${segment.id}-captioned.mp4`);
  const captionStartSecond = normalizeInSegmentOffset(segment.captionStartOffsetSeconds, segment);
  const captionDurationSeconds = normalizeInSegmentClipDuration(
    segment.captionDurationSeconds,
    segment.captionStartOffsetSeconds,
    segment,
  );
  await writeFile(
    subtitleAssPath,
    buildSubtitleAss(subtitleText, {
      endSecond: Math.min(normalizeDuration(segment), captionStartSecond + captionDurationSeconds),
      fontSize: Math.max(24, Math.round(dimensions.height * (42 / 1280))),
      height: dimensions.height,
      marginV: Math.max(48, Math.round(dimensions.height * (96 / 1280))),
      startSecond: captionStartSecond,
      width: dimensions.width,
    }),
    "utf8",
  );
  await run(command, [
    "-y",
    "-i",
    rawOutputPath,
    "-vf",
    buildSubtitleFilter(subtitleAssPath),
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
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
    "-shortest",
    "-movflags",
    "+faststart",
    captionedOutputPath,
  ]);
  return captionedOutputPath;
};

const atempoFilter = (playbackRate: number): string => {
  const factors: number[] = [];
  let remaining = playbackRate;
  while (remaining > 2) {
    factors.push(2);
    remaining /= 2;
  }
  while (remaining < 0.5) {
    factors.push(0.5);
    remaining /= 0.5;
  }
  factors.push(remaining);
  return factors.map((factor) => `atempo=${factor.toFixed(4)}`).join(",");
};

const createSilenceAudioSegment = async (
  command: string,
  durationSeconds: number,
  outputPath: string,
  run: CommandRunner,
) => {
  await run(command, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t",
    String(durationSeconds),
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);
};

const createSourceAudioTrack = async (
  command: string,
  plan: SmartEditPlan,
  workdir: string,
  fetchImpl: typeof fetch,
  run: CommandRunner,
): Promise<string | undefined> => {
  const enabledSegments = [...plan.segments]
    .filter((segment) => segment.enabled)
    .sort((left, right) => left.order - right.order);
  if (
    !enabledSegments.some(
      (segment) => segment.source.sceneClipAudioUrl && !segment.sourceAudioMuted,
    )
  ) {
    return undefined;
  }

  const paddedPaths: string[] = [];
  const timelineStarts = timelineSegmentStartSeconds(enabledSegments);
  let cursor = 0;
  for (const [index, segment] of enabledSegments.entries()) {
    const targetPath = join(workdir, `source-audio-${index + 1}.m4a`);
    const paddedPath = join(workdir, `source-audio-${index + 1}-padded.wav`);
    const start = timelineStarts.get(segment.id) ?? cursor;
    const gapDuration = start - cursor;
    if (gapDuration > 0.01) {
      const gapPath = join(workdir, `source-audio-gap-${index + 1}.wav`);
      await createSilenceAudioSegment(command, gapDuration, gapPath, run);
      paddedPaths.push(gapPath);
      cursor += gapDuration;
    }
    const sourceAudioUrl = segment.sourceAudioMuted ? undefined : segment.source.sceneClipAudioUrl;
    if (!sourceAudioUrl) {
      await createSilenceAudioSegment(command, normalizeDuration(segment), paddedPath, run);
      paddedPaths.push(paddedPath);
      cursor = Math.max(cursor, start) + normalizeDuration(segment);
      continue;
    }

    const sourcePath = await materializeUrl(sourceAudioUrl, targetPath, fetchImpl);
    const audioOffsetSeconds = normalizeInSegmentOffset(segment.sourceAudioStartOffsetSeconds, segment);
    const audioOffsetMilliseconds = Math.round(audioOffsetSeconds * 1000);
    const audioDurationSeconds = normalizeInSegmentClipDuration(
      segment.sourceAudioDurationSeconds,
      segment.sourceAudioStartOffsetSeconds,
      segment,
    );
    const sourceAudioStart = segment.source.startSecond ?? 0;
    const trimEnd =
      segment.source.endSecond === undefined
        ? sourceAudioStart + audioDurationSeconds * normalizePlaybackRate(segment)
        : Math.min(
            segment.source.endSecond,
            sourceAudioStart + audioDurationSeconds * normalizePlaybackRate(segment),
          );
    const filters = [
      `atrim=${sourceAudioStart}:${trimEnd}`,
      "asetpts=PTS-STARTPTS",
      atempoFilter(normalizePlaybackRate(segment)),
      ...(audioOffsetMilliseconds > 0 ? [`adelay=${audioOffsetMilliseconds}:all=1`] : []),
      `apad,atrim=0:${normalizeDuration(segment)}`,
    ].join(",");
    await run(command, [
      "-y",
      "-i",
      sourcePath,
      "-af",
      filters,
      "-c:a",
      "pcm_s16le",
      paddedPath,
    ]);
    paddedPaths.push(paddedPath);
    cursor = Math.max(cursor, start) + normalizeDuration(segment);
  }

  if (paddedPaths.length === 0) {
    return undefined;
  }

  const concatListPath = join(workdir, "smart-edit-source-audio.txt");
  const sourceAudioTrackPath = join(workdir, "source-audio.wav");
  await writeFile(
    concatListPath,
    paddedPaths.map((path) => `file '${escapeConcatPath(path)}'`).join("\n"),
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
    "-c:a",
    "pcm_s16le",
    sourceAudioTrackPath,
  ]);
  return sourceAudioTrackPath;
};

const concatSegments = async (
  command: string,
  segmentPaths: string[],
  workdir: string,
  outputPath: string,
  run: CommandRunner,
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
  run: CommandRunner,
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

const stitchSegmentsWithTransitions = async (
  command: string,
  segments: Array<{ path: string; segment: SmartEditSegment }>,
  dimensions: OutputDimensions,
  workdir: string,
  outputPath: string,
  run: CommandRunner,
) => {
  const timelineStarts = timelineSegmentStartSeconds(segments.map(({ segment }) => segment));
  const hasTimelineGap = segments.some(({ segment }, index) => {
    if (index === 0) {
      return (timelineStarts.get(segment.id) ?? 0) > 0.01;
    }
    const previous = segments[index - 1]!;
    const previousEnd = (timelineStarts.get(previous.segment.id) ?? 0) + normalizeDuration(previous.segment);
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
        : `concat=n=2:v=1:a=0`;
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

const createVoiceoverTrack = async (
  command: string,
  ttsCommand: string,
  plan: SmartEditPlan,
  workdir: string,
  run: CommandRunner,
): Promise<string | undefined> => {
  const enabledSegments = [...plan.segments]
    .filter((segment) => segment.enabled)
    .sort((left, right) => left.order - right.order);
  if (enabledSegments.length === 0) {
    return undefined;
  }
  const voiceLines = enabledSegments.map((segment) => segment.voiceover.trim()).filter(Boolean);
  if (voiceLines.length === 0) {
    return undefined;
  }

  const paddedPaths: string[] = [];
  const timelineStarts = timelineSegmentStartSeconds(enabledSegments);
  let cursor = 0;
  for (const [index, segment] of enabledSegments.entries()) {
    const voiceText = segment.voiceover.trim() || segment.subtitle.trim();
    const start = timelineStarts.get(segment.id) ?? cursor;
    const gapDuration = start - cursor;
    if (gapDuration > 0.01) {
      const gapPath = join(workdir, `voice-gap-${index + 1}.wav`);
      await createSilenceAudioSegment(command, gapDuration, gapPath, run);
      paddedPaths.push(gapPath);
      cursor += gapDuration;
    }
    if (!voiceText) {
      const silencePath = join(workdir, `voice-${index + 1}-silence.wav`);
      await createSilenceAudioSegment(command, normalizeDuration(segment), silencePath, run);
      paddedPaths.push(silencePath);
      cursor = Math.max(cursor, start) + normalizeDuration(segment);
      continue;
    }
    const rawVoicePath = join(workdir, `voice-${index + 1}.wav`);
    const paddedVoicePath = join(workdir, `voice-${index + 1}-padded.wav`);
    const voiceOffsetSeconds = normalizeInSegmentOffset(segment.voiceoverStartOffsetSeconds, segment);
    const voiceOffsetMilliseconds = Math.round(voiceOffsetSeconds * 1000);
    const voiceDurationSeconds = normalizeInSegmentClipDuration(
      segment.voiceoverDurationSeconds,
      segment.voiceoverStartOffsetSeconds,
      segment,
    );
    const voiceFilter =
      voiceOffsetMilliseconds > 0
        ? `atrim=0:${voiceDurationSeconds},asetpts=PTS-STARTPTS,adelay=${voiceOffsetMilliseconds}:all=1,apad,atrim=0:${normalizeDuration(segment)}`
        : `atrim=0:${voiceDurationSeconds},asetpts=PTS-STARTPTS,apad,atrim=0:${normalizeDuration(segment)}`;
    await run(ttsCommand, [
      "-v",
      voiceForLanguage(plan.audio.targetLanguage),
      "-w",
      rawVoicePath,
      voiceText,
    ]);
    await run(command, [
      "-y",
      "-i",
      rawVoicePath,
      "-af",
      voiceFilter,
      "-c:a",
      "pcm_s16le",
      paddedVoicePath,
    ]);
    paddedPaths.push(paddedVoicePath);
    cursor = Math.max(cursor, start) + normalizeDuration(segment);
  }

  if (paddedPaths.length === 0) {
    return undefined;
  }

  const concatListPath = join(workdir, "smart-edit-voice.txt");
  const voiceTrackPath = join(workdir, "voiceover.wav");
  await writeFile(
    concatListPath,
    paddedPaths.map((path) => `file '${escapeConcatPath(path)}'`).join("\n"),
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
    "-c:a",
    "pcm_s16le",
    voiceTrackPath,
  ]);
  return voiceTrackPath;
};

type SmartEditBgmTrack = SmartEditPlan["audio"]["bgmTrack"];

const bgmProfiles: Record<Exclude<SmartEditBgmTrack, "none">, { lavfi: string; volume: number }> = {
  "creator-pop": {
    lavfi: "sine=frequency=523:sample_rate=44100",
    volume: 0.05,
  },
  "soft-lift": {
    lavfi: "sine=frequency=330:sample_rate=44100",
    volume: 0.035,
  },
  "tech-pulse": {
    lavfi: "sine=frequency=176:sample_rate=44100",
    volume: 0.045,
  },
};

export const smartEditBgmProfile = (
  bgmTrack: SmartEditBgmTrack,
): { lavfi: string; volume: number } | undefined =>
  bgmTrack === "none" ? undefined : bgmProfiles[bgmTrack] ?? bgmProfiles["creator-pop"];

const addAudioTracks = async (
  command: string,
  inputPath: string,
  outputPath: string,
  plan: SmartEditPlan,
  run: CommandRunner,
  sourceAudioTrackPath?: string,
  voiceoverTrackPath?: string,
) => {
  const bgmProfile = smartEditBgmProfile(plan.audio.bgmTrack);
  const audioInputs = [
    ...(sourceAudioTrackPath ? [{ label: "src", path: sourceAudioTrackPath, volume: 0.9 }] : []),
    ...(voiceoverTrackPath ? [{ label: "voice", path: voiceoverTrackPath, volume: 1.0 }] : []),
  ];

  if (!bgmProfile && audioInputs.length === 0) {
    await run(command, ["-y", "-i", inputPath, "-c", "copy", outputPath]);
    return;
  }

  if (!bgmProfile && audioInputs.length === 1) {
    await run(command, [
      "-y",
      "-i",
      inputPath,
      "-i",
      audioInputs[0]!.path,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    return;
  }

  const args = [
    "-y",
    "-i",
    inputPath,
  ];
  for (const input of audioInputs) {
    args.push("-i", input.path);
  }
  if (bgmProfile) {
    args.push("-f", "lavfi", "-i", bgmProfile.lavfi);
  }
  const filterParts = audioInputs.map(
    (input, index) => `[${index + 1}:a]volume=${input.volume.toFixed(3)}[${input.label}]`,
  );
  const mixLabels = audioInputs.map((input) => `[${input.label}]`);
  if (bgmProfile) {
    const bgmInputIndex = audioInputs.length + 1;
    filterParts.push(`[${bgmInputIndex}:a]volume=${bgmProfile.volume}[bgm]`);
    mixLabels.push("[bgm]");
  }
  filterParts.push(`${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first[aout]`);
  await run(command, [
    ...args,
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "0:v:0",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
};

export const createSmartEditObjectKey = (projectId: string, exportId: string): string =>
  `projects/${projectId}/smart-edits/${exportId}/export.mp4`;

export const createSmartEditSegmentObjectKey = (
  projectId: string,
  exportId: string,
  segmentId: string,
): string => `projects/${projectId}/smart-edits/${exportId}/segments/${segmentId}.mp4`;

export const composeSmartEditToStorage = async (
  projectId: string,
  plan: SmartEditPlan,
  assets: AssetMetadata[],
  options: ComposeSmartEditOptions,
): Promise<SmartEditLocalExport> => {
  const command = options.command ?? commandFromEnv();
  const fetchImpl = options.fetchImpl ?? fetch;
  const run = options.runCommand ?? runCommand;
  const ttsCommand = options.ttsCommand ?? ttsCommandFromEnv();
  const subtitlesEnabled = options.subtitlesEnabled ?? true;
  const dimensions = smartEditOutputDimensions(options.videoSettings);
  const exportId = randomUUID();
  const workdir = join(smartEditExportDir(), projectId, "smart-edit", exportId);
  await mkdir(workdir, { recursive: true });

  const enabledSegments = [...plan.segments]
    .filter((segment) => segment.enabled)
    .sort((left, right) => left.order - right.order);
  if (enabledSegments.length === 0) {
    throw new Error("Smart edit plan has no enabled segments.");
  }

  const segmentOutputs: SmartEditLocalExport["segmentOutputs"] = [];
  for (const segment of enabledSegments) {
    const outputPath = await createSegmentVideo({
      assets,
      command,
      dimensions,
      fetchImpl,
      run,
      segment,
      subtitlesEnabled,
      workdir,
    });
    const segmentObjectKey = createSmartEditSegmentObjectKey(projectId, exportId, segment.id);
    const uploadedSegment = await options.storageProvider.uploadObject({
      body: await readFile(outputPath),
      contentType: "video/mp4",
      objectKey: segmentObjectKey,
    });
    segmentOutputs.push({
      objectKey: uploadedSegment.objectKey,
      outputPath,
      publicUrl: uploadedSegment.publicUrl,
      sceneId: segment.sceneId,
      segmentId: segment.id,
    });
  }

  const stitchedPath = join(workdir, "stitched.mp4");
  const outputPath = join(workdir, "export.mp4");
  await stitchSegmentsWithTransitions(
    command,
    segmentOutputs.map((segmentOutput) => ({
      path: segmentOutput.outputPath,
      segment: enabledSegments.find((segment) => segment.id === segmentOutput.segmentId)!,
    })),
    dimensions,
    workdir,
    stitchedPath,
    run,
  );
  const voiceoverTrackPath = await createVoiceoverTrack(command, ttsCommand, plan, workdir, run);
  const sourceAudioTrackPath = await createSourceAudioTrack(
    command,
    plan,
    workdir,
    fetchImpl,
    run,
  );
  await addAudioTracks(
    command,
    stitchedPath,
    outputPath,
    plan,
    run,
    sourceAudioTrackPath,
    voiceoverTrackPath,
  );

  const objectKey = createSmartEditObjectKey(projectId, exportId);
  const uploaded = await options.storageProvider.uploadObject({
    body: await readFile(outputPath),
    contentType: "video/mp4",
    objectKey,
  });

  return {
    exportId,
    localUrl: `/api/render-exports/${encodeURIComponent(projectId)}/${encodeURIComponent(exportId)}/export.mp4`,
    objectKey: uploaded.objectKey,
    outputPath,
    publicUrl: uploaded.publicUrl,
    segmentOutputs,
  };
};

export const smartEditSegmentOutputsForResponse = (
  segmentOutputs: SmartEditLocalExport["segmentOutputs"],
): SmartEditSegmentOutput[] =>
  segmentOutputs.map((segment) => ({
    objectKey: segment.objectKey,
    sceneId: segment.sceneId,
    segmentId: segment.segmentId,
    videoUrl: segment.publicUrl,
  }));
