import type { ReferenceVideo } from "@shopclip/shared";

import type { ReferenceDownloadProvider } from "../../providers/references/referenceDownloadProvider.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import {
  registerReferenceForAnalysis,
  runRegisteredReferenceAnalysis,
} from "../references/referenceAnalysisService.js";
import type { ProjectStore } from "./projectStore.js";

export type ReferenceAnalyzeRouteInput = Omit<
  ReferenceVideo,
  "id" | "projectId" | "sourceAssetId" | "sourceUrl" | "analysis" | "createdAt" | "updatedAt"
> & {
  projectId?: string;
  sourceAssetId?: string;
  sourceUrl?: string;
};

export type ReferenceAnalyzeRouteResult =
  | { kind: "registered"; reference: ReferenceVideo }
  | { kind: "project-not-found" }
  | { kind: "source-asset-not-found" }
  | { kind: "source-asset-project-mismatch" }
  | { kind: "source-asset-not-video" }
  | { kind: "registration-failed"; message: string }
  | { kind: "analysis-failed" };

export const registerReferenceAnalysisRoute = async ({
  input,
  referenceDownloader,
  storageProvider,
  store,
}: {
  input: ReferenceAnalyzeRouteInput;
  referenceDownloader: ReferenceDownloadProvider | undefined;
  storageProvider: StorageProvider;
  store: ProjectStore;
}): Promise<ReferenceAnalyzeRouteResult> => {
  const { projectId, sourceAssetId, ...referenceInput } = input;
  if (projectId && !(await store.getProject(projectId))) {
    return { kind: "project-not-found" };
  }

  const sourceAsset = sourceAssetId ? await store.getAsset(sourceAssetId) : undefined;
  if (sourceAssetId && !sourceAsset) {
    return { kind: "source-asset-not-found" };
  }
  if (sourceAsset && projectId && sourceAsset.projectId && sourceAsset.projectId !== projectId) {
    return { kind: "source-asset-project-mismatch" };
  }
  if (sourceAsset && sourceAsset.type !== "video" && !sourceAsset.mimeType?.startsWith("video/")) {
    return { kind: "source-asset-not-video" };
  }

  try {
    const referencePayload = {
      ...referenceInput,
      sourceAssetId,
      sourceUrl: referenceInput.sourceUrl ?? sourceAsset?.url ?? `/api/assets/${sourceAssetId}/content`,
    };
    const reference = await registerReferenceForAnalysis({
      projectId,
      reference: referencePayload,
      store,
    });
    if (!reference) {
      return { kind: "analysis-failed" };
    }

    void runRegisteredReferenceAnalysis({
      projectId,
      reference: referencePayload,
      registeredReference: reference,
      store,
      referenceDownloader,
      storageProvider,
    }).catch((error) => {
      console.error("Reference video background analysis failed", error);
    });

    return { kind: "registered", reference };
  } catch (error) {
    return {
      kind: "registration-failed",
      message:
        error instanceof Error
          ? error.message
          : "Reference video analysis could not be registered.",
    };
  }
};
