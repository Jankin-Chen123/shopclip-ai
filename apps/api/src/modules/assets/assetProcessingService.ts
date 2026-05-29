import { randomUUID } from "node:crypto";
import type {
  AssetMetadata,
  AssetProcessingEvent,
  AssetProcessingJob,
  AssetSlice,
} from "@shopclip/shared";

import { extractAssetAudioSummary } from "../media/audioExtractor.js";
import { sampleAssetFrames } from "../media/frameSampler.js";
import { probeAssetMedia } from "../media/mediaProbe.js";
import type { ProjectStore } from "../projects/projectStore.js";
import { createArkVisionUnderstandingProvider } from "../../providers/vision/arkVisionUnderstandingProvider.js";
import type { VisionUnderstandingProvider } from "../../providers/vision/visionUnderstandingProvider.js";

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

export const processAssetStructure = async ({
  input,
  store,
  assetId,
  visionProvider = createArkVisionUnderstandingProvider(),
}: {
  assetId: string;
  input: ProcessAssetInput;
  store: ProjectStore;
  visionProvider?: VisionUnderstandingProvider;
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
  const probe = probeAssetMedia(asset);
  events.push(await addStepEvent(store, job, asset.id, "probe", "Media metadata extracted.", 10));

  const frames = sampleAssetFrames(asset, probe);
  events.push(
    await addStepEvent(
      store,
      job,
      asset.id,
      "sample_frames",
      `Sampled ${frames.length} deterministic frame references.`,
      25,
    ),
  );

  const audio = extractAssetAudioSummary(asset);
  events.push(
    await addStepEvent(store, job, asset.id, "extract_audio", "Audio transcript summary prepared.", 40),
  );

  const structuredMetadata = await visionProvider.understandAsset({ asset, audio, frames, probe });
  const sliceDrafts = createSliceDrafts(asset, probe.durationSeconds);
  const slicesToCreate = await Promise.all(
    sliceDrafts.map(async (draft, index) => {
      const sliceId = randomUUID();
      const frameKeys = frames
        .filter((frame) => frame.second >= draft.startSecond && frame.second <= draft.endSecond)
        .map((frame) => frame.key);
      const metadata = await visionProvider.understandSlice({
        asset,
        audio,
        endSecond: draft.endSecond,
        frameKeys: frameKeys.length ? frameKeys : frames.slice(0, 1).map((frame) => frame.key),
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
      structuredAssetVersion: "asset-multigranularity-v1",
    },
    tags: [...new Set([...asset.tags, ...structuredMetadata.globalTags])],
  });
  events.push(
    await addStepEvent(store, job, asset.id, "persist_metadata", "Structured asset metadata persisted.", 85),
  );
  events.push(await addStepEvent(store, job, asset.id, "index", "Asset search text indexed.", 100));

  const readyJob = await store.updateAssetProcessingJob(job.id, {
    status: "ready",
    steps: ["probe", "sample_frames", "extract_audio", "understand", "persist_metadata", "index"],
    message: "Structured asset metadata is ready for script generation and smart editing.",
  });

  return {
    asset: updatedAsset ?? asset,
    events,
    job: readyJob ?? { ...job, status: "ready" },
    slices: createdSlices,
  };
};
