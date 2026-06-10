import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { StructuredAssetMetadata, StructuredSliceMetadata } from "@shopclip/shared";

import { MemoryProjectStore } from "../projects/memoryStore.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import type { VisionUnderstandingProvider } from "../../providers/vision/visionUnderstandingProvider.js";
import { processAssetStructure } from "./assetProcessingService.js";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l5Z2WQAAAABJRU5ErkJggg==",
  "base64",
);

describe("processAssetStructure", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
  });

  it("uses storage read URLs and local cached image frames for image structure generation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shopclip-asset-structure-"));
    tempDirs.push(directory);
    const imagePath = join(directory, "source.png");
    await writeFile(imagePath, tinyPng);

    const store = new MemoryProjectStore();
    const assetId = "asset_signed_image";
    const objectKey = `library/raw/${assetId}/source.png`;
    store.addAssetWithId(undefined, assetId, {
      name: "Signed image asset",
      type: "image",
      status: "ready",
      url: "https://storage.example.test/public/source.png",
      mimeType: "image/png",
      sizeBytes: tinyPng.length,
      source: "external_provider",
      storageProvider: "tencent-cos",
      objectKey,
      tags: ["signed", "image"],
      metadata: {
        localFilePath: imagePath,
      },
    });

    const uploadedObjects: Array<{ contentType: string; objectKey: string }> = [];
    const storageProvider: StorageProvider = {
      createReadUrl: ({ objectKey }) => ({ url: `https://signed.example.test/${objectKey}?sign=read` }),
      createUploadIntent: () => {
        throw new Error("createUploadIntent should not be called during structure processing.");
      },
      deleteObject: async () => undefined,
      uploadObject: async ({ contentType, objectKey }) => {
        uploadedObjects.push({ contentType, objectKey });
        return {
          objectKey,
          provider: "tencent-cos",
          publicUrl: `https://storage.example.test/${objectKey}`,
        };
      },
    };

    const seen: {
      assetUrl?: string;
      frameLocalPath?: string;
      frameKey?: string;
      frameContentType?: string;
      sliceAssetUrl?: string;
    } = {};
    const visionProvider: VisionUnderstandingProvider = {
      understandAsset: async ({ asset, frames }): Promise<StructuredAssetMetadata> => {
        seen.assetUrl = asset.url;
        seen.frameLocalPath = frames[0]?.localPath;
        seen.frameKey = frames[0]?.key;
        seen.frameContentType = frames[0]?.contentType;
        return {
          assetId: asset.id,
          type: asset.type,
          source: asset.source ?? "merchant_upload",
          sourceDeclaration: "External image imported into COS.",
          objectKey: asset.objectKey,
          overallSummary: "Signed image asset is ready for ecommerce structure.",
          role: "hero_image",
          globalTags: ["signed", "image", "hero_image"],
          ocrText: "",
          asrSummary: "",
          visualStyle: {
            colors: ["neutral"],
            materials: [],
          },
          qualitySignals: {
            productVisibility: "clear",
            usableForAd: true,
          },
          complianceFlags: [],
          searchText: "signed image hero_image",
          embeddingText: "signed image hero_image",
          modelTrace: {
            provider: "test-vision",
          },
        };
      },
      understandSlice: async ({ asset, frameKeys, sliceId, startSecond, endSecond }): Promise<StructuredSliceMetadata> => {
        seen.sliceAssetUrl = asset.url;
        return {
          sliceId,
          assetId: asset.id,
          startSecond,
          endSecond,
          thumbnailKey: frameKeys[0],
          frameKeys,
          summary: "Image slice shows the imported asset.",
          transcript: "",
          ocrText: "",
          shotType: "close_up",
          cameraMovement: "static",
          composition: "Centered image composition.",
          transition: "hard_cut",
          mood: "practical",
          action: "static product detail",
          keyElements: ["product"],
          productVisibility: "clear",
          visibleProductParts: ["main body"],
          suitableSceneRoles: ["demo"],
          qualitySignals: {
            productVisibility: "clear",
            usableForAd: true,
          },
          searchText: "signed image demo",
          embeddingText: "signed image demo",
          cosFrameObjectKeys: frameKeys,
        };
      },
    };

    const result = await processAssetStructure({
      assetId,
      input: { forceRegenerate: true, mode: "full" },
      store,
      storageProvider,
      visionProvider,
    });

    expect(seen.assetUrl).toBe(`https://signed.example.test/${objectKey}?sign=read`);
    expect(seen.sliceAssetUrl).toBe(`https://signed.example.test/${objectKey}?sign=read`);
    expect(seen.frameLocalPath).toBe(imagePath);
    expect(seen.frameKey).toMatch(/^library\/derived\/asset_signed_image\/frames\/source\.png$/);
    expect(seen.frameContentType).toBe("image/png");
    expect(result?.job.status).toBe("ready");
    expect(result?.slices).toHaveLength(1);
    expect(result?.asset.metadata?.structuredAsset).toMatchObject({
      assetId,
      role: "hero_image",
    });
    expect(uploadedObjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentType: "image/png",
          objectKey: "library/derived/asset_signed_image/frames/source.png",
        }),
        expect.objectContaining({
          contentType: "application/json",
          objectKey: "library/derived/asset_signed_image/metadata/structured-asset.json",
        }),
      ]),
    );
  });
});
