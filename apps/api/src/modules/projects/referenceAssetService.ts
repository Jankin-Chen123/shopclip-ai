import type { AssetMetadata } from "@shopclip/shared";

import { inferAssetTags } from "../assets/tagging.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import { deleteStoredAssetObjects } from "./projectAssetUtils.js";
import type { DeleteReferenceVideoResult, ProjectStore } from "./projectStore.js";
import {
  buildReferenceScriptAssetBody,
  buildReferenceScriptAssetTags,
  isReferenceOwnedAsset,
  isReferenceScriptAssetFor,
} from "./referenceAssetUtils.js";

export type DeleteReferenceResult =
  | { kind: "deleted"; result: DeleteReferenceVideoResult }
  | { kind: "not-found" };

export const deleteReferenceWithOwnedAssets = async ({
  referenceId,
  storageProvider,
  store,
}: {
  referenceId: string;
  storageProvider: StorageProvider;
  store: ProjectStore;
}): Promise<DeleteReferenceResult> => {
  const reference = (await store.listReferenceVideos()).find(
    (candidate) => candidate.id === referenceId,
  );
  if (!reference) {
    return { kind: "not-found" };
  }

  const assetsToDelete = (await store.listAssets()).assets.filter((asset) =>
    isReferenceOwnedAsset(asset, reference),
  );
  await deleteStoredAssetObjects(storageProvider, assetsToDelete);

  const deleted = await store.deleteReferenceVideo(reference.id);
  if (!deleted) {
    return { kind: "not-found" };
  }

  return { kind: "deleted", result: deleted };
};

export type EnsureReferenceScriptAssetResult =
  | { kind: "ready"; asset: AssetMetadata; created: boolean }
  | { kind: "project-not-found" }
  | { kind: "reference-not-found" }
  | { kind: "reference-not-ready" }
  | { kind: "create-failed" };

export const ensureReferenceScriptAsset = async ({
  projectId,
  referenceId,
  store,
}: {
  projectId: string | undefined;
  referenceId: string;
  store: ProjectStore;
}): Promise<EnsureReferenceScriptAssetResult> => {
  if (projectId && !(await store.getProject(projectId))) {
    return { kind: "project-not-found" };
  }

  const reference = (await store.listReferenceVideos()).find(
    (candidate) => candidate.id === referenceId,
  );
  if (!reference) {
    return { kind: "reference-not-found" };
  }
  if (reference.status !== "ready" || !reference.analysis) {
    return { kind: "reference-not-ready" };
  }

  const existingAsset = (await store.listAssets()).assets.find((asset) =>
    isReferenceScriptAssetFor(asset, reference.id, projectId),
  );
  if (existingAsset) {
    return { kind: "ready", asset: existingAsset, created: false };
  }

  const body = buildReferenceScriptAssetBody(reference);
  const title = reference.title.trim() || "Reference video script ideas";
  const storedAsset = await store.addAsset(projectId, {
    type: "reference",
    status: "ready",
    url: reference.sourceUrl,
    name: `${title} - script ideas`,
    mimeType: "text/plain",
    sizeBytes: Math.max(1, Buffer.byteLength(body, "utf8")),
    source: "public_reference",
    embeddingText: body,
    metadata: {
      kind: "reference_script_asset",
      referenceId: reference.id,
      sourceUrl: reference.sourceUrl,
      sourcePlatform: reference.sourcePlatform,
      sourceDeclaration: reference.sourceDeclaration,
      title: reference.title,
      category: reference.category,
      content: body,
      searchText: body,
      reusableSegments: reference.analysis.commerceNarrativeSegments,
      recreationBlueprint: reference.analysis.recreationBlueprint,
      keyViralFactors: reference.analysis.keyViralFactors,
      derivedTemplates: reference.analysis.derivedTemplates,
    },
    tags: inferAssetTags({
      name: `${title} script ideas reference video ${reference.category}`,
      mimeType: "text/plain",
      source: "public_reference",
      tags: buildReferenceScriptAssetTags(reference),
    }),
  });

  if (!storedAsset) {
    return { kind: "create-failed" };
  }

  return { kind: "ready", asset: storedAsset, created: true };
};
