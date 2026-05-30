import { randomUUID } from "node:crypto";
import type { AssetMetadata, AssetSlice, ReferenceVideo } from "@shopclip/shared";

import { processAssetStructure } from "../assets/assetProcessingService.js";
import type { ProjectStore } from "../projects/projectStore.js";
import { createArkViralBreakdownProvider } from "../../providers/references/arkViralBreakdownProvider.js";
import { createReferenceDownloadProviderFromEnv } from "../../providers/references/referenceDownloadProviderFactory.js";
import type { ReferenceDownloadProvider } from "../../providers/references/referenceDownloadProvider.js";
import type { ViralBreakdownProvider } from "../../providers/references/viralBreakdownProvider.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import { createArkVisionUnderstandingProvider } from "../../providers/vision/arkVisionUnderstandingProvider.js";
import type { VisionUnderstandingProvider } from "../../providers/vision/visionUnderstandingProvider.js";

const referenceTags = (reference: Pick<ReferenceVideo, "category" | "sourcePlatform" | "title">): string[] =>
  [
    "public-reference",
    "reference",
    "viral",
    reference.category,
    reference.sourcePlatform,
    ...reference.title
      .split(/[\s#，,。!！?？]+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 8),
  ];

const uniqueTags = (tags: string[]): string[] => [...new Set(tags.filter(Boolean))];

const listAssetSlices = async (store: ProjectStore, assetId: string): Promise<AssetSlice[]> =>
  (await store.listAssets()).assetSlices.filter((slice) => slice.assetId === assetId);

const structuredContextForAsset = async (
  store: ProjectStore,
  sourceAsset: AssetMetadata | undefined,
) => {
  if (!sourceAsset) {
    return undefined;
  }

  return {
    sourceAsset,
    sourceSlices: await listAssetSlices(store, sourceAsset.id),
  };
};

const ingestPublicReferenceAsset = async ({
  projectId,
  reference,
  referenceDownloader,
  storageProvider,
  store,
}: {
  projectId?: string;
  reference: Omit<ReferenceVideo, "id" | "projectId" | "analysis" | "createdAt" | "updatedAt">;
  referenceDownloader: ReferenceDownloadProvider;
  storageProvider?: StorageProvider;
  store: ProjectStore;
}): Promise<AssetMetadata | undefined> => {
  const downloaded = await referenceDownloader.downloadReference({ reference });
  const assetId = randomUUID();
  let objectKey: string | undefined;
  let storageProviderName: AssetMetadata["storageProvider"] | undefined;
  let url = downloaded.publicAnalysisUrl;
  if (downloaded.body && storageProvider) {
    const uploadIntent = storageProvider.createUploadIntent({
      projectId,
      assetId,
      asset: {
        type: "video",
        name: downloaded.name,
        mimeType: downloaded.mimeType,
        sizeBytes: downloaded.sizeBytes,
        tags: uniqueTags(referenceTags(reference)),
      },
    });
    const uploaded = await storageProvider.uploadObject({
      body: downloaded.body,
      contentType: downloaded.mimeType,
      objectKey: uploadIntent.objectKey,
    });
    objectKey = uploaded.objectKey;
    storageProviderName = uploaded.provider;
    url = uploaded.publicUrl;
  }

  return store.addAssetWithId(projectId, assetId, {
    objectKey,
    type: "video",
    status: "uploaded",
    source: "public_reference",
    storageProvider: storageProviderName,
    url,
    name: downloaded.name,
    mimeType: downloaded.mimeType,
    sizeBytes: downloaded.sizeBytes,
    tags: uniqueTags(referenceTags(reference)),
    embeddingText: `${reference.title} ${reference.category} ${reference.sourcePlatform} viral blender demo public reference`,
    metadata: {
      durationSeconds: downloaded.durationSeconds,
      height: downloaded.height,
      localFilePath: downloaded.localFilePath,
      originalSourceUrl: downloaded.sourceUrl,
      referenceIngestMode: "downloaded_for_analysis_only",
      sourceDeclaration: reference.sourceDeclaration,
      width: downloaded.width,
    },
  });
};

export const analyzeReferenceVideo = async ({
  projectId,
  reference,
  referenceDownloader = createReferenceDownloadProviderFromEnv(),
  storageProvider,
  store,
  viralProvider = createArkViralBreakdownProvider(),
  visionProvider = createArkVisionUnderstandingProvider(),
}: {
  projectId?: string;
  reference: Omit<ReferenceVideo, "id" | "projectId" | "analysis" | "createdAt" | "updatedAt">;
  referenceDownloader?: ReferenceDownloadProvider;
  storageProvider?: StorageProvider;
  store: ProjectStore;
  viralProvider?: ViralBreakdownProvider;
  visionProvider?: VisionUnderstandingProvider;
}): Promise<ReferenceVideo | undefined> => {
  let sourceAsset = reference.sourceAssetId ? await store.getAsset(reference.sourceAssetId) : undefined;
  if (!sourceAsset && reference.sourceUrl) {
    sourceAsset = await ingestPublicReferenceAsset({
      projectId,
      reference,
      referenceDownloader,
      storageProvider,
      store,
    });
  }

  const registered = await store.addReferenceVideo(projectId, {
    ...reference,
    sourceAssetId: reference.sourceAssetId ?? sourceAsset?.id,
    status: "analyzing",
  });
  if (!registered) {
    return undefined;
  }

  if (sourceAsset) {
    const processed = await processAssetStructure({
      assetId: sourceAsset.id,
      input: { forceRegenerate: true, mode: "full" },
      storageProvider,
      store,
      visionProvider,
    });
    sourceAsset = processed?.asset ?? sourceAsset;
  }

  const analysis = await viralProvider.analyzeReference(
    registered,
    await structuredContextForAsset(store, sourceAsset),
  );
  return store.updateReferenceVideoAnalysis(registered.id, analysis);
};
