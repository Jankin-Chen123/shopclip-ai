import type { AssetMetadata, ScriptGenerationRequest } from "@shopclip/shared";
import { describe, expect, it } from "vitest";

import { buildScriptAssetPromptLines } from "./router.js";

describe("buildScriptAssetPromptLines", () => {
  it("includes multi-granularity structured asset summaries for real script generation prompts", () => {
    const asset: AssetMetadata = {
      id: "asset-structured-cup",
      projectId: "project-script",
      type: "image",
      status: "ready",
      source: "merchant_upload",
      url: "https://cos.test/cup.png",
      name: "cup hero.png",
      mimeType: "image/png",
      tags: ["cup", "hero"],
      metadata: {
        structuredAsset: {
          assetId: "asset-structured-cup",
          projectId: "project-script",
          type: "image",
          source: "merchant_upload",
          sourceDeclaration: "Merchant-uploaded asset.",
          overallSummary: "A transparent plastic cup with a cat-ear lid and visible straw.",
          role: "hero_image",
          globalTags: ["transparent cup", "cat-ear lid"],
          ocrText: "BPA FREE",
          visualStyle: {
            colors: ["transparent", "pink"],
            materials: ["plastic"],
          },
          qualitySignals: {
            productVisibility: "clear",
            usableForAd: true,
          },
          complianceFlags: [],
          searchText: "transparent pink plastic cup cat-ear lid straw BPA FREE",
          embeddingText: "transparent pink plastic cup cat-ear lid straw BPA FREE",
        },
      },
    };
    const request: ScriptGenerationRequest = {
      assetIds: [asset.id],
      keywords: [],
      materials: [{ assetId: asset.id, bucketId: "hero", name: asset.name, type: "image" }],
      productionMode: "automatic",
    };

    const lines = buildScriptAssetPromptLines(request, [asset]);

    expect(lines.join("\n")).toContain("结构化摘要=A transparent plastic cup");
    expect(lines.join("\n")).toContain("素材角色=hero_image");
    expect(lines.join("\n")).toContain("OCR=BPA FREE");
    expect(lines.join("\n")).toContain("可见度=clear");
    expect(lines.join("\n")).toContain("检索语义=transparent pink plastic cup");
  });
});
