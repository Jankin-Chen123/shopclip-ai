import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import type { SceneRenderClip } from "@shopclip/shared";

const commandFromEnv = () =>
  process.env.FFMPEG_PATH?.trim() || process.env.FFMPEG_BINARY?.trim() || "ffmpeg";
export const renderExportDir = () =>
  process.env.RENDER_EXPORT_DIR?.trim() || join(tmpdir(), "shopclip-ai-render-exports");

type CommandRunner = (command: string, args: string[]) => Promise<void>;

interface ComposeSceneClipsOptions {
  command?: string;
  fetchImpl?: typeof fetch;
  runCommand?: CommandRunner;
}

export const formatFfmpegExitError = (
  code: number | null,
  signal: NodeJS.Signals | null,
  stderr: string,
): Error => {
  const exit = code === null ? `signal ${signal ?? "unknown"}` : `code ${code}`;
  const clippedStderr =
    stderr.length > 2400 ? `${stderr.slice(0, 800)}\n...\n${stderr.slice(-1600)}` : stderr;
  return new Error(`ffmpeg exited with ${exit}. ${clippedStderr}`);
};

const runCommand: CommandRunner = (command: string, args: string[]) =>
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

const escapeConcatPath = (path: string): string => path.replace(/\\/g, "/").replace(/'/g, "'\\''");

const escapeFilterPath = (path: string): string =>
  path.replace(/\\/gu, "/").replace(/'/gu, "\\'").replace(/:/gu, "\\:");

const escapeAssText = (text: string): string =>
  text
    .replace(/\r?\n/gu, "\\N")
    .replace(/[{}]/gu, "")
    .trim();

const cssHexColorToAss = (color: string | undefined): string => {
  const normalized = color?.trim().match(/^#([0-9a-fA-F]{6})$/u)?.[1];
  if (!normalized) {
    return "&H00FFFFFF";
  }
  const red = normalized.slice(0, 2);
  const green = normalized.slice(2, 4);
  const blue = normalized.slice(4, 6);
  return `&H00${blue}${green}${red}`.toUpperCase();
};

const subtitleFontFamily = (): string =>
  process.env.FFMPEG_SUBTITLE_FONT_FAMILY?.trim() ||
  process.env.RENDER_SUBTITLE_FONT_FAMILY?.trim() ||
  "Noto Sans CJK SC";

const subtitleFontsDir = (): string | undefined =>
  process.env.FFMPEG_SUBTITLE_FONTS_DIR?.trim() || process.env.RENDER_SUBTITLE_FONTS_DIR?.trim() || undefined;

export const buildSubtitleFilter = (subtitleAssPath: string): string => {
  const fontsDir = subtitleFontsDir();
  const options = [
    `filename='${escapeFilterPath(subtitleAssPath)}'`,
    ...(fontsDir ? [`fontsdir='${escapeFilterPath(fontsDir)}'`] : []),
  ].join(":");
  return `ass=${options}`;
};

export const buildSubtitleAss = (
  subtitle: string,
  options: {
    color?: string;
    endSecond?: number;
    fontSize?: number;
    height?: number;
    marginV?: number;
    startSecond?: number;
    width?: number;
  } = {},
): string => {
  const escapedSubtitle = escapeAssText(subtitle);
  const width = options.width ?? 720;
  const height = options.height ?? 1280;
  const fontSize = options.fontSize ?? 42;
  const marginV = options.marginV ?? 96;
  const startSecond = Math.max(0, options.startSecond ?? 0);
  const endSecond = Math.max(startSecond + 0.01, options.endSecond ?? 35999.99);
  const formatAssTime = (seconds: number): string => {
    const bounded = Math.max(0, seconds);
    const hours = Math.floor(bounded / 3600);
    const minutes = Math.floor((bounded - hours * 3600) / 60);
    const remainingSeconds = bounded - hours * 3600 - minutes * 60;
    return `${hours}:${String(minutes).padStart(2, "0")}:${remainingSeconds.toFixed(2).padStart(5, "0")}`;
  };
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    `Style: Default,${subtitleFontFamily()},${fontSize},${cssHexColorToAss(options.color)},&H000000FF,&HDD000000,&H99000000,0,0,0,0,100,100,0,0,3,3,0,2,48,48,${marginV},0`,
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    `Dialogue: 0,${formatAssTime(startSecond)},${formatAssTime(endSecond)},Default,,0,0,0,,${escapedSubtitle}`,
    "",
  ].join("\n");
};

export const materializeSceneClipInputs = async (
  videoUrls: string[],
  workdir: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> =>
  Promise.all(
    videoUrls.map(async (url, index) => {
      if (!isRemoteUrl(url)) {
        return url;
      }

      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`Failed to download scene clip ${index + 1}: HTTP ${response.status}.`);
      }

      const clipPath = join(workdir, `scene-${index + 1}.mp4`);
      await writeFile(clipPath, Buffer.from(await response.arrayBuffer()));
      return clipPath;
    }),
  );

const runFfmpegConcat = async (
  command: string,
  concatListPath: string,
  outputPath: string,
  commandRunner: CommandRunner = runCommand,
) => {
  const baseArgs = ["-y", "-f", "concat", "-safe", "0", "-i", concatListPath];

  try {
    await commandRunner(command, [...baseArgs, "-c", "copy", outputPath]);
    return;
  } catch (copyError) {
    await commandRunner(command, [
      ...baseArgs,
      "-c:v",
      "mpeg4",
      "-q:v",
      "4",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outputPath,
    ]).catch((transcodeError) => {
      const copyMessage = copyError instanceof Error ? copyError.message : String(copyError);
      const transcodeMessage =
        transcodeError instanceof Error ? transcodeError.message : String(transcodeError);
      throw new Error(
        `ffmpeg concat failed. Stream copy error: ${copyMessage} Transcode retry error: ${transcodeMessage}`,
      );
    });
  }
};

const runFfmpegSubtitleOverlay = async (
  command: string,
  inputPath: string,
  outputPath: string,
  subtitleAssPath: string,
  commandRunner: CommandRunner = runCommand,
) => {
  await commandRunner(command, [
    "-y",
    "-i",
    inputPath,
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
    outputPath,
  ]);
};

export interface LocalSceneClipExport {
  exportId: string;
  localUrl: string;
  outputPath: string;
}

export const composeSceneClipsToLocalFile = async (
  projectId: string,
  clips: SceneRenderClip[],
  options: ComposeSceneClipsOptions = {},
): Promise<LocalSceneClipExport | undefined> => {
  const sortedClips = [...clips]
    .sort((left, right) => left.order - right.order)
    .filter((clip): clip is SceneRenderClip & { videoUrl: string } => Boolean(clip.videoUrl));
  if (sortedClips.length === 0) {
    return undefined;
  }

  const exportId = randomUUID();
  const workdir = join(renderExportDir(), projectId, exportId);
  await mkdir(workdir, { recursive: true });
  const concatListPath = join(workdir, "clips.txt");
  const outputPath = join(workdir, "export.mp4");
  const inputPaths = await materializeSceneClipInputs(
    sortedClips.map((clip) => clip.videoUrl),
    workdir,
    options.fetchImpl ?? fetch,
  );
  const captionedPaths: string[] = [];
  for (const [index, inputPath] of inputPaths.entries()) {
    const captionedPath = join(workdir, `captioned-${index + 1}.mp4`);
    const subtitleAssPath = join(workdir, `subtitle-${index + 1}.ass`);
    await writeFile(subtitleAssPath, buildSubtitleAss(sortedClips[index]?.subtitle ?? ""), "utf8");
    await runFfmpegSubtitleOverlay(
      options.command ?? commandFromEnv(),
      inputPath,
      captionedPath,
      subtitleAssPath,
      options.runCommand ?? runCommand,
    );
    captionedPaths.push(captionedPath);
  }
  await writeFile(
    concatListPath,
    captionedPaths.map((url) => `file '${escapeConcatPath(url)}'`).join("\n"),
    "utf8",
  );

  await runFfmpegConcat(
    options.command ?? commandFromEnv(),
    concatListPath,
    outputPath,
    options.runCommand ?? runCommand,
  );
  return {
    exportId,
    localUrl: `/api/render-exports/${encodeURIComponent(projectId)}/${encodeURIComponent(exportId)}/export.mp4`,
    outputPath,
  };
};

export const composeSceneClipsWithFfmpeg = async (
  projectId: string,
  clips: SceneRenderClip[],
): Promise<string | undefined> => {
  const localExport = await composeSceneClipsToLocalFile(projectId, clips);
  return localExport?.localUrl;
};
