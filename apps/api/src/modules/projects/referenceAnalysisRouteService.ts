import type { Router } from "express";
import { z } from "zod";
import type { ReferenceVideo } from "@shopclip/shared";

import type { ReferenceDownloadProvider } from "../../providers/references/referenceDownloadProvider.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import {
  registerReferenceForAnalysis,
  runRegisteredReferenceAnalysis,
} from "../references/referenceAnalysisService.js";
import { sendInvalidRequest, sendNotFound } from "./httpResponseUtils.js";
import type { ProjectStore } from "./projectStore.js";

const OptionalNonEmptyStringSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.string().trim().min(1).optional(),
);

const ReferenceAnalyzeRequestSchema = z
  .object({
    projectId: OptionalNonEmptyStringSchema,
    sourceAssetId: OptionalNonEmptyStringSchema,
    sourceUrl: OptionalNonEmptyStringSchema,
    sourcePlatform: z.string().trim().min(1),
    sourceDeclaration: z.string().trim().min(1),
    title: z.string().trim().min(1),
    author: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1),
    publicStats: z
      .object({
        likes: z.number().int().nonnegative().default(0),
        comments: z.number().int().nonnegative().default(0),
        shares: z.number().int().nonnegative().default(0),
        views: z.number().int().nonnegative().default(0),
      })
      .default({ likes: 0, comments: 0, shares: 0, views: 0 }),
    status: z.enum(["registered", "analyzing", "ready", "failed"]).default("registered"),
    errorMessage: z.string().trim().min(1).optional(),
  })
  .superRefine((reference, context) => {
    if (!reference.sourceUrl && !reference.sourceAssetId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either sourceUrl or sourceAssetId is required.",
        path: ["sourceUrl"],
      });
    }
  });

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

const registerReferenceForRouteAnalysis = async ({
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

type RegisterReferenceAnalysisRoutesOptions = {
  referenceDownloader: ReferenceDownloadProvider | undefined;
  router: Router;
  storageProvider: StorageProvider;
  store: ProjectStore;
};

export const registerReferenceAnalysisRoutes = ({
  referenceDownloader,
  router,
  storageProvider,
  store,
}: RegisterReferenceAnalysisRoutesOptions): void => {
  router.post("/references/analyze", async (request, response) => {
    const parsedReference = ReferenceAnalyzeRequestSchema.safeParse(request.body);
    if (!parsedReference.success) {
      sendInvalidRequest(
        response,
        "INVALID_REFERENCE_ANALYZE_REQUEST",
        "Reference video analysis request failed validation.",
      );
      return;
    }

    const registration = await registerReferenceForRouteAnalysis({
      input: parsedReference.data,
      referenceDownloader,
      storageProvider,
      store,
    });
    if (registration.kind === "project-not-found") {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }
    if (registration.kind === "source-asset-not-found") {
      sendNotFound(
        response,
        "REFERENCE_SOURCE_ASSET_NOT_FOUND",
        "Reference source asset was not found.",
      );
      return;
    }
    if (registration.kind === "source-asset-project-mismatch") {
      sendInvalidRequest(
        response,
        "REFERENCE_SOURCE_ASSET_PROJECT_MISMATCH",
        "Reference source asset does not belong to this project.",
      );
      return;
    }
    if (registration.kind === "source-asset-not-video") {
      sendInvalidRequest(
        response,
        "REFERENCE_SOURCE_ASSET_NOT_VIDEO",
        "Reference source asset must be a video asset.",
      );
      return;
    }
    if (registration.kind === "registration-failed") {
      response.status(500).json({
        error: {
          code: "REFERENCE_ANALYSIS_REGISTRATION_FAILED",
          message: registration.message,
        },
      });
      return;
    }
    if (registration.kind === "analysis-failed") {
      response.status(500).json({
        error: {
          code: "REFERENCE_ANALYSIS_FAILED",
          message: "Reference video could not be registered for analysis.",
        },
      });
      return;
    }

    response.status(202).json({ reference: registration.reference });
  });
};
