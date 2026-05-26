import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app";

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
    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.once("listening", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
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
      structureProvider: "mock-asset-processor",
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
      structureProvider: "mock-asset-processor",
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
});
