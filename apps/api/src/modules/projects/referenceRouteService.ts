import { z } from "zod";
import type { Router } from "express";
import { InspirationGenerateRequestSchema } from "@shopclip/shared";

import { extractScriptTemplateWithGeneralModel } from "../../providers/ai/scriptTemplateExtractionProvider.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import { buildViralTemplateFromReferences } from "../references/referenceTemplateService.js";
import { sendInvalidRequest, sendNotFound } from "./httpResponseUtils.js";
import type { ProjectStore } from "./projectStore.js";
import { resolveScriptTemplateAssets } from "./projectAssetResolution.js";
import {
  deleteReferenceWithOwnedAssets,
  ensureReferenceScriptAsset,
} from "./referenceAssetService.js";
import { isScriptLibraryAsset } from "./referenceAssetUtils.js";
import { extractAndStoreScriptTemplate } from "./scriptTemplateRouteService.js";

type RegisterReferenceRoutesOptions = {
  router: Router;
  storageProvider: StorageProvider;
  store: ProjectStore;
};

const OptionalNonEmptyStringSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.string().trim().min(1).optional(),
);

const TemplateCreateRequestSchema = z.object({
  category: z.string().trim().min(1),
  referenceIds: z.array(z.string().trim().min(1)).min(1),
  templateName: z.string().trim().min(1),
});

const ScriptAssetTemplateCreateRequestSchema = z.object({
  assetIds: z.array(z.string().trim().min(1)).min(1).max(20),
  category: OptionalNonEmptyStringSchema,
  templateName: OptionalNonEmptyStringSchema,
  apiConfig: InspirationGenerateRequestSchema.shape.apiConfig,
});

const ReferenceScriptAssetRequestSchema = z
  .object({
    projectId: OptionalNonEmptyStringSchema,
  })
  .default({});

export const registerReferenceRoutes = ({
  router,
  storageProvider,
  store,
}: RegisterReferenceRoutesOptions): void => {
  router.get("/references", async (request, response) => {
    const projectId =
      typeof request.query.projectId === "string" ? request.query.projectId : undefined;
    response.json({
      references: await store.listReferenceVideos(projectId),
    });
  });

  router.delete("/references/:referenceId", async (request, response) => {
    let deletedReference;
    try {
      deletedReference = await deleteReferenceWithOwnedAssets({
        referenceId: request.params.referenceId,
        storageProvider,
        store,
      });
    } catch (error) {
      response.status(502).json({
        error: {
          code: "STORAGE_DELETE_FAILED",
          message: error instanceof Error ? error.message : "Storage delete failed.",
        },
      });
      return;
    }
    if (deletedReference.kind === "not-found") {
      sendNotFound(response, "REFERENCE_NOT_FOUND", "Reference video was not found.");
      return;
    }

    response.json(deletedReference.result);
  });

  router.post("/references/:referenceId/script-asset", async (request, response) => {
    const parsedRequest = ReferenceScriptAssetRequestSchema.safeParse(request.body ?? {});
    if (!parsedRequest.success) {
      sendInvalidRequest(
        response,
        "INVALID_REFERENCE_SCRIPT_ASSET_REQUEST",
        "Reference script asset request failed validation.",
      );
      return;
    }

    const scriptAsset = await ensureReferenceScriptAsset({
      projectId: parsedRequest.data.projectId,
      referenceId: request.params.referenceId,
      store,
    });
    if (scriptAsset.kind === "project-not-found") {
      sendNotFound(response, "PROJECT_NOT_FOUND", "Project was not found.");
      return;
    }
    if (scriptAsset.kind === "reference-not-found") {
      sendNotFound(response, "REFERENCE_NOT_FOUND", "Reference video was not found.");
      return;
    }
    if (scriptAsset.kind === "reference-not-ready") {
      sendInvalidRequest(
        response,
        "REFERENCE_NOT_READY",
        "Reference video must finish analysis before it can be added to the script library.",
      );
      return;
    }
    if (scriptAsset.kind === "create-failed") {
      response.status(500).json({
        error: {
          code: "REFERENCE_SCRIPT_ASSET_CREATE_FAILED",
          message: "Reference script asset could not be created.",
        },
      });
      return;
    }

    response.status(scriptAsset.created ? 201 : 200).json({ asset: scriptAsset.asset });
  });

  router.get("/references/templates", async (request, response) => {
    const category =
      typeof request.query.category === "string" ? request.query.category : undefined;
    response.json({
      templates: await store.listViralTemplates(category),
    });
  });

  router.post("/references/templates", async (request, response) => {
    const parsedTemplate = TemplateCreateRequestSchema.safeParse(request.body);
    if (!parsedTemplate.success) {
      sendInvalidRequest(
        response,
        "INVALID_REFERENCE_TEMPLATE_REQUEST",
        "Reference template request failed validation.",
      );
      return;
    }

    const references = (await store.listReferenceVideos()).filter((reference) =>
      parsedTemplate.data.referenceIds.includes(reference.id),
    );
    if (references.length !== parsedTemplate.data.referenceIds.length) {
      sendNotFound(response, "REFERENCE_NOT_FOUND", "One or more reference videos were not found.");
      return;
    }
    if (references.some((reference) => reference.status !== "ready")) {
      sendInvalidRequest(
        response,
        "REFERENCE_NOT_READY",
        "Reference videos must finish analysis before template extraction.",
      );
      return;
    }

    const template = await store.addViralTemplate(
      buildViralTemplateFromReferences({
        category: parsedTemplate.data.category,
        references,
        templateName: parsedTemplate.data.templateName,
      }),
    );

    response.status(201).json({ template });
  });

  router.post("/references/templates/from-script-assets", async (request, response) => {
    const parsedTemplate = ScriptAssetTemplateCreateRequestSchema.safeParse(request.body ?? {});
    if (!parsedTemplate.success) {
      sendInvalidRequest(
        response,
        "INVALID_SCRIPT_ASSET_TEMPLATE_REQUEST",
        "Script asset template request failed validation.",
      );
      return;
    }

    const templateResult = await extractAndStoreScriptTemplate({
      request: parsedTemplate.data,
      resolveTemplateAssets: (assetIds) =>
        resolveScriptTemplateAssets({
          getAsset: (assetId) => store.getAsset(assetId),
          isScriptAsset: isScriptLibraryAsset,
          requestedAssetIds: assetIds,
        }),
      extractTemplate: extractScriptTemplateWithGeneralModel,
      addViralTemplate: (template) => store.addViralTemplate(template),
    });
    if (templateResult.kind === "error") {
      if (templateResult.error.status === 404) {
        sendNotFound(response, templateResult.error.code, templateResult.error.message);
        return;
      }
      if (templateResult.error.status === 502) {
        response.status(502).json({
          error: {
            code: templateResult.error.code,
            message: templateResult.error.message,
          },
        });
        return;
      }
      sendInvalidRequest(response, templateResult.error.code, templateResult.error.message);
      return;
    }

    response.status(201).json({ template: templateResult.template });
  });
};
