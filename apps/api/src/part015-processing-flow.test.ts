import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { MemoryProjectStore } from "./modules/projects/memoryStore.js";

describe("Part 015 structured asset and reference flow", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const app = createApp({ store: new MemoryProjectStore() });
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
        url: "/uploads/portable-blender-close-up-demo.mp4",
        tags: ["portable blender", "close-up", "demo"],
        metadata: {
          durationSeconds: 9,
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
        metadata?: { suitableSceneRoles?: string[]; productVisibility?: string };
        searchText?: string;
      }>;
    };
    expect(processed.job.status).toBe("ready");
    expect(processed.events.map((event) => event.step)).toEqual([
      "probe",
      "sample_frames",
      "extract_audio",
      "understand",
      "persist_metadata",
      "index",
    ]);
    expect(processed.slices.length).toBeGreaterThanOrEqual(3);
    expect(processed.slices[0]?.metadata?.suitableSceneRoles).toContain("demo");

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
        url: "/uploads/self-shot-reference-demo.mp4",
        tags: ["self-shot", "reference", "demo"],
        metadata: {
          durationSeconds: 6,
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
    expect(ownedReferenceResponse.status).toBe(201);
    const ownedReference = (await ownedReferenceResponse.json()) as {
      reference: { sourceAssetId?: string; sourceUrl: string; status: string };
    };
    expect(ownedReference.reference.sourceAssetId).toBe(ownedReferenceAsset.id);
    expect(ownedReference.reference.sourceUrl).toBe("/uploads/self-shot-reference-demo.mp4");
    expect(ownedReference.reference.status).toBe("ready");

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
    expect(referenceResponse.status).toBe(201);
    const reference = (await referenceResponse.json()) as {
      reference: {
        analysis?: { commerceNarrativeSegments?: Array<{ role: string }> };
        id: string;
        status: string;
      };
    };
    expect(reference.reference.status).toBe("ready");
    expect(reference.reference.analysis?.commerceNarrativeSegments?.map((segment) => segment.role)).toContain(
      "hook",
    );

    const templateResponse = await fetch(`${baseUrl}/api/references/templates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category: "Kitchen appliances",
        referenceIds: [reference.reference.id],
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
        referenceId: reference.reference.id,
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
    expect(recall.candidates[0]?.slice?.metadata?.productVisibility).toBe("clear");
    expect(recall.candidates[0]?.reasons.join(" ")).toContain("product-visibility:clear");
  });
});
