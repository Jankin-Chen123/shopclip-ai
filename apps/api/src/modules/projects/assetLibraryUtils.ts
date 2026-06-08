import type { AssetMetadata } from "@shopclip/shared";

export const assetMatchesCategory = (asset: AssetMetadata, category: string): boolean => {
  const tags = asset.tags.map((tag) => tag.toLowerCase());

  if (category === "image") {
    return asset.type === "image";
  }

  if (category === "video") {
    return asset.type === "video";
  }

  if (category === "audio") {
    return asset.mimeType?.startsWith("audio/") === true || tags.includes("audio");
  }

  if (category === "script") {
    return (
      asset.mimeType === "text/plain" ||
      asset.mimeType === "text/markdown" ||
      tags.some((tag) => tag === "script" || tag === "copy")
    );
  }

  return true;
};

export const getAssetCategory = (value: unknown): string =>
  typeof value === "string" && value.trim() ? value.trim() : "all";

export const filterAssetLibrary = (
  library: { assets: AssetMetadata[]; assetSlices: { assetId: string }[] },
  category: string,
) => {
  const assets =
    category === "all"
      ? library.assets
      : library.assets.filter((asset) => assetMatchesCategory(asset, category));
  const assetIds = new Set(assets.map((asset) => asset.id));

  return {
    assets,
    assetSlices: library.assetSlices.filter((slice) => assetIds.has(slice.assetId)),
  };
};
