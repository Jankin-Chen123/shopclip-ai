import { extname } from "node:path";

import type { AssetMetadata, SmartEditSegment } from "@shopclip/shared";

export const isRemoteUrl = (url: string): boolean => /^https?:\/\//iu.test(url);

export const dataUrlMatch = (url: string) => /^data:([^;,]+)?(?:;[^,]*)?,(.*)$/iu.exec(url);

export const extensionForUrl = (url: string, fallback: string) => {
  const path = url.split("?")[0] ?? "";
  const extension = extname(path).toLowerCase();
  return extension || fallback;
};

export const assetForSegment = (
  segment: SmartEditSegment,
  assets: AssetMetadata[],
): AssetMetadata | undefined =>
  segment.source.assetId ? assets.find((asset) => asset.id === segment.source.assetId) : undefined;

export const sourceUrlForSegment = (
  segment: SmartEditSegment,
  assets: AssetMetadata[],
): string | undefined => {
  const asset = assetForSegment(segment, assets);
  return (
    segment.source.sceneClipVideoOnlyUrl ||
    segment.source.sceneClipUrl ||
    segment.source.imageUrl ||
    asset?.url
  );
};

export const isImageSourceForSegment = (
  segment: SmartEditSegment,
  asset: AssetMetadata | undefined,
  sourceUrl: string,
): boolean => {
  if (segment.source.sceneClipVideoOnlyUrl && sourceUrl === segment.source.sceneClipVideoOnlyUrl) {
    return false;
  }
  if (segment.source.sceneClipUrl && sourceUrl === segment.source.sceneClipUrl) {
    return false;
  }
  if (segment.source.imageUrl && sourceUrl === segment.source.imageUrl) {
    return true;
  }
  if (segment.source.kind === "image-asset" || segment.source.kind === "fallback-still") {
    return true;
  }
  return asset?.url === sourceUrl && asset.type === "image";
};
