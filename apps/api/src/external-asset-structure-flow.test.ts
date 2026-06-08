import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { MemoryProjectStore } from "./modules/projects/memoryStore.js";
import type { StorageProvider } from "./providers/storage/storageProvider.js";
import { listenOnFetchSafePort } from "./testServer.js";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l5Z2WQAAAABJRU5ErkJggg==",
  "base64",
);

const waitFor = async <T>(
  load: () => Promise<T | undefined>,
  predicate: (value: T) => boolean,
): Promise<T> => {
  const deadline = Date.now() + 3_000;
  let lastValue: T | undefined;
  while (Date.now() < deadline) {
    lastValue = await load();
    if (lastValue && predicate(lastValue)) {
      return lastValue;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for expected import state. Last value: ${JSON.stringify(lastValue)}`);
};

describe("external asset import structure flow", () => {
  let server: Server;
  let baseUrl: string;
  let uploadedObjects: Array<{ contentType: string; objectKey: string }>;

  beforeEach(async () => {
    process.env.VISION_PROVIDER_MODE = "mock";
    uploadedObjects = [];

    const storageProvider: StorageProvider = {
      createUploadIntent: ({ asset, assetId, projectId }) => ({
        provider: "mock-cos",
        bucket: "test-bucket",
        region: "ap-guangzhou",
        objectKey: `projects/${projectId ?? "global"}/raw/${assetId}/source.${
          asset.mimeType.split("/").at(1) ?? "bin"
        }`,
        uploadUrl: `https://cos.test/raw/${assetId}`,
        publicUrl: `https://cos.test/raw/${assetId}`,
        method: "PUT",
        headers: { "content-type": asset.mimeType },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      createReadUrl: ({ objectKey }) => ({ url: `https://cos.test/${objectKey}` }),
      deleteObject: async () => undefined,
      uploadObject: async ({ contentType, objectKey }) => {
        uploadedObjects.push({ contentType, objectKey });
        return {
          objectKey,
          provider: "mock-cos",
          publicUrl: `https://cos.test/${objectKey}`,
        };
      },
    };

    const app = createApp({
      store: new MemoryProjectStore(),
      storageProvider,
      externalAssetDownloader: async () => ({
        body: tinyPng,
        contentType: "image/png",
        sourceUrl: "https://images.pexels.com/photos/100/source.png",
      }),
    });
    ({ baseUrl, server } = await listenOnFetchSafePort(app));
  });

  afterEach(async () => {
    delete process.env.VISION_PROVIDER_MODE;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("downloads external image assets, stores them in COS, and persists structured metadata and slices", async () => {
    const projectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Cup launch",
        productName: "ClearSip Cup",
        audience: "Students",
        sellingPoints: ["large capacity"],
        tone: "confident",
        style: "clean product demo",
        targetDurationSeconds: 15,
      }),
    });
    expect(projectResponse.status).toBe(201);
    const { project } = (await projectResponse.json()) as { project: { id: string } };

    const importResponse = await fetch(`${baseUrl}/api/projects/${project.id}/assets/import-external`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "pexels:photo:100",
        source: "pexels",
        externalId: "100",
        type: "image",
        title: "Cup hero detail",
        thumbnailUrl: "https://images.pexels.com/photos/100/thumb.png",
        previewUrl: "https://images.pexels.com/photos/100/preview.png",
        downloadUrl: "https://images.pexels.com/photos/100/source.png",
        externalUrl: "https://www.pexels.com/photo/100/",
        authorName: "Pexels Creator",
        licenseLabel: "Pexels License",
        canUseCommercially: true,
        requiresAttribution: false,
        tags: ["cup", "hero", "detail"],
      }),
    });
    expect(importResponse.status).toBe(202);

    const imported = await waitFor(
      async () => {
        const projectAssetsResponse = await fetch(`${baseUrl}/api/projects/${project.id}/assets?category=all`);
        const body = (await projectAssetsResponse.json()) as {
          assetSlices: Array<{ assetId: string; searchText?: string }>;
          assets: Array<{ id: string; metadata?: Record<string, unknown>; status: string }>;
        };
        return body;
      },
      (body) =>
        body.assets.some(
          (asset) => asset.status === "ready" && Boolean(asset.metadata?.structuredAssetObjectKey),
        ) && body.assetSlices.some((slice) => slice.searchText?.includes("cup")),
    );
    const structuredAsset = imported.assets.find((asset) =>
      Boolean(asset.metadata?.structuredAssetObjectKey),
    );

    expect(structuredAsset?.metadata?.structuredAssetObjectKey).toMatch(
      new RegExp(`^projects/${project.id}/derived/${structuredAsset?.id}/metadata/structured-asset\\.json$`),
    );
    expect(uploadedObjects.some((object) => object.objectKey.includes("/raw/"))).toBe(true);
    expect(
      uploadedObjects.some((object) => object.objectKey.endsWith("/metadata/structured-asset.json")),
    ).toBe(true);
  });
});
