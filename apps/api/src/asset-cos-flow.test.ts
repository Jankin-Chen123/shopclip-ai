import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import { listenOnFetchSafePort } from "./testServer";

const waitFor = async <T>(
  load: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 2_000,
): Promise<T> => {
  const startedAt = Date.now();
  let latest = await load();
  while (!predicate(latest)) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for expected state.");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    latest = await load();
  }
  return latest;
};

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
};

const request = async <T>(
  baseUrl: string,
  path: string,
  options?: RequestInit,
): Promise<{ body: T; status: number }> => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  const body = (await response.json()) as T;
  return { body, status: response.status };
};

const requestWithoutRedirect = async (
  baseUrl: string,
  path: string,
): Promise<{ location: string | null; status: number }> => {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
  });

  return {
    location: response.headers.get("location"),
    status: response.status,
  };
};

const createProject = async (baseUrl: string): Promise<string> => {
  const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
    method: "POST",
    body: JSON.stringify({
      title: "Desk launch clip",
      productName: "GlowGrip Phone Stand",
      audience: "TikTok Shop buyers",
      sellingPoints: ["folds flat", "keeps product shots stable"],
      tone: "confident",
      style: "fast desk demo",
      targetDurationSeconds: 15,
    }),
  });

  expect(created.status).toBe(201);
  return created.body.project.id;
};

