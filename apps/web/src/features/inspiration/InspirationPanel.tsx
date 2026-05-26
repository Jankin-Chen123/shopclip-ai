import { useEffect, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  FileText,
  History,
  Image,
  LoaderCircle,
  SlidersHorizontal,
  Upload,
  Video,
} from "lucide-react";

import type { Language } from "../../app/i18n";
import {
  generateInspirationMaterial,
  loadInspirationVideoTask,
  type InspirationAssetType,
  type InspirationGenerateResponse,
  type UserApiConfig,
} from "../../lib/api";

interface InspirationPanelProps {
  apiConfig: UserApiConfig;
  initialHistory?: InspirationSessionHistoryEntry[];
  initialHistoryOpen?: boolean;
  language: Language;
}

const copy = {
  en: {
    title: "What do you want to create today?",
    placeholder:
      'Enter an idea, script, or upload references. Use "/" for skills, add subjects with @, and create with Agent.',
    uploadReference: "Upload reference",
    agentMode: "Agent mode",
    auto: "Auto",
    custom: "Custom",
    useSkills: "Use skills",
    addSubject: "Add subject",
    generateMaterial: "Generate material",
    text: "Text",
    image: "Image",
    video: "Video",
    errorEmpty: "Enter at least 2 characters before generating.",
    fallbackReason: "Reason",
    resultTitle: "Generated material",
    missingConfig:
      "Open Settings to choose an API provider/model/address and enter the API key for this material type.",
    progress: "Progress",
    videoPolling: "Rendering video and checking progress",
    videoReady: "Video ready",
    videoFailed: "Video generation failed",
    downloadVideo: "Download video",
    outputText: "Copy output",
    outputImage: "Image output",
    outputVideo: "Video output",
    count: "Images",
    aspectRatio: "Aspect ratio",
    quality: "Quality",
    historyTitle: "Session history",
    historyDescription: "Previous conversations and generated artifacts",
    emptyHistory: "Generated sessions will appear here.",
    viewSession: "View session",
    artifact: "artifact",
    artifacts: "artifacts",
    session: "session",
    sessions: "sessions",
    fallbackHistoryDate: "Just now",
  },
  zh: {
    title: "今天想创作什么？",
    placeholder: "输入想法、脚本或上传参考，支持使用 / 调用技能，@ 添加主体，和 Agent 一起创作。",
    uploadReference: "上传参考",
    agentMode: "Agent 模式",
    auto: "自动",
    custom: "自定义",
    useSkills: "使用技能",
    addSubject: "添加主体",
    generateMaterial: "生成素材",
    text: "文本",
    image: "图片",
    video: "视频",
    errorEmpty: "生成前至少输入 2 个字符。",
    fallbackReason: "原因",
    resultTitle: "生成结果",
    missingConfig: "请先到设置中为当前素材类型选择 API 服务厂商、模型、服务地址，并填写 API key。",
    progress: "生成进度",
    videoPolling: "视频生成中，正在自动检查结果",
    videoReady: "视频已生成",
    videoFailed: "视频生成失败",
    downloadVideo: "下载视频",
    outputText: "文本产物",
    outputImage: "图片产物",
    outputVideo: "视频产物",
    count: "图片数量",
    aspectRatio: "比例",
    quality: "清晰度",
    historyTitle: "会话记录",
    historyDescription: "查看之前的会话和大模型产物",
    emptyHistory: "生成后的会话会出现在这里。",
    viewSession: "查看会话",
    artifact: "个产物",
    artifacts: "个产物",
    session: "条会话",
    sessions: "条会话",
    fallbackHistoryDate: "刚刚",
  },
} as const;

const assetTypeOptions = [
  { type: "text", icon: FileText },
  { type: "image", icon: Image },
  { type: "video", icon: Video },
] as const;

const aspectRatioOptions = ["auto", "1:1", "4:3", "3:4", "16:9", "9:16"] as const;
const videoAspectRatioOptions = ["auto", "1:1", "16:9", "9:16"] as const;
const qualityOptions = ["standard", "hd", "2k"] as const;
const inspirationHistoryStorageKey = "shopclip-inspiration-session-history";
const maxInspirationHistoryItems = 12;

export interface InspirationSessionHistoryEntry {
  savedAt: string;
  result: InspirationGenerateResponse;
}

