import { ReferenceVideoAnalysisSchema, type ReferenceVideoAnalysis } from "@shopclip/shared";

import { createMockViralBreakdownProvider } from "./mockViralBreakdownProvider.js";
import type { ViralBreakdownContext, ViralBreakdownProvider } from "./viralBreakdownProvider.js";

const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const PROVIDER_ID = "volcengine-ark-reference";
const REAL_REFERENCE_MODES = ["ark", "doubao", "real", "volcengine-ark"];

type ArkReferenceConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

const SYSTEM_PROMPT = [
  "You are an ecommerce viral short-video strategist.",
  "Return only valid JSON. Do not wrap JSON in markdown.",
  "Analyze the provided public reference metadata for script methodology only.",
  "Do not claim you downloaded, clipped, remixed, or watched the source video unless frame/transcript evidence is provided.",
  "Use the source title, platform, category, public stats, and declaration to infer a structured ecommerce breakdown.",
  "The output must fit a <=15s product video workflow.",
].join("\n");

const firstEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
};

const referenceProviderMode = () =>
  (process.env.REFERENCE_PROVIDER_MODE ?? process.env.AI_PROVIDER_MODE ?? "ark")
    .trim()
    .toLowerCase();

const isRealReferenceMode = (mode = referenceProviderMode()) => REAL_REFERENCE_MODES.includes(mode);

const isVideoGenerationModel = (model: string): boolean => {
  const normalizedModel = model.trim().toLowerCase();
  return normalizedModel.includes("seedance") || normalizedModel.includes("video-generation");
};

const getRequiredConfig = (): ArkReferenceConfig | undefined => {
  const mode = referenceProviderMode();
  if (mode === "mock") {
    return undefined;
  }
  if (!isRealReferenceMode(mode)) {
    throw new Error(
      `Unsupported REFERENCE_PROVIDER_MODE=${mode}. Use ark/real for business runs, or explicitly set mock for tests/demo fixtures.`,
    );
  }

  const apiKey = firstEnv("AI_REFERENCE_API_KEY", "AI_GENERAL_API_KEY", "ARK_API_KEY", "AI_API_KEY");
  const model = firstEnv("AI_REFERENCE_MODEL_ID", "AI_GENERAL_MODEL_ID", "AI_TEXT_MODEL_ID");
  if (!apiKey || !model) {
    throw new Error(
      `${PROVIDER_ID} is configured with REFERENCE_PROVIDER_MODE=${mode}, but missing ${
        !apiKey && !model
          ? "API key and model"
          : !apiKey
            ? "API key"
            : "model"
      }. Set AI_REFERENCE_API_KEY or ARK_API_KEY, and AI_REFERENCE_MODEL_ID or AI_GENERAL_MODEL_ID.`,
    );
  }
  if (isVideoGenerationModel(model)) {
    throw new Error(
      `${PROVIDER_ID} is configured with AI_REFERENCE_MODEL_ID=${model}, but reference breakdown uses the Ark Responses API and requires a text or multimodal understanding model. Do not use Seedance/video generation models here; set AI_REFERENCE_MODEL_ID to a Doubao Seed text/vision model or endpoint that has Responses API access.`,
    );
  }

  return {
    apiKey,
    model,
    baseUrl: (process.env.ARK_API_BASE_URL ?? DEFAULT_ARK_BASE_URL).replace(/\/$/, ""),
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const getNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/%$/, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const clampHookScore = (value: unknown) => {
  const numberValue = getNumber(value) ?? 0.7;
  const normalized =
    numberValue > 10 ? numberValue / 100 : numberValue > 1 ? numberValue / 10 : numberValue;
  return Math.min(1, Math.max(0, normalized));
};

const stringArrayFrom = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => getString(item)).filter((item): item is string => Boolean(item));
  }
  const text = getString(value);
  if (!text) {
    return [];
  }
  return text
    .split(/[,\n;，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const SCENE_ROLES = new Set([
  "hook",
  "pain",
  "fear",
  "solution",
  "demo",
  "trust",
  "price",
  "cta",
  "closure",
  "transition",
]);

const normalizeSceneRole = (value: unknown, fallback: string) => {
  const role = getString(value)?.toLowerCase().replaceAll("-", "_").replace(/\s+/g, "_");
  return role && SCENE_ROLES.has(role) ? role : fallback;
};

const normalizedSegments = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item, index) => {
      const record = isRecord(item) ? item : {};
      const startSecond = Math.max(0, getNumber(record.startSecond) ?? index * 3);
      const endSecond = Math.max(startSecond + 0.5, getNumber(record.endSecond) ?? startSecond + 3);
      return {
        role: normalizeSceneRole(record.role, index === 0 ? "hook" : "demo"),
        startSecond,
        endSecond,
        summary: getString(record.summary) ?? `Reference segment ${index + 1}`,
        copywriting: getString(record.copywriting) ?? getString(record.caption) ?? "Adapt copy with merchant-owned claims.",
        visualPrompt:
          getString(record.visualPrompt) ??
          getString(record.visual) ??
          "Use merchant-owned footage to recreate the structure only.",
      };
    })
    .filter((segment) => segment.endSecond > segment.startSecond);
};

