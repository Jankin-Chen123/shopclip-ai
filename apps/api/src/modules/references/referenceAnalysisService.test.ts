import { describe, expect, it } from "vitest";

import { MemoryProjectStore } from "../projects/memoryStore.js";
import {
  registerReferenceForAnalysis,
  runRegisteredReferenceAnalysis,
} from "./referenceAnalysisService.js";

describe("referenceAnalysisService", () => {
  it("persists failed status when background reference analysis throws", async () => {
    const store = new MemoryProjectStore();
    const registeredReference = await registerReferenceForAnalysis({
      reference: {
        category: "Kitchen appliances",
        publicStats: { likes: 0, comments: 0, shares: 0, views: 0 },
        sourceDeclaration: "Public reference URL; save structured analysis only.",
        sourcePlatform: "tiktok",
        sourceUrl: "https://example.test/reference.mp4",
        status: "registered",
        title: "Reference clip",
      },
      store,
    });
    expect(registeredReference?.status).toBe("analyzing");

    await expect(
      runRegisteredReferenceAnalysis({
        reference: {
          category: "Kitchen appliances",
          publicStats: { likes: 0, comments: 0, shares: 0, views: 0 },
          sourceDeclaration: "Public reference URL; save structured analysis only.",
          sourcePlatform: "tiktok",
          sourceUrl: "https://example.test/reference.mp4",
          status: "registered",
          title: "Reference clip",
        },
        registeredReference: registeredReference!,
        store,
        referenceDownloader: {
          downloadReference: async () => {
            throw new Error("download 403");
          },
        },
        viralProvider: {
          analyzeReference: async () => {
            throw new Error("provider should not be reached");
          },
        },
        visionProvider: {
          understandAsset: async () => {
            throw new Error("vision should not be reached");
          },
          understandSlice: async () => {
            throw new Error("vision should not be reached");
          },
        },
      }),
    ).rejects.toThrow("download 403");

    const storedReference = (await store.listReferenceVideos()).find(
      (reference) => reference.id === registeredReference?.id,
    );
    expect(storedReference?.status).toBe("failed");
    expect(storedReference?.errorMessage).toContain("download 403");
  });
});
