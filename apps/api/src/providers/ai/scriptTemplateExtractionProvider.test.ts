import type { AssetMetadata } from "@shopclip/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractScriptTemplateWithGeneralModel } from "./scriptTemplateExtractionProvider.js";

const makeScriptAsset = (asset: Partial<AssetMetadata>): AssetMetadata => ({
  id: "script-asset-1",
  type: "reference",
  status: "ready",
  url: "https://example.test/reference.mp4",
  name: "Water cup reference ideas",
  mimeType: "text/plain",
  sizeBytes: 1200,
  tags: ["script", "copy", "reference-video"],
  embeddingText: [
    "Reference: cheap water cup proof",
    "Category: Water cup",
    "Hook: opens with a student identity callout.",
    "Pacing: fast hook, compact demo, detail proof, CTA.",
    "Reusable storyboard:",
    "1. hook 0-2s",
    "Summary: calls out budget buyers.",
    "Copy: Bought it for cheap, but it looks so good.",
    "Visual: close-up of cup on desk.",
  ].join("\n"),
  metadata: {
    kind: "reference_script_asset",
    referenceId: "reference-1",
    searchText: "Identity hook + fast demo + price proof + CTA",
  },
  ...asset,
});

describe("script template extraction provider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = originalEnv;
  });

  it("calls the configured general model and parses a reusable viral template", async () => {
    process.env.AI_PROVIDER_MODE = "real";
    process.env.AI_GENERAL_API_KEY = "test-api-key";
    process.env.AI_GENERAL_MODEL_ID = "doubao-seed-1-6";
    process.env.ARK_API_BASE_URL = "https://ark.test/api/v3";

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              name: "Budget buyer beauty proof",
              category: "Water cup",
              strategy:
                "Open with a precise budget-buyer identity, then prove the product looks premium.",
              factorSet: ["identity hook", "price surprise", "desk detail proof"],
              narrativeStructure: ["hook", "demo", "trust", "cta"],
              shotRequirements: [
                "0-2s handheld product reveal",
                "detail close-up on material texture",
              ],
              copywritingRules: [
                "Use short spoken lines",
                "State the price surprise before the proof",
              ],
              riskRules: [
                "Do not reuse public source footage",
                "Keep claims tied to owned material",
              ],
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const template = await extractScriptTemplateWithGeneralModel({
      assets: [makeScriptAsset({})],
      category: "Water cup",
      templateName: "Water cup common method",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ark.test/api/v3/responses");
    expect(init.headers).toMatchObject({
      authorization: "Bearer test-api-key",
      "content-type": "application/json",
    });
    const body = JSON.parse(String(init.body)) as {
      input: Array<{ role: string; content: Array<{ text: string }> }>;
      model: string;
    };
    expect(body.model).toBe("doubao-seed-1-6");
    expect(body.input[1]?.content[0]?.text).toContain("cheap water cup proof");
    expect(body.input[1]?.content[0]?.text).toContain(
      "Extract one reusable ecommerce video template",
    );

    expect(template.name).toBe("Water cup common method");
    expect(template.category).toBe("Water cup");
    expect(template.strategy).toContain("budget-buyer");
    expect(template.narrativeStructure).toEqual(["hook", "demo", "trust", "cta"]);
    expect(template.sourceReferenceIds).toEqual(["reference-1"]);
  });
});
