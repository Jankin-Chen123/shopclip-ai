import { randomUUID } from "node:crypto";
import type { AssetMetadata, AssetProcessingJob, AssetUploadIntent } from "@shopclip/shared";

import { extractBrandDocumentText } from "../assets/documentText.js";
import { createAssetSlices } from "../assets/tagging.js";
import type {
  ConfirmAssetUploadRequest,
  CreateAssetUploadIntentRequest,
} from "../assets/validation.js";
import type {
  StorageProvider,
  StorageUploadObjectResult,
} from "../../providers/storage/storageProvider.js";
import { writeDownloadedAssetCache } from "./externalAssetImportUtils.js";
import {
  buildUploadIntentAssetDraft,
  buildUploadIntentProcessingJobDraft,
} from "./projectAssetUtils.js";
import type { ProjectStore } from "./projectStore.js";

export interface AssetUploadServiceDependencies {
  storageProvider: StorageProvider;
  store: ProjectStore;
}

export interface AssetUploadIntentResult {
  asset: AssetMetadata;
  upload: AssetUploadIntent;
  processingJob: AssetProcessingJob;
}

export type AssetUploadIntentQueueResult =
  | AssetUploadIntentResult
  | "asset-create-failed"
  | "processing-job-create-failed";

export const enqueueAssetUploadIntent = async ({
  asset,
  projectId,
  storageProvider,
  store,
}: AssetUploadServiceDependencies & {
  asset: CreateAssetUploadIntentRequest;
  projectId?: string;
}): Promise<AssetUploadIntentQueueResult> => {
  const assetId = randomUUID();
  const uploadIntent = storageProvider.createUploadIntent({
    projectId,
    assetId,
    asset,
  });

  const storedAsset = await store.addAssetWithId(
    projectId,
    assetId,
    buildUploadIntentAssetDraft(asset, uploadIntent),
    createAssetSlices,
  );
  if (!storedAsset) {
    return "asset-create-failed";
  }

  const processingJob = await store.addAssetProcessingJob(
    projectId,
    buildUploadIntentProcessingJobDraft(randomUUID(), storedAsset.id),
  );
  if (!processingJob) {
    return "processing-job-create-failed";
  }

  return {
    asset: storedAsset,
    upload: uploadIntent,
    processingJob,
  };
};

export interface ConfirmAssetUploadResult {
  asset: AssetMetadata;
  processingJob: AssetProcessingJob;
}

export const confirmAssetUpload = async ({
  assetId,
  confirmation,
  store,
}: {
  assetId: string;
  confirmation: ConfirmAssetUploadRequest;
  store: ProjectStore;
}): Promise<ConfirmAssetUploadResult | "asset-not-found" | "job-not-found"> => {
  const job = await store.getLatestAssetProcessingJob(assetId);
  if (!job) {
    return "job-not-found";
  }

  const confirmedAt = new Date().toISOString();
  const updatedAsset = await store.updateAsset(assetId, {
    status: "ready",
    objectKey: confirmation.objectKey,
    metadata: {
      ...(confirmation.metadata ?? {}),
      checksum: confirmation.checksum,
      uploadConfirmedAt: confirmedAt,
      structuredAssetVersion: "asset-multigranularity-v1",
      structureStatus: "pending_structure",
    },
  });
  if (!updatedAsset) {
    return "asset-not-found";
  }

  const processingJob = await store.updateAssetProcessingJob(job.id, {
    status: "ready",
    steps: [...job.steps, "metadata-ready"],
    message:
      "Upload confirmed. Asset metadata is ready for script generation and storyboard recall.",
  });
  if (!processingJob) {
    return "job-not-found";
  }

  return {
    asset: updatedAsset,
    processingJob,
  };
};

export interface ServerAssetUploadResult {
  asset: AssetMetadata;
  processingJob: AssetProcessingJob | undefined;
  storage: StorageUploadObjectResult;
}

export const uploadAssetThroughServer = async ({
  asset,
  body,
  contentType,
  storageProvider,
  store,
}: AssetUploadServiceDependencies & {
  asset: AssetMetadata;
  body: Buffer;
  contentType: string;
}): Promise<ServerAssetUploadResult | "asset-not-found"> => {
  if (!asset.objectKey) {
    throw new Error("Asset object key is required before server-side upload.");
  }

  const uploaded = await storageProvider.uploadObject({
    body,
    contentType,
    objectKey: asset.objectKey,
  });

  const job = await store.getLatestAssetProcessingJob(asset.id);
  const uploadedAt = new Date().toISOString();
  const localFilePath = await writeDownloadedAssetCache({
    assetId: asset.id,
    body,
    name: asset.name,
  });
  const documentText = await extractBrandDocumentText({
    body,
    mimeType: contentType,
    name: asset.name,
  });
  const documentTextMetadata =
    documentText.status === "unsupported"
      ? {}
      : {
          documentTextCharacterCount: documentText.characterCount,
          documentTextExtractedAt: uploadedAt,
          documentTextKind: documentText.kind,
          documentTextStatus: documentText.status,
          ...(documentText.errorMessage ? { documentTextError: documentText.errorMessage } : {}),
        };

  const updatedAsset = await store.updateAsset(asset.id, {
    status: "ready",
    url: uploaded.publicUrl,
    ...(documentText.status === "extracted" && documentText.text
      ? { embeddingText: documentText.text }
      : {}),
    metadata: {
      proxiedUpload: true,
      localFilePath,
      uploadedBytes: body.length,
      uploadConfirmedAt: uploadedAt,
      structuredAssetVersion: "asset-multigranularity-v1",
      structureStatus:
        asset.type === "image" || asset.type === "video" ? "pending_structure" : "metadata_ready",
      ...documentTextMetadata,
    },
  });
  if (!updatedAsset) {
    return "asset-not-found";
  }

  const processingJob = job
    ? await store.updateAssetProcessingJob(job.id, {
        status: "ready",
        steps: [
          ...job.steps,
          "server-proxy-upload",
          ...(documentText.status === "extracted" ? ["document-text-extracted"] : []),
          "metadata-ready",
        ],
        message:
          documentText.status === "extracted"
            ? "Asset uploaded through the API server. Document text is ready for script generation and storyboard recall."
            : "Asset uploaded through the API server. Metadata is ready for script generation and storyboard recall.",
      })
    : undefined;

  return {
    asset: updatedAsset,
    processingJob,
    storage: uploaded,
  };
};
