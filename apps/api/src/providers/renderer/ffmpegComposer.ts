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

const escapeDrawtextPath = (path: string): string =>
  path.replace(/\\/gu, "/").replace(/'/gu, "\\'").replace(/:/gu, "\\:");

export const buildDrawtextFilter = (subtitleTextPath: string): string => {
  const escapedSubtitleTextPath = escapeDrawtextPath(subtitleTextPath);
  return [
    "drawtext=",
    `textfile='${escapedSubtitleTextPath}'`,
    "x=(w-text_w)/2",
    "y=h-text_h-96",
    "fontsize=42",
    "fontcolor=white",
    "borderw=3",
    "bordercolor=black@0.85",
    "box=1",
    "boxcolor=black@0.35",
    "boxborderw=18",
  ].join(":");
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
  subtitleTextPath: string,
  commandRunner: CommandRunner = runCommand,
) => {
  await commandRunner(command, [
    "-y",
    "-i",
    inputPath,
    "-vf",
    buildDrawtextFilter(subtitleTextPath),
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
    const subtitleTextPath = join(workdir, `subtitle-${index + 1}.txt`);
    await writeFile(subtitleTextPath, sortedClips[index]?.subtitle?.trim() ?? "", "utf8");
    await runFfmpegSubtitleOverlay(
      options.command ?? commandFromEnv(),
      inputPath,
      captionedPath,
      subtitleTextPath,
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
