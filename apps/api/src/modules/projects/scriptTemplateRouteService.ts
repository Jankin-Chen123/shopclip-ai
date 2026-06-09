import type {
  AssetMetadata,
  InspirationGenerateRequest,
  ViralTemplate,
} from "@shopclip/shared";

import type { MaybePromise } from "./projectStore.js";
import type { ScriptTemplateAssetResolution } from "./projectAssetResolution.js";

type ScriptTemplateRouteRequest = {
  apiConfig?: InspirationGenerateRequest["apiConfig"];
  assetIds: string[];
  category?: string;
  templateName?: string;
};

export type ScriptTemplateRouteHttpError = {
  code: string;
  message: string;
  status: 400 | 404 | 502;
};

export type ScriptTemplateRouteResult =
  | { kind: "ready"; template: ViralTemplate }
  | { kind: "error"; error: ScriptTemplateRouteHttpError };

export const extractAndStoreScriptTemplate = async ({
  request,
  resolveTemplateAssets,
  extractTemplate,
  addViralTemplate,
}: {
  request: ScriptTemplateRouteRequest;
  resolveTemplateAssets: (assetIds: string[]) => MaybePromise<ScriptTemplateAssetResolution>;
  extractTemplate: (input: {
    apiConfig?: InspirationGenerateRequest["apiConfig"];
    assets: AssetMetadata[];
    category?: string;
    templateName?: string;
  }) => MaybePromise<ViralTemplate>;
  addViralTemplate: (template: ViralTemplate) => MaybePromise<ViralTemplate>;
}): Promise<ScriptTemplateRouteResult> => {
  const templateAssets = await resolveTemplateAssets(request.assetIds);
  if (templateAssets.kind === "not-found") {
    return {
      kind: "error",
      error: {
        code: "SCRIPT_ASSET_NOT_FOUND",
        message: "One or more script assets were not found.",
        status: 404,
      },
    };
  }
  if (templateAssets.kind === "invalid-type") {
    return {
      kind: "error",
      error: {
        code: "SCRIPT_ASSET_REQUIRED",
        message: "Template extraction only supports script material assets.",
        status: 400,
      },
    };
  }

  try {
    const extractedTemplate = await extractTemplate({
      assets: templateAssets.assets,
      category: request.category,
      templateName: request.templateName,
      apiConfig: request.apiConfig,
    });
    return {
      kind: "ready",
      template: await addViralTemplate(extractedTemplate),
    };
  } catch (error) {
    return {
      kind: "error",
      error: {
        code: "SCRIPT_TEMPLATE_EXTRACTION_FAILED",
        message: error instanceof Error ? error.message : "Script asset template extraction failed.",
        status: 502,
      },
    };
  }
};
