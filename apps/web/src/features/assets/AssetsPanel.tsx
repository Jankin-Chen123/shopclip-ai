import type { ChangeEvent, FormEvent, KeyboardEvent, MouseEvent, UIEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { AssetMetadata } from "@shopclip/shared";
import {
  Check,
  ExternalLink,
  Eye,
  FileText,
  Globe2,
  Image,
  Loader2,
  Music,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  Video,
  X,
} from "lucide-react";

import { Button } from "../../components/ui/Button";
import type { AppCopy, Language } from "../../app/i18n";
import type {
  AssetSearchResult,
  CreateAssetInput,
  ExternalAssetResult,
  ExternalAssetSearchResponse,
  StockProviderConfig,
} from "../../lib/api";
import { getAssetContentUrl } from "../../lib/api";
import type { AssetCategory } from "./AssetCategoryTabs";
import { AssetCategoryTabs, assetCategories, getAssetCategoryLabel } from "./AssetCategoryTabs";

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
  onCategoryChange: (category: AssetCategory) => void;
  onDeleteAssets?: (assetIds: string[]) => void;
  onImportExternalAsset?: (asset: ExternalAssetResult) => Promise<void> | void;
  onImportFiles: (files: File[]) => void;
  onRecallAsset?: (assetId: string) => void;
  onSearchExternalAssets?: (
    query: string,
    type?: AssetCategory,
    page?: number,
    perPage?: number,
  ) => Promise<ExternalAssetSearchResponse>;
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
  source === "pexels" ? "Pexels" : source === "pixabay" ? "Pixabay" : "Freesound";

const stockProviderLabel = (source: StockProviderConfig["source"]) =>
  source === "pexels" ? "Pexels" : source === "pixabay" ? "Pixabay" : "Freesound";

export const hasSearchableStockProviderCredential = (provider: StockProviderConfig): boolean =>
  provider.enabled !== false &&
  (provider.credentialSource === "official" || Boolean(provider.apiKey?.trim()));

const externalSearchPageSize = 12;
const supportedUploadAccept = "image/*,video/*,audio/*,.txt,.md,text/plain";

const videoCoverFallbackUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080' viewBox='0 0 1920 1080'%3E%3Cdefs%3E%3CradialGradient id='g' cx='28%25' cy='22%25' r='58%25'%3E%3Cstop offset='0' stop-color='%2322d3ee' stop-opacity='.25'/%3E%3Cstop offset='1' stop-color='%23070b10'/%3E%3C/radialGradient%3E%3ClinearGradient id='p' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%230b1220'/%3E%3Cstop offset='1' stop-color='%23111111'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1920' height='1080' fill='url(%23p)'/%3E%3Crect x='90' y='70' width='1740' height='940' rx='48' fill='url(%23g)' stroke='%2322d3ee' stroke-opacity='.38' stroke-width='4'/%3E%3Crect x='760' y='360' width='400' height='260' rx='48' fill='%23152538' stroke='%238dd7ff' stroke-opacity='.35' stroke-width='3'/%3E%3Cpath d='M910 430v120l105-60-105-60z' fill='%23dbeafe'/%3E%3Ctext x='960' y='720' text-anchor='middle' fill='%23cffafe' font-family='Arial, sans-serif' font-size='54' font-weight='700'%3ENo video cover%3C/text%3E%3Ctext x='960' y='790' text-anchor='middle' fill='%2394a3b8' font-family='Arial, sans-serif' font-size='34'%3EPreview image unavailable from provider%3C/text%3E%3C/svg%3E";

const getExternalAssetDisplayUrl = (asset: ExternalAssetResult) =>
  asset.downloadUrl ?? asset.previewUrl;

const getExternalAssetCardImageUrl = (asset: ExternalAssetResult) =>
  asset.type === "audio"
    ? ""
    : asset.type === "video"
      ? asset.thumbnailUrl || videoCoverFallbackUrl
      : getExternalAssetDisplayUrl(asset);

const getExternalVideoPosterUrl = (asset: ExternalAssetResult) =>
  asset.thumbnailUrl || videoCoverFallbackUrl;

const externalSearchTypeForCategory = (category: AssetCategory): AssetCategory => category;

const isImageAsset = (asset: AssetMetadata) =>
  asset.type === "image" || asset.mimeType?.startsWith("image/");

const isVideoAsset = (asset: AssetMetadata) =>
  asset.type === "video" || asset.mimeType?.startsWith("video/");

const isAudioAsset = (asset: AssetMetadata) =>
  asset.mimeType?.startsWith("audio/") || asset.tags.some((tag) => tag.toLowerCase() === "audio");

const isScriptAsset = (asset: AssetMetadata) =>
  asset.mimeType?.startsWith("text/") ||
  asset.mimeType === "text/markdown" ||
  asset.tags.some((tag) => ["script", "copy", "text", "脚本"].includes(tag.toLowerCase()));

const assetSourceLabel = (asset: AssetMetadata, language: Language) => {
  if (asset.source === "external_provider") {
    return language === "zh" ? "第三方素材" : "External provider";
  }
  if (asset.source === "generated") {
    return language === "zh" ? "生成素材" : "Generated";
  }
  if (asset.source === "public_reference") {
    return language === "zh" ? "公共参考" : "Public reference";
  }
  return language === "zh" ? "本地导入" : "Local import";
};

const formatAssetDate = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

const genericImportUi = {
  en: {
    action: "Import assets",
    aria: "Import assets",
    dialogTitle: "Import assets",
    fileLabel: "Image, video, audio, or text files",
    confirm: "Import assets",
    helper: "Choose local image, video, audio, or text files",
    emptyAction: "Import assets",
    selectedFiles: (count: number) => `${count} file${count === 1 ? "" : "s"} selected`,
  },
  zh: {
    action: "导入素材",
    aria: "导入素材",
    dialogTitle: "导入素材",
    fileLabel: "图片、视频、音频或文本文件",
    confirm: "导入素材",
    helper: "选择本地图片、视频、音频或文本文件",
    emptyAction: "导入素材",
    selectedFiles: (count: number) => `已选择 ${count} 个文件`,
  },
} as const;

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
  hasSearched,
  language,
  hasProject,
  onImportExternalAsset,
  onImportFiles,
  onRecallAsset,
  onCategoryChange,
  onDeleteAssets,
  onSearchExternalAssets,
  onSearchAssets,
  onSearchQueryChange,
  searchQuery,
  searchResults,
  stockProviderConfigs = [],
}: AssetsPanelProps) => {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExternalSearchOpen, setIsExternalSearchOpen] = useState(false);
  const [externalModalQuery, setExternalModalQuery] = useState("");
  const [externalModalResults, setExternalModalResults] = useState<ExternalAssetResult[]>([]);
  const [externalModalPage, setExternalModalPage] = useState(1);
  const [externalModalHasMore, setExternalModalHasMore] = useState(false);
  const [externalModalError, setExternalModalError] = useState<string>();
  const [externalImportMessage, setExternalImportMessage] = useState<string>();
  const [selectedExternalAssetIds, setSelectedExternalAssetIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(() => new Set());
  const [importedExternalAssetIds, setImportedExternalAssetIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [previewAsset, setPreviewAsset] = useState<AssetMetadata>();
  const [previewExternalAsset, setPreviewExternalAsset] = useState<ExternalAssetResult>();
  const [isExternalModalSearching, setIsExternalModalSearching] = useState(false);
  const [isExternalModalLoadingMore, setIsExternalModalLoadingMore] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ui = categoryUi[language][activeCategory];
  const importUi = genericImportUi[language];
  const CategoryIcon = categoryIcons[activeCategory];
  const searchInputId = `asset-search-${activeCategory}`;
  const externalSearchInputId = `external-asset-search-${activeCategory}`;
  const fileInputId = `asset-import-${activeCategory}`;
  const enabledStockProviders = stockProviderConfigs.filter(
    (provider) => provider.enabled !== false,
  );
  const configuredSearchProviders = enabledStockProviders.filter(
    hasSearchableStockProviderCredential,
  );
  const [externalModalType, setExternalModalType] = useState<AssetCategory>(activeCategory);
  const externalSearchType = externalSearchTypeForCategory(externalModalType);
  const hasConfiguredStockProvider = configuredSearchProviders.length > 0;
  const isShowingSearchResults = hasSearched && searchQuery.trim().length > 0;
  const previewAssets = isShowingSearchResults
    ? searchResults.map((result) => result.asset)
    : assets;
  const searchScoreByAssetId = new Map(
    searchResults.map((result) => [result.asset.id, result.score] as const),
  );
  const selectedExternalAssets = externalModalResults.filter((result) =>
    selectedExternalAssetIds.has(result.id),
  );
  const selectedExternalAssetCount = selectedExternalAssets.length;
  const selectedAssetCount = previewAssets.filter((asset) => selectedAssetIds.has(asset.id)).length;
  const closeAssetPreview = () => setPreviewAsset(undefined);
  const detailLabel = language === "zh" ? "查看详情" : "View details";
  const previewAssetReady = previewAsset?.status === "ready";
  const previewAssetUrl =
    previewAsset && previewAssetReady ? getAssetContentUrl(previewAsset.id) : "";

  useEffect(() => {
    const currentAssetIds = new Set(assets.map((asset) => asset.id));
    setSelectedAssetIds((current) => {
      const next = new Set([...current].filter((assetId) => currentAssetIds.has(assetId)));
      return next.size === current.size ? current : next;
    });
  }, [assets]);

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

  const runExternalSearch = async (
    query = externalModalQuery,
    page = 1,
    mode: "replace" | "append" = "replace",
    type = externalModalType,
  ) => {
    if (mode === "replace") {
      setSelectedExternalAssetIds(new Set());
      setExternalImportMessage(undefined);
      setExternalModalHasMore(false);
      setExternalModalPage(1);
    }
    if (!onSearchExternalAssets || !query.trim() || !hasConfiguredStockProvider) {
      setExternalModalResults([]);
      setExternalModalHasMore(false);
      return;
    }

    if (mode === "append") {
      setIsExternalModalLoadingMore(true);
    } else {
      setIsExternalModalSearching(true);
    }
    setExternalModalError(undefined);
    try {
      const response = await onSearchExternalAssets(
        query.trim(),
        externalSearchTypeForCategory(type),
        page,
        externalSearchPageSize,
      );
      setExternalModalPage(response.page);
      setExternalModalHasMore(response.hasMore);
      setExternalModalResults((current) => {
        if (mode === "replace") {
          return response.externalResults;
        }

        const existingIds = new Set(current.map((result) => result.id));
        return [
          ...current,
          ...response.externalResults.filter((result) => !existingIds.has(result.id)),
        ];
      });
    } catch (error) {
      if (mode === "replace") {
        setExternalModalResults([]);
        setExternalModalHasMore(false);
      }
      setExternalModalError(error instanceof Error ? error.message : "External search failed.");
    } finally {
      setIsExternalModalSearching(false);
      setIsExternalModalLoadingMore(false);
    }
  };

  const openExternalSearch = () => {
    const initialType = activeCategory;
    setIsExternalSearchOpen(true);
    setExternalModalQuery("");
    setExternalModalType(initialType);
    setSelectedExternalAssetIds(new Set());
    setExternalImportMessage(undefined);
    setExternalModalResults([]);
    setExternalModalError(undefined);
    setExternalModalHasMore(false);
  };

  const handleExternalSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runExternalSearch();
  };

  const handleCategoryClick = (category: AssetCategory) => {
    onCategoryChange(category);
    if (hasSearched && searchQuery.trim()) {
      onSearchAssets();
    }
  };

  const handleExternalTypeClick = (category: AssetCategory) => {
    setExternalModalType(category);
    if (externalModalQuery.trim() && hasConfiguredStockProvider) {
      void runExternalSearch(externalModalQuery, 1, "replace", category);
    }
  };

  const closeExternalSearch = () => {
    setIsExternalSearchOpen(false);
    setExternalModalError(undefined);
    setExternalImportMessage(undefined);
    setSelectedExternalAssetIds(new Set());
    setPreviewExternalAsset(undefined);
  };

  const loadMoreExternalResults = () => {
    if (
      isExternalModalSearching ||
      isExternalModalLoadingMore ||
      !externalModalHasMore ||
      !hasConfiguredStockProvider
    ) {
      return;
    }

    void runExternalSearch(externalModalQuery, externalModalPage + 1, "append");
  };

  const handleExternalResultsScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceFromBottom < 180) {
      loadMoreExternalResults();
    }
  };

  const toggleExternalAssetSelection = (assetId: string) => {
    setExternalImportMessage(undefined);
    setSelectedExternalAssetIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const handleDeleteAsset = (assetId: string) => {
    onDeleteAssets?.([assetId]);
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      next.delete(assetId);
      return next;
    });
    if (previewAsset?.id === assetId) {
      closeAssetPreview();
    }
  };

  const handleDeleteSelectedAssets = () => {
    const assetIds = assets
      .filter((asset) => selectedAssetIds.has(asset.id))
      .map((asset) => asset.id);
    onDeleteAssets?.(assetIds);
    setSelectedAssetIds(new Set());
    if (previewAsset && assetIds.includes(previewAsset.id)) {
      closeAssetPreview();
    }
  };

  const isInteractivePreviewTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && Boolean(target.closest("button, a"));

  const handleExternalAssetCardClick = (event: MouseEvent<HTMLElement>, assetId: string) => {
    if (isInteractivePreviewTarget(event.target)) {
      return;
    }
    toggleExternalAssetSelection(assetId);
  };

  const handleExternalAssetKeyDown = (event: KeyboardEvent<HTMLElement>, assetId: string) => {
    if (isInteractivePreviewTarget(event.target)) {
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    toggleExternalAssetSelection(assetId);
  };

  const handleBulkExternalImport = async () => {
    if (selectedExternalAssetCount === 0 || !onImportExternalAsset) {
      return;
    }

    setExternalImportMessage(language === "zh" ? "正在导入到腾讯 COS..." : "Importing to Tencent COS...");
    try {
      for (const asset of selectedExternalAssets) {
        await onImportExternalAsset(asset);
      }
    } catch (error) {
      setExternalImportMessage(
        error instanceof Error
          ? error.message
          : language === "zh"
            ? "导入失败，请稍后重试。"
            : "Import failed. Try again.",
      );
      return;
    }

    setImportedExternalAssetIds((current) => {
      const next = new Set(current);
      selectedExternalAssets.forEach((asset) => next.add(asset.id));
      return next;
    });
    setExternalImportMessage(
      language === "zh"
        ? `已将 ${selectedExternalAssetCount} 个素材导入腾讯 COS，并写入正式素材库。`
        : `${selectedExternalAssetCount} asset${
            selectedExternalAssetCount === 1 ? "" : "s"
          } imported to Tencent COS and saved in the asset library.`,
    );
    setSelectedExternalAssetIds(new Set());
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
          aria-label={importUi.aria}
          className="asset-import-button asset-import-card"
          onClick={() => setIsImportOpen(true)}
          type="button"
        >
          <span className="asset-import-icon" aria-hidden="true">
            <Plus size={28} strokeWidth={2.2} />
          </span>
          <span>
            <strong>{importUi.action}</strong>
            <small>{importUi.helper}</small>
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

      <AssetCategoryTabs
        activeCategory={activeCategory}
        language={language}
        onCategoryChange={handleCategoryClick}
      />

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
                ? "在悬浮窗中搜索已配置素材库，勾选后可一键导入腾讯 COS。"
                : "Search configured stock libraries, select results, and import them to Tencent COS."
              : language === "zh"
                ? "无需先切回项目页；勾选素材会直接导入腾讯 COS 并写入素材库。"
                : "No need to switch pages first; selected assets import directly to Tencent COS."}
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

      {previewAssets.length > 0 ? (
        <div className="asset-bulk-actions">
          <strong>
            {language === "zh"
              ? `已选择 ${selectedAssetCount} 个素材`
              : `${selectedAssetCount} selected`}
          </strong>
          <Button
            disabled={disabled || !onDeleteAssets || selectedAssetCount === 0}
            icon={<Trash2 size={18} />}
            onClick={handleDeleteSelectedAssets}
            variant="secondary"
          >
            {language === "zh" ? "删除选中" : "Delete selected"}
          </Button>
        </div>
      ) : null}

      <div className="asset-grid" aria-live="polite">
        {previewAssets.length === 0 ? (
          <div className="empty-state asset-empty-state">
            <span className="asset-empty-icon" aria-hidden="true">
              <CategoryIcon size={34} />
            </span>
            <strong>
              {isShowingSearchResults
                ? language === "zh"
                  ? `没有匹配 ${searchQuery.trim()} 的${getAssetCategoryLabel(activeCategory, language)}素材`
                  : `No ${getAssetCategoryLabel(activeCategory, language).toLowerCase()} matched ${searchQuery.trim()}`
                : ui.emptyTitle}
            </strong>
            <span>
              {isShowingSearchResults
                ? language === "zh"
                  ? "可以换一个关键词，或先导入更多图片素材。"
                  : "Try another keyword, or import more image assets first."
                : ui.emptyBody}
            </span>
            <button
              className="asset-empty-action"
              onClick={() => setIsImportOpen(true)}
              type="button"
            >
              {importUi.emptyAction}
            </button>
          </div>
        ) : (
          previewAssets.map((asset) => {
            const AssetIcon = isAudioAsset(asset)
              ? Music
              : isScriptAsset(asset)
                ? FileText
                : CategoryIcon;
            const isReady = asset.status === "ready";
            const isSelected = selectedAssetIds.has(asset.id);
            const searchScore = searchScoreByAssetId.get(asset.id);

            return (
              <article className={`asset-card ${isSelected ? "is-selected" : ""}`} key={asset.id}>
                <div className="asset-card-actions">
                  <button
                    aria-label={
                      language === "zh"
                        ? `${isSelected ? "取消选择" : "选择"} ${asset.name}`
                        : `${isSelected ? "Deselect" : "Select"} ${asset.name}`
                    }
                    aria-pressed={isSelected}
                    className="asset-selection-control"
                    onClick={() => toggleAssetSelection(asset.id)}
                    type="button"
                  >
                    {isSelected ? <Check size={15} aria-hidden="true" /> : null}
                  </button>
                  <button
                    aria-label={language === "zh" ? `删除 ${asset.name}` : `Delete ${asset.name}`}
                    className="asset-card-delete"
                    disabled={disabled || !onDeleteAssets}
                    onClick={() => handleDeleteAsset(asset.id)}
                    type="button"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
                <button
                  aria-label={
                    language === "zh" ? `打开 ${asset.name} 详情` : `Open details for ${asset.name}`
                  }
                  className="asset-card-frame asset-card-preview"
                  onClick={() => setPreviewAsset(asset)}
                  type="button"
                >
                  {!isReady ? (
                    <span
                      aria-label={
                        language === "zh" ? `${asset.name} 正在上传` : `${asset.name} is uploading`
                      }
                      className="asset-uploading-placeholder"
                      role="status"
                    >
                      <span className="asset-uploading-spinner" aria-hidden="true" />
                    </span>
                  ) : isImageAsset(asset) ? (
                    <img
                      alt={asset.name}
                      decoding="async"
                      loading="lazy"
                      src={getAssetContentUrl(asset.id)}
                    />
                  ) : isVideoAsset(asset) ? (
                    <video
                      aria-label={asset.name}
                      muted
                      preload="metadata"
                      src={getAssetContentUrl(asset.id)}
                    />
                  ) : isAudioAsset(asset) ? (
                    <span className="asset-audio-preview" aria-hidden="true">
                      <Music size={28} />
                      <span className="external-audio-waveform">
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                    </span>
                  ) : (
                    <>
                      <span className="asset-preview-glow" aria-hidden="true" />
                      <AssetIcon size={32} aria-hidden="true" />
                    </>
                  )}
                  <span className="asset-card-detail-chip">
                    <Eye size={15} aria-hidden="true" />
                    {detailLabel}
                  </span>
                </button>
                <div className="asset-card-meta">
                  <div>
                    <h3 title={asset.name}>{asset.name}</h3>
                    <p>{asset.mimeType ?? asset.type}</p>
                  </div>
                  <span>
                    {isShowingSearchResults && searchScore !== undefined
                      ? copy.score(searchScore)
                      : formatBytes(asset.sizeBytes)}
                  </span>
                </div>
              </article>
            );
          })
        )}
      </div>

      {previewAsset ? (
        <div className="external-preview-backdrop" role="presentation">
          <section
            aria-labelledby="asset-preview-title"
            aria-modal="true"
            className="external-preview-dialog asset-preview-dialog"
            role="dialog"
          >
            <div className="asset-import-dialog-heading external-preview-heading">
              <div>
                <p className="eyebrow">{language === "zh" ? "素材详情" : "Asset details"}</p>
                <h3 id="asset-preview-title">{previewAsset.name}</h3>
              </div>
              <button
                aria-label={language === "zh" ? "关闭素材详情" : "Close asset details"}
                className="icon-button"
                onClick={closeAssetPreview}
                type="button"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="external-preview-content">
              <div className="external-preview-media asset-preview-media">
                {!previewAssetReady ? (
                  <div className="asset-document-preview" role="status">
                    <span className="asset-uploading-spinner" aria-hidden="true" />
                    <strong>
                      {language === "zh"
                        ? "正在上传，稍后可预览"
                        : "Uploading, preview will be available soon"}
                    </strong>
                    <span>{previewAsset.name}</span>
                  </div>
                ) : isImageAsset(previewAsset) ? (
                  <img alt={previewAsset.name} decoding="async" src={previewAssetUrl} />
                ) : isVideoAsset(previewAsset) ? (
                  <video controls preload="metadata" src={previewAssetUrl} />
                ) : isAudioAsset(previewAsset) ? (
                  <div className="external-preview-audio">
                    <div
                      className="external-audio-preview external-audio-preview-large"
                      aria-hidden="true"
                    >
                      <Music size={42} />
                      <span className="external-audio-waveform">
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                    <audio controls src={previewAssetUrl} />
                  </div>
                ) : (
                  <div className="asset-document-preview">
                    <FileText size={42} aria-hidden="true" />
                    <strong>{previewAsset.name}</strong>
                    <span>{previewAsset.mimeType ?? previewAsset.type}</span>
                  </div>
                )}
              </div>

              <aside className="external-preview-details">
                <span className="external-source-pill">
                  <Globe2 size={14} aria-hidden="true" />
                  {assetSourceLabel(previewAsset, language)}
                </span>
                <dl>
                  <div>
                    <dt>{language === "zh" ? "名称" : "Name"}</dt>
                    <dd>{previewAsset.name}</dd>
                  </div>
                  <div>
                    <dt>{language === "zh" ? "类型" : "Type"}</dt>
                    <dd>{previewAsset.mimeType ?? previewAsset.type}</dd>
                  </div>
                  <div>
                    <dt>{language === "zh" ? "大小" : "Size"}</dt>
                    <dd>{formatBytes(previewAsset.sizeBytes)}</dd>
                  </div>
                  <div>
                    <dt>{language === "zh" ? "状态" : "Status"}</dt>
                    <dd>{previewAsset.status}</dd>
                  </div>
                  {previewAsset.storageProvider ? (
                    <div>
                      <dt>{language === "zh" ? "存储" : "Storage"}</dt>
                      <dd>{previewAsset.storageProvider}</dd>
                    </div>
                  ) : null}
                  {previewAsset.tags.length > 0 ? (
                    <div>
                      <dt>{language === "zh" ? "标签" : "Tags"}</dt>
                      <dd>{previewAsset.tags.join(", ")}</dd>
                    </div>
                  ) : null}
                  {previewAsset.embeddingText ? (
                    <div>
                      <dt>{language === "zh" ? "检索描述" : "Retrieval text"}</dt>
                      <dd>{previewAsset.embeddingText}</dd>
                    </div>
                  ) : null}
                  {formatAssetDate(previewAsset.createdAt) ? (
                    <div>
                      <dt>{language === "zh" ? "创建时间" : "Created"}</dt>
                      <dd>{formatAssetDate(previewAsset.createdAt)}</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="external-preview-actions">
                  {onRecallAsset ? (
                    <Button
                      icon={<Check size={18} />}
                      onClick={() => {
                        onRecallAsset(previewAsset.id);
                        closeAssetPreview();
                      }}
                      variant="primary"
                    >
                      {language === "zh" ? "用于当前分镜" : "Use in selected scene"}
                    </Button>
                  ) : null}
                  {previewAssetReady ? (
                    <a
                      className="external-open-link"
                      href={previewAssetUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink size={16} aria-hidden="true" />
                      {language === "zh" ? "打开文件" : "Open file"}
                    </a>
                  ) : null}
                </div>
              </aside>
            </div>
          </section>
        </div>
      ) : null}

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
                  onChange={(event) => {
                    setExternalModalQuery(event.target.value);
                    setExternalImportMessage(undefined);
                  }}
                  placeholder={language === "zh" ? "输入素材关键词" : "Search photos and videos"}
                  value={externalModalQuery}
                />
              </div>
              <Button
                disabled={
                  disabled ||
                  isExternalModalSearching ||
                  !externalModalQuery.trim() ||
                  !hasConfiguredStockProvider
                }
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

            <div
              className="asset-browser-tabs external-type-tabs"
              aria-label={language === "zh" ? "第三方素材类型" : "External stock asset types"}
            >
              {assetCategories.map((category) => (
                <button
                  aria-pressed={externalModalType === category}
                  className={externalModalType === category ? "active" : undefined}
                  key={category}
                  onClick={() => handleExternalTypeClick(category)}
                  type="button"
                >
                  <span>{getAssetCategoryLabel(category, language)}</span>
                </button>
              ))}
            </div>

            <div className="external-provider-summary" aria-label="Configured stock providers">
              {enabledStockProviders.map((provider) => (
                <span className="external-source-pill" key={provider.source}>
                  <Globe2 size={14} aria-hidden="true" />
                  {stockProviderLabel(provider.source)}
                  {!hasSearchableStockProviderCredential(provider)
                    ? language === "zh"
                      ? "（缺少 key）"
                      : " (missing key)"
                    : ""}
                </span>
              ))}
            </div>

            {!hasConfiguredStockProvider ? (
              <div className="external-empty-result external-provider-warning" role="status">
                <Globe2 size={22} aria-hidden="true" />
                <div>
                  <h3>
                    {language === "zh"
                      ? "请先添加第三方素材库"
                      : "Add a third-party stock library first"}
                  </h3>
                  <p>
                    {language === "zh"
                      ? "前往设置页选择 Pexels 或 Pixabay，并填写 API key 后再搜索。"
                      : "Go to Settings, choose Pexels or Pixabay, and add an API key before searching."}
                  </p>
                </div>
              </div>
            ) : null}

            {externalSearchType === "script" ? (
              <p className="external-search-note">
                {language === "zh"
                  ? "当前第三方素材库主要支持图片、视频和音频；剧本类型会使用相同关键词尝试匹配可参考素材。"
                  : "External stock primarily supports image, video, and audio; script uses the same query for reference matches."}
              </p>
            ) : null}

            {externalModalError ? (
              <p className="inline-error" role="alert">
                {externalModalError}
              </p>
            ) : null}

            <div className="external-search-results-shell" onScroll={handleExternalResultsScroll}>
              {isExternalModalSearching ? (
                <div className="external-search-loading" role="status">
                  <Loader2 className="spin" size={22} aria-hidden="true" />
                  <span>{language === "zh" ? "正在搜索素材..." : "Searching stock assets..."}</span>
                </div>
              ) : !hasConfiguredStockProvider ? null : externalModalResults.length > 0 ? (
                <>
                  <div className="external-asset-grid external-asset-grid-modal" aria-live="polite">
                    {externalModalResults.map((result) => {
                      const isSelected = selectedExternalAssetIds.has(result.id);
                      const isImported = importedExternalAssetIds.has(result.id);

                      return (
                        <article
                          aria-label={
                            language === "zh"
                              ? `${isSelected ? "取消选择" : "选择"} ${result.title}`
                              : `${isSelected ? "Deselect" : "Select"} ${result.title}`
                          }
                          aria-pressed={isSelected}
                          className={`external-asset-card ${
                            isSelected ? "is-selected" : ""
                          } ${isImported ? "is-imported" : ""}`.trim()}
                          key={result.id}
                          onClick={(event) => handleExternalAssetCardClick(event, result.id)}
                          onKeyDown={(event) => handleExternalAssetKeyDown(event, result.id)}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="external-asset-preview">
                            {result.type === "audio" ? (
                              <div className="external-audio-preview" aria-hidden="true">
                                <Music size={30} />
                                <span className="external-audio-waveform">
                                  <i />
                                  <i />
                                  <i />
                                  <i />
                                  <i />
                                  <i />
                                  <i />
                                </span>
                              </div>
                            ) : getExternalAssetCardImageUrl(result) ? (
                              <img
                                alt=""
                                decoding="async"
                                loading="lazy"
                                onError={(event) => {
                                  if (result.type === "video") {
                                    event.currentTarget.src = videoCoverFallbackUrl;
                                  }
                                }}
                                src={getExternalAssetCardImageUrl(result)}
                              />
                            ) : (
                              <span className="external-video-preview" aria-hidden="true">
                                <Video size={30} />
                              </span>
                            )}
                            <span className="external-selection-mark" aria-hidden="true">
                              {isSelected || isImported ? <Check size={16} /> : null}
                            </span>
                            <button
                              aria-label={
                                language === "zh"
                                  ? `预览 ${result.title}`
                                  : `Preview ${result.title}`
                              }
                              className="external-preview-action"
                              onClick={(event) => {
                                event.stopPropagation();
                                setPreviewExternalAsset(result);
                              }}
                              onKeyDown={(event) => event.stopPropagation()}
                              type="button"
                            >
                              <Eye size={16} aria-hidden="true" />
                              <span>{language === "zh" ? "预览" : "Preview"}</span>
                            </button>
                          </div>
                          <div className="external-asset-body">
                            <div>
                              <span className="external-source-pill">
                                <Globe2 size={14} aria-hidden="true" />
                                {sourceLabel(result.source)}
                              </span>
                              <h4 title={result.title}>{result.title}</h4>
                              {isImported ? (
                                <span className="external-imported-label">
                                  {language === "zh" ? "已存库" : "Imported"}
                                </span>
                              ) : null}
                              <p>
                                {result.authorName} / {result.licenseLabel}
                              </p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <div className="external-load-more-state" role="status">
                    {isExternalModalLoadingMore ? (
                      <>
                        <Loader2 className="spin" size={18} aria-hidden="true" />
                        <span>{language === "zh" ? "正在继续加载..." : "Loading more..."}</span>
                      </>
                    ) : externalModalHasMore ? (
                      <span>{language === "zh" ? "向下滚动继续加载" : "Scroll for more"}</span>
                    ) : (
                      <span>{language === "zh" ? "已加载全部结果" : "All results loaded"}</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="external-empty-result">
                  <Globe2 size={22} aria-hidden="true" />
                  <div>
                    <h3>
                      {language === "zh" ? "没有找到第三方素材" : "No external stock results"}
                    </h3>
                    <p>
                      {language === "zh"
                        ? "可以换一个关键词，或到设置页确认素材库 API key 是否已启用。"
                        : "Try another keyword or confirm that the stock provider API key is enabled in Settings."}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {hasConfiguredStockProvider && externalModalResults.length > 0 ? (
              <div className="external-bulk-actions">
                <div>
                  <strong>
                    {language === "zh"
                      ? `已选择 ${selectedExternalAssetCount} 个素材`
                      : `${selectedExternalAssetCount} selected`}
                  </strong>
                  {externalImportMessage ? <p role="status">{externalImportMessage}</p> : null}
                </div>
                <Button
                  disabled={disabled || selectedExternalAssetCount === 0 || isLoading}
                  icon={<Check size={18} />}
                  onClick={handleBulkExternalImport}
                  variant="primary"
                >
                  {language === "zh" ? "一键导入" : "Import selected"}
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {previewExternalAsset ? (
        <div className="external-preview-backdrop" role="presentation">
          <section
            aria-labelledby="external-preview-title"
            aria-modal="true"
            className="external-preview-dialog"
            role="dialog"
          >
            <div className="asset-import-dialog-heading external-preview-heading">
              <div>
                <p className="eyebrow">{language === "zh" ? "素材预览" : "Asset preview"}</p>
                <h3 id="external-preview-title">{previewExternalAsset.title}</h3>
              </div>
              <button
                aria-label={language === "zh" ? "关闭素材预览" : "Close asset preview"}
                className="icon-button"
                onClick={() => setPreviewExternalAsset(undefined)}
                type="button"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="external-preview-content">
              <div className="external-preview-media">
                {previewExternalAsset.type === "image" ? (
                  <img
                    alt={previewExternalAsset.title}
                    decoding="async"
                    src={getExternalAssetDisplayUrl(previewExternalAsset)}
                  />
                ) : previewExternalAsset.type === "audio" ? (
                  <div className="external-preview-audio">
                    <div
                      className="external-audio-preview external-audio-preview-large"
                      aria-hidden="true"
                    >
                      <Music size={42} />
                      <span className="external-audio-waveform">
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                    <audio controls src={getExternalAssetDisplayUrl(previewExternalAsset)} />
                  </div>
                ) : (
                  <video controls poster={getExternalVideoPosterUrl(previewExternalAsset)}>
                    <source
                      src={getExternalAssetDisplayUrl(previewExternalAsset)}
                      type="video/mp4"
                    />
                  </video>
                )}
              </div>

              <aside className="external-preview-details">
                <span className="external-source-pill">
                  <Globe2 size={14} aria-hidden="true" />
                  {sourceLabel(previewExternalAsset.source)}
                </span>
                <dl>
                  <div>
                    <dt>{language === "zh" ? "标题" : "Title"}</dt>
                    <dd>{previewExternalAsset.title}</dd>
                  </div>
                  <div>
                    <dt>{language === "zh" ? "作者" : "Author"}</dt>
                    <dd>{previewExternalAsset.authorName}</dd>
                  </div>
                  <div>
                    <dt>{language === "zh" ? "授权" : "License"}</dt>
                    <dd>{previewExternalAsset.licenseLabel}</dd>
                  </div>
                  {previewExternalAsset.width && previewExternalAsset.height ? (
                    <div>
                      <dt>{language === "zh" ? "尺寸" : "Dimensions"}</dt>
                      <dd>
                        {previewExternalAsset.width} x {previewExternalAsset.height}
                      </dd>
                    </div>
                  ) : null}
                  {previewExternalAsset.durationSeconds ? (
                    <div>
                      <dt>{language === "zh" ? "时长" : "Duration"}</dt>
                      <dd>{previewExternalAsset.durationSeconds.toFixed(1)}s</dd>
                    </div>
                  ) : null}
                  {previewExternalAsset.tags.length > 0 ? (
                    <div>
                      <dt>{language === "zh" ? "标签" : "Tags"}</dt>
                      <dd>{previewExternalAsset.tags.join(", ")}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>{language === "zh" ? "用途" : "Usage"}</dt>
                    <dd>
                      {previewExternalAsset.canUseCommercially
                        ? language === "zh"
                          ? "可商用"
                          : "Commercial use allowed"
                        : language === "zh"
                          ? "需确认授权"
                          : "Check license before use"}
                      {previewExternalAsset.requiresAttribution
                        ? language === "zh"
                          ? "，需要署名"
                          : ", attribution required"
                        : ""}
                    </dd>
                  </div>
                </dl>

                <div className="external-preview-actions">
                  <Button
                    icon={<Check size={18} />}
                    onClick={() => toggleExternalAssetSelection(previewExternalAsset.id)}
                    variant={
                      selectedExternalAssetIds.has(previewExternalAsset.id)
                        ? "secondary"
                        : "primary"
                    }
                  >
                    {selectedExternalAssetIds.has(previewExternalAsset.id)
                      ? language === "zh"
                        ? "取消勾选"
                        : "Deselect"
                      : language === "zh"
                        ? "勾选素材"
                        : "Select asset"}
                  </Button>
                  <a
                    className="external-open-link"
                    href={previewExternalAsset.externalUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink size={16} aria-hidden="true" />
                    {language === "zh" ? "打开来源" : "Open source"}
                  </a>
                </div>
              </aside>
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
                <h3 id="asset-import-title">{importUi.dialogTitle}</h3>
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
              <span>{importUi.fileLabel}</span>
              <input
                accept={supportedUploadAccept}
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
                  <strong>{importUi.selectedFiles(selectedFiles.length)}</strong>
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
                icon={
                  isLoading ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />
                }
                onClick={handleConfirmImport}
                variant="primary"
              >
                {importUi.confirm}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
};