const loadStoredInspirationHistory = (): InspirationSessionHistoryEntry[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedHistory = window.localStorage.getItem(inspirationHistoryStorageKey);
    if (!storedHistory) {
      return [];
    }
    const parsedHistory = JSON.parse(storedHistory) as Partial<InspirationSessionHistoryEntry>[];
    return parsedHistory
      .filter(
        (entry): entry is InspirationSessionHistoryEntry =>
          typeof entry?.savedAt === "string" &&
          typeof entry.result?.id === "string" &&
          typeof entry.result.prompt === "string" &&
          Array.isArray(entry.result.materials),
      )
      .slice(0, maxInspirationHistoryItems);
  } catch {
    return [];
  }
};

export const appendInspirationSessionHistory = (
  history: InspirationSessionHistoryEntry[],
  result: InspirationGenerateResponse,
  savedAt = new Date().toISOString(),
): InspirationSessionHistoryEntry[] => [
  { savedAt, result },
  ...history.filter((entry) => entry.result.id !== result.id),
].slice(0, maxInspirationHistoryItems);

export const replaceInspirationSessionHistoryResult = (
  history: InspirationSessionHistoryEntry[],
  result: InspirationGenerateResponse,
): InspirationSessionHistoryEntry[] =>
  history.map((entry) => (entry.result.id === result.id ? { ...entry, result } : entry));

const saveInspirationHistory = (history: InspirationSessionHistoryEntry[]) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(inspirationHistoryStorageKey, JSON.stringify(history));
  } catch {
    // Large generated artifacts can exceed browser storage. Keep the in-memory session usable.
  }
};

