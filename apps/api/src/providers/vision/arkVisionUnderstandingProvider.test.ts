import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetMetadata } from "@shopclip/shared";

import { createArkVisionUnderstandingProvider } from "./arkVisionUnderstandingProvider.js";

const ORIGINAL_ENV = { ...process.env };

const baseAsset: AssetMetadata = {
  id: "asset_vision_1",
  name: "GlowGrip close up demo.mp4",
  projectId: "project_vision",
  type: "video",
  url: "https://cdn.example.com/assets/glowgrip-demo.mp4",
  source: "merchant_upload",
  status: "ready",
  tags: ["phone stand", "close-up", "demo"],
  createdAt: "2026-05-29T00:00:00.000Z",
};

const resetVisionEnv = () => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.VISION_PROVIDER_MODE;
  delete process.env.AI_PROVIDER_MODE;
  delete process.env.ARK_API_KEY;
  delete process.env.ARK_API_BASE_URL;
  delete process.env.AI_VISION_API_KEY;
  delete process.env.AI_VISION_MODEL_ID;
};

describe("createArkVisionUnderstandingProvider", () => {
  beforeEach(() => {
    resetVisionEnv();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetVisionEnv();
    vi.restoreAllMocks();
  });

  it("uses Ark multimodal responses when vision env is configured", async () => {
    process.env.VISION_PROVIDER_MODE = "ark";
    process.env.ARK_API_KEY = "test-key";
    process.env.ARK_API_BASE_URL = "https://ark.test/api/v3";
    process.env.AI_VISION_MODEL_ID = "ep-vision-test";

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { input: Array<{ content: unknown[] }> };
      const content = body.input[1]?.content ?? [];
      const contextText = content
        .map((item) =>
          typeof item === "object" && item !== null && "text" in item
            ? String((item as { text?: string }).text)
            : "",
        )
        .join("\n");
      const isSliceRequest = contextText.includes("shotType");
      const hasVideoInput = content.some(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type?: string }).type === "input_video",
      );
      const output =
        isSliceRequest && hasVideoInput
          ? {
              summary: "Hero close-up shows the phone stand grip and hinge clearly.",
              ocrText: "GlowGrip",
              shotType: "close_up",
              cameraMovement: "static",
              composition: "Product centered with hand scale reference.",
              transition: "hard_cut",
              mood: "practical",
              action: "hand adjusts the phone stand",
              keyElements: ["phone stand", "hinge", "hand"],
              productVisibility: "clear",
              visibleProductParts: ["grip", "hinge", "base"],
              suitableSceneRoles: ["demo", "trust"],
              qualitySignals: {
                sharpness: 0.91,
                stability: 0.86,
                productVisibility: "clear",
                usableForAd: true,
              },
            }
          : {
              overallSummary:
                "Merchant demo video showing a compact phone stand in close-up and usage scenes.",
              role: "usage_demo",
              globalTags: ["phone stand", "close-up", "usage_demo"],
              ocrText: "GlowGrip",
              visualStyle: {
                colors: ["black", "silver"],
                materials: ["metal", "silicone"],
                lighting: "bright tabletop light",
                background: "desktop",
                mood: "practical",
              },
              qualitySignals: {
                sharpness: 0.9,
                stability: 0.84,
                productVisibility: "clear",
                usableForAd: true,
              },
              complianceFlags: [],
              confidence: 0.88,
            };

      return new Response(
        JSON.stringify({
          output_text: JSON.stringify(output),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createArkVisionUnderstandingProvider();
    const assetMetadata = await provider.understandAsset({
      asset: baseAsset,
      audio: { asrSummary: "Shows the stand locking into place.", transcript: "locks in one move" },
      frames: [{ key: "https://cdn.example.com/frame-0.jpg", second: 0 }],
      probe: { durationSeconds: 9, format: "mp4", width: 1080, height: 1920 },
    });
    const sliceMetadata = await provider.understandSlice({
      asset: baseAsset,
      audio: { asrSummary: "Shows the stand locking into place.", transcript: "locks in one move" },
      endSecond: 3,
      frameKeys: ["https://cdn.example.com/frame-0.jpg"],
      index: 0,
      sliceId: "slice_vision_1",
      startSecond: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://ark.test/api/v3/responses");
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      input: Array<{ content: Array<{ type?: string; video_url?: string }> }>;
    };
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      input: Array<{ content: Array<{ type?: string; video_url?: string }> }>;
    };
    expect(firstBody.input[1]?.content.some((item) => item.type === "input_video")).toBe(true);
    expect(secondBody.input[1]?.content.some((item) => item.type === "input_video")).toBe(true);
    expect(secondBody.input[1]?.content.some((item) => item.type === "input_image")).toBe(false);
    expect(assetMetadata.modelTrace).toMatchObject({
      provider: "volcengine-ark-vision",
      model: "ep-vision-test",
      fallbackUsed: false,
    });
    expect(assetMetadata.role).toBe("usage_demo");
    expect(assetMetadata.searchText).toContain("merchant demo video");
    expect(sliceMetadata.productVisibility).toBe("clear");
    expect(sliceMetadata.suitableSceneRoles).toContain("demo");
    expect(sliceMetadata.modelTrace).toBeUndefined();
  });

  it("uses deterministic metadata only when mock mode is explicit", async () => {
    process.env.VISION_PROVIDER_MODE = "mock";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const provider = createArkVisionUnderstandingProvider();
    const metadata = await provider.understandAsset({
      asset: baseAsset,
      audio: { asrSummary: "", transcript: "" },
      frames: [],
      probe: { durationSeconds: 9, format: "mp4" },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(metadata.modelTrace).toMatchObject({
      provider: "mock-vision",
      fallbackUsed: true,
    });
  });

  it("enriches slice roles from OCR subtitles and time-position cues", async () => {
    process.env.VISION_PROVIDER_MODE = "ark";
    process.env.ARK_API_KEY = "test-key";
    process.env.ARK_API_BASE_URL = "https://ark.test/api/v3";
    process.env.AI_VISION_MODEL_ID = "ep-vision-test";

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              output_text: JSON.stringify({
                summary: "Opening reveal shows the product with a purchase prompt.",
                ocrText: "限时优惠 点击下单",
                shotType: "close_up",
                cameraMovement: "static",
                action: "unwrap and reveal the product",
                keyElements: ["product"],
                productVisibility: "clear",
                suitableSceneRoles: ["demo"],
                qualitySignals: {
                  productVisibility: "clear",
                  usableForAd: true,
                },
              }),
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    const provider = createArkVisionUnderstandingProvider();
    const sliceMetadata = await provider.understandSlice({
      asset: baseAsset,
      audio: {
        asrSummary: "OCR-first text extraction; ASR disabled.",
        transcript: "",
      },
      endSecond: 3,
      frameKeys: ["https://cdn.example.com/frame-0.jpg"],
      index: 0,
      sliceId: "slice_vision_ocr_roles",
      startSecond: 0,
    });

    expect(sliceMetadata.ocrText).toBe("限时优惠 点击下单");
    expect(sliceMetadata.transcript).toBe("");
    expect(sliceMetadata.suitableSceneRoles).toEqual(
      expect.arrayContaining(["demo", "hook", "price", "cta"]),
    );
    expect(sliceMetadata.searchText).toContain("限时优惠");
  });

  it("fails fast instead of silently using mock when real vision mode misses config", () => {
    process.env.VISION_PROVIDER_MODE = "ark";
    delete process.env.ARK_API_KEY;
    delete process.env.AI_VISION_API_KEY;
    process.env.AI_VISION_MODEL_ID = "ep-vision-test";

    expect(() => createArkVisionUnderstandingProvider()).toThrow(
      /VISION_PROVIDER_MODE=ark.*missing API key/,
    );
  });

  it("fails fast instead of silently using mock when Ark returns invalid JSON", async () => {
    process.env.VISION_PROVIDER_MODE = "ark";
    process.env.ARK_API_KEY = "test-key";
    process.env.AI_VISION_MODEL_ID = "ep-vision-test";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ output_text: "not json" }), { status: 200 })),
    );

    const provider = createArkVisionUnderstandingProvider();
    await expect(
      provider.understandAsset({
        asset: baseAsset,
        audio: { asrSummary: "", transcript: "" },
        frames: [],
        probe: { durationSeconds: 9, format: "mp4" },
      }),
    ).rejects.toThrow(/asset understanding failed.*valid JSON/);
  });
});
