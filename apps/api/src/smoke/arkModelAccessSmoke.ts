import { loadLocalEnvFile } from "../env.js";

loadLocalEnvFile(undefined, { override: false });

const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

type EnvPick = {
  key: string;
  value: string;
};

const firstEnv = (...keys: string[]): EnvPick | undefined => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return { key, value };
    }
  }
  return undefined;
};

const summarizeBody = async (response: Response) => {
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return JSON.stringify(parsed).slice(0, 320);
  } catch {
    return text.slice(0, 320);
  }
};

const wait = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const errorMessage = (error: unknown) => {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = error.cause;
  const causeText =
    cause && typeof cause === "object" && "code" in cause
      ? `; cause=${String((cause as { code?: unknown }).code)}`
      : "";
  return `${error.message}${causeText}`;
};

const postArkTextCheck = async (baseUrl: string, apiKey: string, model: string) =>
  fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: "Return only valid JSON." }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: 'Return {"ok":true} only.' }],
        },
      ],
      temperature: 0,
    }),
  });

const checkArkModel = async (
  label: string,
  apiKeyEnvNames: string[],
  modelEnvNames: string[],
) => {
  const apiKey = firstEnv(...apiKeyEnvNames);
  const model = firstEnv(...modelEnvNames);
  const baseUrl = (process.env.ARK_API_BASE_URL ?? DEFAULT_ARK_BASE_URL).replace(/\/$/, "");

  if (!apiKey || !model) {
    return {
      label,
      ok: false,
      reason: `missing ${!apiKey && !model ? "api key and model" : !apiKey ? "api key" : "model"}`,
      apiKeyEnv: apiKey?.key,
      modelEnv: model?.key,
    };
  }

  let response: Response | undefined;
  let networkError: unknown;
  let attempts = 0;
  for (const delay of [0, 500, 1000, 1500, 2000]) {
    if (delay > 0) {
      await wait(delay);
    }
    attempts += 1;
    try {
      response = await postArkTextCheck(baseUrl, apiKey.value, model.value);
      break;
    } catch (error) {
      networkError = error;
    }
  }

  if (!response) {
    return {
      label,
      ok: false,
      reason: "network error",
      apiKeyEnv: apiKey.key,
      modelEnv: model.key,
      attempts,
      error: errorMessage(networkError),
    };
  }

  return {
    label,
    ok: response.ok,
    status: response.status,
    apiKeyEnv: apiKey.key,
    modelEnv: model.key,
    attempts,
    error: response.ok ? undefined : await summarizeBody(response),
  };
};

const results = [];
results.push(
  await checkArkModel(
    "vision",
    ["AI_VISION_API_KEY", "AI_GENERAL_API_KEY", "ARK_API_KEY", "AI_API_KEY"],
    ["AI_VISION_MODEL_ID", "AI_VISION_ENDPOINT_ID", "AI_GENERAL_MODEL_ID"],
  ),
);
results.push(
  await checkArkModel(
    "reference",
    ["AI_REFERENCE_API_KEY", "AI_GENERAL_API_KEY", "ARK_API_KEY", "AI_API_KEY"],
    ["AI_REFERENCE_MODEL_ID", "AI_GENERAL_MODEL_ID", "AI_TEXT_MODEL_ID"],
  ),
);

console.log(JSON.stringify({ results }, null, 2));

if (results.some((result) => !result.ok)) {
  process.exitCode = 1;
}