describe("COS-backed asset import contract", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    process.env.VISION_PROVIDER_MODE = "mock";
    const app = createApp();
    ({ baseUrl, server } = await listenOnFetchSafePort(app));
  });

  afterEach(async () => {
    delete process.env.VISION_PROVIDER_MODE;
    vi.restoreAllMocks();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it("supports a global asset library without requiring a project", async () => {
    const created = await request<{
      asset: {
        id: string;
        projectId?: string;
        status: string;
        objectKey: string;
        type: string;
      };
      upload: {
        objectKey: string;
        publicUrl: string;
      };
    }>(baseUrl, "/api/assets/upload-intent", {
      method: "POST",
      body: JSON.stringify({
        type: "image",
        name: "Global hero.png",
        mimeType: "image/png",
        sizeBytes: 128_000,
        tags: ["global", "hero"],
      }),
    });

    expect(created.status).toBe(201);
    expect(created.body.asset.projectId).toBeUndefined();
    expect(created.body.asset.objectKey).toMatch(
      new RegExp(`^library/raw/${created.body.asset.id}/source\\.png$`),
    );

    const listedImages = await request<{
      assets: Array<{ id: string; projectId?: string; type: string }>;
      assetSlices: Array<{ assetId: string }>;
      category: string;
    }>(baseUrl, "/api/assets?category=image");

    expect(listedImages.status).toBe(200);
    expect(listedImages.body.category).toBe("image");
    expect(listedImages.body.assets).toEqual([
      expect.objectContaining({
        id: created.body.asset.id,
        type: "image",
      }),
    ]);
    expect(listedImages.body.assets[0]?.projectId).toBeUndefined();
    expect(listedImages.body.assetSlices.every((slice) => slice.assetId === created.body.asset.id)).toBe(
      true,
    );

    const searched = await request<{
      projectId?: string;
      results: Array<{ asset: { id: string } }>;
    }>(baseUrl, "/api/assets/search?q=hero");

    expect(searched.status).toBe(200);
    expect(searched.body.projectId).toBeUndefined();
    expect(searched.body.results[0]?.asset.id).toBe(created.body.asset.id);
  });

  it("creates an upload intent for project brand document assets", async () => {
    const projectId = await createProject(baseUrl);

    const created = await request<{
      asset: {
        id: string;
        mimeType: string;
        objectKey: string;
        status: string;
        tags: string[];
        type: string;
      };
      upload: {
        headers: Record<string, string>;
        objectKey: string;
      };
    }>(baseUrl, `/api/projects/${projectId}/assets/upload-intent`, {
      method: "POST",
      body: JSON.stringify({
        type: "reference",
        name: "Brand campaign brief.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 48_000,
        tags: ["script", "brand"],
      }),
    });

    expect(created.status).toBe(201);
    expect(created.body.asset).toMatchObject({
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      status: "uploaded",
      type: "reference",
    });
    expect(created.body.asset.objectKey).toMatch(
      new RegExp(`^projects/${projectId}/raw/${created.body.asset.id}/source\\.docx$`),
    );
    expect(created.body.asset.tags).toEqual(expect.arrayContaining(["script", "brand"]));
    expect(created.body.upload.objectKey).toBe(created.body.asset.objectKey);
    expect(created.body.upload.headers).toEqual({
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  });

  it("returns COS intelligent image matches as the asset search results", async () => {
    const app = createApp({
      cosAssetSearch: async ({ query }) =>
        query === "dog"
          ? [
              {
                uri: "cos://shopclip-1250000000/library/raw/cos-hit/source.png",
                objectKey: "library/raw/cos-hit/source.png",
                score: 87,
              },
              {
                uri: "cos://shopclip-1250000000/library/raw/cos-miss/source.png",
                objectKey: "library/raw/cos-miss/source.png",
                score: 69,
              },
            ]
          : [],
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
    ({ baseUrl, server } = await listenOnFetchSafePort(app));

    const hit = await request<{ asset: { id: string; objectKey: string } }>(
      baseUrl,
      "/api/assets",
      {
        method: "POST",
        body: JSON.stringify({
          type: "image",
          name: "Golden retriever product photo.png",
          mimeType: "image/png",
          sizeBytes: 180_000,
          objectKey: "library/raw/cos-hit/source.png",
          storageProvider: "tencent-cos",
          tags: ["dog"],
        }),
      },
    );
    expect(hit.status).toBe(201);

    const miss = await request<{ asset: { id: string } }>(baseUrl, "/api/assets", {
      method: "POST",
      body: JSON.stringify({
        type: "image",
        name: "Borderline score photo.png",
        mimeType: "image/png",
        sizeBytes: 180_000,
        objectKey: "library/raw/cos-miss/source.png",
        storageProvider: "tencent-cos",
        tags: ["dog"],
      }),
    });
    expect(miss.status).toBe(201);

    const searched = await request<{
      results: Array<{ asset: { id: string; name: string }; score: number; reasons: string[] }>;
    }>(baseUrl, "/api/assets/search?q=dog");

    expect(searched.status).toBe(200);
    expect(searched.body.results).toHaveLength(1);
    expect(searched.body.results[0]).toMatchObject({
      asset: {
        id: hit.body.asset.id,
        name: "Golden retriever product photo.png",
      },
      score: 87,
      reasons: expect.arrayContaining(["cos-intelligent-search", "cos-score:87"]),
    });
    expect(searched.body.results.map((result) => result.asset.id)).not.toContain(
      miss.body.asset.id,
    );
  });

  it("returns empty search results when configured COS intelligent search fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const app = createApp({
      cosAssetSearch: async () => {
        throw new Error("COS intelligent search failed with HTTP 403.");
      },
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
    ({ baseUrl, server } = await listenOnFetchSafePort(app));

    const created = await request<{ asset: { id: string } }>(baseUrl, "/api/assets", {
      method: "POST",
      body: JSON.stringify({
        type: "image",
        name: "Dog product photo.png",
        mimeType: "image/png",
        sizeBytes: 180_000,
        tags: ["dog"],
      }),
    });
    expect(created.status).toBe(201);

    const searched = await request<{
      results: Array<{ asset: { id: string; name: string } }>;
    }>(baseUrl, "/api/assets/search?q=dog");

    expect(searched.status).toBe(200);
    expect(searched.body.results).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      "[assets/search] COS intelligent search failed; returning empty COS results.",
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it("creates a COS upload intent and stores structured asset metadata without exposing secrets", async () => {
    const projectId = await createProject(baseUrl);

    const created = await request<{
      asset: {
        id: string;
        status: string;
        storageProvider: string;
        objectKey: string;
        url: string;
        tags: string[];
        metadata: Record<string, unknown>;
      };
      upload: {
        provider: string;
        bucket: string;
        region: string;
        objectKey: string;
        uploadUrl: string;
        publicUrl: string;
        method: string;
        headers: Record<string, string>;
        expiresAt: string;
      };
      processingJob: {
        id: string;
        assetId: string;
        status: string;
        steps: string[];
      };
    }>(baseUrl, `/api/projects/${projectId}/assets/upload-intent`, {
      method: "POST",
      body: JSON.stringify({
        type: "image",
        name: "Hero packshot on white.png",
        mimeType: "image/png",
        sizeBytes: 180_000,
        tags: ["product", "hero"],
      }),
    });

    expect(created.status).toBe(201);
    expect(created.body.asset).toMatchObject({
      status: "uploaded",
      storageProvider: "mock-cos",
      url: created.body.upload.publicUrl,
    });
    expect(created.body.upload).toMatchObject({
      provider: "mock-cos",
      method: "PUT",
      headers: { "content-type": "image/png" },
    });
    expect(created.body.upload.objectKey).toBe(created.body.asset.objectKey);
    expect(created.body.upload.objectKey).toMatch(
      new RegExp(`^projects/${projectId}/raw/${created.body.asset.id}/source\\.png$`),
    );
    expect(created.body.asset.tags).toEqual(
      expect.arrayContaining(["product", "hero", "storage-mock-cos", "source-merchant-upload"]),
    );
    expect(created.body.asset.metadata.structuredAssetVersion).toBe(
      "asset-multigranularity-v1",
    );
    expect(created.body.processingJob).toMatchObject({
      assetId: created.body.asset.id,
      status: "processing",
    });
    expect(created.body.processingJob.steps).toEqual(
      expect.arrayContaining(["upload", "multimodal-understanding", "slice-indexing"]),
    );
    expect(JSON.stringify(created.body)).not.toContain("SECRET");
    expect(JSON.stringify(created.body)).not.toContain("COS_SECRET");

    const searched = await request<{
      results: Array<{ asset: { id: string; objectKey: string; storageProvider: string } }>;
    }>(baseUrl, `/api/assets/search?projectId=${projectId}&q=hero`);

    expect(searched.status).toBe(200);
    expect(searched.body.results[0].asset).toMatchObject({
      id: created.body.asset.id,
      objectKey: created.body.asset.objectKey,
      storageProvider: "mock-cos",
    });

    const video = await request<{ asset: { id: string; type: string; name: string } }>(
      baseUrl,
      `/api/projects/${projectId}/assets`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "video",
          name: "Desk demo clip.mp4",
          mimeType: "video/mp4",
          sizeBytes: 1_800_000,
          tags: ["product", "demo"],
        }),
      },
    );
    expect(video.status).toBe(201);

    const listedImages = await request<{
      assets: Array<{ id: string; type: string; name: string }>;
      assetSlices: Array<{ assetId: string }>;
      category: string;
      projectId: string;
    }>(baseUrl, `/api/projects/${projectId}/assets?category=image`);

    expect(listedImages.status).toBe(200);
    expect(listedImages.body).toMatchObject({
      category: "image",
      projectId,
    });
    expect(listedImages.body.assets).toHaveLength(1);
    expect(listedImages.body.assets[0]).toMatchObject({
      id: created.body.asset.id,
      type: "image",
    });
    expect(listedImages.body.assets.map((asset) => asset.id)).not.toContain(video.body.asset.id);
    expect(listedImages.body.assetSlices.every((slice) => slice.assetId === created.body.asset.id)).toBe(
      true,
    );

    const proxiedUpload = await fetch(`${baseUrl}/api/assets/${created.body.asset.id}/upload`, {
      method: "POST",
      headers: {
        "content-type": "image/png",
      },
      body: new Uint8Array([137, 80, 78, 71]),
    });
    const proxiedUploadBody = (await proxiedUpload.json()) as {
      asset: { id: string; status: string; metadata: Record<string, unknown> };
      processingJob?: { status: string; steps: string[] };
      storage: { objectKey: string; provider: string; publicUrl: string };
    };

    expect(proxiedUpload.status).toBe(200);
    expect(proxiedUploadBody.asset).toMatchObject({
      id: created.body.asset.id,
      status: "ready",
    });
    expect(proxiedUploadBody.asset.metadata).toMatchObject({
      proxiedUpload: true,
      uploadedBytes: 4,
      structuredAssetVersion: "asset-multigranularity-v1",
      structureStatus: "pending_structure",
      localFilePath: expect.any(String),
    });
    expect(proxiedUploadBody.processingJob).toMatchObject({
      status: "ready",
    });
    expect(proxiedUploadBody.processingJob?.steps).toEqual(
      expect.arrayContaining(["server-proxy-upload", "metadata-ready"]),
    );
    expect(proxiedUploadBody.storage).toMatchObject({
      objectKey: created.body.upload.objectKey,
      provider: "mock-cos",
    });

    const content = await requestWithoutRedirect(
      baseUrl,
      `/api/assets/${created.body.asset.id}/content`,
    );

    expect(content.status).toBe(302);
    expect(content.location).toBe(proxiedUploadBody.storage.publicUrl);

    const confirmed = await request<{
      asset: {
        id: string;
        status: string;
        metadata: Record<string, unknown>;
      };
      processingJob: {
        id: string;
        status: string;
        steps: string[];
        message: string;
      };
    }>(baseUrl, `/api/assets/${created.body.asset.id}/confirm-upload`, {
      method: "POST",
      body: JSON.stringify({
        checksum: "sha256-demo",
        objectKey: created.body.upload.objectKey,
        metadata: {
          uploadedFileName: "Hero packshot on white.png",
        },
      }),
    });

    expect(confirmed.status).toBe(200);
    expect(confirmed.body.asset).toMatchObject({
      id: created.body.asset.id,
      status: "ready",
    });
    expect(confirmed.body.asset.metadata).toMatchObject({
      checksum: "sha256-demo",
      uploadedFileName: "Hero packshot on white.png",
      structuredAssetVersion: "asset-multigranularity-v1",
      structureStatus: "pending_structure",
    });
    expect(confirmed.body.processingJob).toMatchObject({
      id: created.body.processingJob.id,
      status: "ready",
    });
    expect(confirmed.body.processingJob.steps).toEqual(expect.arrayContaining(["metadata-ready"]));

    const loadedJob = await request<{
      processingJob: {
        id: string;
        status: string;
        assetId: string;
      };
    }>(baseUrl, `/api/asset-processing-jobs/${created.body.processingJob.id}`);

    expect(loadedJob.status).toBe(200);
    expect(loadedJob.body.processingJob).toMatchObject({
      id: created.body.processingJob.id,
      assetId: created.body.asset.id,
      status: "ready",
    });

    const deleted = await request<{
      deletedAssets: Array<{ id: string; objectKey?: string }>;
    }>(baseUrl, "/api/assets", {
      method: "DELETE",
      body: JSON.stringify({
        assetIds: [created.body.asset.id],
      }),
    });

    expect(deleted.status).toBe(200);
    expect(deleted.body.deletedAssets).toEqual([
      expect.objectContaining({
        id: created.body.asset.id,
        objectKey: created.body.upload.objectKey,
      }),
    ]);

    const listedAfterDelete = await request<{
      assets: Array<{ id: string }>;
      assetSlices: Array<{ assetId: string }>;
    }>(baseUrl, `/api/projects/${projectId}/assets?category=image`);

    expect(listedAfterDelete.status).toBe(200);
    expect(listedAfterDelete.body.assets).toHaveLength(0);
    expect(listedAfterDelete.body.assetSlices).toHaveLength(0);
  });

  it("queues external imports immediately and completes COS/database metadata in the background", async () => {
    const imageDownload = createDeferred<{
      body: Buffer;
      contentType: string;
      sourceUrl: string;
    }>();
    const uploadedObjects: Array<{
      body: Buffer;
      contentType: string;
      objectKey: string;
    }> = [];
    const app = createApp({
      externalAssetDownloader: () => imageDownload.promise,
      storageProvider: {
        createReadUrl: ({ objectKey }) => ({ url: `https://cos.example.test/${objectKey}` }),
        createUploadIntent: ({ asset, assetId, projectId }) => ({
          provider: "tencent-cos",
          bucket: "shopclip-assets",
          region: "ap-guangzhou",
          objectKey: projectId
            ? `projects/${projectId}/raw/${assetId}/source.${asset.mimeType.split("/")[1]}`
            : `library/raw/${assetId}/source.${asset.mimeType.split("/")[1]}`,
          uploadUrl: "https://cos.example.test/upload",
          publicUrl: "https://cos.example.test/pending",
          method: "PUT",
          headers: { "content-type": asset.mimeType },
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
        deleteObject: async () => undefined,
        uploadObject: async ({ body, contentType, objectKey }) => {
          uploadedObjects.push({ body, contentType, objectKey });
          return {
            objectKey,
            provider: "tencent-cos",
            publicUrl: `https://cos.example.test/${objectKey}`,
          };
        },
      },
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
    ({ baseUrl, server } = await listenOnFetchSafePort(app));
    const projectId = await createProject(baseUrl);

    const queued = await request<{
      asset: {
        id: string;
        metadata: Record<string, unknown>;
        mimeType: string;
        objectKey?: string;
        source: string;
        status: string;
        storageProvider?: string;
        tags: string[];
        type: string;
        url: string;
      };
      processingJob: {
        id: string;
        assetId: string;
        status: string;
        steps: string[];
      };
    }>(baseUrl, `/api/projects/${projectId}/assets/import-external`, {
      method: "POST",
      body: JSON.stringify({
        id: "pexels:image:asset-image",
        source: "pexels",
        externalId: "asset-image",
        type: "image",
        title: "Water packshot",
        thumbnailUrl: "https://images.pexels.com/thumb.jpg",
        previewUrl: "https://images.pexels.com/image/preview",
        downloadUrl: "https://images.pexels.com/image/download",
        externalUrl: "https://www.pexels.com/photo/asset-image/",
        authorName: "Pexels Creator",
        authorUrl: "https://www.pexels.com/@creator",
        licenseLabel: "Pexels License",
        licenseUrl: "https://www.pexels.com/license/",
        canUseCommercially: true,
        requiresAttribution: false,
        tags: ["water"],
      }),
    });

    expect(queued.status).toBe(202);
    expect(queued.body.asset).toMatchObject({
      name: "Water packshot",
      type: "image",
      mimeType: "image/jpeg",
      source: "external_provider",
      status: "processing",
      url: "https://images.pexels.com/image/preview",
    });
    expect(queued.body.asset.objectKey).toBeUndefined();
    expect(queued.body.asset.storageProvider).toBeUndefined();
    expect(queued.body.asset.metadata).toMatchObject({
      externalAssetImport: true,
      externalAssetType: "image",
      externalId: "asset-image",
      externalSource: "pexels",
      originalDownloadUrl: "https://images.pexels.com/image/download",
      originalPreviewUrl: "https://images.pexels.com/image/preview",
    });
    expect(queued.body.processingJob).toMatchObject({
      assetId: queued.body.asset.id,
      status: "processing",
    });
    expect(queued.body.processingJob.steps).toEqual(
      expect.arrayContaining(["queued", "external-download", "cos-upload"]),
    );
    expect(uploadedObjects).toHaveLength(0);

    imageDownload.resolve({
      body: Buffer.from("downloaded:image:asset-image"),
      contentType: "image/webp",
      sourceUrl: "https://images.pexels.com/image/download",
    });

    const completedJob = await waitFor(
      () =>
        request<{
          processingJob: {
            id: string;
            status: string;
            steps: string[];
          };
        }>(baseUrl, `/api/asset-processing-jobs/${queued.body.processingJob.id}`),
      (loaded) => loaded.body.processingJob.status === "ready",
    );

    expect(completedJob.body.processingJob.steps).toEqual(
      expect.arrayContaining([
        "external-download",
        "cos-upload",
        "multigranularity-structure",
        "metadata-ready",
      ]),
    );

    const project = await request<{
      project: {
        assetSlices: Array<{
          assetId: string;
          metadata?: Record<string, unknown>;
          searchText?: string;
          thumbnailKey?: string;
        }>;
        assets: Array<{
          id: string;
          metadata: Record<string, unknown>;
          mimeType: string;
          objectKey?: string;
          status: string;
          storageProvider?: string;
          tags: string[];
          url: string;
        }>;
      };
    }>(baseUrl, `/api/projects/${projectId}`);
    const importedAsset = project.body.project.assets.find(
      (asset) => asset.id === queued.body.asset.id,
    );

    expect(importedAsset).toMatchObject({
      status: "ready",
      mimeType: "image/webp",
      storageProvider: "tencent-cos",
      url: `https://cos.example.test/${importedAsset?.objectKey}`,
    });
    expect(importedAsset?.tags).toEqual(
      expect.arrayContaining([
        "external",
        "image",
        "source-pexels",
        "external-id-asset-image",
        "license-pexels-license",
        "storage-tencent-cos",
      ]),
    );
    expect(importedAsset?.metadata).toMatchObject({
      externalAssetImport: true,
      externalAssetType: "image",
      externalId: "asset-image",
      externalSource: "pexels",
      downloadedBytes: Buffer.byteLength("downloaded:image:asset-image"),
      downloadedFromUrl: "https://images.pexels.com/image/download",
      localFilePath: expect.any(String),
      structuredAsset: expect.objectContaining({
        assetId: queued.body.asset.id,
        type: "image",
      }),
      structuredAssetObjectKey: expect.stringMatching(
        new RegExp(`^projects/${projectId}/derived/${queued.body.asset.id}/metadata/structured-asset\\.json$`),
      ),
      structuredAssetVersion: "asset-multigranularity-v1",
    });
    expect(project.body.project.assetSlices).toContainEqual(
      expect.objectContaining({
        assetId: queued.body.asset.id,
        searchText: expect.stringContaining("water"),
      }),
    );
    expect(uploadedObjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentType: "application/json",
          objectKey: importedAsset?.metadata.structuredAssetObjectKey,
        }),
      ]),
    );
    expect(uploadedObjects[0]).toMatchObject({
      body: Buffer.from("downloaded:image:asset-image"),
      contentType: "image/webp",
      objectKey: importedAsset?.objectKey,
    });
  });
});
