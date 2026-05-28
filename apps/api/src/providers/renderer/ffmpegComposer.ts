import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import type { SceneRenderClip } from "@shopclip/shared";

const commandFromEnv = () => process.env.FFMPEG_PATH?.trim() || process.env.FFMPEG_BINARY?.trim() || "ffmpeg";
export const renderExportDir = () =>
  process.env.RENDER_EXPORT_DIR?.trim() || join(tmpdir(), "shopclip-ai-render-exports");

const runCommand = (command: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${code}. ${stderr.slice(0, 400)}`));
    });
  });

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
  await writeFile(
    concatListPath,
    videoUrls.map((url) => `file '${url.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8",
  );

  await runCommand(commandFromEnv(), [
    "-y",
    "-protocol_whitelist",
    "file,http,https,tcp,tls,crypto",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c",
    "copy",
    outputPath,
  ]);
  return `/api/render-exports/${encodeURIComponent(projectId)}/${encodeURIComponent(exportId)}/export.mp4`;
};
