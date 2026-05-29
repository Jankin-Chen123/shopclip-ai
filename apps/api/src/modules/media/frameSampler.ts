import type { AssetMetadata } from "@shopclip/shared";

import type { MediaProbeResult } from "./mediaProbe.js";

export interface SampledFrame {
  key: string;
  second: number;
}

const baseKeyForAsset = (asset: AssetMetadata): string =>
  asset.objectKey ?? `mock/${asset.projectId ?? "global"}/${asset.id}/${asset.name}`;

export const sampleAssetFrames = (asset: AssetMetadata, probe: MediaProbeResult): SampledFrame[] => {
  if (asset.type === "image") {
    return [{ key: `${baseKeyForAsset(asset)}#image-frame`, second: 0 }];
  }

  const duration = Math.max(1, Math.min(15, Math.ceil(probe.durationSeconds)));
  const seconds = new Set<number>();
  for (let second = 0; second < duration; second += 3) {
    seconds.add(second);
  }
  seconds.add(Math.max(0, duration - 1));

  return [...seconds].sort((left, right) => left - right).map((second) => ({
    key: `${baseKeyForAsset(asset)}#frame-${second}`,
    second,
  }));
};
