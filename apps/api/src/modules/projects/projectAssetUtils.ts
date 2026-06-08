import type { AssetMetadata, AssetProcessingJob, AssetUploadIntent } from "@shopclip/shared";

import { inferAssetTags } from "../assets/tagging.js";
import type { CreateAssetUploadIntentRequest } from "../assets/validation.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";

export type AssetDraft = Omit<
  AssetMetadata,
  "id" | "projectId" | "createdAt" | "updatedAt"
>;

export type AssetProcessingJobDraft = Omit<AssetProcessingJob, "createdAt">;

export const collectStorageObjectKeys = (assets: AssetMetadata[]): Set<string> => {
  const objectKeys = new Set<string>();
  assets.forEach((asset) => {
    if (asset.objectKey) {
      objectKeys.add(asset.objectKey);
    }
    if (asset.thumbnailKey) {
      objectKeys.add(asset.thumbnailKey);
    }
  });
  return objectKeys;
};

export const deleteStoredAssetObjects = async (
  storageProvider: StorageProvider,
  assets: AssetMetadata[],
): Promise<void> => {
  const objectKeys = collectStorageObjectKeys(assets);
  await Promise.all(
    [...objectKeys].map((objectKey) =>
      storageProvider.deleteObject({
        objectKey,
      }),
    ),
  );
};

export const canUseAssetInProject = (asset: AssetMetadata, projectId: string): boolean =>
  !asset.projectId || asset.projectId === projectId;

export const isLocalRenderExportUrl = (url: string | undefined): boolean =>
  url?.startsWith("/api/render-exports/") ?? false;

export const buildUploadIntentAssetDraft = (
  asset: CreateAssetUploadIntentRequest,
  uploadIntent: AssetUploadIntent,
): AssetDraft => ({
  type: asset.type,
  status: "uploaded",
  url: uploadIntent.publicUrl,
  name: asset.name,
  mimeType: asset.mimeType,
  sizeBytes: asset.sizeBytes,
  source: asset.source ?? "merchant_upload",
  storageProvider: uploadIntent.provider,
  objectKey: uploadIntent.objectKey,
  embeddingText: asset.embeddingText ?? `${asset.name} ${(asset.tags ?? []).join(" ")}`,
  metadata: {
    ...(asset.metadata ?? {}),
    bucket: uploadIntent.bucket,
    region: uploadIntent.region,
    checksum: asset.checksum,
    structuredAssetVersion: "asset-multigranularity-v1",
  },
  tags: inferAssetTags({
    ...asset,
    source: asset.source ?? "merchant_upload",
    storageProvider: uploadIntent.provider,
  }),
});

export const buildUploadIntentProcessingJobDraft = (
  id: string,
  assetId: string,
): AssetProcessingJobDraft => ({
  id,
  assetId,
  status: "processing",
  steps: ["upload", "multimodal-understanding", "slice-indexing"],
  message:
    "Upload intent created. Structured metadata generation can run after the object is uploaded.",
});
