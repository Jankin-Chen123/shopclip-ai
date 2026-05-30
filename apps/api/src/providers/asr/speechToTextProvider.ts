import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export interface SpeechToTextResult {
  provider: string;
  transcript: string;
}

export interface SpeechToTextProvider {
  transcribe(input: { audioPath: string; language?: string }): Promise<SpeechToTextResult>;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const transcriptFromResponse = (body: unknown): string => {
  if (!isRecord(body)) {
    return "";
  }
  const direct = body.text ?? body.transcript ?? body.result;
  if (typeof direct === "string") {
    return direct.trim();
  }
  const data = body.data;
  if (isRecord(data)) {
    const nested = data.text ?? data.transcript ?? data.result;
    if (typeof nested === "string") {
      return nested.trim();
    }
  }
  return "";
};

export const createHttpSpeechToTextProvider = (): SpeechToTextProvider => ({
  transcribe: async ({ audioPath, language }) => {
    const endpoint = firstEnv("ASR_ENDPOINT_URL", "SPEECH_TO_TEXT_ENDPOINT_URL");
    if (!endpoint) {
      throw new Error("ASR_ENDPOINT_URL is required when ASR_PROVIDER_MODE=http.");
    }

    const apiKey = firstEnv("ASR_API_KEY", "SPEECH_TO_TEXT_API_KEY");
    const form = new FormData();
    const audio = await readFile(audioPath);
    form.append("file", new Blob([audio], { type: "audio/mp4" }), basename(audioPath));
    if (language) {
      form.append("language", language);
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : undefined,
      body: form,
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    if (!response.ok) {
      throw new Error(`ASR request failed with HTTP ${response.status}.`);
    }

    const transcript = transcriptFromResponse(body);
    if (!transcript) {
      throw new Error("ASR response did not include transcript text.");
    }
    return {
      provider: "http-asr",
      transcript,
    };
  },
});

export const createSpeechToTextProviderFromEnv = (): SpeechToTextProvider | undefined => {
  const mode = (process.env.ASR_PROVIDER_MODE ?? "none").trim().toLowerCase();
  if (mode === "none" || mode === "off" || mode === "") {
    return undefined;
  }
  if (mode === "http" || mode === "real") {
    return createHttpSpeechToTextProvider();
  }
  if (mode === "mock") {
    throw new Error("ASR_PROVIDER_MODE=mock is not supported in business code. Use tests to inject a provider instead.");
  }
  throw new Error(`Unsupported ASR_PROVIDER_MODE=${mode}. Use http/real or none.`);
};
