import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import type { SceneRenderClip } from "@shopclip/shared";

const commandFromEnv = () => process.env.FFMPEG_PATH?.trim() || process.env.FFMPEG_BINARY?.trim() || "ffmpeg";
export const renderExportDir = () =>
  process.env.RENDER_EXPORT_DIR?.trim() || join(tmpdir(), "shopclip-ai-render-exports");

export const formatFfmpegExitError = (
  code: number | null,
  signal: NodeJS.Signals | null,
  stderr: string,
): Error => {
  const exit = code === null ? `signal ${signal ?? "unknown"}` : `code ${code}`;
  return new Error(`ffmpeg exited with ${exit}. ${stderr.slice(0, 1200)}`);
};

const runCommand = (command: string, args: string[]) =>
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

const escapeConcatPath = (path: string): string =>
  path.replace(/\\/g, "/").replace(/'/g, "'\\''");

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
) => {
  const baseArgs = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
  ];

  try {
    await runCommand(command, [...baseArgs, "-c", "copy", outputPath]);
    return;
  } catch (copyError) {
    await runCommand(command, [
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

export const composeSceneClipsWithFfmpeg = async (
  projectId: string,
  clips: SceneRenderClip[],
): Promise<string | undefined> => {
  const videoUrls = clips
    .sort((left, right) => left.order - right.order)
    .map((clip) => clip.videoUrl)
    .filter((url): url is string => Boolean(url));
  if (videoUrls.length <= 1) {
    return videoUrls[0];
  }

  const exportId = randomUUID();
  const workdir = join(renderExportDir(), projectId, exportId);
  await mkdir(workdir, { recursive: true });
  const concatListPath = join(workdir, "clips.txt");
  const outputPath = join(workdir, "export.mp4");
  const inputPaths = await materializeSceneClipInputs(videoUrls, workdir);
  await writeFile(
    concatListPath,
    inputPaths.map((url) => `file '${escapeConcatPath(url)}'`).join("\n"),
    "utf8",
  );

  await runFfmpegConcat(commandFromEnv(), concatListPath, outputPath);
  return `/api/render-exports/${encodeURIComponent(projectId)}/${encodeURIComponent(exportId)}/export.mp4`;
};
