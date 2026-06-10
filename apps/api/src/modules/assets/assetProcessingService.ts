import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type {
  AssetMetadata,
  AssetProcessingEvent,
  AssetProcessingJob,
  AssetSlice,
} from "@shopclip/shared";

import {
  extractAssetAudioSummary,
  type ExtractedAudioSummary,
} from "../media/audioExtractor.js";
import { sampleAssetFrames } from "../media/frameSampler.js";
import { probeAssetMedia } from "../media/mediaProbe.js";
import type { ProjectStore } from "../projects/projectStore.js";
import { createArkVisionUnderstandingProvider } from "../../providers/vision/arkVisionUnderstandingProvider.js";
import type { VisionUnderstandingProvider } from "../../providers/vision/visionUnderstandingProvider.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";

export interface ProcessAssetInput {
  forceRegenerate?: boolean;
  mode?: "full" | "metadata-only";
}

export interface ProcessAssetResult {
  asset: AssetMetadata;
  events: AssetProcessingEvent[];
  job: AssetProcessingJob;
  slices: AssetSlice[];
}

const addStepEvent = async (
  store: ProjectStore,
  job: AssetProcessingJob,
  assetId: string,
  step: string,
  message: string,
  progress: number,
): Promise<AssetProcessingEvent> => {
  const event = await store.addAssetProcessingEvent(job.id, {
    assetId,
    step,
    status: "completed",
    message,
    progress,
    retryable: false,
  });
  if (!event) {
    throw new Error(`Failed to record asset processing event for step ${step}.`);
  }
  return event;
};

const createSliceDrafts = (asset: AssetMetadata, durationSeconds: number) => {
  if (asset.type === "image") {
    return [{ startSecond: 0, endSecond: 1 }];
  }

  const cappedDuration = Math.max(3, Math.min(15, Math.ceil(durationSeconds)));
  const drafts: Array<{ startSecond: number; endSecond: number }> = [];
  for (let startSecond = 0; startSecond < cappedDuration; startSecond += 3) {
    drafts.push({
      startSecond,
      endSecond: Math.min(cappedDuration, startSecond + 3),
    });
  }
  return drafts;
};

const derivedPrefixForAsset = (asset: AssetMetadata): string =>
  asset.projectId ? `projects/${asset.projectId}/derived/${asset.id}` : `library/derived/${asset.id}`;

const publishStructuredArtifacts = async ({
  asset,
  frames,
  storageProvider,
}: {
  asset: AssetMetadata;
  frames: Awaited<ReturnType<typeof sampleAssetFrames>>;
  storageProvider?: StorageProvider;
}) => {
  if (!storageProvider) {
    return {
      frames,
      structuredAssetObjectKey: undefined,
    };
  }

  const derivedPrefix = derivedPrefixForAsset(asset);
  const publishedFrames = await Promise.all(
    frames.map(async (frame) => {
      if (!frame.localPath) {
        return asset.type === "image" && asset.objectKey
          ? { ...frame, key: asset.objectKey }
          : frame;
      }

      const objectKey = `${derivedPrefix}/frames/${basename(frame.localPath)}`;
      let body: Buffer;
      try {
        body = await readFile(frame.localPath);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code?: unknown }).code === "ENOENT"
        ) {
          return frame;
        }
        throw error;
      }
      await storageProvider.uploadObject({
        body,
        contentType: frame.contentType ?? "image/jpeg",
        objectKey,
      });
      return {
        ...frame,
        key: objectKey,
      };
    }),
  );

  return {
    frames: publishedFrames,
    structuredAssetObjectKey: `${derivedPrefix}/metadata/structured-asset.json`,
  };
};

const shouldExtractAudio = () => {
  const mode = process.env.ASR_PROVIDER_MODE?.trim().toLowerCase() ?? "none";
  return ["http", "real"].includes(mode);
};

const assetWithStorageReadUrl = (
  asset: AssetMetadata,
  storageProvider: StorageProvider | undefined,
): AssetMetadata => {
  if (!storageProvider || !asset.objectKey) {
    return asset;
  }

  try {
    return {
      ...asset,
      url: storageProvider.createReadUrl({ objectKey: asset.objectKey }).url,
    };
  } catch (error) {
    console.warn("[asset-structure] failed to create storage read URL for vision input.", {
      assetId: asset.id,
      error: error instanceof Error ? error.message : String(error),
      objectKey: asset.objectKey,
    });
    return asset;
  }
};

const ocrFirstTextSummary = (): ExtractedAudioSummary => ({
  asrSummary:
    "OCR-first text extraction: subtitles and overlays are read from sampled frames by the vision model. ASR is disabled by default.",
  transcript: "",
});

