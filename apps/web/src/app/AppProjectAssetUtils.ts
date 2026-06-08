import type { AssetMetadata } from "@shopclip/shared";

import type { AssetPrepSnapshot } from "../features/assets/AssetPrepPanel";

export const getCreationUsableAssets = (
  projectId: string | undefined,
  assets: AssetMetadata[],
): AssetMetadata[] => {
  const assetsById = new Map<string, AssetMetadata>();
  assets.forEach((asset) => {
    if (asset.projectId && asset.projectId !== projectId) {
      return;
    }
    assetsById.set(asset.id, asset);
  });
  return [...assetsById.values()];
};

const getReferenceIdFromScriptAsset = (asset: AssetMetadata): string | undefined => {
  if (!asset.metadata || typeof asset.metadata !== "object" || !("referenceId" in asset.metadata)) {
    return undefined;
  }
  return typeof asset.metadata.referenceId === "string" ? asset.metadata.referenceId : undefined;
};

export const getReferenceScriptAssets = (assets: AssetMetadata[]): AssetMetadata[] => {
  const assetsById = new Map<string, AssetMetadata>();
  assets.forEach((asset) => {
    const kind =
      asset.metadata && typeof asset.metadata === "object" && "kind" in asset.metadata
        ? asset.metadata.kind
        : undefined;
    if (
      kind === "reference_script_asset" &&
      asset.status === "ready" &&
      getReferenceIdFromScriptAsset(asset)
    ) {
      assetsById.set(asset.id, asset);
    }
  });
  return [...assetsById.values()];
};

type PreparedAssetBucketId = "hero" | "scene" | "demo" | "brand";

export const getPreparedAssetsByBucket = (
  assets: AssetMetadata[],
): Record<string, AssetMetadata[]> => {
  const preparedAssetsByBucket: Record<PreparedAssetBucketId, AssetMetadata[]> = {
    hero: [],
    scene: [],
    demo: [],
    brand: [],
  };

  assets.forEach((asset) => {
    if (asset.type === "image" || asset.mimeType?.startsWith("image/")) {
      const bucketId = preparedAssetsByBucket.hero.length === 0 ? "hero" : "scene";
      preparedAssetsByBucket[bucketId].push(asset);
      return;
    }

    if (asset.type === "video" || asset.mimeType?.startsWith("video/")) {
      preparedAssetsByBucket.demo.push(asset);
      return;
    }

    preparedAssetsByBucket.brand.push(asset);
  });

  return Object.fromEntries(
    Object.entries(preparedAssetsByBucket).filter(([, bucketAssets]) => bucketAssets.length > 0),
  );
};

export const createAssetPrepSnapshotFromProjectAssets = (
  assets: AssetMetadata[],
  keywords: string[] = [],
): AssetPrepSnapshot => {
  const preparedAssetsByBucket = getPreparedAssetsByBucket(assets);
  const materials = Object.entries(preparedAssetsByBucket).flatMap(([bucketId, bucketAssets]) =>
    bucketAssets.map((asset) => ({
      assetId: asset.id,
      bucketId,
      mimeType: asset.mimeType,
      name: asset.name,
      sizeBytes: asset.sizeBytes,
      source: "library" as const,
      tags: asset.tags,
      type: asset.type,
    })),
  );

  return {
    assetIds: materials.map((material) => material.assetId),
    keywords,
    materials,
  };
};

export const pruneAssetPrepSnapshotDeletedAssets = (
  snapshot: AssetPrepSnapshot,
  deletedAssetIds: Set<string>,
): AssetPrepSnapshot => ({
  ...snapshot,
  assetIds: snapshot.assetIds.filter((assetId) => !deletedAssetIds.has(assetId)),
  materials: snapshot.materials.filter(
    (material) => !material.assetId || !deletedAssetIds.has(material.assetId),
  ),
});
