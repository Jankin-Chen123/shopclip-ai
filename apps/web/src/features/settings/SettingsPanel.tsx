import { useState } from "react";
import { Database, KeyRound, Languages, Plus, ServerCog, Trash2 } from "lucide-react";

import type { Language } from "../../app/i18n";
import { languageNames } from "../../app/i18n";
import type { StockProviderConfig, UserApiConfig } from "../../lib/api";

type ApiConfigRole = "general" | "image" | "video";

interface SettingsPanelProps {
  apiConfig: UserApiConfig;
  language: Language;
  stockProviderConfigs: StockProviderConfig[];
  onApiConfigChange: (apiConfig: UserApiConfig) => void;
  onLanguageChange: (language: Language) => void;
  onStockProviderConfigsChange: (configs: StockProviderConfig[]) => void;
}

interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  models: Record<ApiConfigRole, string[]>;
}

const providerPresets: ProviderPreset[] = [
  {
    id: "volcengine-ark",
    label: "Volcengine Ark",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    models: {
      general: [
        "Doubao-Seed-2.0-pro",
        "Doubao-Seed-2.0-flash",
        "Doubao-Seed-1.8-thinking",
        "Doubao-Seed-1.8",
      ],
      image: [
        "Doubao-Seedream-5.0-lite",
        "Doubao-Seedream-4.5",
        "Doubao-Seedream-4.0",
      ],
      video: [
        "Doubao-Seedance-2.0",
        "Doubao-Seedance-1.5-pro",
        "Doubao-Seedance-1.5-lite",
      ],
    },
  },
  {
    id: "openai-compatible",
    label: "OpenAI compatible",
    baseUrl: "https://api.openai.com/v1",
    models: {
      general: ["gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-pro", "gpt-5.4-mini"],
      image: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"],
      video: ["sora-2", "sora-2-pro"],
    },
  },
  {
    id: "custom",
    label: "Custom provider",
    baseUrl: "",
    models: {
      general: ["custom-text-model"],
      image: ["custom-image-model"],
      video: ["custom-video-model"],
    },
  },
];

const defaultProviderPreset = providerPresets[0]!;

const stockProviderPresets: Array<{
  source: StockProviderConfig["source"];
  label: string;
  description: Record<Language, string>;
  requiresApiKey: boolean;
}> = [
  {
    source: "demo",
    label: "Demo Stock",
    description: {
      en: "Built-in sample stock library for local demos and acceptance checks.",
      zh: "内置演示素材库，用于本地体验和验收检查。",
    },
    requiresApiKey: false,
  },
  {
    source: "pexels",
    label: "Pexels",
    description: {
      en: "Search Pexels photos and videos with your own API key.",
      zh: "使用你的 API key 搜索 Pexels 图片和视频。",
    },
    requiresApiKey: true,
  },
  {
    source: "pixabay",
    label: "Pixabay",
    description: {
      en: "Search Pixabay images and videos with your own API key.",
      zh: "使用你的 API key 搜索 Pixabay 图片和视频。",
    },
    requiresApiKey: true,
  },
];

const getStockProviderPreset = (source: StockProviderConfig["source"]) =>
  stockProviderPresets.find((preset) => preset.source === source) ?? stockProviderPresets[0]!;

const roleCopy: Record<
  Language,
  Record<ApiConfigRole, { title: string; description: string; keyLabel: string }>
> = {
  en: {
    general: {
      title: "General model",
      description: "Used for text ideas, scripts, and general assistant calls.",
      keyLabel: "General API key",
    },
    image: {
      title: "Image generation model",
      description: "Used when the inspiration result type is Image.",
      keyLabel: "Image API key",
    },
    video: {
      title: "Video generation model",
      description: "Used when the inspiration result type is Video.",
      keyLabel: "Video API key",
    },
  },
  zh: {
    general: {
      title: "通用模型",
      description: "用于文本灵感、脚本和通用大模型调用。",
      keyLabel: "通用 API key",
    },
    image: {
      title: "图片生成模型",
      description: "灵感结果类型为图片时使用。",
      keyLabel: "图片 API key",
    },
    video: {
      title: "视频生成模型",
      description: "灵感结果类型为视频时使用。",
      keyLabel: "视频 API key",
    },
  },
};

