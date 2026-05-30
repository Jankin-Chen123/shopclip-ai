import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReferenceVideo } from "@shopclip/shared";

import { createArkViralBreakdownProvider } from "./arkViralBreakdownProvider.js";

const ORIGINAL_ENV = { ...process.env };

const reference: ReferenceVideo = {
  id: "reference_cup_1",
  projectId: "project_cup",
  sourceUrl: "https://v.douyin.com/zp1jYKA1sW8",
  sourcePlatform: "douyin",
  sourceDeclaration: "Public reference URL; save structured analysis only.",
  title: "我就说跟着大学生买没错吧！！ #塑料杯 #杯子控 #最适合我用的杯子出现了",
  category: "水杯",
  publicStats: {
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
  },
  status: "analyzing",
  createdAt: "2026-05-29T00:00:00.000Z",
  updatedAt: "2026-05-29T00:00:00.000Z",
};

const resetEnv = () => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.REFERENCE_PROVIDER_MODE;
  delete process.env.ARK_API_KEY;
  delete process.env.ARK_API_BASE_URL;
  delete process.env.AI_REFERENCE_API_KEY;
  delete process.env.AI_REFERENCE_MODEL_ID;
  delete process.env.AI_GENERAL_MODEL_ID;
};

describe("createArkViralBreakdownProvider", () => {
  beforeEach(() => {
    resetEnv();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetEnv();
    vi.restoreAllMocks();
  });

  it("uses Ark responses for configured reference breakdown instead of fixed mock output", async () => {
    process.env.REFERENCE_PROVIDER_MODE = "ark";
    process.env.ARK_API_KEY = "test-key";
    process.env.ARK_API_BASE_URL = "https://ark.test/api/v3";
    process.env.AI_REFERENCE_MODEL_ID = "ep-reference-test";

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { input: Array<{ content: unknown[] }> };
      const prompt = JSON.stringify(body.input);
      expect(prompt).toContain(reference.title);
      expect(prompt).toContain(reference.sourceUrl);
      expect(prompt).toContain("Structured source slices");
      expect(prompt).toContain("transparent cup close-up demo");

      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            durationSeconds: 12,
            hookScore: 0.86,
            hookAnalysis: "用“跟着大学生买”建立身份背书，直接击中杯子控和学生党。",
            pacingAnalysis: "开场身份认同，随后展示容量、手柄和吸管细节，最后用适合自用收尾。",
            emotionalArc: ["被种草", "确认实用", "下单冲动"],
            targetAudience: ["大学生", "杯子控"],
            contentFormula: "身份背书 + 外观细节 + 使用场景 + 下单理由。",
            keyViralFactors: ["student_identity", "cup_collector", "practical_detail"],
            commerceNarrativeSegments: [
              {
                role: "hook",
                startSecond: 0,
                endSecond: 2,
                summary: "用大学生身份背书制造跟买理由。",
                copywriting: "跟着大学生买没错。",
                visualPrompt: "手持透明塑料杯的第一眼展示。",
              },
              {
                role: "demo",
                startSecond: 2,
                endSecond: 8,
                summary: "展示杯身、吸管、手柄和容量感。",
                copywriting: "杯子控会喜欢的细节。",
                visualPrompt: "近景扫过杯盖、吸管和杯身。",
              },
              {
                role: "cta",
                startSecond: 8,
                endSecond: 12,
                summary: "强调适合自用并引导下单。",
                copywriting: "最适合我用的杯子出现了。",
                visualPrompt: "桌面定格展示杯子整体。",
              },
            ],
            recreationBlueprint: {
              visual: "用商家自有杯子素材复刻身份背书和细节展示结构。",
              copywriting: "保留口语化跟买语气，替换为目标人群语言。",
              shootingGuide: "只复用结构，不下载、不裁切、不混剪公开视频。",
            },
            commentInsights: ["用户可能关注容量、是否漏水、吸管清洁。"],
            derivedTemplates: ["student_identity_cup_detail"],
          }),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createArkViralBreakdownProvider();
    const analysis = await provider.analyzeReference(reference, {
      sourceAsset: {
        id: "asset_public_reference_1",
        projectId: reference.projectId,
        type: "video",
        status: "ready",
        source: "public_reference",
        url: "/reference-ingest/cup.mp4",
        name: "cup-reference.mp4",
        tags: ["transparent cup", "demo"],
        embeddingText: "transparent cup close-up demo",
      },
      sourceSlices: [
        {
          id: "slice_public_reference_1",
          assetId: "asset_public_reference_1",
          label: "transparent cup close-up demo",
          startSecond: 0,
          endSecond: 3,
          tags: ["hook", "demo"],
          searchText: "transparent cup close-up demo",
          metadata: {
            sliceId: "slice_public_reference_1",
            assetId: "asset_public_reference_1",
            startSecond: 0,
            endSecond: 3,
            frameKeys: ["reference/cup#frame-0"],
            summary: "transparent cup close-up demo",
            transcript: "跟着大学生买没错",
            ocrText: "杯子控",
            shotType: "close_up",
            cameraMovement: "handheld_push_in",
            composition: "Cup is centered.",
            transition: "opening_cut",
            mood: "practical",
            action: "transparent cup close-up demo",
            keyElements: ["cup"],
            productVisibility: "clear",
            visibleProductParts: ["cup body", "lid"],
            suitableSceneRoles: ["hook", "demo"],
            qualitySignals: { productVisibility: "clear", usableForAd: true },
            searchText: "transparent cup close-up demo",
            embeddingText: "transparent cup close-up demo",
            cosFrameObjectKeys: ["reference/cup#frame-0"],
          },
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://ark.test/api/v3/responses");
    expect(analysis.referenceId).toBe(reference.id);
    expect(analysis.sourceUrl).toBe(reference.sourceUrl);
    expect(analysis.title).toBe(reference.title);
    expect(analysis.category).toBe("水杯");
    expect(analysis.hookAnalysis).toContain("大学生");
    expect(analysis.keyViralFactors).toContain("student_identity");
    expect(analysis.contentFormula).not.toContain("Identity hook + pain cue");
  });

  it("normalizes common model output shape drift before schema validation", async () => {
    process.env.REFERENCE_PROVIDER_MODE = "ark";
    process.env.ARK_API_KEY = "test-key";
    process.env.ARK_API_BASE_URL = "https://ark.test/api/v3";
    process.env.AI_REFERENCE_MODEL_ID = "ep-reference-test";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              durationSeconds: "12",
              hookScore: 8,
              hookAnalysis: "身份标签开场。",
              pacingAnalysis: "快节奏展示。",
              emotionalArc: "好奇，信任，下单",
              targetAudience: "学生党,杯子控",
              contentFormula: "身份背书 + 细节证明 + CTA",
              keyViralFactors: "identity_label, demo_proof",
              commerceNarrativeSegments: [
                {
                  role: "Hook",
                  startSecond: "0",
                  endSecond: "2",
                  summary: "身份标签开场。",
                  copywriting: "跟着大学生买。",
                  visualPrompt: "商品第一眼展示。",
                },
              ],
              recreationBlueprint: ["复刻结构，不复用素材", "替换成自有商品文案", "只用作方法论"],
              commentInsights: "容量问题，清洗问题",
              derivedTemplates: "student_identity_template",
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const provider = createArkViralBreakdownProvider();
    const analysis = await provider.analyzeReference(reference);

    expect(analysis.hookScore).toBe(0.8);
    expect(analysis.emotionalArc).toEqual(["好奇", "信任", "下单"]);
    expect(analysis.targetAudience).toContain("学生党");
    expect(analysis.keyViralFactors).toContain("identity_label");
    expect(analysis.recreationBlueprint.visual).toBe("复刻结构，不复用素材");
  });

  it("normalizes percentage hook scores without crushing 10-point scores", async () => {
    process.env.REFERENCE_PROVIDER_MODE = "ark";
    process.env.ARK_API_KEY = "test-key";
    process.env.ARK_API_BASE_URL = "https://ark.test/api/v3";
    process.env.AI_REFERENCE_MODEL_ID = "ep-reference-test";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              durationSeconds: 12,
              hookScore: 92,
              hookAnalysis: "强身份标签。",
              pacingAnalysis: "紧凑节奏。",
              emotionalArc: ["curiosity"],
              targetAudience: ["students"],
              contentFormula: "identity hook + product proof",
              keyViralFactors: ["identity_label"],
              commerceNarrativeSegments: [
                {
                  role: "hook",
                  startSecond: 0,
                  endSecond: 2,
                  summary: "Strong identity hook.",
                  copywriting: "Students love this.",
                  visualPrompt: "Open with product close-up.",
                },
              ],
              recreationBlueprint: {
                visual: "Use merchant-owned visuals.",
                copywriting: "Adapt the identity hook.",
                shootingGuide: "Do not remix the source video.",
              },
              commentInsights: [],
              derivedTemplates: [],
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const provider = createArkViralBreakdownProvider();
    const analysis = await provider.analyzeReference(reference);

    expect(analysis.hookScore).toBe(0.92);
  });

  it("fails fast instead of silently using mock when real reference mode misses config", () => {
    process.env.REFERENCE_PROVIDER_MODE = "ark";
    delete process.env.ARK_API_KEY;
    delete process.env.AI_REFERENCE_API_KEY;
    delete process.env.AI_GENERAL_API_KEY;
    delete process.env.AI_API_KEY;
    process.env.AI_REFERENCE_MODEL_ID = "ep-reference-test";

    expect(() => createArkViralBreakdownProvider()).toThrow(
      /REFERENCE_PROVIDER_MODE=ark.*missing API key/,
    );
  });

  it("rejects Seedance video generation models before calling the Responses API", () => {
    process.env.REFERENCE_PROVIDER_MODE = "ark";
    process.env.ARK_API_KEY = "test-key";
    process.env.AI_REFERENCE_MODEL_ID = "doubao-seedance-1-5-pro-251215";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(() => createArkViralBreakdownProvider()).toThrow(
      /reference breakdown uses the Ark Responses API.*Seedance\/video generation models/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
