import type { AssetMetadata } from "@shopclip/shared";

import { resolveFfprobeCommand, runMediaCommand } from "./mediaTooling.js";

const numberFromMetadata = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const stringFromMetadata = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

export interface MediaProbeResult {
  durationSeconds: number;
  format?: string;
  height?: number;
  sourcePath?: string;
  width?: number;
}

const isUsableMediaInput = (value: string | undefined): value is string =>
  Boolean(value?.trim()) && !value!.startsWith("/api/");

const sourcePathForAsset = (asset: AssetMetadata): string | undefined => {
  const metadataPath = stringFromMetadata(asset.metadata, "localFilePath");
  if (metadataPath) {
    return metadataPath;
  }
  return isUsableMediaInput(asset.url) ? asset.url : undefined;
};

const parseProbeOutput = (asset: AssetMetadata, sourcePath: string, stdout: string): MediaProbeResult => {
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string; format_name?: string };
    streams?: Array<{ codec_type?: string; height?: number; width?: number }>;
  };
  const videoStream = parsed.streams?.find((stream) => stream.codec_type === "video");
  const duration = Number(parsed.format?.duration);
  return {
    durationSeconds:
      Number.isFinite(duration) && duration > 0
        ? duration
        : (numberFromMetadata(asset.metadata, "durationSeconds") ?? (asset.type === "video" ? 9 : 1)),
    format: parsed.format?.format_name ?? asset.mimeType?.split("/").at(1),
    height: videoStream?.height ?? numberFromMetadata(asset.metadata, "height"),
    sourcePath,
    width: videoStream?.width ?? numberFromMetadata(asset.metadata, "width"),
  };
};

export const probeAssetMedia = async (asset: AssetMetadata): Promise<MediaProbeResult> => {
  const sourcePath = sourcePathForAsset(asset);
  if (asset.type !== "video" || !sourcePath) {
    return {
      durationSeconds: numberFromMetadata(asset.metadata, "durationSeconds") ?? (asset.type === "video" ? 9 : 1),
      format: asset.mimeType?.split("/").at(1),
      height: numberFromMetadata(asset.metadata, "height"),
      sourcePath,
      width: numberFromMetadata(asset.metadata, "width"),
    };
  }

  const command = await resolveFfprobeCommand();
  const { stdout } = await runMediaCommand(command, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    sourcePath,
  ]);
  return parseProbeOutput(asset, sourcePath, stdout);
};
