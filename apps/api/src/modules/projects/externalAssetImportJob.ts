import { randomUUID } from "node:crypto";
import type { AssetMetadata, AssetProcessingJob, AssetUploadIntent, ExternalAssetResult } from "@shopclip/shared";

import { processAssetStructure } from "../assets/assetProcessingService.js";
import { createAssetSlices } from "../assets/tagging.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import {
  assetTypeForExternalAsset,
  buildExternalImportMetadata,
  buildExternalImportTags,
  contentTypeForExternalAsset,
  externalAssetTypeTag,
  fileNameForExternalImport,
  mimeTypeForExternalAsset,
  writeDownloadedAssetCache,
  type ExternalAssetDownloader,
} from "./externalAssetImportUtils.js";
import type { ProjectStore } from "./projectStore.js";

export interface ExternalAssetImportJobDependencies {
  externalAssetDownloader: ExternalAssetDownloader;
  storageProvider: StorageProvider;
  store: ProjectStore;
}

const runExternalAssetImportJob = async ({
  assetId,
  externalAsset,
  externalAssetDownloader,
  jobId,
  projectId,
  storageProvider,
  store,
}: ExternalAssetImportJobDependencies & {
  assetId: string;
  externalAsset: ExternalAssetResult;
  jobId: string;
  projectId: string | undefined;
}): Promise<void> => {
  try {
    await store.updateAssetProcessingJob(jobId, {
      status: "processing",
      steps: ["queued", "external-download"],
      message: "Downloading the selected third-party asset before COS upload.",
    });

    const downloaded = await externalAssetDownloader(externalAsset);
    const contentType = contentTypeForExternalAsset(externalAsset.type, downloaded.contentType);
    const assetType = assetTypeForExternalAsset(externalAsset.type);
    const sizeBytes = downloaded.body.length;
    const uploadIntent: AssetUploadIntent = storageProvider.createUploadIntent({
      projectId,
      assetId,
      asset: {
        type: assetType,
        name: fileNameForExternalImport(externalAsset.title, contentType),
        mimeType: contentType,
        sizeBytes,
        source: "external_provider",
        tags: [...externalAsset.tags, externalAssetTypeTag(externalAsset.type), "external"],
      },
    });

    await store.updateAssetProcessingJob(jobId, {
      status: "processing",
      steps: ["queued", "external-download", "cos-upload"],
      message: "Uploading the downloaded third-party asset into Tencent COS.",
    });

    const uploaded = await storageProvider.uploadObject({
      body: downloaded.body,
      contentType,
      objectKey: uploadIntent.objectKey,
    });
    const sourceUrl = downloaded.sourceUrl || externalAsset.downloadUrl || externalAsset.previewUrl;
    const importedFileName = fileNameForExternalImport(externalAsset.title, contentType);
    const localFilePath = await writeDownloadedAssetCache({
      assetId,
      body: downloaded.body,
      name: importedFileName,
    });

    await store.updateAsset(assetId, {
      status: "ready",
      url: uploaded.publicUrl,
      mimeType: contentType,
      sizeBytes,
      source: "external_provider",
      storageProvider: uploaded.provider,
      objectKey: uploaded.objectKey,
      embeddingText: `${externalAsset.title} ${externalAsset.tags.join(" ")}`,
      metadata: buildExternalImportMetadata(externalAsset, {
        bucket: uploadIntent.bucket,
        region: uploadIntent.region,
        downloadedFromUrl: sourceUrl,
        downloadedBytes: sizeBytes,
        localFilePath,
        importedAt: new Date().toISOString(),
      }),
      tags: buildExternalImportTags(externalAsset, contentType, uploaded.provider),
    });

    let structureErrorMessage: string | undefined;
    if (assetType === "image" || assetType === "video") {
      await store.updateAssetProcessingJob(jobId, {
        status: "processing",
        steps: ["queued", "external-download", "cos-upload", "multigranularity-structure"],
        message: "Generating structured asset metadata and slice index from the imported asset.",
      });
      try {
        await processAssetStructure({
          assetId,
          input: { forceRegenerate: true, mode: "full" },
          store,
          storageProvider,
        });
      } catch (error) {
        structureErrorMessage =
          error instanceof Error ? error.message : "External asset structure generation failed.";
        console.warn("[external-asset-import] structure generation failed after import.", {
          assetId,
          error: structureErrorMessage,
          projectId,
          source: externalAsset.source,
        });
        await store.updateAsset(assetId, {
          metadata: {
            externalStructureError: structureErrorMessage,
            externalStructureFailedAt: new Date().toISOString(),
            structuredAssetStatus: "failed",
          },
        });
      }
    }

    await store.updateAssetProcessingJob(jobId, {
      status: "ready",
      steps: [
        "queued",
        "external-download",
        "cos-upload",
        ...(assetType === "image" || assetType === "video"
          ? [
              structureErrorMessage
                ? "multigranularity-structure-failed"
                : "multigranularity-structure",
            ]
          : []),
        "metadata-ready",
      ],
      message:
        structureErrorMessage
          ? `External asset imported into Tencent COS, but structured metadata generation failed: ${structureErrorMessage}`
          : assetType === "image" || assetType === "video"
          ? "External asset imported into Tencent COS and structured metadata persisted."
          : "External asset imported into Tencent COS and metadata persisted.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "External asset import failed.";
    await store.updateAsset(assetId, {
      status: "failed",
      metadata: {
        externalImportError: message,
        failedAt: new Date().toISOString(),
      },
    });
    await store.updateAssetProcessingJob(jobId, {
      status: "failed",
      steps: ["queued", "external-download", "cos-upload"],
      message,
    });
  }
};

export const enqueueExternalAssetImport = async (
  projectId: string | undefined,
  externalAsset: ExternalAssetResult,
  dependencies: ExternalAssetImportJobDependencies,
): Promise<{ asset: AssetMetadata; processingJob: AssetProcessingJob } | undefined> => {
  const assetId = randomUUID();
  const contentType = mimeTypeForExternalAsset(externalAsset.type);
  const storedAsset = await dependencies.store.addAssetWithId(
    projectId,
    assetId,
    {
      type: assetTypeForExternalAsset(externalAsset.type),
      status: "processing",
      url: externalAsset.previewUrl,
      name: externalAsset.title,
      mimeType: contentType,
      source: "external_provider",
      embeddingText: `${externalAsset.title} ${externalAsset.tags.join(" ")}`,
      metadata: buildExternalImportMetadata(externalAsset, {
        queuedAt: new Date().toISOString(),
      }),
      tags: buildExternalImportTags(externalAsset, contentType),
    },
    createAssetSlices,
  );
  if (!storedAsset) {
    return undefined;
  }

  const processingJob = await dependencies.store.addAssetProcessingJob(projectId, {
    id: randomUUID(),
    assetId,
    status: "processing",
    steps: ["queued", "external-download", "cos-upload", "metadata-ready"],
    message:
      "External asset import queued. Download, Tencent COS upload, and metadata persistence will continue in the background.",
  });
  if (!processingJob) {
    return undefined;
  }

  void runExternalAssetImportJob({
    ...dependencies,
    assetId,
    externalAsset,
    jobId: processingJob.id,
    projectId,
  });

  return { asset: storedAsset, processingJob };
};
