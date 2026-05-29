import type { AssetMetadata } from "@shopclip/shared";

const numberFromMetadata = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

export interface MediaProbeResult {
  durationSeconds: number;
  format?: string;
  height?: number;
  width?: number;
}

export const probeAssetMedia = (asset: AssetMetadata): MediaProbeResult => ({
  durationSeconds: numberFromMetadata(asset.metadata, "durationSeconds") ?? (asset.type === "video" ? 9 : 1),
  format: asset.mimeType?.split("/").at(1),
  height: numberFromMetadata(asset.metadata, "height"),
  width: numberFromMetadata(asset.metadata, "width"),
});