const normalizedBlueprint = (value: unknown) => {
  if (isRecord(value) && !Array.isArray(value)) {
    return {
      visual: getString(value.visual) ?? "Use merchant-owned visuals and product proof shots.",
      copywriting: getString(value.copywriting) ?? "Adapt the copywriting method to the current product.",
      shootingGuide:
        getString(value.shootingGuide) ??
        getString(value.shooting) ??
        "Use this as a method blueprint only. Do not remix the public source video.",
    };
  }
  const lines = stringArrayFrom(value);
  return {
    visual: lines[0] ?? "Use merchant-owned visuals and product proof shots.",
    copywriting: lines[1] ?? "Adapt the copywriting method to the current product.",
    shootingGuide:
      lines[2] ?? "Use this as a method blueprint only. Do not remix the public source video.",
  };
};

const wait = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const fetchWithNetworkRetry = async (url: string, init: RequestInit) => {
  let lastError: unknown;
  for (const delay of [0, 500, 1000]) {
    if (delay > 0) {
      await wait(delay);
    }
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

const responseTextFromBody = (body: unknown): string | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }

  const outputText = getString(body.output_text);
  if (outputText) {
    return outputText;
  }

  const output = Array.isArray(body.output) ? body.output : [];
  for (const outputItem of output) {
    if (!isRecord(outputItem)) {
      continue;
    }
    const content = Array.isArray(outputItem.content) ? outputItem.content : [];
    for (const contentItem of content) {
      if (!isRecord(contentItem)) {
        continue;
      }
      const text = getString(contentItem.text);
      if (text) {
        return text;
      }
    }
  }

  return undefined;
};

const extractJsonObject = (text: string): unknown => {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  const jsonText = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(jsonText);
  } catch {
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(jsonText.slice(start, end + 1));
    }
    throw new Error("Ark reference response did not contain valid JSON.");
  }
};

const referenceStructureLines = (context?: ViralBreakdownContext): string[] => {
  if (!context?.sourceAsset) {
    return ["Structured source asset: none; use declared reference metadata only."];
  }

  const structuredAsset = context.sourceAsset.metadata?.structuredAsset;
  const assetSummary =
    isRecord(structuredAsset) && typeof structuredAsset.overallSummary === "string"
      ? structuredAsset.overallSummary
      : context.sourceAsset.embeddingText;
  const sliceLines = (context.sourceSlices ?? []).slice(0, 8).map((slice, index) => {
    const metadata = slice.metadata;
    return [
      `Slice ${index + 1}`,
      `time=${slice.startSecond ?? metadata?.startSecond ?? 0}-${slice.endSecond ?? metadata?.endSecond ?? 0}s`,
      `roles=${metadata?.suitableSceneRoles.join(",") ?? slice.tags.join(",")}`,
      `shot=${metadata?.shotType ?? "unknown"}`,
      `motion=${metadata?.cameraMovement ?? "unknown"}`,
      `summary=${metadata?.summary ?? slice.searchText ?? slice.label}`,
      `transcript=${metadata?.transcript ?? ""}`,
      `ocr=${metadata?.ocrText ?? ""}`,
    ].join("; ");
  });

  return [
    `Structured source asset id: ${context.sourceAsset.id}`,
    `Structured source asset source: ${context.sourceAsset.source ?? "merchant_upload"}`,
    `Structured source asset summary: ${assetSummary ?? "none"}`,
    `Structured source asset tags: ${context.sourceAsset.tags.join(", ") || "none"}`,
    `Structured source slices:\n${sliceLines.join("\n") || "none"}`,
  ];
};

