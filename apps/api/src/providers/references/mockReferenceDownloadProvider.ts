import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReferenceDownloadProvider } from "./referenceDownloadProvider.js";

const require = createRequire(import.meta.url);
const ffmpegPath = (require("@ffmpeg-installer/ffmpeg") as { path: string }).path;

const slugFromText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "public-reference-video";

const createFixtureVideo = async (slug: string): Promise<{ path: string; sizeBytes: number }> => {
  const directory = join(tmpdir(), "shopclip-ai-reference-fixtures");
  await mkdir(directory, { recursive: true });
  const videoPath = join(directory, `${slug}-${randomUUID()}.mp4`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x180:rate=10",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:duration=6",
        "-t",
        "6",
        "-c:v",
        "mpeg4",
        "-q:v",
        "5",
        "-c:a",
        "aac",
        videoPath,
      ],
      { windowsHide: true },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Mock reference fixture generation failed with ${code}: ${stderr.slice(0, 800)}`));
    });
  });

  return {
    path: videoPath,
    sizeBytes: (await stat(videoPath)).size,
  };
};

export const createMockReferenceDownloadProvider = (): ReferenceDownloadProvider => ({
  downloadReference: async ({ reference }) => {
    const slug = slugFromText(reference.title || reference.sourceUrl);
    const sourceUrl = reference.sourceUrl;
    const fixture = await createFixtureVideo(slug);
    return {
      durationSeconds: 6,
      height: 180,
      mimeType: "video/mp4",
      name: `${slug}.mp4`,
      localFilePath: fixture.path,
      publicAnalysisUrl: fixture.path,
      sizeBytes: fixture.sizeBytes,
      sourceUrl,
      width: 320,
    };
  },
});
