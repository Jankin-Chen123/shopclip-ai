import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  AssetMetadata,
  SmartEditPlan,
  SmartEditSegment,
  SmartEditSegmentOutput,
} from "@shopclip/shared";

import type { StorageProvider } from "../storage/storageProvider.js";
import { formatFfmpegExitError } from "./ffmpegComposer.js";
import { smartEditBgmProfile } from "./smartEditAudioFilters.js";
import {
  addAudioTracks,
  createSourceAudioTrack,
  createVoiceoverTrack,
  type SmartEditCommandRunner,
} from "./smartEditAudioTracks.js";
import {
  applyGlobalTimelineTextOverlay,
  applySegmentSubtitleOverlay,
} from "./smartEditSubtitleOverlay.js";
import {
  assetForSegment,
  dataUrlMatch,
  extensionForUrl,
  isImageSourceForSegment,
  isRemoteUrl,
  sourceUrlForSegment,
} from "./smartEditMediaSources.js";
import {
  globalTimelineDurationSeconds,
} from "./smartEditSourceAudioPlan.js";
import {
  normalizeDuration,
  normalizePlaybackRate,
  smartEditExecutableTimelinePlan,
} from "./smartEditTimelinePlan.js";
import {
  buildSegmentVideoFilter,
  smartEditOutputDimensions,
  type OutputDimensions,
} from "./smartEditVisualFilters.js";
import { stitchSegmentsWithTransitions } from "./smartEditVideoStitching.js";

export { smartEditOutputDimensions } from "./smartEditVisualFilters.js";

type CommandRunner = SmartEditCommandRunner;

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
    materializeUrl,
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
