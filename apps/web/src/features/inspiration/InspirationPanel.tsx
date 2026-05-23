import { useState } from "react";
import {
  ArrowUp,
  AtSign,
  Bot,
  FileText,
  Image,
  LoaderCircle,
  Palette,
  Search,
  SlidersHorizontal,
  Upload,
  Video,
} from "lucide-react";

import type { Language } from "../../app/i18n";
import {
  generateInspirationMaterial,
  type InspirationAssetType,
  type InspirationGenerateResponse,
  type UserApiConfig,
} from "../../lib/api";

interface InspirationPanelProps {
  apiConfig: UserApiConfig;
  language: Language;
}

const inspirationCopy = {
  en: {
    title: "What do you want to create today?",
    placeholder:
      'Enter an idea, script, or upload references. Use "/" for skills, add subjects with @, and create with Agent.',
    uploadReference: "Upload reference",
    agentMode: "Agent mode",
    auto: "Auto",
    inspirationSearch: "Inspiration search",
    creativeDesign: "Creative design",
    addSubject: "Add subject",
    generateMaterial: "Generate material",
    text: "Text",
    image: "Image",
    video: "Video",
    modelRoute: "Current routing",
    errorEmpty: "Enter at least 2 characters before generating.",
    fallbackUsed: "Fallback material returned",
    fallbackReason: "Reason",
    resultTitle: "Generated material",
    missingConfig:
      "Open Settings to choose an API provider/model/address and enter the API key for this material type.",
  },
  zh: {
    title: "今天想创作什么？",
    placeholder: "输入想法、脚本或上传参考，支持使用 / 调用技能，@ 添加主体，和 Agent 一起创作",
    uploadReference: "上传参考",
    agentMode: "Agent 模式",
    auto: "自动",
    inspirationSearch: "灵感搜索",
    creativeDesign: "创意设计",
    addSubject: "添加主体",
    generateMaterial: "生成素材",
    text: "文本",
    image: "图片",
    video: "视频",
    modelRoute: "当前调用配置",
    errorEmpty: "生成前至少输入 2 个字符。",
    fallbackUsed: "已返回兜底素材",
    fallbackReason: "原因",
    resultTitle: "生成结果",
  },
} as const;

const assetTypeOptions = [
  { type: "text", icon: FileText },
  { type: "image", icon: Image },
  { type: "video", icon: Video },
] as const;

export const InspirationPanel = ({ apiConfig, language }: InspirationPanelProps) => {
  const text = inspirationCopy[language];
  const [assetType, setAssetType] = useState<InspirationAssetType>("image");
  const [error, setError] = useState<string>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<InspirationGenerateResponse>();
  const modelRouteSummary =
    language === "zh"
      ? `${text.modelRoute}：文本 ${apiConfig.general?.model ?? "-"}，图片 ${
          apiConfig.image?.model ?? "-"
        }，视频 ${apiConfig.video?.model ?? "-"}。`
      : `${text.modelRoute}: text ${apiConfig.general?.model ?? "-"}, image ${
          apiConfig.image?.model ?? "-"
        }, video ${apiConfig.video?.model ?? "-"}.`;

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();
    const missingConfigMessage =
      language === "zh"
        ? "请先到设置中为当前素材类型选择 API 服务厂商、模型、服务地址，并填写 API key。"
        : inspirationCopy.en.missingConfig;
    if (trimmedPrompt.length < 2) {
      setError(text.errorEmpty);
      return;
    }

    const activeConfig =
      assetType === "image"
        ? apiConfig.image
        : assetType === "video"
          ? apiConfig.video
          : apiConfig.general;
    if (!activeConfig?.apiKey?.trim()) {
      setError(missingConfigMessage);
      return;
    }

    setError(undefined);
    setIsGenerating(true);
    try {
      setResult(await generateInspirationMaterial(trimmedPrompt, assetType, apiConfig));
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const activeMaterial = result?.materials[0];

  return (
    <section className="inspiration-page" aria-labelledby="inspiration-title">
      <div className="inspiration-composer standalone">
        <h2 id="inspiration-title">{text.title}</h2>
        <div className="inspiration-box">
          <button
            className="reference-tile"
            type="button"
            aria-label={text.uploadReference}
          >
            <Upload size={20} aria-hidden="true" />
          </button>
          <label className="inspiration-input">
            <span className="sr-only">{text.title}</span>
            <textarea
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={text.placeholder}
              rows={3}
              value={prompt}
            />
          </label>
          <div className="inspiration-tools" aria-label="Inspiration tools">
            <button type="button" className="active">
              <Bot size={16} aria-hidden="true" />
              {text.agentMode}
            </button>
            <button type="button">
              <SlidersHorizontal size={16} aria-hidden="true" />
              {text.auto}
            </button>
            <button type="button">
              <Search size={16} aria-hidden="true" />
              {text.inspirationSearch}
            </button>
            <button type="button">
              <Palette size={16} aria-hidden="true" />
              {text.creativeDesign}
            </button>
            <button type="button" aria-label={text.addSubject}>
              <AtSign size={16} aria-hidden="true" />
            </button>
          </div>
          <button
            className="inspiration-submit"
            disabled={isGenerating}
            onClick={() => void handleGenerate()}
            type="button"
            aria-label={text.generateMaterial}
          >
            {isGenerating ? (
              <LoaderCircle className="spin" size={18} aria-hidden="true" />
            ) : (
              <ArrowUp size={18} aria-hidden="true" />
            )}
            <span>{text.generateMaterial}</span>
          </button>
        </div>
        <div className="inspiration-mode-row" aria-label="Material type">
          {assetTypeOptions.map(({ type, icon: Icon }) => (
            <button
              aria-pressed={assetType === type}
              className={assetType === type ? "active" : undefined}
              key={type}
              onClick={() => setAssetType(type)}
              type="button"
            >
              <Icon size={16} aria-hidden="true" />
              {text[type]}
            </button>
          ))}
        </div>
        <p className="inspiration-model-note">{modelRouteSummary}</p>
        {error ? <p className="inline-error">{error}</p> : null}
        {result && activeMaterial ? (
          <section className="inspiration-result" aria-label={text.resultTitle}>
            <div className="result-copy">
              <span className="section-label">{text.resultTitle}</span>
              <h3>{activeMaterial.title}</h3>
              <p>{activeMaterial.content}</p>
              <div className="inspiration-result-meta">
                <span>{result.model}</span>
                <span>{activeMaterial.status}</span>
                {result.fallback.used ? <span>{text.fallbackUsed}</span> : null}
              </div>
              {result.fallback.reason ? (
                <p className="fallback-note">
                  {text.fallbackReason}: {result.fallback.reason}
                </p>
              ) : null}
            </div>
            {activeMaterial.type === "image" && activeMaterial.url ? (
              <img alt={activeMaterial.title} src={activeMaterial.url} />
            ) : null}
            {activeMaterial.type === "video" && activeMaterial.url ? (
              <video aria-label={activeMaterial.title} controls src={activeMaterial.url} />
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  );
};
