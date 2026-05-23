import type { ChangeEvent, FormEvent } from "react";
import { useRef, useState } from "react";
import type { AssetMetadata } from "@shopclip/shared";
import {
  FileText,
  Globe2,
  Image,
  Loader2,
  Music,
  Plus,
  Search,
  UploadCloud,
  Video,
  X,
} from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import type { AppCopy, Language } from "../../app/i18n";
import type {
  AssetSearchResult,
  CreateAssetInput,
  ExternalAssetResult,
  StockProviderConfig,
} from "../../lib/api";
import type { AssetCategory } from "./AssetCategoryTabs";

interface AssetsPanelProps {
  activeCategory: AssetCategory;
  assetDraft: CreateAssetInput;
  assets: AssetMetadata[];
  copy: AppCopy["assets"];
  disabled: boolean;
  error?: string;
  hasSearched: boolean;
  isLoading: boolean;
  isSearching: boolean;
  language: Language;
  externalSearchResults?: ExternalAssetResult[];
  hasProject: boolean;
  onAssetDraftChange: (asset: CreateAssetInput) => void;
  onImportExternalAsset?: (asset: ExternalAssetResult) => void;
  onImportFiles: (files: File[]) => void;
  onRecallAsset?: (assetId: string) => void;
  onSearchExternalAssets?: (
    query: string,
    type?: "image" | "video",
  ) => Promise<ExternalAssetResult[]>;
  onSearchAssets: () => void;
  onSearchQueryChange: (query: string) => void;
  onUploadAsset: () => void;
  searchQuery: string;
  searchResults: AssetSearchResult[];
  stockProviderConfigs?: StockProviderConfig[];
}

const categoryIcons = {
  image: Image,
  video: Video,
  audio: Music,
  script: FileText,
} as const;

