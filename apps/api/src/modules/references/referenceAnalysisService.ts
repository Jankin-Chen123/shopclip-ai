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

type ReferenceAnalyzeInput = Omit<
  ReferenceVideo,
  "id" | "projectId" | "analysis" | "createdAt" | "updatedAt"
>;

const ingestPublicReferenceAsset = async ({
  projectId,
  reference,
  referenceDownloader,
  storageProvider,
  store,
}: {
  projectId?: string;
  reference: ReferenceAnalyzeInput;
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

interface ReferenceAnalysisDependencies {
  projectId?: string;
  reference: ReferenceAnalyzeInput;
  referenceDownloader?: ReferenceDownloadProvider;
  storageProvider?: StorageProvider;
  store: ProjectStore;
  viralProvider?: ViralBreakdownProvider;
  visionProvider?: VisionUnderstandingProvider;
}

interface RegisteredReferenceAnalysisDependencies
  extends ReferenceAnalysisDependencies {
  registeredReference: ReferenceVideo;
}

const getReferenceErrorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : "Reference video provider failed during background analysis.";

export const registerReferenceForAnalysis = async ({
  projectId,
  reference,
  store,
}: Pick<ReferenceAnalysisDependencies, "projectId" | "reference" | "store">): Promise<
  ReferenceVideo | undefined
> =>
  store.addReferenceVideo(projectId, {
    ...reference,
    status: "analyzing",
  });

const completeReferenceAnalysis = async ({
  projectId,
  reference,
  referenceDownloader = createReferenceDownloadProviderFromEnv(),
  registeredReference,
  storageProvider,
  store,
  viralProvider = createArkViralBreakdownProvider(),
  visionProvider = createArkVisionUnderstandingProvider(),
}: RegisteredReferenceAnalysisDependencies): Promise<ReferenceVideo | undefined> => {
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

  let registered = registeredReference;
  if (sourceAsset?.id && registered.sourceAssetId !== sourceAsset.id) {
    registered =
      (await store.updateReferenceVideo(registered.id, {
        sourceAssetId: sourceAsset.id,
      })) ?? {
        ...registered,
        sourceAssetId: sourceAsset.id,
      };
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

export const runRegisteredReferenceAnalysis = async ({
  registeredReference,
  ...dependencies
}: RegisteredReferenceAnalysisDependencies): Promise<ReferenceVideo | undefined> => {
  try {
    return await completeReferenceAnalysis({
      ...dependencies,
      registeredReference,
    });
  } catch (error) {
    await dependencies.store.updateReferenceVideo(registeredReference.id, {
      errorMessage: getReferenceErrorMessage(error),
      status: "failed",
    });
    throw error;
  }
};

export const analyzeReferenceVideo = async (
  dependencies: ReferenceAnalysisDependencies,
): Promise<ReferenceVideo | undefined> => {
  const registeredReference = await registerReferenceForAnalysis(dependencies);
  if (!registeredReference) {
    return undefined;
  }
  return runRegisteredReferenceAnalysis({
    ...dependencies,
    registeredReference,
  });
};
