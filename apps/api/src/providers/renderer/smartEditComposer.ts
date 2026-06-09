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
} from "@shopclip/shared";

import type { StorageProvider } from "../storage/storageProvider.js";
import { formatFfmpegExitError } from "./ffmpegComposer.js";
import {
  atempoFilter,
  audioFadeFilters,
  audioVolumeFilter,
  audioVolumeKeyframes,
  normalizeAudioVolume,
  smartEditBgmProfile,
  type SmartEditAudioVolumeKeyframe,
} from "./smartEditAudioFilters.js";
import {
  applyGlobalTimelineTextOverlay,
  applySegmentSubtitleOverlay,
} from "./smartEditSubtitleOverlay.js";
import {
  globalTimelineDurationSeconds,
  hasOverlappingSourceAudioClips,
  safeFileToken,
  sourceAudioTimelineClips,
  type SourceAudioTimelineClip,
} from "./smartEditSourceAudioPlan.js";
import {
  isTimelineElementHiddenByTrack,
  isTimelineElementMutedByTrack,
  normalizeDuration,
  normalizeInSegmentClipDuration,
  normalizeInSegmentOffset,
  normalizePlaybackRate,
  smartEditExecutableTimelinePlan,
  timelineElementTrackKind,
  timelineSegmentStartSeconds,
} from "./smartEditTimelinePlan.js";
import {
  buildSegmentVideoFilter,
  ffmpegXfadeTransition,
  smartEditOutputDimensions,
  transitionDurationSeconds,
  type OutputDimensions,
} from "./smartEditVisualFilters.js";

export { smartEditOutputDimensions } from "./smartEditVisualFilters.js";

type CommandRunner = (command: string, args: string[]) => Promise<void>;