const formatSessionTime = (savedAt: string, language: Language, fallback: string) => {
  const savedDate = new Date(savedAt);
  if (Number.isNaN(savedDate.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(savedDate);
};

export const InspirationPanel = ({
  apiConfig,
  initialHistory,
  initialHistoryOpen = false,
  language,
}: InspirationPanelProps) => {
  const text = copy[language];
  const [history, setHistory] = useState<InspirationSessionHistoryEntry[]>(
    () => initialHistory ?? loadStoredInspirationHistory(),
  );
  const initialResult = history[0]?.result;
  const [assetType, setAssetType] = useState<InspirationAssetType>(
    initialResult?.assetType ?? "image",
  );
  const [error, setError] = useState<string>();
  const [imageAspectRatio, setImageAspectRatio] = useState<(typeof aspectRatioOptions)[number]>("auto");
  const [imageCount, setImageCount] = useState(1);
  const [imageQuality, setImageQuality] = useState<(typeof qualityOptions)[number]>("standard");
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(initialHistoryOpen);
  const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false);
  const [pollError, setPollError] = useState<string>();
  const [prompt, setPrompt] = useState(initialResult?.prompt ?? "");
  const [result, setResult] = useState<InspirationGenerateResponse | undefined>(initialResult);
  const [videoAspectRatio, setVideoAspectRatio] =
    useState<(typeof videoAspectRatioOptions)[number]>("auto");
  const [videoQuality, setVideoQuality] = useState<(typeof qualityOptions)[number]>("standard");
  const [selectedHistoryId, setSelectedHistoryId] = useState(initialResult?.id);

  const selectedTypeOption = assetTypeOptions.find((option) => option.type === assetType) ?? assetTypeOptions[1];
  const SelectedTypeIcon = selectedTypeOption.icon;

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();
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
    if (activeConfig?.credentialSource !== "official" && !activeConfig?.apiKey?.trim()) {
      setError(text.missingConfig);
      return;
    }

    const generationOptions =
      assetType === "image"
        ? {
            image: {
              count: imageCount,
              aspectRatio: imageAspectRatio,
              quality: imageQuality,
            },
          }
        : assetType === "video"
          ? {
              video: {
                aspectRatio: videoAspectRatio,
                quality: videoQuality,
              },
            }
          : undefined;

    setError(undefined);
    setPollError(undefined);
    setIsGenerating(true);
    try {
      const generatedResult = await generateInspirationMaterial(
        trimmedPrompt,
        assetType,
        apiConfig,
        generationOptions,
      );
      setResult(generatedResult);
      setSelectedHistoryId(generatedResult.id);
      setIsHistoryOpen(true);
      setHistory((currentHistory) => {
        const nextHistory = appendInspirationSessionHistory(currentHistory, generatedResult);
        saveInspirationHistory(nextHistory);
        return nextHistory;
      });
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const activeMaterial = result?.materials[0];
  const materialProgress =
    activeMaterial?.progress ??
    (activeMaterial?.status === "ready" ? 100 : activeMaterial?.status === "processing" ? 0 : 0);
  const shouldShowResult = Boolean(result && activeMaterial && isHistoryOpen);
  const restoreHistoryEntry = (entry: InspirationSessionHistoryEntry) => {
    setAssetType(entry.result.assetType);
    setError(undefined);
    setPollError(undefined);
    setPrompt(entry.result.prompt);
    setResult(entry.result);
    setSelectedHistoryId(entry.result.id);
    setIsCustomOpen(false);
    setIsTypeMenuOpen(false);
  };

  useEffect(() => {
    const taskId = activeMaterial?.type === "video" ? activeMaterial.taskId : undefined;
    const resultId = result?.id;
    const resultPrompt = result?.prompt;
    if (!resultId || !resultPrompt || !taskId || activeMaterial?.status !== "processing") {
      return undefined;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 90;

    const pollVideoTask = async () => {
      attempts += 1;
      try {
        const material = await loadInspirationVideoTask(taskId, resultPrompt, apiConfig);
        if (cancelled) {
          return;
        }

        setPollError(undefined);
        setResult((currentResult) => {
          if (currentResult?.id !== resultId) {
            return currentResult;
          }

          const nextResult = {
            ...currentResult,
            materials: [material, ...currentResult.materials.slice(1)],
          };
          setHistory((currentHistory) => {
            const nextHistory = replaceInspirationSessionHistoryResult(currentHistory, nextResult);
            saveInspirationHistory(nextHistory);
            return nextHistory;
          });
          return nextResult;
        });
      } catch (taskError) {
        if (!cancelled) {
          setPollError(taskError instanceof Error ? taskError.message : "Video polling failed.");
        }
      }
    };

    const intervalId = window.setInterval(() => {
      if (attempts >= maxAttempts) {
        window.clearInterval(intervalId);
        return;
      }
      void pollVideoTask();
    }, 5000);

    void pollVideoTask();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    activeMaterial?.status,
    activeMaterial?.taskId,
    activeMaterial?.type,
    apiConfig,
    result?.id,
    result?.prompt,
  ]);

  return (
    <section className="inspiration-page" aria-labelledby="inspiration-title">
      <div className="inspiration-workspace">
        <div className="inspiration-main">
          <div className="inspiration-composer standalone">
            <h2 id="inspiration-title">{text.title}</h2>
            <div className="inspiration-box">
              <button className="reference-tile" type="button" aria-label={text.uploadReference}>
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
                <div className="inspiration-type-menu">
                  <button
                    className="active"
                    onClick={() => {
                      setIsTypeMenuOpen((isOpen) => !isOpen);
                      setIsCustomOpen(false);
                    }}
                    type="button"
                  >
                    <SelectedTypeIcon size={16} aria-hidden="true" />
                    {text[assetType]}
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {isTypeMenuOpen ? (
                    <div className="inspiration-type-list" role="menu">
                      {assetTypeOptions.map(({ type, icon: Icon }) => (
                        <button
                          aria-checked={assetType === type}
                          key={type}
                          onClick={() => {
                            setAssetType(type);
                            setIsTypeMenuOpen(false);
                          }}
                          role="menuitemradio"
                          type="button"
                        >
                          <Icon size={16} aria-hidden="true" />
                          {text[type]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="inspiration-custom-menu">
                  <button
                    className={isCustomOpen ? "active" : undefined}
                    onClick={() => {
                      setIsCustomOpen((isOpen) => !isOpen);
                      setIsTypeMenuOpen(false);
                    }}
                    type="button"
                  >
                    <SlidersHorizontal size={16} aria-hidden="true" />
                    {text.custom}
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="inspiration-dropdown-layer">
                {isCustomOpen ? (
                  <div className="inspiration-custom-panel">
                    {assetType === "image" ? (
                      <>
                        <label>
                          {text.count}
                          <input
                            max={4}
                            min={1}
                            onChange={(event) => setImageCount(Number(event.target.value))}
                            type="number"
                            value={imageCount}
                          />
                        </label>
                        <label>
                          {text.aspectRatio}
                          <select
                            onChange={(event) =>
                              setImageAspectRatio(event.target.value as typeof imageAspectRatio)
                            }
                            value={imageAspectRatio}
                          >
                            {aspectRatioOptions.map((ratio) => (
                              <option key={ratio} value={ratio}>
                                {ratio}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {text.quality}
                          <select
                            onChange={(event) =>
                              setImageQuality(event.target.value as typeof imageQuality)
                            }
                            value={imageQuality}
                          >
                            {qualityOptions.map((quality) => (
                              <option key={quality} value={quality}>
                                {quality}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : assetType === "video" ? (
                      <>
                        <label>
                          {text.aspectRatio}
                          <select
                            onChange={(event) =>
                              setVideoAspectRatio(event.target.value as typeof videoAspectRatio)
                            }
                            value={videoAspectRatio}
                          >
                            {videoAspectRatioOptions.map((ratio) => (
                              <option key={ratio} value={ratio}>
                                {ratio}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {text.quality}
                          <select
                            onChange={(event) =>
                              setVideoQuality(event.target.value as typeof videoQuality)
                            }
                            value={videoQuality}
                          >
                            {qualityOptions.map((quality) => (
                              <option key={quality} value={quality}>
                                {quality}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : (
                      <p>{text.outputText}</p>
                    )}
                  </div>
                ) : null}
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
          </div>
          {error ? <p className="inline-error">{error}</p> : null}
          {shouldShowResult && result && activeMaterial ? (
            <section
              className={`inspiration-result inspiration-result-${result.assetType}`}
              aria-label={text.resultTitle}
            >
              {result.assetType === "text" ? (
                <div className="text-result-body">
                  <p>{activeMaterial.content}</p>
                </div>
              ) : null}
              {result.assetType === "image" ? (
                <div className="image-result-grid">
                  {result.materials.map((material) =>
                    material.url ? (
                      <img alt={material.title || text.outputImage} key={material.id} src={material.url} />
                    ) : null,
                  )}
                </div>
              ) : null}
              {activeMaterial.type === "video" && activeMaterial.url ? (
                <video aria-label={text.outputVideo} controls src={activeMaterial.url} />
              ) : null}
              {result.assetType === "video" && !activeMaterial.url ? (
                <div className="video-progress-panel">
                  <div className="video-progress-header">
                    <span>
                      {activeMaterial.status === "ready"
                        ? text.videoReady
                        : activeMaterial.status === "failed"
                          ? text.videoFailed
                          : text.videoPolling}
                    </span>
                    <strong>{materialProgress}%</strong>
                  </div>
                  <div
                    aria-label={text.progress}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={materialProgress}
                    className="video-progress-track"
                    role="progressbar"
                  >
                    <span style={{ width: `${materialProgress}%` }} />
                  </div>
                  {activeMaterial.url ? (
                    <a
                      className="video-download-link"
                      href={activeMaterial.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {text.downloadVideo}
                    </a>
                  ) : null}
                </div>
              ) : null}
              {pollError || result.fallback.reason ? (
                <div className="inspiration-result-notes">
                  {pollError ? <p className="fallback-note">{pollError}</p> : null}
                  {result.fallback.reason ? (
                    <p className="fallback-note">
                      {text.fallbackReason}: {result.fallback.reason}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
        <aside
          className="inspiration-session-history inspiration-history-sidebar"
          aria-labelledby="inspiration-history-title"
        >
          <button
            aria-controls="inspiration-history-list"
            aria-expanded={isHistoryOpen}
            className="inspiration-history-toggle"
            onClick={() => setIsHistoryOpen((isOpen) => !isOpen)}
            type="button"
          >
            <span className="inspiration-history-icon">
              <History size={18} aria-hidden="true" />
            </span>
            <div>
              <h3 id="inspiration-history-title">{text.historyTitle}</h3>
              <p>{text.historyDescription}</p>
            </div>
            <span className="inspiration-history-count">
              {language === "zh"
                ? `${history.length}${text.sessions}`
                : `${history.length} ${history.length === 1 ? text.session : text.sessions}`}
            </span>
            <ChevronDown
              className={isHistoryOpen ? "history-chevron open" : "history-chevron"}
              size={16}
              aria-hidden="true"
            />
          </button>
          {history.length > 0 ? (
            <div
              className="inspiration-history-list vertical"
              hidden={!isHistoryOpen}
              id="inspiration-history-list"
            >
              {history.map((entry) => {
                const materialCount = entry.result.materials.length;
                const artifactLabel =
                  language === "zh"
                    ? `${materialCount}${text.artifacts}`
                    : `${materialCount} ${entry.result.assetType} ${
                        materialCount === 1 ? text.artifact : text.artifacts
                      }`;
                return (
                  <button
                    aria-label={`${text.viewSession}: ${entry.result.prompt}`}
                    className={selectedHistoryId === entry.result.id ? "active" : undefined}
                    key={`${entry.result.id}-${entry.savedAt}`}
                    onClick={() => restoreHistoryEntry(entry)}
                    type="button"
                  >
                    <span className="history-session-prompt">{entry.result.prompt}</span>
                    <span className="history-session-meta">
                      {formatSessionTime(entry.savedAt, language, text.fallbackHistoryDate)} ·{" "}
                      {artifactLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="inspiration-history-empty">{text.emptyHistory}</p>
          )}
        </aside>
      </div>
    </section>
  );
};
