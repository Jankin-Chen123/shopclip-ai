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

describe("P1 asset retrieval and scene editing", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const app = createApp({
      externalAssetDownloader: async (asset) => ({
        body: Buffer.from(`downloaded:${asset.source}:${asset.externalId}`),
        contentType:
          asset.type === "video"
            ? "video/mp4"
            : asset.type === "audio"
              ? "audio/mpeg"
              : "image/jpeg",
        sourceUrl: asset.downloadUrl ?? asset.previewUrl,
      }),
    });
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

  it("tags uploaded assets, creates slices, and ranks retrieval results for keyword, tag, and vector-like queries", async () => {
    const projectId = await createProject(baseUrl);

    const assets = [
      {
        type: "image",
        name: "Hero packshot on white",
        mimeType: "image/png",
        sizeBytes: 180_000,
        tags: ["product"],
      },
      {
        type: "image",
        name: "Hands free desk lifestyle demo",
        mimeType: "image/webp",
        sizeBytes: 260_000,
        tags: ["desk", "benefit"],
      },
      {
        type: "image",
        name: "Unboxing shipping box",
        mimeType: "image/jpeg",
        sizeBytes: 200_000,
        tags: ["packaging"],
      },
    ];

    for (const asset of assets) {
      const created = await request<{ asset: { tags: string[] } }>(
        baseUrl,
        `/api/projects/${projectId}/assets`,
        {
          method: "POST",
          body: JSON.stringify(asset),
        },
      );
      expect(created.status).toBe(201);
      expect(created.body.asset.tags.length).toBeGreaterThan(asset.tags.length);
    }

    const loaded = await request<{
      project: { assetSlices: Array<{ label: string; tags: string[] }> };
    }>(baseUrl, `/api/projects/${projectId}`);

    expect(loaded.status).toBe(200);
    expect(loaded.body.project.assetSlices).toHaveLength(3);
    expect(loaded.body.project.assetSlices[0].tags.length).toBeGreaterThan(0);

    const keyword = await request<{
      results: Array<{ asset: { name: string }; score: number; reasons: string[] }>;
    }>(baseUrl, `/api/assets/search?projectId=${projectId}&q=hands-free%20desk`);

    expect(keyword.status).toBe(200);
    expect(keyword.body.results[0].asset.name).toBe("Hands free desk lifestyle demo");
    expect(keyword.body.results[0].score).toBeGreaterThan(keyword.body.results[1].score);
    expect(keyword.body.results[0].reasons.join(" ")).toContain("keyword");

    const tag = await request<{
      results: Array<{ asset: { name: string }; reasons: string[] }>;
    }>(baseUrl, `/api/assets/search?projectId=${projectId}&tags=packaging`);

    expect(tag.status).toBe(200);
    expect(tag.body.results[0].asset.name).toBe("Unboxing shipping box");
    expect(tag.body.results[0].reasons.join(" ")).toContain("tag");

    const vectorLike = await request<{
      results: Array<{ asset: { name: string }; reasons: string[] }>;
    }>(baseUrl, `/api/assets/search?projectId=${projectId}&q=stable%20creator%20table`);

    expect(vectorLike.status).toBe(200);
    expect(vectorLike.body.results[0].asset.name).toBe("Hands free desk lifestyle demo");
    expect(vectorLike.body.results[0].reasons.join(" ")).toContain("vector-like");
  });

  it("keeps external provider results out of local asset matches", async () => {
    const projectId = await createProject(baseUrl);
    const created = await request<{ asset: { id: string } }>(
      baseUrl,
      `/api/projects/${projectId}/assets`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "image",
          name: "Desk packshot",
          mimeType: "image/png",
          sizeBytes: 180_000,
          tags: ["desk"],
        }),
      },
    );
    expect(created.status).toBe(201);

    const searched = await request<{
      results: Array<{ asset: { name: string } }>;
      externalResults: Array<{ source: string; title: string; previewUrl: string }>;
    }>(baseUrl, `/api/assets/search?projectId=${projectId}&q=desk`);

    expect(searched.status).toBe(200);
    expect(searched.body.results[0].asset.name).toBe("Desk packshot");
    expect(searched.body.externalResults).toEqual([]);
  });

  it("returns an empty external search response when no user provider is configured", async () => {
    const searched = await request<{
      query: string;
      page: number;
      perPage: number;
      hasMore: boolean;
      externalResults: Array<{ source: string; title: string }>;
    }>(baseUrl, "/api/assets/external-search", {
      method: "POST",
      body: JSON.stringify({
        query: "desk product",
        page: 2,
        perPage: 4,
        type: "image",
        providers: [],
      }),
    });

    expect(searched.status).toBe(200);
    expect(searched.body.query).toBe("desk product");
    expect(searched.body).toMatchObject({ page: 2, perPage: 4, hasMore: false });
    expect(searched.body.externalResults).toEqual([]);
    expect(JSON.stringify(searched.body)).not.toContain("apiKey");
  });

  it("imports an external provider result into the project asset library", async () => {
    const projectId = await createProject(baseUrl);

    const imported = await request<{
      asset: {
        id: string;
        name: string;
        objectKey?: string;
        status: string;
        storageProvider?: string;
        type: string;
        url: string;
        tags: string[];
        mimeType?: string;
      };
      processingJob: {
        assetId: string;
        id: string;
        status: string;
      };
    }>(baseUrl, `/api/projects/${projectId}/assets/import-external`, {
      method: "POST",
      body: JSON.stringify({
        id: "pexels:video:654",
        source: "pexels",
        externalId: "654",
        type: "video",
        title: "Desk setup B-roll",
        thumbnailUrl: "https://images.pexels.com/videos/654/thumb.jpg",
        previewUrl: "https://videos.pexels.com/video-files/654/preview.mp4",
        downloadUrl: "https://videos.pexels.com/video-files/654/download.mp4",
        externalUrl: "https://www.pexels.com/video/654/",
        authorName: "Pexels Creator",
        authorUrl: "https://www.pexels.com/@creator",
        licenseLabel: "Pexels License",
        licenseUrl: "https://www.pexels.com/license/",
        canUseCommercially: true,
        requiresAttribution: false,
        tags: ["desk", "product"],
        durationSeconds: 6,
      }),
    });

    expect(imported.status).toBe(202);
    expect(imported.body.asset).toMatchObject({
      name: "Desk setup B-roll",
      type: "video",
      mimeType: "video/mp4",
      status: "processing",
    });
    expect(imported.body.processingJob).toMatchObject({
      assetId: imported.body.asset.id,
      status: "processing",
    });

    const completed = await waitFor(
      () =>
        request<{
          processingJob: {
            id: string;
            status: string;
          };
        }>(baseUrl, `/api/asset-processing-jobs/${imported.body.processingJob.id}`),
      (loaded) => loaded.body.processingJob.status === "ready",
    );
    expect(completed.body.processingJob.status).toBe("ready");

    const loaded = await request<{
      project: {
        assets: Array<{
          id: string;
          name: string;
          objectKey?: string;
          status: string;
          storageProvider?: string;
          tags: string[];
          url: string;
        }>;
      };
    }>(baseUrl, `/api/projects/${projectId}`);
    const readyAsset = loaded.body.project.assets.find(
      (asset) => asset.id === imported.body.asset.id,
    );
    expect(readyAsset).toMatchObject({
      id: imported.body.asset.id,
      name: "Desk setup B-roll",
      status: "ready",
      storageProvider: "mock-cos",
    });
    expect(readyAsset?.objectKey).toMatch(
      new RegExp(`^projects/${projectId}/raw/${imported.body.asset.id}/source\\.mp4$`),
    );
    expect(readyAsset?.url).toContain(readyAsset?.objectKey ?? "");
    expect(readyAsset?.tags).toEqual(
      expect.arrayContaining([
        "desk",
        "product",
        "video",
        "external",
        "source-pexels",
        "license-pexels-license",
        "storage-mock-cos",
      ]),
    );
    expect(loaded.body.project.assets).toContainEqual(
      expect.objectContaining({ id: imported.body.asset.id, name: "Desk setup B-roll" }),
    );
  });

  it("imports a Freesound audio result into the project asset library as an audio reference", async () => {
    const projectId = await createProject(baseUrl);

    const imported = await request<{
      asset: {
        id: string;
        name: string;
        objectKey?: string;
        status: string;
        storageProvider?: string;
        type: string;
        url: string;
        tags: string[];
        mimeType?: string;
      };
      processingJob: {
        assetId: string;
        id: string;
        status: string;
      };
    }>(baseUrl, `/api/projects/${projectId}/assets/import-external`, {
      method: "POST",
      body: JSON.stringify({
        id: "freesound:sound:12345",
        source: "freesound",
        externalId: "12345",
        type: "audio",
        title: "Cash register button click",
        thumbnailUrl: "",
        previewUrl: "https://cdn.freesound.org/previews/12/12345-hq.mp3",
        downloadUrl: "https://cdn.freesound.org/previews/12/12345-hq.mp3",
        externalUrl: "https://freesound.org/people/creator/sounds/12345/",
        authorName: "Freesound Creator",
        authorUrl: "https://freesound.org/people/creator/",
        licenseLabel: "Creative Commons 0",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        canUseCommercially: true,
        requiresAttribution: false,
        tags: ["click", "cash register"],
        durationSeconds: 1.2,
      }),
    });

    expect(imported.status).toBe(202);
    expect(imported.body.asset).toMatchObject({
      name: "Cash register button click",
      type: "reference",
      mimeType: "audio/mpeg",
      status: "processing",
    });

    await waitFor(
      () =>
        request<{
          processingJob: {
            id: string;
            status: string;
          };
        }>(baseUrl, `/api/asset-processing-jobs/${imported.body.processingJob.id}`),
      (loaded) => loaded.body.processingJob.status === "ready",
    );

    const loaded = await request<{
      project: {
        assets: Array<{
          id: string;
          objectKey?: string;
          status: string;
          storageProvider?: string;
          tags: string[];
          url: string;
        }>;
      };
    }>(baseUrl, `/api/projects/${projectId}`);
    const readyAsset = loaded.body.project.assets.find(
      (asset) => asset.id === imported.body.asset.id,
    );
    expect(readyAsset).toMatchObject({
      status: "ready",
      storageProvider: "mock-cos",
    });
    expect(readyAsset?.objectKey).toMatch(
      new RegExp(`^projects/${projectId}/raw/${imported.body.asset.id}/source\\.mp3$`),
    );
    expect(readyAsset?.url).toContain(readyAsset?.objectKey ?? "");
    expect(readyAsset?.tags).toEqual(
      expect.arrayContaining([
        "audio",
        "click",
        "cash-register",
        "external",
        "source-freesound",
        "license-creative-commons-0",
        "storage-mock-cos",
      ]),
    );
  });

  it("updates, reorders, deletes, regenerates scenes, and applies editing agent suggestions without changing unrelated scenes", async () => {
    const projectId = await createProject(baseUrl);

    const asset = await request<{ asset: { id: string } }>(
      baseUrl,
      `/api/projects/${projectId}/assets`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "image",
          name: "Hands free desk lifestyle demo",
          mimeType: "image/webp",
          sizeBytes: 260_000,
          tags: ["desk", "benefit"],
        }),
      },
    );
    expect(asset.status).toBe(201);

    const generated = await request<{
      script: {
        scenes: Array<{
          id: string;
          order: number;
          subtitle: string;
          voiceover: string;
          visualPrompt: string;
        }>;
      };
    }>(baseUrl, `/api/projects/${projectId}/generate-script`, { method: "POST" });
    expect(generated.status).toBe(201);

    const [firstScene, secondScene, thirdScene, fourthScene] = generated.body.script.scenes;
    const patched = await request<{
      scene: { id: string; durationSeconds: number; subtitle: string; assetId: string };
    }>(baseUrl, `/api/scenes/${firstScene.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        durationSeconds: 2.5,
        subtitle: "Hands-free desk hook",
        voiceover: "Keep the product steady while you film.",
        visualPrompt: "Close shot of the stand holding a phone on a creator desk.",
        assetId: asset.body.asset.id,
      }),
    });

    expect(patched.status).toBe(200);
    expect(patched.body.scene).toMatchObject({
      id: firstScene.id,
      durationSeconds: 2.5,
      subtitle: "Hands-free desk hook",
      assetId: asset.body.asset.id,
    });

    const reordered = await request<{
      scenes: Array<{ id: string; order: number }>;
    }>(baseUrl, `/api/projects/${projectId}/scenes/reorder`, {
      method: "POST",
      body: JSON.stringify({
        sceneIds: [fourthScene.id, firstScene.id, secondScene.id, thirdScene.id],
      }),
    });

    expect(reordered.status).toBe(200);
    expect(reordered.body.scenes.map((scene) => scene.id)).toEqual([
      fourthScene.id,
      firstScene.id,
      secondScene.id,
      thirdScene.id,
    ]);
    expect(reordered.body.scenes.map((scene) => scene.order)).toEqual([1, 2, 3, 4]);

    const deleted = await request<{ scenes: Array<{ id: string; order: number }> }>(
      baseUrl,
      `/api/scenes/${thirdScene.id}`,
      { method: "DELETE" },
    );

    expect(deleted.status).toBe(200);
    expect(deleted.body.scenes.map((scene) => scene.id)).not.toContain(thirdScene.id);
    expect(deleted.body.scenes.map((scene) => scene.order)).toEqual([1, 2, 3]);

    const beforeRegen = await request<{
      project: { scenes: Array<{ id: string; subtitle: string; voiceover: string }> };
    }>(baseUrl, `/api/projects/${projectId}`);
    const untouchedBefore = beforeRegen.body.project.scenes.find(
      (scene) => scene.id === secondScene.id,
    );
    expect(untouchedBefore).toBeDefined();

    const regenerated = await request<{
      scene: { id: string; subtitle: string; voiceover: string; visualPrompt: string; status: string };
      traceEvent: { step: string; message: string };
    }>(baseUrl, `/api/scenes/${firstScene.id}/regenerate`, {
      method: "POST",
      body: JSON.stringify({
        scene: {
          durationSeconds: 5,
          subtitle: "Current inspector subtitle",
          voiceover: "Current inspector voiceover",
          visualPrompt: "Current inspector visual prompt for image regeneration",
          assetId: asset.body.asset.id,
        },
      }),
    });

    expect(regenerated.status).toBe(200);
    expect(regenerated.body.scene).toMatchObject({
      id: firstScene.id,
      status: "generated",
      subtitle: "Current inspector subtitle",
      voiceover: "Current inspector voiceover",
      visualPrompt: "Current inspector visual prompt for image regeneration",
    });
    expect(regenerated.body.traceEvent.step).toBe("scene-regenerated");

    const afterRegen = await request<{
      project: { scenes: Array<{ id: string; subtitle: string; voiceover: string }> };
    }>(baseUrl, `/api/projects/${projectId}`);
    const untouchedAfter = afterRegen.body.project.scenes.find(
      (scene) => scene.id === secondScene.id,
    );
    expect(untouchedAfter).toEqual(untouchedBefore);

    const suggestions = await request<{
      suggestions: Array<{
        id: string;
        explanation: string;
        update: { subtitle?: string; visualPrompt?: string };
      }>;
    }>(baseUrl, `/api/scenes/${firstScene.id}/suggestions`);

    expect(suggestions.status).toBe(200);
    expect(suggestions.body.suggestions).toHaveLength(2);
    expect(suggestions.body.suggestions[0].explanation.length).toBeGreaterThan(10);

    const applied = await request<{
      scene: { id: string; subtitle: string; status: string };
      traceEvent: { step: string; message: string };
    }>(
      baseUrl,
      `/api/scenes/${firstScene.id}/suggestions/${suggestions.body.suggestions[0].id}/apply`,
      {
        method: "POST",
      },
    );

    expect(applied.status).toBe(200);
    expect(applied.body.scene.status).toBe("edited");
    expect(applied.body.traceEvent.step).toBe("agent-suggestion-applied");
    expect(applied.body.traceEvent.message).toContain(suggestions.body.suggestions[0].id);
  });
});
