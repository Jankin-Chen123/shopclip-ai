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
import { buildSubtitleAss, buildSubtitleFilter, formatFfmpegExitError } from "./ffmpegComposer.js";

type CommandRunner = (command: string, args: string[]) => Promise<void>;

interface ComposeSmartEditOptions {
  command?: string;
  fetchImpl?: typeof fetch;
  runCommand?: CommandRunner;
  storageProvider: StorageProvider;
  subtitlesEnabled?: boolean;
  ttsCommand?: string;
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
  return segment.source.sceneClipUrl || segment.source.imageUrl || asset?.url;
};

const buildScaleFilter = () =>
  "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30,format=yuv420p";

const escapeConcatPath = (path: string): string => path.replace(/\\/g, "/").replace(/'/g, "'\\''");

const normalizeDuration = (segment: SmartEditSegment): number =>
  Math.max(0.5, Math.min(15, segment.durationSeconds));

const containsReadableText = (text: string): boolean => /[\p{L}\p{N}]/u.test(text);

const isMostlyReplacementSymbols = (text: string): boolean => {
  const compact = text.replace(/\s/gu, "");
  if (!compact) {
    return true;
  }
  const symbolCount = [...compact].filter((character) => /[?�□■◇◆]+/u.test(character)).length;
  return symbolCount / compact.length >= 0.6;
};

export const subtitleTextForSegment = (segment: SmartEditSegment): string => {
  const subtitle = segment.subtitle.trim();
  if (subtitle && containsReadableText(subtitle) && !isMostlyReplacementSymbols(subtitle)) {
    return subtitle;
  }

  const voiceover = segment.voiceover.trim();
  if (voiceover && containsReadableText(voiceover) && !isMostlyReplacementSymbols(voiceover)) {
    return voiceover;
  }

  return subtitle || voiceover;
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
  workdir,
}: {
  assets: AssetMetadata[];
  command: string;
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
    segment.source.startSecond === undefined &&
    segment.source.endSecond === undefined
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
      buildScaleFilter(),
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
    args.push("-i", sourcePath, "-t", String(duration), "-vf", buildScaleFilter());
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
  if (!subtitlesEnabled || !subtitleText) {
    return rawOutputPath;
  }

  const subtitleAssPath = join(workdir, `${segment.id}.ass`);
  const captionedOutputPath = join(workdir, `${segment.id}-captioned.mp4`);
  await writeFile(subtitleAssPath, buildSubtitleAss(subtitleText), "utf8");
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
  for (const [index, segment] of enabledSegments.entries()) {
    const voiceText = segment.voiceover.trim() || segment.subtitle.trim();
    if (!voiceText) {
      continue;
    }
    const rawVoicePath = join(workdir, `voice-${index + 1}.wav`);
    const paddedVoicePath = join(workdir, `voice-${index + 1}-padded.wav`);
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
      `apad,atrim=0:${normalizeDuration(segment)}`,
      "-c:a",
      "pcm_s16le",
      paddedVoicePath,
    ]);
    paddedPaths.push(paddedVoicePath);
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

const addSyntheticBgm = async (
  command: string,
  inputPath: string,
  outputPath: string,
  plan: SmartEditPlan,
  run: CommandRunner,
  voiceoverTrackPath?: string,
) => {
  const hasBgm = plan.audio.bgmTrack !== "none";
  if (!hasBgm && !voiceoverTrackPath) {
    await run(command, ["-y", "-i", inputPath, "-c", "copy", outputPath]);
    return;
  }

  if (voiceoverTrackPath && !hasBgm) {
    await run(command, [
      "-y",
      "-i",
      inputPath,
      "-i",
      voiceoverTrackPath,
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

  if (voiceoverTrackPath) {
    await run(command, [
      "-y",
      "-i",
      inputPath,
      "-i",
      voiceoverTrackPath,
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=220:sample_rate=44100",
      "-filter_complex",
      "[1:a]volume=1.0[voice];[2:a]volume=0.045[bgm];[voice][bgm]amix=inputs=2:duration=first[aout]",
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
    return;
  }

  await run(command, [
    "-y",
    "-i",
    inputPath,
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:sample_rate=44100",
    "-filter_complex",
    "[1:a]volume=0.045[aout]",
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
  await concatSegments(
    command,
    segmentOutputs.map((segment) => segment.outputPath),
    workdir,
    stitchedPath,
    run,
  );
  const voiceoverTrackPath = await createVoiceoverTrack(command, ttsCommand, plan, workdir, run);
  await addSyntheticBgm(command, stitchedPath, outputPath, plan, run, voiceoverTrackPath);

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
