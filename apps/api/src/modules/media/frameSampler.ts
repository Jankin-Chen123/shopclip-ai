import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { AssetMetadata } from "@shopclip/shared";

import { mediaOutputDir, mediaOutputPublicBase } from "./mediaPaths.js";
import type { MediaProbeResult } from "./mediaProbe.js";
import { resolveFfmpegCommand, runMediaCommand } from "./mediaTooling.js";

export interface SampledFrame {
  contentType?: string;
  key: string;
  localPath?: string;
  second: number;
}

const baseKeyForAsset = (asset: AssetMetadata): string =>
  asset.objectKey ?? `mock/${asset.projectId ?? "global"}/${asset.id}/${asset.name}`;

export interface FrameSamplingOptions {
  outputDir?: string;
  publicBaseUrl?: string;
}

const secondsForDuration = (durationSeconds: number): number[] => {
  const duration = Math.max(1, Math.min(15, Math.ceil(durationSeconds)));
  const seconds = new Set<number>();
  for (let second = 0; second < duration; second += 3) {
    seconds.add(second);
  }
  seconds.add(Math.max(0, duration - 1));
  return [...seconds].sort((left, right) => left - right);
};

const sanitizeSegment = (value: string): string =>
  value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "asset";

export const sampleAssetFrames = async (
  asset: AssetMetadata,
  probe: MediaProbeResult,
  options: FrameSamplingOptions = {},
): Promise<SampledFrame[]> => {
  if (asset.type === "image") {
    return [
      {
        contentType: asset.mimeType,
        key: `${baseKeyForAsset(asset)}#image-frame`,
        localPath: probe.sourcePath,
        second: 0,
      },
    ];
  }

  if (!probe.sourcePath) {
    throw new Error(`Cannot sample real frames for asset ${asset.id}: no local file path or direct media URL.`);
  }

  const outputDir = options.outputDir ?? join(mediaOutputDir(), asset.id, "frames");
  const publicBaseUrl = options.publicBaseUrl ?? `${mediaOutputPublicBase()}/${encodeURIComponent(asset.id)}/frames`;
  await mkdir(outputDir, { recursive: true });
  const command = await resolveFfmpegCommand();
  const safeAssetId = sanitizeSegment(asset.id);

  const frames: SampledFrame[] = [];
  for (const second of secondsForDuration(probe.durationSeconds)) {
    const filename = `${safeAssetId}-frame-${String(second).replace(".", "-")}.jpg`;
    const localPath = join(outputDir, filename);
    await runMediaCommand(command, [
      "-y",
      "-ss",
      String(second),
      "-i",
      probe.sourcePath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      localPath,
    ]);
    frames.push({
      contentType: "image/jpeg",
      key: `${publicBaseUrl}/${encodeURIComponent(basename(localPath))}`,
      localPath,
      second,
    });
  }

  return frames;
};
