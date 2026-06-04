import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

import type { SceneRenderClip, SceneRenderClipMaterial } from "@shopclip/shared";

import type { StorageProvider } from "../storage/storageProvider.js";
import { formatFfmpegExitError } from "./ffmpegComposer.js";

type CommandRunner = (command: string, args: string[]) => Promise<void>;

interface MaterializeSceneClipOptions {
  command?: string;
  fetchImpl?: typeof fetch;
  runCommand?: CommandRunner;
  storageProvider: StorageProvider;
}

const commandFromEnv = () =>
  process.env.FFMPEG_PATH?.trim() || process.env.FFMPEG_BINARY?.trim() || "ffmpeg";

const materialExportDir = () =>
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
    throw new Error(`Failed to download scene clip material: HTTP ${response.status}.`);
  }
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return outputPath;
};

const extractVideoOnly = async (
  command: string,
  inputPath: string,
  outputPath: string,
  run: CommandRunner,
) => {
  try {
    await run(command, ["-y", "-i", inputPath, "-map", "0:v:0", "-an", "-c:v", "copy", outputPath]);
  } catch {
    await run(command, [
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
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
  }
};

const extractAudio = async (
  command: string,
  inputPath: string,
  outputPath: string,
  run: CommandRunner,
): Promise<boolean> => {
  try {
    await run(command, [
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:a:0?",
      "-vn",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      outputPath,
    ]);
    return true;
  } catch {
    return false;
  }
};

const materialKey = (
  projectId: string,
  renderTaskId: string,
  clip: SceneRenderClip,
  fileName: string,
) => `projects/${projectId}/render-tasks/${renderTaskId}/materials/scene-${clip.order}-${fileName}`;

export const materializeSceneClipForSmartEdit = async (
  projectId: string,
  renderTaskId: string,
  clip: SceneRenderClip,
  options: MaterializeSceneClipOptions,
): Promise<SceneRenderClip> => {
  if (!clip.videoUrl || clip.material?.status === "ready") {
    return clip;
  }

  const command = options.command ?? commandFromEnv();
  const fetchImpl = options.fetchImpl ?? fetch;
  const run = options.runCommand ?? runCommand;
  const workdir = join(materialExportDir(), projectId, "materials", renderTaskId, clip.sceneId);
  await mkdir(workdir, { recursive: true });

  try {
    const inputPath = await materializeUrl(
      clip.videoUrl,
      join(workdir, `source${extensionForUrl(clip.videoUrl, ".mp4")}`),
      fetchImpl,
    );
    const videoOnlyPath = join(workdir, "video-only.mp4");
    const audioPath = join(workdir, "audio.m4a");
    await extractVideoOnly(command, inputPath, videoOnlyPath, run);
    const hasAudio = await extractAudio(command, inputPath, audioPath, run);

    const videoUpload = await options.storageProvider.uploadObject({
      body: await readFile(videoOnlyPath),
      contentType: "video/mp4",
      objectKey: materialKey(projectId, renderTaskId, clip, "video-only.mp4"),
    });
    const audioUpload = hasAudio
      ? await options.storageProvider.uploadObject({
          body: await readFile(audioPath),
          contentType: "audio/mp4",
          objectKey: materialKey(projectId, renderTaskId, clip, "audio.m4a"),
        })
      : undefined;

    const material: SceneRenderClipMaterial = {
      audioObjectKey: audioUpload?.objectKey,
      audioUrl: audioUpload?.publicUrl,
      materializedAt: new Date().toISOString(),
      status: "ready",
      text: clip.subtitle,
      videoObjectKey: videoUpload.objectKey,
      videoOnlyUrl: videoUpload.publicUrl,
    };

    return {
      ...clip,
      material,
    };
  } catch (error) {
    return {
      ...clip,
      material: {
        errorMessage:
          error instanceof Error ? error.message : "Scene clip materialization failed.",
        materializedAt: new Date().toISOString(),
        status: "failed",
        text: clip.subtitle,
      },
    };
  }
};

export const materializeSceneClipsForSmartEdit = async (
  projectId: string,
  renderTaskId: string,
  clips: SceneRenderClip[] | undefined,
  options: MaterializeSceneClipOptions,
): Promise<SceneRenderClip[] | undefined> => {
  if (!clips || clips.length === 0) {
    return clips;
  }

  const materialized: SceneRenderClip[] = [];
  for (const clip of [...clips].sort((left, right) => left.order - right.order)) {
    materialized.push(await materializeSceneClipForSmartEdit(projectId, renderTaskId, clip, options));
  }
  return materialized;
};
