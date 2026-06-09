import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SmartEditPlan } from "@shopclip/shared";

import {
  atempoFilter,
  audioFadeFilters,
  audioVolumeFilter,
  smartEditBgmProfile,
} from "./smartEditAudioFilters.js";
import {
  globalTimelineDurationSeconds,
  hasOverlappingSourceAudioClips,
  safeFileToken,
  sourceAudioTimelineClips,
  type SourceAudioTimelineClip,
} from "./smartEditSourceAudioPlan.js";
import { voiceoverTimelineClips } from "./smartEditVoiceoverPlan.js";

export type SmartEditCommandRunner = (command: string, args: string[]) => Promise<void>;

type SmartEditUrlMaterializer = (
  url: string,
  outputPath: string,
  fetchImpl: typeof fetch,
) => Promise<string>;

const escapeConcatPath = (path: string): string => path.replace(/\\/g, "/").replace(/'/g, "'\\''");

export const voiceForLanguage = (language: string | undefined): string => {
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

const createSilenceAudioSegment = async (
  command: string,
  durationSeconds: number,
  outputPath: string,
  run: SmartEditCommandRunner,
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
  run: SmartEditCommandRunner,
  materializeUrl: SmartEditUrlMaterializer,
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

export const createSourceAudioTrack = async (
  command: string,
  plan: SmartEditPlan,
  workdir: string,
  fetchImpl: typeof fetch,
  run: SmartEditCommandRunner,
  materializeUrl: SmartEditUrlMaterializer,
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
      materializeUrl,
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

export const createVoiceoverTrack = async (
  command: string,
  ttsCommand: string,
  plan: SmartEditPlan,
  workdir: string,
  run: SmartEditCommandRunner,
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

export const addAudioTracks = async (
  command: string,
  inputPath: string,
  outputPath: string,
  plan: SmartEditPlan,
  run: SmartEditCommandRunner,
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

  const args = ["-y", "-i", inputPath];
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