const referenceContextText = (
  reference: Parameters<ViralBreakdownProvider["analyzeReference"]>[0],
  context?: ViralBreakdownContext,
) =>
  [
    "Return JSON fields: durationSeconds, hookScore, hookAnalysis, pacingAnalysis, emotionalArc, targetAudience, contentFormula, keyViralFactors, commerceNarrativeSegments, recreationBlueprint, commentInsights, derivedTemplates.",
    "hookScore must be a 0-1 number. If you think in 10-point scoring, convert 8/10 to 0.8.",
    "commerceNarrativeSegments item fields: role, startSecond, endSecond, summary, copywriting, visualPrompt.",
    "Allowed roles: hook, pain, fear, solution, demo, trust, price, cta, closure, transition.",
    `Reference id: ${reference.id}`,
    `Source URL: ${reference.sourceUrl}`,
    `Platform: ${reference.sourcePlatform}`,
    `Source declaration: ${reference.sourceDeclaration}`,
    `Title: ${reference.title}`,
    `Author: ${reference.author ?? "unknown"}`,
    `Category: ${reference.category}`,
    `Public stats: likes=${reference.publicStats.likes}, comments=${reference.publicStats.comments}, shares=${reference.publicStats.shares}, views=${reference.publicStats.views}`,
    reference.sourceAssetId
      ? `Merchant-owned source asset id: ${reference.sourceAssetId}; if structured metadata exists in context, it may be used for methodology extraction.`
      : "Public URL source; analyze methodology only from provided metadata unless the model can access the URL.",
    ...referenceStructureLines(context),
  ].join("\n");

const postArkReference = async (
  config: ArkReferenceConfig,
  reference: Parameters<ViralBreakdownProvider["analyzeReference"]>[0],
  context?: ViralBreakdownContext,
) => {
  const response = await fetchWithNetworkRetry(`${config.baseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: SYSTEM_PROMPT }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: referenceContextText(reference, context) }],
        },
      ],
      temperature: 0,
    }),
  });

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = undefined;
  }

  if (!response.ok) {
    const responseSummary = isRecord(responseBody)
      ? ` ${JSON.stringify(responseBody).slice(0, 240)}`
      : "";
    const rawSummary = responseSummary.toLowerCase();
    if (
      response.status === 403 &&
      rawSummary.includes("does not have access to responses api")
    ) {
      throw new Error(
        `Ark reference request failed with HTTP 403 because model ${config.model} cannot access the Responses API. Set AI_REFERENCE_MODEL_ID to a text or multimodal understanding model/endpoint, not a video generation model.`,
      );
    }
    throw new Error(`Ark reference request failed with HTTP ${response.status}.${responseSummary}`);
  }

  const responseText = responseTextFromBody(responseBody);
  if (!responseText) {
    throw new Error("Ark reference response did not include output_text.");
  }

  return extractJsonObject(responseText);
};

const buildReferenceAnalysis = (
  reference: Parameters<ViralBreakdownProvider["analyzeReference"]>[0],
  raw: unknown,
): ReferenceVideoAnalysis => {
  const record = isRecord(raw) ? raw : {};
  return ReferenceVideoAnalysisSchema.parse({
    ...record,
    referenceId: reference.id,
    sourceUrl: reference.sourceUrl,
    sourcePlatform: reference.sourcePlatform,
    sourceDeclaration: reference.sourceDeclaration,
    title: reference.title,
    author: reference.author,
    publicStats: reference.publicStats,
    category: reference.category,
    durationSeconds: getNumber(record.durationSeconds),
    hookScore: clampHookScore(record.hookScore),
    hookAnalysis: getString(record.hookAnalysis) ?? "Reference hook uses visible opening cues from the public video.",
    pacingAnalysis:
      getString(record.pacingAnalysis) ??
      "Fast ecommerce pacing: hook, product proof, usage demonstration, then CTA.",
    emotionalArc: stringArrayFrom(record.emotionalArc),
    targetAudience: stringArrayFrom(record.targetAudience),
    contentFormula:
      getString(record.contentFormula) ?? "Hook + product proof + usage demo + trust cue + CTA.",
    keyViralFactors: stringArrayFrom(record.keyViralFactors),
    commerceNarrativeSegments: normalizedSegments(record.commerceNarrativeSegments),
    recreationBlueprint: normalizedBlueprint(record.recreationBlueprint),
    commentInsights: stringArrayFrom(record.commentInsights),
    derivedTemplates: stringArrayFrom(record.derivedTemplates),
  });
};

export const createArkViralBreakdownProvider = (): ViralBreakdownProvider => {
  const config = getRequiredConfig();
  if (!config) {
    return createMockViralBreakdownProvider();
  }

  return {
    analyzeReference: async (reference, context) => {
      try {
        return buildReferenceAnalysis(reference, await postArkReference(config, reference, context));
      } catch (error) {
        throw new Error(
          `${PROVIDER_ID} failed: ${
            error instanceof Error ? error.message : "Unknown reference breakdown error."
          }`,
        );
      }
    },
  };
};