export const processAssetStructure = async ({
  input,
  store,
  assetId,
  visionProvider = createArkVisionUnderstandingProvider(),
  storageProvider,
}: {
  assetId: string;
  input: ProcessAssetInput;
  store: ProjectStore;
  visionProvider?: VisionUnderstandingProvider;
  storageProvider?: StorageProvider;
}): Promise<ProcessAssetResult | undefined> => {
  const asset = await store.getAsset(assetId);
  if (!asset) {
    return undefined;
  }

  const job = await store.addAssetProcessingJob(asset.projectId, {
    id: randomUUID(),
    assetId,
    status: "processing",
    steps: ["probe"],
    message: input.forceRegenerate
      ? "Regenerating structured asset metadata."
      : "Generating structured asset metadata.",
  });
  if (!job) {
    return undefined;
  }

  const events: AssetProcessingEvent[] = [];
  const probe = await probeAssetMedia(asset);
  events.push(await addStepEvent(store, job, asset.id, "probe", "Media metadata extracted.", 10));

  const sampledFrames = await sampleAssetFrames(asset, probe);
  const publishedArtifacts = await publishStructuredArtifacts({
    asset,
    frames: sampledFrames,
    storageProvider,
  });
  const frames = publishedArtifacts.frames;
  events.push(
    await addStepEvent(
      store,
      job,
      asset.id,
      "sample_frames",
      `Sampled ${frames.length} real frame references.`,
      25,
    ),
  );
  if (storageProvider) {
    events.push(
      await addStepEvent(
        store,
        job,
        asset.id,
        "publish_artifacts",
        "Published derived frame artifacts to object storage.",
        32,
      ),
    );
  }

  const extractAudio = shouldExtractAudio();
  const textStep = extractAudio ? "extract_audio" : "prepare_ocr";
  const audio = extractAudio ? await extractAssetAudioSummary(asset) : ocrFirstTextSummary();
  events.push(
    await addStepEvent(
      store,
      job,
      asset.id,
      textStep,
      extractAudio
        ? "Audio transcript summary prepared."
        : "Sampled frames prepared for OCR/subtitle understanding.",
      40,
    ),
  );

  const visionAsset = assetWithStorageReadUrl(asset, storageProvider);
  const structuredMetadata = await visionProvider.understandAsset({
    asset: visionAsset,
    audio,
    frames,
    probe,
  });
  const sliceDrafts = createSliceDrafts(asset, probe.durationSeconds);
  const slicesToCreate = await Promise.all(
    sliceDrafts.map(async (draft, index) => {
      const sliceId = randomUUID();
      const frameKeys = frames
        .filter((frame) => frame.second >= draft.startSecond && frame.second <= draft.endSecond)
        .map((frame) => frame.key);
      const sliceFrames = frames.filter(
        (frame) => frame.second >= draft.startSecond && frame.second <= draft.endSecond,
      );
      const metadata = await visionProvider.understandSlice({
        asset: visionAsset,
        audio,
        endSecond: draft.endSecond,
        frameKeys: frameKeys.length ? frameKeys : frames.slice(0, 1).map((frame) => frame.key),
        frames: sliceFrames.length ? sliceFrames : frames.slice(0, 1),
        index,
        sliceId,
        startSecond: draft.startSecond,
      });

      return {
        id: sliceId,
        label: `${asset.name} slice ${index + 1}`,
        startSecond: draft.startSecond,
        endSecond: draft.endSecond,
        tags: [...new Set([...asset.tags, ...metadata.suitableSceneRoles, metadata.shotType])],
        thumbnailKey: metadata.thumbnailKey,
        searchText: metadata.searchText,
        embeddingText: metadata.embeddingText,
        metadata,
      };
    }),
  );
  events.push(
    await addStepEvent(store, job, asset.id, "understand", "Visual and slice understanding completed.", 65),
  );

  const createdSlices = await store.addAssetSlices(
    asset.id,
    slicesToCreate.map(({ id: _id, ...slice }) => slice),
  );
  const updatedAsset = await store.updateAsset(asset.id, {
    status: "ready",
    embeddingText: structuredMetadata.embeddingText,
    metadata: {
      ...(asset.metadata ?? {}),
      structuredAsset: structuredMetadata,
      structuredAssetObjectKey: publishedArtifacts.structuredAssetObjectKey,
      structuredAssetVersion: "asset-multigranularity-v1",
    },
    tags: [...new Set([...asset.tags, ...structuredMetadata.globalTags])],
  });
  if (storageProvider && publishedArtifacts.structuredAssetObjectKey) {
    await storageProvider.uploadObject({
      body: Buffer.from(JSON.stringify(updatedAsset?.metadata?.structuredAsset ?? structuredMetadata, null, 2)),
      contentType: "application/json",
      objectKey: publishedArtifacts.structuredAssetObjectKey,
    });
  }
  events.push(
    await addStepEvent(store, job, asset.id, "persist_metadata", "Structured asset metadata persisted.", 85),
  );
  events.push(await addStepEvent(store, job, asset.id, "index", "Asset search text indexed.", 100));

  const readyJob = await store.updateAssetProcessingJob(job.id, {
    status: "ready",
    steps: [
      "probe",
      "sample_frames",
      ...(storageProvider ? ["publish_artifacts"] : []),
      textStep,
      "understand",
      "persist_metadata",
      "index",
    ],
    message: "Structured asset metadata is ready for script generation and smart editing.",
  });

  return {
    asset: updatedAsset ?? asset,
    events,
    job: readyJob ?? { ...job, status: "ready" },
    slices: createdSlices,
  };
};