const settingsCopy = {
  en: {
    title: "Settings",
    subtitle: "Language and model provider configuration.",
    languageTitle: "Language",
    provider: "API provider",
    apiBaseUrl: "API service address",
    model: "Model",
    modelPlaceholder: "Select or type a model",
    keyHelp: "API keys are stored in this browser and sent only with generation requests.",
    keyPlaceholder: "Paste API key",
    stockTitle: "Third-party stock libraries",
    stockDescription:
      "Choose a stock site and add its API key. Keys stay in this browser and are only sent when you search that site.",
    addStockLibrary: "Add third-party library",
    stockProvider: "Stock site",
    stockApiKey: "Stock API key",
    stockApiKeyPlaceholder: "Paste provider API key",
    stockDemoHelp: "Demo Stock does not require an API key.",
    enabled: "Enabled",
    remove: "Remove",
    configured: "Configured libraries",
    noStockProviders: "No stock libraries added yet.",
  },
  zh: {
    title: "设置",
    subtitle: "语言切换与模型服务配置。",
    languageTitle: "语言",
    provider: "API 服务厂商",
    apiBaseUrl: "API 服务地址",
    model: "模型",
    modelPlaceholder: "选择或手动输入模型",
    keyHelp: "API key 仅保存在当前浏览器中，并只会在生成请求时发送。",
    keyPlaceholder: "填写 API key",
    stockTitle: "第三方素材库",
    stockDescription:
      "选择素材库网站并添加 API key。Key 只保存在当前浏览器中，只会在搜索对应素材库时发送。",
    addStockLibrary: "添加第三方素材库",
    stockProvider: "素材库网站",
    stockApiKey: "素材库 API key",
    stockApiKeyPlaceholder: "填写该素材库的 API key",
    stockDemoHelp: "Demo Stock 不需要 API key。",
    enabled: "启用",
    remove: "移除",
    configured: "已添加素材库",
    noStockProviders: "还没有添加第三方素材库。",
  },
} as const;

const getPreset = (provider?: string) =>
  providerPresets.find((preset) => preset.id === provider) ?? defaultProviderPreset;

export const createDefaultApiConfig = (): UserApiConfig => ({
  general: {
    provider: "volcengine-ark",
    apiBaseUrl: defaultProviderPreset.baseUrl,
    model: defaultProviderPreset.models.general[0],
  },
  image: {
    provider: "volcengine-ark",
    apiBaseUrl: defaultProviderPreset.baseUrl,
    model: defaultProviderPreset.models.image[0],
  },
  video: {
    provider: "volcengine-ark",
    apiBaseUrl: defaultProviderPreset.baseUrl,
    model: defaultProviderPreset.models.video[0],
  },
});

export const sanitizeApiConfig = (apiConfig: UserApiConfig): UserApiConfig => {
  const defaults = createDefaultApiConfig();
  return {
    general: { ...defaults.general, ...apiConfig.general },
    image: { ...defaults.image, ...apiConfig.image },
    video: { ...defaults.video, ...apiConfig.video },
  };
};

export const createDefaultStockProviderConfigs = (): StockProviderConfig[] => [
  { source: "demo", enabled: true },
];

export const sanitizeStockProviderConfigs = (
  configs: StockProviderConfig[] = [],
): StockProviderConfig[] => {
  const knownSources = new Set(stockProviderPresets.map((provider) => provider.source));
  const normalized = configs
    .filter((config) => knownSources.has(config.source))
    .map((config) => ({
      source: config.source,
      enabled: config.enabled !== false,
      apiKey: config.apiKey?.trim() || undefined,
    }));

  return normalized;
};

