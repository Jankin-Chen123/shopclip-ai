import { useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import { ChevronDown, Database, KeyRound, Languages, Plus, ServerCog, Trash2 } from "lucide-react";

import type { Language } from "../../app/i18n";
import { languageNames } from "../../app/i18n";
import type { StockProviderConfig, UserApiConfig } from "../../lib/api";

type ApiConfigRole = "general" | "image" | "video";
type CredentialSource = "custom" | "official";

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

interface ModelComboboxProps {
  label: string;
  models: string[];
  onChange: (model: string) => void;
  placeholder: string;
  role: ApiConfigRole;
  value: string;
}

const providerPresets: ProviderPreset[] = [
  {
    id: "volcengine-ark",
    label: "Volcengine Ark",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    models: {
      general: [
        "doubao-seed-2-0-pro-260215",
        "doubao-seed-2-0-lite-260428",
        "doubao-seed-2-0-mini-260428",
      ],
      image: [
        "doubao-seedream-5-0-260128",
        "doubao-seedream-4-5-251128",
        "doubao-seedream-4-0-250828",
      ],
      video: ["doubao-seedance-1-5-pro-251215"],
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

const arkModelAliases = new Map<string, string>([
  ["doubao-seed-2.0-pro", "doubao-seed-2-0-pro-260215"],
  ["doubao-seed-2-0-pro-260215", "doubao-seed-2-0-pro-260215"],
  ["doubao-seed-2.0-lite", "doubao-seed-2-0-lite-260428"],
  ["doubao-seed-2-0-lite-260428", "doubao-seed-2-0-lite-260428"],
  ["doubao-seed-2.0-mini", "doubao-seed-2-0-mini-260428"],
  ["doubao-seed-2-0-mini-260428", "doubao-seed-2-0-mini-260428"],
  ["doubao-seedream-5.0", "doubao-seedream-5-0-260128"],
  ["doubao-seedream-5.0-lite", "doubao-seedream-5-0-260128"],
  ["doubao-seedream-5-0-lite", "doubao-seedream-5-0-260128"],
  ["doubao-seedream-5-0-260128", "doubao-seedream-5-0-260128"],
  ["doubao-seedream-4.5", "doubao-seedream-4-5-251128"],
  ["doubao-seedream-4-5", "doubao-seedream-4-5-251128"],
  ["doubao-seedream-4-5-251128", "doubao-seedream-4-5-251128"],
  ["doubao-seedream-4.0", "doubao-seedream-4-0-250828"],
  ["doubao-seedream-4-0-250828", "doubao-seedream-4-0-250828"],
  ["doubao-seedance-1.5-pro", "doubao-seedance-1-5-pro-251215"],
  ["doubao-seedance-1-5-pro", "doubao-seedance-1-5-pro-251215"],
  ["doubao-seedance-1-5-pro-251215", "doubao-seedance-1-5-pro-251215"],
  ["doubao-seedance-2.0", "doubao-seedance-1-5-pro-251215"],
  ["doubao-seedance-2-0", "doubao-seedance-1-5-pro-251215"],
  ["doubao-seedance-1.5-lite", "doubao-seedance-1-5-pro-251215"],
  ["doubao-seedance-1-5-lite", "doubao-seedance-1-5-pro-251215"],
]);

const normalizeApiModel = (model?: string) => {
  const trimmedModel = model?.trim();
  if (!trimmedModel) {
    return undefined;
  }
  return arkModelAliases.get(trimmedModel.toLowerCase()) ?? trimmedModel;
};

const stockProviderPresets: Array<{
  source: StockProviderConfig["source"];
  label: string;
  description: Record<Language, string>;
}> = [
  {
    source: "pexels",
    label: "Pexels",
    description: {
      en: "Search Pexels photos and videos with your own API key.",
      zh: "使用你的 API key 搜索 Pexels 图片和视频。",
    },
  },
  {
    source: "pixabay",
    label: "Pixabay",
    description: {
      en: "Search Pixabay images and videos with your own API key.",
      zh: "使用你的 API key 搜索 Pixabay 图片和视频。",
    },
  },
  {
    source: "freesound",
    label: "Freesound",
    description: {
      en: "Search Freesound audio effects and music previews with your own API key.",
      zh: "使用你的 API key 搜索 Freesound 音效和音乐预览素材。",
    },
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
    credentialSource: "API key source",
    customCredential: "Custom",
    officialCredential: "Use official config",
    apiBaseUrl: "API service address",
    model: "Model",
    modelPlaceholder: "Select a model or paste an endpoint ID",
    keyHelp: "API keys are stored in this browser and sent only with generation requests.",
    officialKeyHelp:
      "Official config sends a server-side flag with the request. The backend uses the API key from its .env file.",
    keyPlaceholder: "Paste API key",
    officialKeyPlaceholder: "Backend .env API key",
    stockTitle: "Third-party stock libraries",
    stockDescription:
      "Choose a stock site and decide whether searches use your browser key or the backend .env key.",
    addStockLibrary: "Add third-party library",
    stockProvider: "Stock site",
    stockCredentialSource: "Stock API key source",
    stockApiKey: "Stock API key",
    stockApiKeyPlaceholder: "Paste provider API key",
    stockOfficialKeyPlaceholder: "Backend .env stock API key",
    stockOfficialKeyHelp: "The backend uses the selected stock provider key from its .env file.",
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
    modelPlaceholder: "选择模型或填写 Endpoint ID",
    keyHelp: "API key 仅保存在当前浏览器中，并只会在生成请求时发送。",
    keyPlaceholder: "填写 API key",
    stockTitle: "第三方素材库",
    stockDescription:
      "选择素材库网站并添加 API key。Key 只保存在当前浏览器中，只会在搜索对应素材库时发送。",
    addStockLibrary: "添加第三方素材库",
    stockProvider: "素材库网站",
    stockApiKey: "素材库 API key",
    stockApiKeyPlaceholder: "填写该素材库的 API key",
    enabled: "启用",
    remove: "移除",
    configured: "已添加素材库",
    noStockProviders: "还没有添加第三方素材库。",
  },
} as const;

const localizedSettingsCopy = {
  ...settingsCopy,
  zh: {
    ...settingsCopy.zh,
    credentialSource: "API key 来源",
    customCredential: "自定义",
    officialCredential: "使用官方配置",
    officialKeyHelp: "使用官方配置时，请求会携带服务端配置标记，后端使用 .env 中的 API key。",
    officialKeyPlaceholder: "后端 .env API key",
    stockCredentialSource: "素材 API key 来源",
    stockOfficialKeyPlaceholder: "后端 .env 素材 API key",
    stockOfficialKeyHelp: "后端使用 .env 中选中素材库的 API key。",
  },
} as const;

const getPreset = (provider?: string) =>
  providerPresets.find((preset) => preset.id === provider) ?? defaultProviderPreset;

const ModelCombobox = ({
  label,
  models,
  onChange,
  placeholder,
  role,
  value,
}: ModelComboboxProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const listId = `${role}-model-options`;

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setIsOpen(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      setIsOpen(true);
    }
    if (event.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="model-picker" onBlur={handleBlur}>
      <div className="model-combobox-shell">
        <input
          aria-controls={listId}
          aria-expanded={isOpen}
          aria-label={`${label} model`}
          aria-haspopup="listbox"
          className="model-combobox"
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          value={value}
        />
        <button
          aria-expanded={isOpen}
          aria-label={`${label} model presets`}
          className="model-combobox-toggle"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="model-option-list" hidden={!isOpen} id={listId} role="listbox">
        {models.map((model) => (
          <button
            aria-selected={value === model}
            className="model-option"
            key={model}
            onClick={() => {
              onChange(model);
              setIsOpen(false);
            }}
            role="option"
            type="button"
          >
            {model}
          </button>
        ))}
      </div>
    </div>
  );
};

export const createDefaultApiConfig = (): UserApiConfig => ({
  general: {
    credentialSource: "custom",
    provider: "volcengine-ark",
    apiBaseUrl: defaultProviderPreset.baseUrl,
    model: defaultProviderPreset.models.general[0],
  },
  image: {
    credentialSource: "custom",
    provider: "volcengine-ark",
    apiBaseUrl: defaultProviderPreset.baseUrl,
    model: defaultProviderPreset.models.image[0],
  },
  video: {
    credentialSource: "custom",
    provider: "volcengine-ark",
    apiBaseUrl: defaultProviderPreset.baseUrl,
    model: defaultProviderPreset.models.video[0],
  },
});

export const sanitizeApiConfig = (apiConfig: UserApiConfig): UserApiConfig => {
  const defaults = createDefaultApiConfig();
  const defaultGeneral = defaults.general!;
  const defaultImage = defaults.image!;
  const defaultVideo = defaults.video!;
  const sanitizeRole = (
    roleConfig: UserApiConfig[ApiConfigRole] | undefined,
    defaultRoleConfig: NonNullable<UserApiConfig[ApiConfigRole]>,
  ): NonNullable<UserApiConfig[ApiConfigRole]> => {
    const credentialSource: CredentialSource =
      roleConfig?.credentialSource === "official" ? "official" : "custom";

    return {
      ...defaultRoleConfig,
      ...roleConfig,
      credentialSource,
      apiKey: credentialSource === "official" ? undefined : roleConfig?.apiKey,
      model: normalizeApiModel(roleConfig?.model) ?? defaultRoleConfig.model,
    };
  };

  return {
    general: sanitizeRole(apiConfig.general, defaultGeneral),
    image: sanitizeRole(apiConfig.image, defaultImage),
    video: sanitizeRole(apiConfig.video, defaultVideo),
  };
};

export const createDefaultStockProviderConfigs = (): StockProviderConfig[] => [];

export const sanitizeStockProviderConfigs = (
  configs: StockProviderConfig[] = [],
): StockProviderConfig[] => {
  const knownSources = new Set(stockProviderPresets.map((provider) => provider.source));
  const normalized = configs
    .filter((config) => knownSources.has(config.source))
    .map((config) => {
      const credentialSource: CredentialSource =
        config.credentialSource === "official" ? "official" : "custom";

      return {
        source: config.source,
        credentialSource,
        enabled: config.enabled !== false,
        apiKey: credentialSource === "official" ? undefined : config.apiKey?.trim() || undefined,
      };
    });

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
  const text = { ...localizedSettingsCopy.en, ...localizedSettingsCopy[language] };
  const roleText = roleCopy[language];
  const config = sanitizeApiConfig(apiConfig);
  const stockConfigs = sanitizeStockProviderConfigs(stockProviderConfigs);
  const [draftStockProvider, setDraftStockProvider] =
    useState<StockProviderConfig["source"]>("pexels");
  const [draftStockCredentialSource, setDraftStockCredentialSource] =
    useState<CredentialSource>("custom");
  const [draftStockApiKey, setDraftStockApiKey] = useState("");

  const updateRole = (
    role: ApiConfigRole,
    update: Partial<NonNullable<UserApiConfig[ApiConfigRole]>>,
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

  const handleCredentialSourceChange = (
    role: ApiConfigRole,
    credentialSource: CredentialSource,
  ) => {
    updateRole(role, {
      credentialSource,
      apiKey: credentialSource === "official" ? undefined : config[role]?.apiKey,
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

  const handleStockCredentialSourceChange = (
    source: StockProviderConfig["source"],
    credentialSource: CredentialSource,
  ) => {
    const currentProvider = stockConfigs.find((provider) => provider.source === source);
    updateStockProvider(source, {
      credentialSource,
      apiKey: credentialSource === "official" ? undefined : currentProvider?.apiKey,
    });
  };

  const addStockProvider = () => {
    const nextConfig: StockProviderConfig = {
      source: draftStockProvider,
      credentialSource: draftStockCredentialSource,
      enabled: true,
      apiKey:
        draftStockCredentialSource === "official"
          ? undefined
          : draftStockApiKey.trim() || undefined,
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
          const roleConfig = config[role]!;
          const preset = getPreset(roleConfig.provider);
          const models = preset.models[role];
          const isOfficialCredential = roleConfig.credentialSource === "official";
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

              <fieldset className="credential-source-field">
                <legend>{text.credentialSource}</legend>
                <div className="settings-segmented-control">
                  {(["custom", "official"] as const).map((credentialSource) => (
                    <button
                      aria-pressed={roleConfig.credentialSource === credentialSource}
                      className={
                        roleConfig.credentialSource === credentialSource ? "active" : undefined
                      }
                      key={credentialSource}
                      onClick={() => handleCredentialSourceChange(role, credentialSource)}
                      type="button"
                    >
                      {credentialSource === "custom"
                        ? text.customCredential
                        : text.officialCredential}
                    </button>
                  ))}
                </div>
              </fieldset>

              {isOfficialCredential ? (
                <p className="settings-key-help">{text.officialKeyHelp}</p>
              ) : (
                <>
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
                    <ModelCombobox
                      label={roleText[role].title}
                      models={models}
                      onChange={(model) => updateRole(role, { model })}
                      placeholder={text.modelPlaceholder}
                      role={role}
                      value={roleConfig.model ?? ""}
                    />
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
                </>
              )}
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

          <fieldset className="credential-source-field">
            <legend>{text.stockCredentialSource}</legend>
            <div className="settings-segmented-control">
              {(["custom", "official"] as const).map((credentialSource) => (
                <button
                  aria-pressed={draftStockCredentialSource === credentialSource}
                  className={draftStockCredentialSource === credentialSource ? "active" : undefined}
                  key={credentialSource}
                  onClick={() => {
                    setDraftStockCredentialSource(credentialSource);
                    if (credentialSource === "official") {
                      setDraftStockApiKey("");
                    }
                  }}
                  type="button"
                >
                  {credentialSource === "custom" ? text.customCredential : text.officialCredential}
                </button>
              ))}
            </div>
          </fieldset>

          {draftStockCredentialSource === "official" ? (
            <p className="settings-key-help stock-provider-official-help">
              {text.stockOfficialKeyHelp}
            </p>
          ) : (
            <label>
              {text.stockApiKey}
              <input
                autoComplete="off"
                onChange={(event) => setDraftStockApiKey(event.target.value)}
                placeholder={text.stockApiKeyPlaceholder}
                type="password"
                value={draftStockApiKey}
              />
            </label>
          )}

          <button
            className="stock-provider-add-button"
            disabled={draftStockCredentialSource === "custom" && !draftStockApiKey.trim()}
            onClick={addStockProvider}
            type="button"
          >
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

                  <fieldset className="credential-source-field">
                    <legend>{text.stockCredentialSource}</legend>
                    <div className="settings-segmented-control">
                      {(["custom", "official"] as const).map((credentialSource) => (
                        <button
                          aria-pressed={provider.credentialSource === credentialSource}
                          className={
                            provider.credentialSource === credentialSource ? "active" : undefined
                          }
                          key={credentialSource}
                          onClick={() =>
                            handleStockCredentialSourceChange(provider.source, credentialSource)
                          }
                          type="button"
                        >
                          {credentialSource === "custom"
                            ? text.customCredential
                            : text.officialCredential}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {provider.credentialSource === "official" ? (
                    <p className="settings-key-help stock-provider-official-help">
                      {text.stockOfficialKeyHelp}
                    </p>
                  ) : (
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