const formatBytes = (bytes?: number) => {
  if (!bytes) {
    return "metadata";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const sourceLabel = (source: ExternalAssetResult["source"]) =>
  source === "pexels" ? "Pexels" : source === "pixabay" ? "Pixabay" : "Demo stock";

const stockProviderLabel = (source: StockProviderConfig["source"]) =>
  source === "pexels" ? "Pexels" : source === "pixabay" ? "Pixabay" : "Demo Stock";

const externalSearchTypeForCategory = (category: AssetCategory): "image" | "video" | undefined =>
  category === "image" || category === "video" ? category : undefined;

const categoryUi: Record<
  Language,
  Record<
    AssetCategory,
    {
      title: string;
      importAction: string;
      importAria: string;
      dialogTitle: string;
      fileLabel: string;
      fileAccept: string;
      searchLabel: string;
      searchPlaceholder: string;
      emptyTitle: string;
      emptyBody: string;
      confirmImport: string;
      selectedFiles: (count: number) => string;
    }
  >
> = {
  en: {
    image: {
      title: "Image library",
      importAction: "Import images",
      importAria: "Import images",
      dialogTitle: "Import images",
      fileLabel: "Local image files",
      fileAccept: "image/*",
      searchLabel: "Search image library",
      searchPlaceholder: "Search image library",
      emptyTitle: "No images yet",
      emptyBody: "Imported image materials will appear here.",
      confirmImport: "Import selected",
      selectedFiles: (count) => `${count} image file${count === 1 ? "" : "s"} selected`,
    },
    video: {
      title: "Video library",
      importAction: "Import videos",
      importAria: "Import videos",
      dialogTitle: "Import videos",
      fileLabel: "Local video files",
      fileAccept: "video/*",
      searchLabel: "Search video library",
      searchPlaceholder: "Search video library",
      emptyTitle: "No videos yet",
      emptyBody: "Imported video materials will appear here.",
      confirmImport: "Import selected",
      selectedFiles: (count) => `${count} video file${count === 1 ? "" : "s"} selected`,
    },
    audio: {
      title: "Audio library",
      importAction: "Import audio",
      importAria: "Import audio",
      dialogTitle: "Import audio",
      fileLabel: "Local audio files",
      fileAccept: "audio/*",
      searchLabel: "Search audio library",
      searchPlaceholder: "Search audio library",
      emptyTitle: "No audio yet",
      emptyBody: "Imported audio materials will appear here.",
      confirmImport: "Import selected",
      selectedFiles: (count) => `${count} audio file${count === 1 ? "" : "s"} selected`,
    },
    script: {
      title: "Script library",
      importAction: "Import scripts",
      importAria: "Import scripts",
      dialogTitle: "Import scripts",
      fileLabel: "Local script files",
      fileAccept: ".txt,.md,text/plain",
      searchLabel: "Search script library",
      searchPlaceholder: "Search script library",
      emptyTitle: "No scripts yet",
      emptyBody: "Imported script materials will appear here.",
      confirmImport: "Import selected",
      selectedFiles: (count) => `${count} script file${count === 1 ? "" : "s"} selected`,
    },
  },
  zh: {
    image: {
      title: "图片素材库",
      importAction: "导入图片",
      importAria: "导入图片素材",
      dialogTitle: "导入图片素材",
      fileLabel: "本机图片文件",
      fileAccept: "image/*",
      searchLabel: "搜索图片素材库",
      searchPlaceholder: "搜索图片素材库",
      emptyTitle: "暂无图片素材",
      emptyBody: "导入后的图片素材会显示在这里。",
      confirmImport: "导入选中文件",
      selectedFiles: (count) => `已选择 ${count} 个图片文件`,
    },
    video: {
      title: "视频素材库",
      importAction: "导入视频",
      importAria: "导入视频素材",
      dialogTitle: "导入视频素材",
      fileLabel: "本机视频文件",
      fileAccept: "video/*",
      searchLabel: "搜索视频素材库",
      searchPlaceholder: "搜索视频素材库",
      emptyTitle: "暂无视频素材",
      emptyBody: "导入后的视频素材会显示在这里。",
      confirmImport: "导入选中文件",
      selectedFiles: (count) => `已选择 ${count} 个视频文件`,
    },
    audio: {
      title: "音频素材库",
      importAction: "导入音频",
      importAria: "导入音频素材",
      dialogTitle: "导入音频素材",
      fileLabel: "本机音频文件",
      fileAccept: "audio/*",
      searchLabel: "搜索音频素材库",
      searchPlaceholder: "搜索音频素材库",
      emptyTitle: "暂无音频素材",
      emptyBody: "导入后的音频素材会显示在这里。",
      confirmImport: "导入选中文件",
      selectedFiles: (count) => `已选择 ${count} 个音频文件`,
    },
    script: {
      title: "剧本素材库",
      importAction: "导入剧本",
      importAria: "导入剧本素材",
      dialogTitle: "导入剧本素材",
      fileLabel: "本机剧本文件",
      fileAccept: ".txt,.md,text/plain",
      searchLabel: "搜索剧本素材库",
      searchPlaceholder: "搜索剧本素材库",
      emptyTitle: "暂无剧本素材",
      emptyBody: "导入后的剧本素材会显示在这里。",
      confirmImport: "导入选中文件",
      selectedFiles: (count) => `已选择 ${count} 个剧本文件`,
    },
  },
};

export const AssetsPanel = ({
  activeCategory,
  assets,
  copy,
  disabled,
  error,
  isLoading,
  isSearching,
  language,
  hasProject,
  onImportExternalAsset,
  onImportFiles,
  onRecallAsset,
  onSearchExternalAssets,
  onSearchAssets,
  onSearchQueryChange,
  searchQuery,
  searchResults,
  stockProviderConfigs = [],
}: AssetsPanelProps) => {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExternalSearchOpen, setIsExternalSearchOpen] = useState(false);
  const [externalModalQuery, setExternalModalQuery] = useState(searchQuery);
  const [externalModalResults, setExternalModalResults] = useState<ExternalAssetResult[]>([]);
  const [externalModalError, setExternalModalError] = useState<string>();
  const [isExternalModalSearching, setIsExternalModalSearching] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ui = categoryUi[language][activeCategory];
  const CategoryIcon = categoryIcons[activeCategory];
  const searchInputId = `asset-search-${activeCategory}`;
  const externalSearchInputId = `external-asset-search-${activeCategory}`;
  const fileInputId = `asset-import-${activeCategory}`;
  const enabledStockProviders = stockProviderConfigs.filter((provider) => provider.enabled !== false);
  const externalSearchType = externalSearchTypeForCategory(activeCategory);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(Array.from(event.target.files ?? []));
  };

  const closeImportDialog = () => {
    setIsImportOpen(false);
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleConfirmImport = () => {
    onImportFiles(selectedFiles);
    closeImportDialog();
  };

  const runExternalSearch = async (query = externalModalQuery) => {
    if (!onSearchExternalAssets || !query.trim()) {
      setExternalModalResults([]);
      return;
    }

    setIsExternalModalSearching(true);
    setExternalModalError(undefined);
    try {
      const results = await onSearchExternalAssets(query.trim(), externalSearchType);
      setExternalModalResults(results);
    } catch (error) {
      setExternalModalResults([]);
      setExternalModalError(error instanceof Error ? error.message : "External search failed.");
    } finally {
      setIsExternalModalSearching(false);
    }
  };

  const openExternalSearch = () => {
    setIsExternalSearchOpen(true);
    setExternalModalQuery(searchQuery);
    void runExternalSearch(searchQuery);
  };

  const handleExternalSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runExternalSearch();
  };

  const closeExternalSearch = () => {
    setIsExternalSearchOpen(false);
    setExternalModalError(undefined);
  };

  return (
    <section
      className="panel asset-library-board asset-library-polished"
      id="assets"
      aria-labelledby="assets-title"
    >
      <div className="asset-library-heading">
        <h2 id="assets-title">{ui.title}</h2>
      </div>

      <div className="asset-library-toolbar">
        <button
          aria-label={ui.importAria}
          className="asset-import-button asset-import-card"
          onClick={() => setIsImportOpen(true)}
          type="button"
        >
          <span className="asset-import-icon" aria-hidden="true">
            <Plus size={28} strokeWidth={2.2} />
          </span>
          <span>
            <strong>{ui.importAction}</strong>
            <small>{language === "zh" ? "选择本机文件并加入素材库" : "Choose local files"}</small>
          </span>
        </button>

        <div className="asset-search-box asset-search-panel">
          <label className="sr-only" htmlFor={searchInputId}>
            {ui.searchLabel}
          </label>
          <div className="asset-search-input-shell">
            <Search size={20} aria-hidden="true" />
            <input
              id={searchInputId}
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder={ui.searchPlaceholder}
            />
          </div>
          <Button
            disabled={disabled || isSearching}
            icon={isSearching ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
            onClick={onSearchAssets}
          >
            {copy.search}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="external-stock-entry" aria-labelledby="external-stock-entry-title">
        <div>
          <span className="external-source-pill">
            <Globe2 size={14} aria-hidden="true" />
            {language === "zh" ? "第三方素材库" : "Third-party stock"}
          </span>
          <h3 id="external-stock-entry-title">
            {language === "zh" ? "搜索可直接导入的外部素材" : "Search external stock assets"}
          </h3>
          <p>
            {hasProject
              ? language === "zh"
                ? "在悬浮窗中搜索已配置素材库，导入后会进入当前项目素材库。"
                : "Search Demo, Pexels, or Pixabay results and import one into this project."
              : language === "zh"
                ? "无需先切回项目页；导入时会自动创建一个演示项目并把素材加入进去。"
                : "No need to switch pages first; importing creates a demo project and adds the asset."}
          </p>
        </div>
        <Button
          disabled={disabled || isSearching || !onSearchExternalAssets}
          icon={
            isExternalModalSearching ? <Loader2 className="spin" size={18} /> : <Search size={18} />
          }
          onClick={openExternalSearch}
          variant="primary"
        >
          {language === "zh" ? "搜索第三方素材" : "Search stock"}
        </Button>
      </section>

      {searchResults.length > 0 ? (
        <section className="asset-result-section" aria-labelledby="local-results-title">
          <div className="asset-result-heading">
            <h3 id="local-results-title">
              {language === "zh" ? "项目素材结果" : "Project asset results"}
            </h3>
          </div>
          <div className="asset-search-results" aria-live="polite">
            {searchResults.map((result) => (
              <button
                className="asset-search-result"
                disabled={!onRecallAsset}
                key={result.asset.id}
                onClick={() => onRecallAsset?.(result.asset.id)}
                type="button"
              >
                <strong>{result.asset.name}</strong>
                <span>{copy.score(result.score)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="asset-grid" aria-live="polite">
        {assets.length === 0 ? (
          <div
            className={`empty-state asset-empty-state ${
              searchResults.length > 0
                ? "asset-empty-state-compact"
                : ""
            }`.trim()}
          >
            <span className="asset-empty-icon" aria-hidden="true">
              <CategoryIcon size={34} />
            </span>
            <strong>{ui.emptyTitle}</strong>
            <span>{ui.emptyBody}</span>
            <button
              className="asset-empty-action"
              onClick={() => setIsImportOpen(true)}
              type="button"
            >
              {ui.importAction}
            </button>
          </div>
        ) : (
          assets.map((asset) => (
            <article className="asset-card" key={asset.id}>
              <button
                aria-label={asset.name}
                className="asset-card-frame asset-card-preview"
                disabled={!onRecallAsset}
                onClick={() => onRecallAsset?.(asset.id)}
                type="button"
              >
                <span className="asset-preview-glow" aria-hidden="true" />
                <CategoryIcon size={32} aria-hidden="true" />
              </button>
              <div className="asset-card-meta">
                <div>
                  <h3>{asset.name}</h3>
                  <p>{asset.mimeType ?? asset.type}</p>
                </div>
                <span>{formatBytes(asset.sizeBytes)}</span>
              </div>
              <StatusPill tone={asset.status === "ready" ? "success" : "warning"}>
                {asset.status}
              </StatusPill>
            </article>
          ))
        )}
      </div>

      {isExternalSearchOpen ? (
        <div className="asset-import-backdrop external-search-backdrop" role="presentation">
          <section
            aria-labelledby="external-search-title"
            aria-modal="true"
            className="external-search-dialog"
            role="dialog"
          >
            <div className="asset-import-dialog-heading external-search-heading">
              <div>
                <p className="eyebrow">
                  {language === "zh" ? "第三方素材库" : "Third-party stock"}
                </p>
                <h3 id="external-search-title">
                  {language === "zh" ? "搜索第三方素材" : "Search third-party assets"}
                </h3>
              </div>
              <button
                aria-label={language === "zh" ? "关闭第三方素材搜索" : "Close stock search"}
                className="icon-button"
                onClick={closeExternalSearch}
                type="button"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <form className="external-search-form" onSubmit={handleExternalSearchSubmit}>
              <label className="sr-only" htmlFor={externalSearchInputId}>
                {language === "zh" ? "第三方素材搜索关键词" : "External stock search query"}
              </label>
              <div className="asset-search-input-shell">
                <Search size={20} aria-hidden="true" />
                <input
                  id={externalSearchInputId}
                  onChange={(event) => setExternalModalQuery(event.target.value)}
                  placeholder={
                    language === "zh" ? "输入素材关键词" : "Search photos and videos"
                  }
                  value={externalModalQuery}
                />
              </div>
              <Button
                disabled={disabled || isExternalModalSearching || !externalModalQuery.trim()}
                icon={
                  isExternalModalSearching ? (
                    <Loader2 className="spin" size={18} />
                  ) : (
                    <Search size={18} />
                  )
                }
                type="submit"
                variant="primary"
              >
                {language === "zh" ? "搜索" : "Search"}
              </Button>
            </form>

            <div className="external-provider-summary" aria-label="Configured stock providers">
              {(enabledStockProviders.length > 0
                ? enabledStockProviders
                : [{ source: "demo" as const, enabled: true }]
              ).map((provider) => (
                <span className="external-source-pill" key={provider.source}>
                  <Globe2 size={14} aria-hidden="true" />
                  {stockProviderLabel(provider.source)}
                  {provider.source !== "demo" && !provider.apiKey
                    ? language === "zh"
                      ? "（缺少 key）"
                      : " (missing key)"
                    : ""}
                </span>
              ))}
            </div>

            {externalSearchType ? null : (
              <p className="external-search-note">
                {language === "zh"
                  ? "当前第三方素材库主要支持图片和视频；音频、脚本会显示可参考素材。"
                  : "External stock currently supports images and videos; audio and script tabs show reference materials."}
              </p>
            )}

            {externalModalError ? (
              <p className="inline-error" role="alert">
                {externalModalError}
              </p>
            ) : null}

            <div className="external-search-results-shell">
              {isExternalModalSearching ? (
                <div className="external-search-loading" role="status">
                  <Loader2 className="spin" size={22} aria-hidden="true" />
                  <span>{language === "zh" ? "正在搜索素材..." : "Searching stock assets..."}</span>
                </div>
              ) : externalModalResults.length > 0 ? (
                <div className="external-asset-grid external-asset-grid-modal" aria-live="polite">
                  {externalModalResults.map((result) => (
                    <article className="external-asset-card" key={result.id}>
                      <div className="external-asset-preview">
                        {result.type === "image" ? (
                          <img alt="" src={result.thumbnailUrl} />
                        ) : (
                          <span className="external-video-preview" aria-hidden="true">
                            <Video size={30} />
                          </span>
                        )}
                      </div>
                      <div className="external-asset-body">
                        <div>
                          <span className="external-source-pill">
                            <Globe2 size={14} aria-hidden="true" />
                            {sourceLabel(result.source)}
                          </span>
                          <h4>{result.title}</h4>
                          <p>
                            {result.authorName} / {result.licenseLabel}
                          </p>
                        </div>
                        <button
                          className="external-import-action"
                          disabled={!onImportExternalAsset || disabled || isLoading}
                          onClick={() => onImportExternalAsset?.(result)}
                          type="button"
                        >
                          {language === "zh" ? "导入项目" : "Import to project"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="external-empty-result">
                  <Globe2 size={22} aria-hidden="true" />
                  <div>
                    <h3>{language === "zh" ? "没有找到第三方素材" : "No external stock results"}</h3>
                    <p>
                      {language === "zh"
                        ? "可以换一个关键词，或到设置页确认素材库 API key 是否已启用。"
                        : "Try another keyword or confirm that the stock provider API key is enabled in Settings."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {isImportOpen ? (
        <div className="asset-import-backdrop" role="presentation">
          <section
            aria-labelledby="asset-import-title"
            aria-modal="true"
            className="asset-import-dialog"
            role="dialog"
          >
            <div className="asset-import-dialog-heading">
              <div>
                <p className="eyebrow">{copy.title}</p>
                <h3 id="asset-import-title">{ui.dialogTitle}</h3>
              </div>
              <button
                aria-label={language === "zh" ? "关闭导入窗口" : "Close import dialog"}
                className="icon-button"
                onClick={closeImportDialog}
                type="button"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <label className="asset-file-picker" htmlFor={fileInputId}>
              <UploadCloud size={24} aria-hidden="true" />
              <span>{ui.fileLabel}</span>
              <input
                accept={ui.fileAccept}
                id={fileInputId}
                multiple
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
            </label>

            <div className="asset-selected-files" aria-live="polite">
              {selectedFiles.length === 0 ? (
                <span>{language === "zh" ? "未选择文件" : "No files selected"}</span>
              ) : (
                <>
                  <strong>{ui.selectedFiles(selectedFiles.length)}</strong>
                  <ul>
                    {selectedFiles.slice(0, 5).map((file) => (
                      <li key={`${file.name}-${file.size}`}>{file.name}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="dialog-actions">
              <Button onClick={closeImportDialog}>{language === "zh" ? "取消" : "Cancel"}</Button>
              <Button
                disabled={disabled || selectedFiles.length === 0 || isLoading}
                icon={isLoading ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
                onClick={handleConfirmImport}
                variant="primary"
              >
                {ui.confirmImport}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
};
