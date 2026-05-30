import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { MemoryProjectStore } from "./modules/projects/memoryStore.js";
import type { StorageProvider } from "./providers/storage/storageProvider.js";

const require = createRequire(import.meta.url);
const ffmpegPath = (require("@ffmpeg-installer/ffmpeg") as { path: string }).path;

const runFfmpeg = (args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg fixture generation failed with ${code}: ${stderr.slice(0, 800)}`));
    });
  });

const createFixtureVideo = async (directory: string, name: string) => {
  const videoPath = join(directory, name);
  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x180:rate=10",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=1000:duration=9",
    "-t",
    "9",
    "-c:v",
    "mpeg4",
    "-q:v",
    "5",
    "-c:a",
    "aac",
    videoPath,
  ]);
  return videoPath;
};

const waitForReferenceStatus = async (
  baseUrl: string,
  referenceId: string,
  status: string,
) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const referencesResponse = await fetch(`${baseUrl}/api/references`);
    expect(referencesResponse.status).toBe(200);
    const references = (await referencesResponse.json()) as {
      references: Array<{
        analysis?: { commerceNarrativeSegments?: Array<{ role: string }> };
        id: string;
        projectId?: string;
        sourceAssetId?: string;
        sourceUrl?: string;
        status: string;
      }>;
    };
    const reference = references.references.find((candidate) => candidate.id === referenceId);
    if (reference?.status === status) {
      return reference;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Reference ${referenceId} did not reach status ${status}.`);
};

