import type { AssetMetadata, InspirationGenerateRequest, ViralTemplate } from "@shopclip/shared";
import { ViralTemplateSchema } from "@shopclip/shared";

const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_GENERAL_MODEL = "doubao-seed-2-0-pro-260215";
const PROVIDER_ID = "script-template-general-provider";
const REAL_PROVIDER_MODES = ["ark", "doubao", "real", "volcengine-ark"];

type ProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
};

export interface ScriptTemplateExtractionInput {
  assets: AssetMetadata[];
  apiConfig?: InspirationGenerateRequest["apiConfig"];
  category?: string;
  templateName?: string;
}

const firstEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
};

const providerMode = () => (process.env.AI_PROVIDER_MODE ?? "ark").trim().toLowerCase();

const isRealProviderMode = (mode = providerMode()) => REAL_PROVIDER_MODES.includes(mode);

const isArkProvider = (provider?: string) => {
  const providerId = provider?.trim().toLowerCase();
  return providerId === "volcengine-ark" || providerId === "ark" || providerId === "doubao";
};

const getUserGeneralConfig = (apiConfig?: InspirationGenerateRequest["apiConfig"]) =>
  apiConfig?.general;

const hasUserGeneralConfigInput = (apiConfig?: InspirationGenerateRequest["apiConfig"]) => {
  const general = getUserGeneralConfig(apiConfig);
  return Boolean(
    general?.credentialSource === "official" ||
    general?.apiKey?.trim() ||
    general?.model?.trim() ||
    general?.apiBaseUrl?.trim() ||
    general?.provider?.trim(),
  );
};

