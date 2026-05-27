import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export interface VideoReferenceFrame {
  frameId: string;
  imageUrl: string;
  purpose: "cover" | "product-closeup" | "usage-scene";
  timestampSeconds: number;
}

export interface VideoFrameExtractionInput {
  assetId: string;
  maxFrames?: number;
  videoUrl: string;
}

export type VideoFrameExtractor = (
  input: VideoFrameExtractionInput,
) => Promise<VideoReferenceFrame[]>;

const defaultFrameTimestamps = [0.5, 2, 4];

const sanitizeSegment = (value: string): string =>
  value
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase();

const framePurposeForIndex = (index: number): VideoReferenceFrame["purpose"] =>
  index === 0 ? "cover" : index === 1 ? "product-closeup" : "usage-scene";

const runFfmpeg = (args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH?.trim() || "ffmpeg", args, {
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${code}.`));
    });
  });

export const extractVideoReferenceFrames: VideoFrameExtractor = async ({
  assetId,
  maxFrames = 3,
  videoUrl,
}) => {
  const outputDir = process.env.VIDEO_FRAME_OUTPUT_DIR?.trim();
  const publicBaseUrl = process.env.VIDEO_FRAME_PUBLIC_BASE_URL?.trim()?.replace(/\/$/, "");
  if (!outputDir || !publicBaseUrl) {
    return [];
  }

  await mkdir(outputDir, { recursive: true });
  const frameCount = Math.max(1, Math.min(maxFrames, defaultFrameTimestamps.length));
  const safeAssetId = sanitizeSegment(assetId) || "asset";
  const frames: VideoReferenceFrame[] = [];

  for (let index = 0; index < frameCount; index += 1) {
    const timestampSeconds = defaultFrameTimestamps[index] ?? 0.5;
    const frameId = `${safeAssetId}-frame-${index + 1}`;
    const filename = `${frameId}.jpg`;
    const outputPath = path.join(outputDir, filename);
    await runFfmpeg([
      "-y",
      "-ss",
      String(timestampSeconds),
      "-i",
      videoUrl,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outputPath,
    ]);
    frames.push({
      frameId,
      imageUrl: `${publicBaseUrl}/${encodeURIComponent(filename)}`,
      purpose: framePurposeForIndex(index),
      timestampSeconds,
    });
  }

  return frames;
};