interface ComposeSmartEditOptions {
  command?: string;
  fetchImpl?: typeof fetch;
  runCommand?: CommandRunner;
  storageProvider: StorageProvider;
  subtitlesEnabled?: boolean;
  ttsCommand?: string;
  videoSettings?: Parameters<typeof smartEditOutputDimensions>[0];
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

const isImageSourceForSegment = (
  segment: SmartEditSegment,
  asset: AssetMetadata | undefined,
  sourceUrl: string,
): boolean => {
  if (segment.source.sceneClipVideoOnlyUrl && sourceUrl === segment.source.sceneClipVideoOnlyUrl) {
    return false;
  }
  if (segment.source.sceneClipUrl && sourceUrl === segment.source.sceneClipUrl) {
    return false;
  }
  if (segment.source.imageUrl && sourceUrl === segment.source.imageUrl) {
    return true;
  }
  if (segment.source.kind === "image-asset" || segment.source.kind === "fallback-still") {
    return true;
  }
  return asset?.url === sourceUrl && asset.type === "image";
};

const escapeConcatPath = (path: string): string => path.replace(/\\/g, "/").replace(/'/g, "'\\''");

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
  const isImage = isImageSourceForSegment(segment, asset, sourceUrl);
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

  return applySegmentSubtitleOverlay({
    command,
    dimensions,
    inputPath: rawOutputPath,
    outputPath: join(workdir, `${segment.id}-captioned.mp4`),
    run,
    segment,
    subtitlesEnabled,
    workdir,
  });
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

const createMixedSourceAudioTrack = async (
  command: string,
  clips: SourceAudioTimelineClip[],
  timelineDurationSeconds: number,
  workdir: string,
  fetchImpl: typeof fetch,
  run: CommandRunner,
): Promise<string | undefined> => {
  if (clips.length === 0) {
    return undefined;
  }

  const lanePaths: string[] = [];
  for (const clip of clips) {
    const token = safeFileToken(clip.id);
    const targetPath = join(workdir, `source-audio-${token}.m4a`);
    const lanePath = join(workdir, `source-audio-${token}-lane.wav`);
    const sourcePath = await materializeUrl(clip.sourceUrl, targetPath, fetchImpl);
    const globalDelayMilliseconds = Math.max(
      0,
      Math.round((clip.startSecond + clip.delaySeconds) * 1000),
    );
    const filters = [
      `atrim=${clip.trimStartSecond}:${clip.trimEndSecond}`,
      "asetpts=PTS-STARTPTS",
      atempoFilter(clip.playbackRate),
      ...audioFadeFilters(clip.mediaDurationSeconds, clip.fadeInSeconds, clip.fadeOutSeconds),
      ...audioVolumeFilter(clip.volume, clip.volumeKeyframes, clip.mediaDurationSeconds),
      `adelay=${globalDelayMilliseconds}:all=1`,
      `apad,atrim=0:${timelineDurationSeconds}`,
    ].join(",");
    await run(command, [
      "-y",
      "-i",
      sourcePath,
      "-af",
      filters,
      "-c:a",
      "pcm_s16le",
      lanePath,
    ]);
    lanePaths.push(lanePath);
  }

  const sourceAudioTrackPath = join(workdir, "source-audio.wav");
  const filterInputs = lanePaths.map((_, index) => `[${index}:a]`).join("");
  await run(command, [
    "-y",
    ...lanePaths.flatMap((path) => ["-i", path]),
    "-filter_complex",
    `${filterInputs}amix=inputs=${lanePaths.length}:duration=longest,atrim=0:${timelineDurationSeconds}[aout]`,
    "-map",
    "[aout]",
    "-c:a",
    "pcm_s16le",
    sourceAudioTrackPath,
  ]);
  return sourceAudioTrackPath;
};

const createSourceAudioTrack = async (
  command: string,
  plan: SmartEditPlan,
  workdir: string,
  fetchImpl: typeof fetch,
  run: CommandRunner,
): Promise<string | undefined> => {
  const clips = sourceAudioTimelineClips(plan);
  if (clips.length === 0) {
    return undefined;
  }

  const timelineDurationSeconds = globalTimelineDurationSeconds(plan);
  if (hasOverlappingSourceAudioClips(clips)) {
    return createMixedSourceAudioTrack(
      command,
      clips,
      timelineDurationSeconds,
      workdir,
      fetchImpl,
      run,
    );
  }

  const paddedPaths: string[] = [];
  let cursor = 0;
  for (const [index, clip] of clips.entries()) {
    const token = safeFileToken(clip.id);
    const targetPath = join(workdir, `source-audio-${token}.m4a`);
    const paddedPath = join(workdir, `source-audio-${token}-padded.wav`);
    const start = clip.startSecond;
    const gapDuration = start - cursor;
    if (gapDuration > 0.01) {
      const gapPath = join(workdir, `source-audio-gap-${index + 1}.wav`);
      await createSilenceAudioSegment(command, gapDuration, gapPath, run);
      paddedPaths.push(gapPath);
      cursor += gapDuration;
    }

    const sourcePath = await materializeUrl(clip.sourceUrl, targetPath, fetchImpl);
    const audioOffsetMilliseconds = Math.max(0, Math.round(clip.delaySeconds * 1000));
    const filters = [
      `atrim=${clip.trimStartSecond}:${clip.trimEndSecond}`,
      "asetpts=PTS-STARTPTS",
      atempoFilter(clip.playbackRate),
      ...audioFadeFilters(clip.mediaDurationSeconds, clip.fadeInSeconds, clip.fadeOutSeconds),
      ...audioVolumeFilter(clip.volume, clip.volumeKeyframes, clip.mediaDurationSeconds),
      ...(audioOffsetMilliseconds > 0 ? [`adelay=${audioOffsetMilliseconds}:all=1`] : []),
      `apad,atrim=0:${clip.durationSeconds}`,
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
    cursor = Math.max(cursor, start) + clip.durationSeconds;
  }

  const tailDuration = timelineDurationSeconds - cursor;
  if (tailDuration > 0.01) {
    const gapPath = join(workdir, "source-audio-tail.wav");
    await createSilenceAudioSegment(command, tailDuration, gapPath, run);
    paddedPaths.push(gapPath);
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

type VoiceoverTimelineClip = {
  durationSeconds: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  id: string;
  startSecond: number;
  text: string;
  volume: number;
  volumeKeyframes: SmartEditAudioVolumeKeyframe[];
};

const voiceoverTimelineClips = (plan: SmartEditPlan): VoiceoverTimelineClip[] => {
  const enabledSegments = [...plan.segments]
    .filter((segment) => segment.enabled)
    .sort((left, right) => left.order - right.order);
  const timelineStarts = timelineSegmentStartSeconds(enabledSegments);
  const segmentClips = enabledSegments.flatMap((segment): VoiceoverTimelineClip[] => {
    const voiceText = segment.voiceover.trim();
    if (!voiceText) {
      return [];
    }
    const voiceOffsetSeconds = normalizeInSegmentOffset(segment.voiceoverStartOffsetSeconds, segment);
    const voiceDurationSeconds = normalizeInSegmentClipDuration(
      segment.voiceoverDurationSeconds,
      segment.voiceoverStartOffsetSeconds,
      segment,
    );
    return [
      {
        durationSeconds: voiceDurationSeconds,
        fadeInSeconds: segment.voiceoverFadeInSeconds ?? 0,
        fadeOutSeconds: segment.voiceoverFadeOutSeconds ?? 0,
        id: segment.id,
        startSecond: (timelineStarts.get(segment.id) ?? 0) + voiceOffsetSeconds,
        text: voiceText,
        volume: normalizeAudioVolume(segment.voiceoverVolume),
        volumeKeyframes: audioVolumeKeyframes(segment.voiceoverVolumeKeyframes, voiceDurationSeconds),
      },
    ];
  });
  const timelineVoiceClips = (plan.timeline?.elements ?? [])
    .filter(
      (element) =>
        (timelineElementTrackKind(element) === "voice" ||
          (timelineElementTrackKind(element) === "caption" && !element.segmentId)) &&
        !element.segmentId &&
        !element.hidden &&
        !element.muted &&
        !isTimelineElementHiddenByTrack(plan, element) &&
        !isTimelineElementMutedByTrack(plan, element),
    )
    .flatMap((element): VoiceoverTimelineClip[] => {
      const text = (element.text?.trim() || element.label.trim()).trim();
      if (!text) {
        return [];
      }
      return [
        {
          durationSeconds: element.durationSeconds,
          fadeInSeconds: element.audioFadeInSeconds ?? 0,
          fadeOutSeconds: element.audioFadeOutSeconds ?? 0,
          id: element.id,
          startSecond: element.startSecond,
          text,
          volume: normalizeAudioVolume(element.audioVolume),
          volumeKeyframes: audioVolumeKeyframes(element.audioVolumeKeyframes, element.durationSeconds),
        },
      ];
    });
  return [...segmentClips, ...timelineVoiceClips].sort((left, right) => left.startSecond - right.startSecond);
};

const createVoiceoverTrack = async (
  command: string,
  ttsCommand: string,
  plan: SmartEditPlan,
  workdir: string,
  run: CommandRunner,
): Promise<string | undefined> => {
  const clips = voiceoverTimelineClips(plan);
  if (clips.length === 0) {
    return undefined;
  }

  const timelineDurationSeconds = globalTimelineDurationSeconds(plan);
  const lanePaths: string[] = [];
  for (const clip of clips) {
    const token = safeFileToken(clip.id);
    const rawVoicePath = join(workdir, `voice-${token}.wav`);
    const lanePath = join(workdir, `voice-${token}-lane.wav`);
    const voiceDelayMilliseconds = Math.max(0, Math.round(clip.startSecond * 1000));
    const voiceFilter = [
      `atrim=0:${clip.durationSeconds}`,
      "asetpts=PTS-STARTPTS",
      ...audioFadeFilters(clip.durationSeconds, clip.fadeInSeconds, clip.fadeOutSeconds),
      ...audioVolumeFilter(clip.volume, clip.volumeKeyframes, clip.durationSeconds),
      `adelay=${voiceDelayMilliseconds}:all=1`,
      `apad,atrim=0:${timelineDurationSeconds}`,
    ].join(",");
    await run(ttsCommand, [
      "-v",
      voiceForLanguage(plan.audio.targetLanguage),
      "-w",
      rawVoicePath,
      clip.text,
    ]);
    await run(command, [
      "-y",
      "-i",
      rawVoicePath,
      "-af",
      voiceFilter,
      "-c:a",
      "pcm_s16le",
      lanePath,
    ]);
    lanePaths.push(lanePath);
  }

  if (lanePaths.length === 0) {
    return undefined;
  }

  const voiceTrackPath = join(workdir, "voiceover.wav");
  const filterInputs = lanePaths.map((_, index) => `[${index}:a]`).join("");
  await run(command, [
    "-y",
    ...lanePaths.flatMap((path) => ["-i", path]),
    "-filter_complex",
    `${filterInputs}amix=inputs=${lanePaths.length}:duration=longest,atrim=0:${timelineDurationSeconds}[aout]`,
    "-map",
    "[aout]",
    "-c:a",
    "pcm_s16le",
    voiceTrackPath,
  ]);
  return voiceTrackPath;
};


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

export { smartEditBgmProfile };

export const composeSmartEditToStorage = async (
  projectId: string,
  plan: SmartEditPlan,
  assets: AssetMetadata[],
  options: ComposeSmartEditOptions,
): Promise<SmartEditLocalExport> => {
  const executablePlan = smartEditExecutableTimelinePlan(plan);
  const command = options.command ?? commandFromEnv();
  const fetchImpl = options.fetchImpl ?? fetch;
  const run = options.runCommand ?? runCommand;
  const ttsCommand = options.ttsCommand ?? ttsCommandFromEnv();
  const subtitlesEnabled = options.subtitlesEnabled ?? true;
  const dimensions = smartEditOutputDimensions(options.videoSettings);
  const exportId = randomUUID();
  const workdir = join(smartEditExportDir(), projectId, "smart-edit", exportId);
  await mkdir(workdir, { recursive: true });

  const enabledSegments = [...executablePlan.segments]
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
  const textOverlayPath = await applyGlobalTimelineTextOverlay(
    command,
    stitchedPath,
    join(workdir, "stitched-with-global-text.mp4"),
    executablePlan,
    globalTimelineDurationSeconds(executablePlan),
    dimensions,
    workdir,
    run,
  );
  const voiceoverTrackPath = await createVoiceoverTrack(command, ttsCommand, executablePlan, workdir, run);
  const sourceAudioTrackPath = await createSourceAudioTrack(
    command,
    executablePlan,
    workdir,
    fetchImpl,
    run,
  );
  await addAudioTracks(
    command,
    textOverlayPath,
    outputPath,
    executablePlan,
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