const getRequiredConfig = (
  apiConfig?: InspirationGenerateRequest["apiConfig"],
): ProviderConfig | undefined => {
  const mode = providerMode();
  if (mode === "mock") {
    return undefined;
  }
  if (!isRealProviderMode(mode)) {
    throw new Error(
      `Unsupported AI_PROVIDER_MODE=${mode}. Use ark/real for business runs, or explicitly set mock for tests.`,
    );
  }

  const userConfig = getUserGeneralConfig(apiConfig);
  if (userConfig?.credentialSource === "official") {
    const apiKey = firstEnv("AI_GENERAL_API_KEY", "AI_TEXT_API_KEY", "ARK_API_KEY", "AI_API_KEY");
    const model =
      firstEnv("AI_GENERAL_MODEL_ID", "AI_TEXT_MODEL_ID", "AI_TEXT_ENDPOINT_ID") ??
      DEFAULT_GENERAL_MODEL;
    if (!apiKey) {
      return undefined;
    }
    return {
      apiKey,
      model,
      baseUrl: (process.env.ARK_API_BASE_URL ?? DEFAULT_ARK_BASE_URL).replace(/\/$/, ""),
      provider: "volcengine-ark",
    };
  }

  if (userConfig?.apiKey?.trim() && userConfig.model?.trim() && userConfig.apiBaseUrl?.trim()) {
    return {
      apiKey: userConfig.apiKey.trim(),
      model: userConfig.model.trim(),
      baseUrl: userConfig.apiBaseUrl.trim().replace(/\/$/, ""),
      provider: userConfig.provider?.trim() || "user-configured-provider",
    };
  }

  if (hasUserGeneralConfigInput(apiConfig)) {
    return undefined;
  }

  const apiKey = firstEnv("AI_GENERAL_API_KEY", "AI_TEXT_API_KEY", "ARK_API_KEY", "AI_API_KEY");
  const model =
    firstEnv("AI_GENERAL_MODEL_ID", "AI_TEXT_MODEL_ID", "AI_TEXT_ENDPOINT_ID") ??
    DEFAULT_GENERAL_MODEL;
  if (!apiKey) {
    return undefined;
  }

  return {
    apiKey,
    model,
    baseUrl: (process.env.ARK_API_BASE_URL ?? DEFAULT_ARK_BASE_URL).replace(/\/$/, ""),
    provider: "volcengine-ark",
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

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

type TemplateSceneRole = ViralTemplate["narrativeStructure"][number];

const normalizeSceneRole = (value: unknown, fallback: string) => {
  const role = getString(value)?.toLowerCase().replaceAll("-", "_").replace(/\s+/g, "_");
  return role && SCENE_ROLES.has(role) ? role : fallback;
};

const createId = (prefix: string, seed: string) => {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `${prefix}_${Date.now().toString(36)}_${hash.toString(36)}`;
};

const parseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const postJson = async (
  path: string,
  config: ProviderConfig,
  body: Record<string, unknown>,
): Promise<unknown> => {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const responseBody = await parseJson(response);
  if (!response.ok) {
    const responseSummary = isRecord(responseBody)
      ? ` ${JSON.stringify(responseBody).slice(0, 240)}`
      : "";
    throw new Error(`${PROVIDER_ID} failed with HTTP ${response.status}.${responseSummary}`);
  }
  return responseBody;
};

const getResponsesApiText = (body: unknown) => {
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

const firstChatCompletionText = (body: unknown) => {
  if (!isRecord(body) || !Array.isArray(body.choices)) {
    return undefined;
  }
  const firstChoice = body.choices.find(isRecord);
  const message = isRecord(firstChoice?.message) ? firstChoice.message : undefined;
  return getString(message?.content) ?? getString(firstChoice?.text);
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
    throw new Error("General model response did not contain valid JSON.");
  }
};

const getAssetText = (asset: AssetMetadata) => {
  const metadata = isRecord(asset.metadata) ? asset.metadata : {};
  return (
    asset.embeddingText ??
    getString(metadata.searchText) ??
    getString(metadata.referenceAnalysisText) ??
    `${asset.name}\n${asset.tags.join(", ")}`
  );
};

const getSourceReferenceIds = (assets: AssetMetadata[]) => [
  ...new Set(
    assets
      .map((asset) => {
        const metadata = isRecord(asset.metadata) ? asset.metadata : {};
        return getString(metadata.referenceId);
      })
      .filter((referenceId): referenceId is string => Boolean(referenceId)),
  ),
];

const inferCategory = (assets: AssetMetadata[], category?: string) => {
  if (category?.trim()) {
    return category.trim();
  }
  for (const asset of assets) {
    const metadata = isRecord(asset.metadata) ? asset.metadata : {};
    const metadataCategory = getString(metadata.category);
    if (metadataCategory) {
      return metadataCategory;
    }
    const nonUtilityTag = asset.tags.find(
      (tag) =>
        !["script", "copy", "reference-video", "viral-breakdown"].includes(tag.toLowerCase()),
    );
    if (nonUtilityTag) {
      return nonUtilityTag;
    }
  }
  return "Ecommerce product";
};

const buildPrompt = (input: ScriptTemplateExtractionInput) => {
  const category = inferCategory(input.assets, input.category);
  const assetBlocks = input.assets
    .map((asset, index) =>
      [
        `Script asset ${index + 1}: ${asset.name}`,
        `Tags: ${asset.tags.join(", ") || "none"}`,
        `Content:`,
        getAssetText(asset),
      ].join("\n"),
    )
    .join("\n\n---\n\n");

  return [
    `Extract one reusable ecommerce video template for category: ${category}.`,
    input.templateName ? `Preferred template name: ${input.templateName}` : undefined,
    "Use only common methods found across the selected script assets.",
    "Return only JSON with these fields: name, category, strategy, factorSet, narrativeStructure, shotRequirements, copywritingRules, riskRules.",
    "narrativeStructure must only use roles from: hook, pain, fear, solution, demo, trust, price, cta, closure, transition.",
    "Do not include raw public video copying instructions. Templates must be reusable with merchant-owned assets.",
    "",
    assetBlocks,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
};

const SYSTEM_PROMPT = [
  "You are an ecommerce short-video methodology strategist.",
  "You extract reusable creative templates from structured script assets.",
  "Return only valid JSON. Do not wrap JSON in markdown.",
  "Keep the template practical for <=15s merchant-owned product videos.",
  "Never tell users to copy, remix, or reuse public source footage.",
].join("\n");

const normalizeTemplate = (
  rawTemplate: unknown,
  input: ScriptTemplateExtractionInput,
): ViralTemplate => {
  const raw = isRecord(rawTemplate) ? rawTemplate : {};
  const sourceReferenceIds = getSourceReferenceIds(input.assets);
  const category = inferCategory(input.assets, input.category);
  const narrativeStructure = stringArrayFrom(raw.narrativeStructure)
    .map((role, index) => normalizeSceneRole(role, index === 0 ? "hook" : "demo"))
    .filter((role, index, roles) => roles.indexOf(role) === index);

  const template: ViralTemplate = {
    templateId: createId(
      "template_script",
      `${input.templateName ?? getString(raw.name) ?? category}:${sourceReferenceIds.join(",")}`,
    ),
    name: input.templateName?.trim() || getString(raw.name) || `${category} reusable template`,
    category: getString(raw.category) || category,
    strategy:
      getString(raw.strategy) ||
      "Open with a clear buyer situation, prove the product through owned footage, and close with a shopping action.",
    factorSet: stringArrayFrom(raw.factorSet).slice(0, 12),
    narrativeStructure: (narrativeStructure.length > 0
      ? narrativeStructure
      : ["hook", "demo", "trust", "cta"]) as TemplateSceneRole[],
    shotRequirements: stringArrayFrom(raw.shotRequirements).slice(0, 12),
    copywritingRules: stringArrayFrom(raw.copywritingRules).slice(0, 12),
    riskRules: [
      ...stringArrayFrom(raw.riskRules),
      "Use this as a method template only; do not copy or remix public source footage.",
    ]
      .filter((rule, index, rules) => rules.indexOf(rule) === index)
      .slice(0, 12),
    sourceReferenceIds,
  };

  return ViralTemplateSchema.parse(template);
};

const createMockTemplate = (input: ScriptTemplateExtractionInput): ViralTemplate =>
  normalizeTemplate(
    {
      name: input.templateName || "Reusable script method",
      category: inferCategory(input.assets, input.category),
      strategy:
        "Open with a precise buyer identity or pain, show a compact product proof, add one trust detail, and close with CTA.",
      factorSet: ["identity hook", "fast demo", "trust proof", "direct CTA"],
      narrativeStructure: ["hook", "demo", "trust", "cta"],
      shotRequirements: [
        "0-2s close-up opening hook",
        "2-8s owned product demo",
        "8-12s detail proof shot",
        "final packshot with CTA",
      ],
      copywritingRules: ["Keep every line short", "Tie claims to visible product proof"],
      riskRules: ["Do not reuse public source footage"],
    },
    input,
  );

export const extractScriptTemplateWithGeneralModel = async (
  input: ScriptTemplateExtractionInput,
): Promise<ViralTemplate> => {
  if (input.assets.length === 0) {
    throw new Error("At least one script asset is required for template extraction.");
  }

  if (providerMode() === "mock") {
    return createMockTemplate(input);
  }

  const config = getRequiredConfig(input.apiConfig);
  if (!config) {
    throw new Error(
      `${PROVIDER_ID} is missing general model configuration. Set AI_GENERAL_API_KEY/ARK_API_KEY and AI_GENERAL_MODEL_ID, or provide Settings > General model config.`,
    );
  }

  const prompt = buildPrompt(input);
  const body = isArkProvider(config.provider)
    ? await postJson("/responses", config, {
        model: config.model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: SYSTEM_PROMPT }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          },
        ],
        temperature: 0.35,
      })
    : await postJson("/chat/completions", config, {
        model: config.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0.35,
      });

  const text = getResponsesApiText(body) ?? firstChatCompletionText(body);
  if (!text) {
    throw new Error("General model did not return template text.");
  }

  return normalizeTemplate(extractJsonObject(text), input);
};