describe("Part 015 structured asset and reference flow", () => {
  let server: Server;
  let baseUrl: string;
  let workdir: string;
  let productVideoPath: string;
  let ownedReferenceVideoPath: string;
  let publicReferenceVideoPath: string;
  let uploadedObjects: Array<{ contentType: string; objectKey: string }>;

  beforeEach(async () => {
    process.env.VISION_PROVIDER_MODE = "mock";
    process.env.REFERENCE_PROVIDER_MODE = "mock";
    process.env.REFERENCE_DOWNLOAD_PROVIDER_MODE = "mock";
    process.env.AI_PROVIDER_MODE = "mock";
    workdir = await mkdtemp(join(tmpdir(), "shopclip-part015-real-"));
    productVideoPath = await createFixtureVideo(workdir, "portable-blender-close-up-demo.mp4");
    ownedReferenceVideoPath = await createFixtureVideo(workdir, "self-shot-reference-demo.mp4");
    publicReferenceVideoPath = await createFixtureVideo(workdir, "public-reference-demo.mp4");
    const publicReferenceStats = await stat(publicReferenceVideoPath);
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
      referenceDownloader: {
        downloadReference: async ({ reference }) => ({
          durationSeconds: 9,
          height: 180,
          localFilePath: publicReferenceVideoPath,
          mimeType: "video/mp4",
          name: "public-reference-demo.mp4",
          publicAnalysisUrl: publicReferenceVideoPath,
          sizeBytes: publicReferenceStats.size,
          sourceUrl: reference.sourceUrl,
          width: 320,
        }),
      },
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.once("listening", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    delete process.env.VISION_PROVIDER_MODE;
    delete process.env.REFERENCE_PROVIDER_MODE;
    delete process.env.REFERENCE_DOWNLOAD_PROVIDER_MODE;
    delete process.env.AI_PROVIDER_MODE;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await rm(workdir, { recursive: true, force: true });
  });

  it("analyzes public reference videos without a project and reuses them for later script generation", async () => {
    const referenceResponse = await fetch(`${baseUrl}/api/references/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceUrl: "https://example.test/video/global-viral-blender",
        sourcePlatform: "tiktok",
        sourceDeclaration: "Public reference URL; save structured analysis only.",
        title: "Global viral blender proof",
        category: "Kitchen appliances",
      }),
    });
    expect(referenceResponse.status).toBe(202);
    const reference = (await referenceResponse.json()) as {
      reference: {
        id: string;
        projectId?: string;
        sourceAssetId?: string;
        status: string;
      };
    };
    expect(reference.reference.projectId).toBeUndefined();
    expect(reference.reference.status).toBe("analyzing");
    const readyReference = await waitForReferenceStatus(baseUrl, reference.reference.id, "ready");
    expect(readyReference.sourceAssetId).toBeTruthy();

    const referencesResponse = await fetch(`${baseUrl}/api/references`);
    expect(referencesResponse.status).toBe(200);
    const references = (await referencesResponse.json()) as {
      references: Array<{ id: string; projectId?: string }>;
    };
    expect(references.references.some((candidate) => candidate.id === readyReference.id)).toBe(
      true,
    );

    const templateResponse = await fetch(`${baseUrl}/api/references/templates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category: "Kitchen appliances",
        referenceIds: [readyReference.id],
        templateName: "Global Identity Hook Demo",
      }),
    });
    expect(templateResponse.status).toBe(201);
    const template = (await templateResponse.json()) as {
      template: { templateId: string };
    };

    const templatesResponse = await fetch(`${baseUrl}/api/references/templates`);
    expect(templatesResponse.status).toBe(200);
    const templates = (await templatesResponse.json()) as {
      templates: Array<{ templateId: string }>;
    };
    expect(
      templates.templates.some((candidate) => candidate.templateId === template.template.templateId),
    ).toBe(true);

    const projectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Reuse global reference",
        productName: "BlendGo Portable Blender",
        audience: "Busy commuters",
        sellingPoints: ["USB-C charging", "leak-proof lid"],
        tone: "confident",
        style: "fast demo",
        targetDurationSeconds: 15,
      }),
    });
    expect(projectResponse.status).toBe(201);
    const { project } = (await projectResponse.json()) as { project: { id: string } };

    const scriptResponse = await fetch(`${baseUrl}/api/projects/${project.id}/generate-script`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productionMode: "template",
        referenceId: readyReference.id,
        templateId: template.template.templateId,
      }),
    });
    expect(scriptResponse.status).toBe(201);
    const script = (await scriptResponse.json()) as { script: { constraints: string[] } };
    expect(script.script.constraints.join(" ")).toContain("参考视频");
  });

  it("processes video assets into searchable slices and stores reference breakdowns", async () => {
    const projectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Portable blender launch",
        productName: "BlendGo Portable Blender",
        audience: "Busy commuters",
        sellingPoints: ["USB-C charging", "leak-proof lid"],
        tone: "confident",
        style: "fast demo",
        targetDurationSeconds: 15,
      }),
    });
    expect(projectResponse.status).toBe(201);
    const { project } = (await projectResponse.json()) as { project: { id: string } };

    const assetResponse = await fetch(`${baseUrl}/api/projects/${project.id}/assets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "video",
        name: "portable-blender-close-up-demo.mp4",
        mimeType: "video/mp4",
        sizeBytes: 4_000_000,
        url: productVideoPath,
        tags: ["portable blender", "close-up", "demo"],
        metadata: {
          localFilePath: productVideoPath,
        },
      }),
    });
    expect(assetResponse.status).toBe(201);
    const { asset } = (await assetResponse.json()) as { asset: { id: string } };

    const processResponse = await fetch(`${baseUrl}/api/assets/${asset.id}/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "full", forceRegenerate: true }),
    });
    expect(processResponse.status).toBe(202);
    const processed = (await processResponse.json()) as {
      asset: { metadata?: Record<string, unknown> };
      events: Array<{ step: string; status: string }>;
      job: { status: string };
      slices: Array<{
        metadata?: {
          cosFrameObjectKeys?: string[];
          suitableSceneRoles?: string[];
          productVisibility?: string;
        };
        searchText?: string;
      }>;
    };
    expect(processed.job.status).toBe("ready");
    expect(processed.events.map((event) => event.step)).toEqual([
      "probe",
      "sample_frames",
      "publish_artifacts",
      "prepare_ocr",
      "understand",
      "persist_metadata",
      "index",
    ]);
    expect(processed.slices.length).toBeGreaterThanOrEqual(3);
    expect(processed.slices[0]?.metadata?.suitableSceneRoles).toContain("demo");
    expect(processed.slices[0]?.metadata?.cosFrameObjectKeys?.[0]).toMatch(
      new RegExp(`^projects/${project.id}/derived/${asset.id}/frames/.+\\.jpg$`),
    );
    expect(processed.asset.metadata?.structuredAssetObjectKey).toBe(
      `projects/${project.id}/derived/${asset.id}/metadata/structured-asset.json`,
    );
    expect(
      uploadedObjects.some((object) =>
        object.objectKey.endsWith("/metadata/structured-asset.json"),
      ),
    ).toBe(true);

    const searchResponse = await fetch(
      `${baseUrl}/api/assets/search?projectId=${project.id}&q=close-up%20demo&level=slice&sceneRole=demo`,
    );
    expect(searchResponse.status).toBe(200);
    const search = (await searchResponse.json()) as {
      results: Array<{ reasons: string[]; slices: Array<{ searchText?: string }> }>;
    };
    expect(search.results[0]?.slices[0]?.searchText).toContain("demo");
    expect(search.results[0]?.reasons.some((reason) => reason.startsWith("slice-role:demo"))).toBe(
      true,
    );

    const ownedReferenceAssetResponse = await fetch(`${baseUrl}/api/projects/${project.id}/assets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "video",
        name: "self-shot-reference-demo.mp4",
        mimeType: "video/mp4",
        sizeBytes: 3_200_000,
        url: ownedReferenceVideoPath,
        tags: ["self-shot", "reference", "demo"],
        metadata: {
          localFilePath: ownedReferenceVideoPath,
        },
      }),
    });
    expect(ownedReferenceAssetResponse.status).toBe(201);
    const { asset: ownedReferenceAsset } = (await ownedReferenceAssetResponse.json()) as {
      asset: { id: string };
    };

    const ownedReferenceResponse = await fetch(`${baseUrl}/api/references/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        sourceAssetId: ownedReferenceAsset.id,
        sourcePlatform: "merchant_upload",
        sourceDeclaration: "Merchant-owned uploaded reference video; may analyze frames and transcript.",
        title: "Self-shot commuter smoothie proof",
        category: "Kitchen appliances",
      }),
    });
    expect(ownedReferenceResponse.status).toBe(202);
    const ownedReference = (await ownedReferenceResponse.json()) as {
      reference: { id: string; sourceAssetId?: string; sourceUrl: string; status: string };
    };
    expect(ownedReference.reference.sourceAssetId).toBe(ownedReferenceAsset.id);
    expect(ownedReference.reference.sourceUrl).toBe(ownedReferenceVideoPath);
    expect(ownedReference.reference.status).toBe("analyzing");
    await waitForReferenceStatus(baseUrl, ownedReference.reference.id, "ready");

    const ownedReferenceSearchResponse = await fetch(
      `${baseUrl}/api/assets/search?projectId=${project.id}&q=self-shot&level=slice`,
    );
    expect(ownedReferenceSearchResponse.status).toBe(200);
    const ownedReferenceSearch = (await ownedReferenceSearchResponse.json()) as {
      results: Array<{ asset: { id: string }; slices: Array<{ searchText?: string }> }>;
    };
    expect(ownedReferenceSearch.results.some((result) => result.asset.id === ownedReferenceAsset.id)).toBe(
      true,
    );

    const referenceResponse = await fetch(`${baseUrl}/api/references/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        sourceUrl: "https://example.test/video/viral-blender",
        sourcePlatform: "tiktok",
        sourceDeclaration: "Public reference URL; save structured analysis only.",
        title: "Morning smoothie in 10 seconds",
        category: "Kitchen appliances",
        publicStats: { likes: 120000, comments: 3200, shares: 8400, views: 1400000 },
      }),
    });
    expect(referenceResponse.status).toBe(202);
    const reference = (await referenceResponse.json()) as {
      reference: {
        analysis?: { commerceNarrativeSegments?: Array<{ role: string }> };
        id: string;
        sourceAssetId?: string;
        status: string;
      };
    };
    expect(reference.reference.status).toBe("analyzing");
    const readyReference = await waitForReferenceStatus(baseUrl, reference.reference.id, "ready");
    expect(readyReference.sourceAssetId).toBeTruthy();
    expect(readyReference.analysis?.commerceNarrativeSegments?.map((segment) => segment.role)).toContain(
      "hook",
    );

    const publicReferenceSearchResponse = await fetch(
      `${baseUrl}/api/assets/search?projectId=${project.id}&q=viral%20blender&level=slice`,
    );
    expect(publicReferenceSearchResponse.status).toBe(200);
    const publicReferenceSearch = (await publicReferenceSearchResponse.json()) as {
      results: Array<{
        asset: { id: string; source?: string };
        slices: Array<{ metadata?: { suitableSceneRoles?: string[] }; searchText?: string }>;
      }>;
    };
    const publicReferenceResult = publicReferenceSearch.results.find(
      (result) => result.asset.id === readyReference.sourceAssetId,
    );
    expect(publicReferenceResult?.asset.source).toBe("public_reference");
    expect(publicReferenceResult?.slices.length).toBeGreaterThanOrEqual(3);
    expect(publicReferenceResult?.slices[0]?.metadata?.suitableSceneRoles).toContain("demo");

    const templateResponse = await fetch(`${baseUrl}/api/references/templates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category: "Kitchen appliances",
        referenceIds: [readyReference.id],
        templateName: "Identity Hook Demo",
      }),
    });
    expect(templateResponse.status).toBe(201);
    const template = (await templateResponse.json()) as {
      template: { templateId: string; narrativeStructure: string[] };
    };
    expect(template.template.narrativeStructure).toEqual(["hook", "demo", "trust", "cta"]);

    const scriptResponse = await fetch(`${baseUrl}/api/projects/${project.id}/generate-script`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetIds: [asset.id],
        keywords: ["close-up demo"],
        materials: [],
        productionMode: "template",
        referenceId: readyReference.id,
        templateId: template.template.templateId,
      }),
    });
    expect(scriptResponse.status).toBe(201);
    const script = (await scriptResponse.json()) as {
      script: {
        constraints: string[];
        scenes: Array<{ assetId?: string; assetRecallQuery?: string; id: string }>;
      };
    };
    expect(script.script.constraints.join(" ")).toContain("灵感模板");
    expect(script.script.scenes[0]?.assetRecallQuery).toContain("demo");

    const recallResponse = await fetch(
      `${baseUrl}/api/scenes/${script.script.scenes[0]!.id}/asset-recall`,
      { method: "POST" },
    );
    expect(recallResponse.status).toBe(200);
    const recall = (await recallResponse.json()) as {
      candidates: Array<{
        asset: { id: string };
        reasons: string[];
        slice?: { metadata?: { productVisibility?: string } };
      }>;
    };
    expect(recall.candidates[0]?.asset.id).toBe(asset.id);
    expect(
      recall.candidates.some((candidate) => candidate.asset.id === readyReference.sourceAssetId),
    ).toBe(false);
    expect(recall.candidates[0]?.slice?.metadata?.productVisibility).toBe("clear");
    expect(recall.candidates[0]?.reasons.join(" ")).toContain("product-visibility:clear");
  });
});
