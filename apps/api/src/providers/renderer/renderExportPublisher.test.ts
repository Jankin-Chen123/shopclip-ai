import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SceneRenderClip } from "@shopclip/shared";
import { describe, expect, it, vi } from "vitest";

import type { StorageProvider } from "../storage/storageProvider.js";
import { publishRenderExportToStorage } from "./renderExportPublisher.js";

const clips: SceneRenderClip[] = [
  {
    sceneId: "scene-2",
    order: 2,
    status: "completed",
    progress: 100,
    videoUrl: "https://cdn.example.test/scene-2.mp4",
  },
  {
    sceneId: "scene-1",
    order: 1,
    status: "completed",
    progress: 100,
    videoUrl: "https://cdn.example.test/scene-1.mp4",
  },
];

const createStorageProvider = (): StorageProvider => ({
  createUploadIntent: vi.fn(),
  createReadUrl: vi.fn(({ objectKey }) => ({
    expiresAt: "2026-05-29T12:00:00.000Z",
    url: `https://signed.example.test/${objectKey}?signature=test`,
  })),
  deleteObject: vi.fn(),
  uploadObject: vi.fn(async ({ objectKey }) => ({
    objectKey,
    provider: "mock-cos",
    publicUrl: `https://cdn.example.test/${objectKey}`,
  })),
});

describe("render export publisher", () => {
  it("uploads a locally composed single-scene export instead of returning the raw scene URL", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "shopclip-export-publisher-"));
    const outputPath = join(workdir, "export.mp4");
    await writeFile(outputPath, Buffer.from("captioned-single-scene-video"));
    const storageProvider = createStorageProvider();
    const localComposer = vi.fn(async () => ({
      exportId: "export-single",
      localUrl: "/api/render-exports/project-1/export-single/export.mp4",
      outputPath,
    }));

    const exportUrl = await publishRenderExportToStorage("project-1", [clips[0]!], {
      localComposer,
      storageProvider,
    });

    expect(exportUrl).toBe(
      "https://cdn.example.test/projects/project-1/exports/export-single/export.mp4",
    );
    expect(localComposer).toHaveBeenCalledWith("project-1", [clips[0]!]);
    expect(storageProvider.uploadObject).toHaveBeenCalledWith({
      body: Buffer.from("captioned-single-scene-video"),
      contentType: "video/mp4",
      objectKey: "projects/project-1/exports/export-single/export.mp4",
    });
  });

  it("uploads a locally composed multi-scene export to COS and returns the public object URL", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "shopclip-export-publisher-"));
    const outputPath = join(workdir, "export.mp4");
    await writeFile(outputPath, Buffer.from("final-video"));
    const storageProvider = createStorageProvider();

    const exportUrl = await publishRenderExportToStorage("project-1", clips, {
      localComposer: async () => ({
        exportId: "export-1",
        localUrl: "/api/render-exports/project-1/export-1/export.mp4",
        outputPath,
      }),
      storageProvider,
    });

    expect(exportUrl).toBe("https://cdn.example.test/projects/project-1/exports/export-1/export.mp4");
    expect(storageProvider.uploadObject).toHaveBeenCalledWith({
      body: Buffer.from("final-video"),
      contentType: "video/mp4",
      objectKey: "projects/project-1/exports/export-1/export.mp4",
    });
  });

  it("can return a signed read URL for private COS buckets", async () => {
    const workdir = await mkdtemp(join(tmpdir(), "shopclip-export-publisher-"));
    const outputPath = join(workdir, "export.mp4");
    await writeFile(outputPath, Buffer.from("final-video"));
    const storageProvider = createStorageProvider();

    const exportUrl = await publishRenderExportToStorage("project-1", clips, {
      env: { COS_EXPORT_READ_MODE: "signed" },
      localComposer: async () => ({
        exportId: "export-1",
        localUrl: "/api/render-exports/project-1/export-1/export.mp4",
        outputPath,
      }),
      storageProvider,
    });

    expect(exportUrl).toBe(
      "https://signed.example.test/projects/project-1/exports/export-1/export.mp4?signature=test",
    );
    expect(storageProvider.createReadUrl).toHaveBeenCalledWith({
      objectKey: "projects/project-1/exports/export-1/export.mp4",
    });
  });
});