export const SettingsPanel = ({
  apiConfig,
  language,
  stockProviderConfigs,
  onApiConfigChange,
  onLanguageChange,
  onStockProviderConfigsChange,
}: SettingsPanelProps) => {
  const text = settingsCopy[language];
  const roleText = roleCopy[language];
  const config = sanitizeApiConfig(apiConfig);
  const stockConfigs = sanitizeStockProviderConfigs(stockProviderConfigs);
  const [draftStockProvider, setDraftStockProvider] =
    useState<StockProviderConfig["source"]>("pexels");
  const [draftStockApiKey, setDraftStockApiKey] = useState("");
  const draftStockPreset = getStockProviderPreset(draftStockProvider);

  const updateRole = (
    role: ApiConfigRole,
    update: NonNullable<UserApiConfig[ApiConfigRole]>,
  ) => {
    onApiConfigChange({
      ...config,
      [role]: {
        ...config[role],
        ...update,
      },
    });
  };

  const handleProviderChange = (role: ApiConfigRole, provider: string) => {
    const preset = getPreset(provider);
    updateRole(role, {
      provider: preset.id,
      apiBaseUrl: preset.baseUrl || config[role]?.apiBaseUrl,
      model: preset.models[role][0] ?? config[role]?.model ?? "",
    });
  };

  const updateStockProvider = (
    source: StockProviderConfig["source"],
    update: Partial<StockProviderConfig>,
  ) => {
    onStockProviderConfigsChange(
      stockConfigs.map((provider) =>
        provider.source === source ? { ...provider, ...update } : provider,
      ),
    );
  };

  const addStockProvider = () => {
    const nextConfig: StockProviderConfig = {
      source: draftStockProvider,
      enabled: true,
      apiKey: draftStockApiKey.trim() || undefined,
    };
    const existing = stockConfigs.some((provider) => provider.source === draftStockProvider);
    onStockProviderConfigsChange(
      existing
        ? stockConfigs.map((provider) =>
            provider.source === draftStockProvider ? { ...provider, ...nextConfig } : provider,
          )
        : [...stockConfigs, nextConfig],
    );
    setDraftStockApiKey("");
  };

  const removeStockProvider = (source: StockProviderConfig["source"]) => {
    onStockProviderConfigsChange(stockConfigs.filter((provider) => provider.source !== source));
  };

  return (
    <section className="settings-panel" aria-labelledby="settings-title">
      <div className="settings-heading">
        <span className="settings-heading-icon" aria-hidden="true">
          <ServerCog size={22} />
        </span>
        <div>
          <h2 id="settings-title">{text.title}</h2>
          <p>{text.subtitle}</p>
        </div>
      </div>

      <section className="settings-section" aria-labelledby="settings-language-title">
        <div className="settings-section-heading">
          <Languages size={18} aria-hidden="true" />
          <h3 id="settings-language-title">{text.languageTitle}</h3>
        </div>
        <div className="settings-language-options">
          {(["en", "zh"] as const).map((option) => (
            <button
              aria-pressed={language === option}
              className={language === option ? "active" : undefined}
              key={option}
              onClick={() => onLanguageChange(option)}
              type="button"
            >
              {languageNames[option]}
            </button>
          ))}
        </div>
      </section>

      <div className="api-config-grid">
        {(["general", "image", "video"] as const).map((role) => {
          const roleConfig = config[role] ?? {};
          const preset = getPreset(roleConfig.provider);
          const models = preset.models[role];
          return (
            <section className="api-config-card" key={role} aria-labelledby={`${role}-config`}>
              <div className="settings-section-heading">
                <KeyRound size={18} aria-hidden="true" />
                <div>
                  <h3 id={`${role}-config`}>{roleText[role].title}</h3>
                  <p>{roleText[role].description}</p>
                </div>
              </div>

              <label>
                {text.provider}
                <select
                  onChange={(event) => handleProviderChange(role, event.target.value)}
                  value={roleConfig.provider ?? "volcengine-ark"}
                >
                  {providerPresets.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {text.apiBaseUrl}
                <input
                  onChange={(event) => updateRole(role, { apiBaseUrl: event.target.value })}
                  type="url"
                  value={roleConfig.apiBaseUrl ?? ""}
                />
              </label>

              <label>
                {text.model}
                <input
                  list={`${role}-model-presets`}
                  onChange={(event) => updateRole(role, { model: event.target.value })}
                  placeholder={text.modelPlaceholder}
                  value={roleConfig.model ?? ""}
                />
                <datalist id={`${role}-model-presets`}>
                  {models.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </label>

              <label>
                {roleText[role].keyLabel}
                <input
                  autoComplete="off"
                  onChange={(event) => updateRole(role, { apiKey: event.target.value })}
                  placeholder={text.keyPlaceholder}
                  type="password"
                  value={roleConfig.apiKey ?? ""}
                />
              </label>
            </section>
          );
        })}
      </div>

      <section className="settings-section" aria-labelledby="stock-provider-settings-title">
        <div className="settings-section-heading">
          <Database size={18} aria-hidden="true" />
          <div>
            <h3 id="stock-provider-settings-title">{text.stockTitle}</h3>
            <p>{text.stockDescription}</p>
          </div>
        </div>

        <div className="stock-provider-add-row">
          <label>
            {text.stockProvider}
            <select
              onChange={(event) =>
                setDraftStockProvider(event.target.value as StockProviderConfig["source"])
              }
              value={draftStockProvider}
            >
              {stockProviderPresets.map((provider) => (
                <option key={provider.source} value={provider.source}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            {text.stockApiKey}
            <input
              autoComplete="off"
              disabled={!draftStockPreset.requiresApiKey}
              onChange={(event) => setDraftStockApiKey(event.target.value)}
              placeholder={
                draftStockPreset.requiresApiKey ? text.stockApiKeyPlaceholder : text.stockDemoHelp
              }
              type="password"
              value={draftStockApiKey}
            />
          </label>

          <button className="stock-provider-add-button" onClick={addStockProvider} type="button">
            <Plus size={18} aria-hidden="true" />
            {text.addStockLibrary}
          </button>
        </div>

        <div className="stock-provider-list" aria-label={text.configured}>
          {stockConfigs.length === 0 ? (
            <p className="settings-key-help">{text.noStockProviders}</p>
          ) : (
            stockConfigs.map((provider) => {
              const preset = getStockProviderPreset(provider.source);
              return (
                <article className="stock-provider-card" key={provider.source}>
                  <div>
                    <div className="stock-provider-card-heading">
                      <strong>{preset.label}</strong>
                      <label className="stock-provider-enabled">
                        <input
                          checked={provider.enabled !== false}
                          onChange={(event) =>
                            updateStockProvider(provider.source, { enabled: event.target.checked })
                          }
                          type="checkbox"
                        />
                        {text.enabled}
                      </label>
                    </div>
                    <p>{preset.description[language]}</p>
                  </div>

                  {preset.requiresApiKey ? (
                    <label>
                      {text.stockApiKey}
                      <input
                        autoComplete="off"
                        onChange={(event) =>
                          updateStockProvider(provider.source, {
                            apiKey: event.target.value || undefined,
                          })
                        }
                        placeholder={text.stockApiKeyPlaceholder}
                        type="password"
                        value={provider.apiKey ?? ""}
                      />
                    </label>
                  ) : (
                    <span className="stock-provider-demo-note">{text.stockDemoHelp}</span>
                  )}

                  <button
                    aria-label={`${text.remove} ${preset.label}`}
                    className="stock-provider-remove"
                    onClick={() => removeStockProvider(provider.source)}
                    type="button"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    {text.remove}
                  </button>
                </article>
              );
            })
          )}
        </div>
      </section>
      <p className="settings-key-help">{text.keyHelp}</p>
    </section>
  );
};
