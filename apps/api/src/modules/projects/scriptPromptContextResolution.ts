import type {
  AssetMetadata,
  ReferenceVideo,
  ScriptGenerationRequest,
  ViralTemplate,
} from "@shopclip/shared";

import type { MaybePromise } from "./projectStore.js";
import { getMetadataRecord } from "./referenceAssetUtils.js";
import type { ScriptPromptContext } from "./scriptPromptContext.js";

export type ScriptPromptContextHttpError = {
  code: string;
  message: string;
  status: 400 | 404;
};

export type ScriptPromptContextResolution = {
  context: ScriptPromptContext;
  error?: ScriptPromptContextHttpError;
};

type ScriptPromptContextDependencies = {
  listAssets: () => MaybePromise<AssetMetadata[]>;
  listReferenceVideos: () => MaybePromise<ReferenceVideo[]>;
  listViralTemplates: () => MaybePromise<ViralTemplate[]>;
  request: ScriptGenerationRequest;
};

const getReferenceIdFromAsset = (asset: AssetMetadata): string | undefined => {
  const metadata = getMetadataRecord(asset);
  return metadata.kind === "reference_script_asset" && typeof metadata.referenceId === "string"
    ? metadata.referenceId
    : undefined;
};

const findReferenceScriptAsset = async (
  listAssets: () => MaybePromise<AssetMetadata[]>,
  referenceId: string,
): Promise<AssetMetadata | undefined> => {
  const assets = await listAssets();
  return assets.find((asset) => getReferenceIdFromAsset(asset) === referenceId);
};

export const resolveScriptPromptContext = async ({
  request,
  listAssets,
  listReferenceVideos,
  listViralTemplates,
}: ScriptPromptContextDependencies): Promise<ScriptPromptContextResolution> => {
  const context: ScriptPromptContext = {};

  if (request.referenceId) {
    const reference = (await listReferenceVideos()).find(
      (candidate) => candidate.id === request.referenceId,
    );
    if (!reference) {
      return {
        context,
        error: {
          code: "REFERENCE_NOT_FOUND",
          message: "Reference video was not found.",
          status: 404,
        },
      };
    }
    if (request.productionMode === "viral-remix" && reference.status !== "ready") {
      return {
        context,
        error: {
          code: "REFERENCE_NOT_READY",
          message: "Reference video must finish analysis before viral remix script generation.",
          status: 400,
        },
      };
    }
    if (request.productionMode === "viral-remix" && !reference.analysis) {
      return {
        context,
        error: {
          code: "REFERENCE_ANALYSIS_REQUIRED",
          message: "Reference video analysis is required for viral remix script generation.",
          status: 400,
        },
      };
    }
    context.reference = reference;
    context.referenceScriptAsset = await findReferenceScriptAsset(listAssets, reference.id);
  }

  if (request.templateId) {
    const template = (await listViralTemplates()).find(
      (candidate) => candidate.templateId === request.templateId,
    );
    if (!template) {
      return {
        context,
        error: {
          code: "VIRAL_TEMPLATE_NOT_FOUND",
          message: "Viral template was not found.",
          status: 404,
        },
      };
    }
    context.template = template;
  }

  if (request.productionMode === "viral-remix" && !context.reference) {
    return {
      context,
      error: {
        code: "REFERENCE_REQUIRED",
        message: "Viral remix script generation requires a selected reference video.",
        status: 400,
      },
    };
  }

  if (request.productionMode === "template" && !context.template) {
    return {
      context,
      error: {
        code: "VIRAL_TEMPLATE_REQUIRED",
        message: "Template script generation requires a selected viral template.",
        status: 400,
      },
    };
  }

  return { context };
};
