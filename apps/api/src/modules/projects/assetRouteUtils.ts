import type { AssetMetadata } from "@shopclip/shared";

import type { CosImageSearchMatch } from "../../providers/assets/cosIntelligentSearchProvider.js";
import { createAssetSlices, inferAssetTags } from "../assets/tagging.js";
import type { CreateAssetRequest } from "../assets/validation.js";
import { mergeAssetSearchResults } from "../retrieval/hybridAssetSearch.js";
import { searchAssets } from "../retrieval/search.js";
import { mapCosImageMatchesToAssetResults } from "../../providers/assets/cosIntelligentSearchProvider.js";
import type { ProjectSnapshot } from "./projectStore.js";

export const toStoredAssetInput = (
  asset: CreateAssetRequest,
  fallbackUrl: string,
): Omit<AssetMetadata, "id" | "projectId" | "createdAt" | "updatedAt"> => ({
  type: asset.type,
  status: "ready",
  url: asset.url ?? fallbackUrl,
  name: asset.name,
  mimeType: asset.mimeType,
  sizeBytes: asset.sizeBytes,
  source: asset.source ?? "merchant_upload",
  storageProvider: asset.storageProvider,
  objectKey: asset.objectKey,
  thumbnailKey: asset.thumbnailKey,
  embeddingText: asset.embeddingText,
  metadata: asset.metadata,
  tags: inferAssetTags(asset),
});

export const createGlobalAssetLibraryProject = (library: {
  assets: AssetMetadata[];
  assetSlices: ProjectSnapshot["assetSlices"];
}): ProjectSnapshot => ({
  id: "global-asset-library",
  title: "Global asset library",
  productName: "Global asset library",
  audience: "merchant",
  sellingPoints: ["shared assets"],
  tone: "neutral",
  style: "library",
  targetDurationSeconds: 15,
  prepKeywords: [],
  status: "ready",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  assets: library.assets,
  assetSlices: library.assetSlices,
  assetProcessingEvents: [],
  assetProcessingJobs: [],
  referenceVideos: [],
  viralTemplates: [],
  scripts: [],
  scenes: [],
  renderTasks: [],
});

export const parseAssetSearchQuery = (
  query: Record<string, unknown>,
): {
  level: "asset" | "slice" | undefined;
  projectId: string;
  query: string;
  sceneRole: string | undefined;
  tags: string[];
} => ({
  projectId: typeof query.projectId === "string" ? query.projectId.trim() : "",
  query: typeof query.q === "string" ? query.q : "",
  tags:
    typeof query.tags === "string"
      ? query.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [],
  level: query.level === "slice" || query.level === "asset" ? query.level : undefined,
  sceneRole: typeof query.sceneRole === "string" ? query.sceneRole : undefined,
});

export const mergeLocalAndCosAssetSearch = (
  library: ProjectSnapshot,
  input: {
    cosMatches: CosImageSearchMatch[] | undefined;
    level: "asset" | "slice" | undefined;
    query: string;
    sceneRole: string | undefined;
    tags: string[];
  },
) => {
  const cosResults = input.cosMatches
    ? mapCosImageMatchesToAssetResults(input.cosMatches, library)
    : undefined;
  const textResults = searchAssets(library, {
    query: input.query,
    tags: input.tags,
    level: input.level,
    sceneRole: input.sceneRole,
  });
  const shouldUseHybridResults = Boolean(input.level || input.sceneRole);
  return input.cosMatches !== undefined && !shouldUseHybridResults
    ? (cosResults ?? [])
    : mergeAssetSearchResults(textResults, cosResults);
};

export { createAssetSlices };
