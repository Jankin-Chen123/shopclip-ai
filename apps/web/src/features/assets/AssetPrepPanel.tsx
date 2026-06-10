import { useEffect, useLayoutEffect, useState } from "react";
import type { AssetMetadata } from "@shopclip/shared";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  FileText,
  FolderOpen,
  Image,
  Loader2,
  Plus,
  Search,
  UploadCloud,
  Video,
  X,
} from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import type { Language } from "../../app/i18n";
import { getAssetContentUrl } from "../../lib/api";
import { assetMatchesCategory, type AssetCategory } from "./AssetCategoryTabs";

interface AssetPrepPanelProps {
  defaultOpenLibraryBucketId?: string;
  embedded?: boolean;
  initialSnapshot?: AssetPrepSnapshot;
  libraryAssets?: AssetMetadata[];
  preparedLibraryAssetsByBucket?: Record<string, AssetMetadata[]>;
  disabled: boolean;
  error?: string;
  isGenerating: boolean;
  isImporting: boolean;
  language: Language;
  onBack: () => void;
  onGenerateStoryboard: () => void;
  onImportFiles: (files: File[]) => void;
  onPreparationChange?: (snapshot: AssetPrepSnapshot) => void;
  onRemovePreparedAsset?: (asset: AssetMetadata) => void;
}

interface PrepBucket {
  id: string;
  accept: string;
  category: AssetCategory;
  icon: typeof Image;
  limit: number;
  title: string;
  helper: string;
  support: string;
}

interface ManualPrepUpload {
  id: string;
  asset?: AssetMetadata;
  mimeType?: string;
  name: string;
  size: number;
  source: "file" | "library";
}

export interface AssetPrepMaterial {
  assetId?: string;
  bucketId: string;
  mimeType?: string;
  name: string;
  sizeBytes?: number;
  source: "file" | "library";
  tags: string[];
  type?: string;
}

export interface AssetPrepSnapshot {
  assetIds: string[];
  keywords: string[];
  materials: AssetPrepMaterial[];
}

const text = {
  en: {
    step: "Step 02",
    title: "Asset prep",
    body: "Upload product and reference materials. AI will analyze usable assets for storyboard generation.",
    uploaded: (count: number, limit: number) => `Uploaded ${count}/${limit}`,
    complete: "Ready",
    import: "Import",
    importFromLibrary: "Import from library",
    libraryDialogTitle: "Import from asset library",
    librarySearch: "Search asset library",
    librarySearchPlaceholder: "Search name, MIME, or tag",
    emptyLibrary: "No matching library assets",
    closeLibrary: "Close asset library",
    previewAsset: (name: string) => `Preview ${name}`,
    selectAsset: (name: string) => `Select ${name}`,
    selectedCount: (count: number) => `${count} selected`,
    importSelected: "Import selected assets",
    previewTitle: "Asset preview",
    closePreview: "Close preview",
    addMore: "Add more",
    back: "Back",
    generate: "Continue to script",
    estimate: "AI analysis usually takes 1-2 minutes. Use clear, complete materials for better results.",
    buckets: {
      hero: {
        title: "Product hero images",
        helper: "Main packshots and angles for product recognition.",
        support: "JPG, PNG, WEBP, single file <= 10MB",
      },
      scene: {
        title: "Scene / detail images",
        helper: "Usage scenes, close-ups, materials, and detail references.",
        support: "JPG, PNG, WEBP, single file <= 10MB",
      },
      demo: {
        title: "Demo videos",
        helper: "Optional product demonstrations for motion and pacing.",
        support: "MP4, MOV, single file <= 500MB, duration <= 2 min",
      },
      brand: {
        title: "Brand materials",
        helper: "Docs, logo, and campaign references for tone and constraints.",
        support: "PDF, DOCX, PPTX, PNG, single file <= 20MB",
      },
    },
  },
  zh: {
    step: "步骤 02",
    title: "素材准备",
    body: "上传产品和参考素材，AI 将分析并识别可用资产，辅助后续脚本与视频生成。",
    uploaded: (count: number, limit: number) => `已上传 ${count}/${limit}`,
    complete: "已完成",
    import: "导入",
    importFromLibrary: "从素材库导入",
    libraryDialogTitle: "从素材库导入",
    librarySearch: "搜索素材库",
    librarySearchPlaceholder: "搜索名称、MIME 或标签",
    emptyLibrary: "暂无匹配的素材库素材",
    closeLibrary: "关闭素材库",
    previewAsset: (name: string) => `预览 ${name}`,
    selectAsset: (name: string) => `选择 ${name}`,
    selectedCount: (count: number) => `已选择 ${count} 个`,
    importSelected: "导入选中素材",
    previewTitle: "素材预览",
    closePreview: "关闭预览",
    addMore: "继续上传",
    back: "返回上一步",
    generate: "继续脚本生成",
    estimate: "AI 分析预计需要 1-2 分钟，请确保已上传清晰、完整的素材以获得更佳效果。",
    buckets: {
      hero: {
        title: "产品主图",
        helper: "用于识别产品外观、角度和核心卖点的主视觉素材。",
        support: "支持：JPG、PNG、WEBP，单文件 <= 10MB",
      },
      scene: {
        title: "场景图 / 细节图",
        helper: "使用场景、特写、材质和细节参考。",
        support: "支持：JPG、PNG、WEBP，单文件 <= 10MB",
      },
      demo: {
        title: "演示视频",
        helper: "可选产品演示视频，用于动作节奏和使用过程参考。",
        support: "支持：MP4、MOV，单文件 <= 500MB，时长 <= 2 分钟",
      },
      brand: {
        title: "品牌资料",
        helper: "品牌文档、Logo 和活动资料，用于控制口吻与约束。",
        support: "支持：PDF、DOCX、PPTX、PNG，单文件 <= 20MB",
      },
    },
  },
} as const;

const getBuckets = (language: Language): PrepBucket[] => {
  const localized = text[language].buckets;
  return [
    { id: "hero", accept: "image/jpeg,image/png,image/webp", category: "image", icon: Image, limit: 4, ...localized.hero },
    { id: "scene", accept: "image/jpeg,image/png,image/webp", category: "image", icon: Image, limit: 8, ...localized.scene },
    { id: "demo", accept: "video/mp4,video/quicktime,.mp4,.mov", category: "video", icon: Video, limit: 2, ...localized.demo },
    { id: "brand", accept: ".pdf,.doc,.docx,.ppt,.pptx,image/png,text/plain,text/markdown", category: "script", icon: FileText, limit: 3, ...localized.brand },
  ];
};

const formatSize = (bytes?: number) => {
  if (!bytes) {
    return "";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const assetFitsPrepCategory = assetMatchesCategory;

const isPrepImageAsset = (asset: AssetMetadata) =>
  asset.type === "image" || asset.mimeType?.startsWith("image/");

const isPrepVideoAsset = (asset: AssetMetadata) =>
  asset.type === "video" || asset.mimeType?.startsWith("video/");

const isPrepAudioAsset = (asset: AssetMetadata) => asset.mimeType?.startsWith("audio/");

const createLibraryPrepUpload = (asset: AssetMetadata): ManualPrepUpload => ({
  id: asset.id,
  asset,
  mimeType: asset.mimeType,
  name: asset.name,
  size: asset.sizeBytes ?? 0,
  source: "library",
});

const uploadsAreEqual = (
  left: Record<string, ManualPrepUpload[]>,
  right: Record<string, ManualPrepUpload[]>,
): boolean => JSON.stringify(left) === JSON.stringify(right);

const matchesPendingUpload = (asset: AssetMetadata, upload: ManualPrepUpload): boolean =>
  !upload.asset &&
  asset.name === upload.name &&
  (upload.size === 0 || asset.sizeBytes === upload.size) &&
  (!upload.mimeType || asset.mimeType === upload.mimeType);

export const hydratePrepUploadsWithLibraryAssets = (
  manualUploads: Record<string, ManualPrepUpload[]>,
  libraryAssets: AssetMetadata[],
): Record<string, ManualPrepUpload[]> => {
  const hydrated = Object.fromEntries(
    Object.entries(manualUploads).map(([bucketId, uploads]) => [
      bucketId,
      uploads.map((upload) => {
        const matchedAsset = libraryAssets.find((asset) => matchesPendingUpload(asset, upload));
        return matchedAsset ? createLibraryPrepUpload(matchedAsset) : upload;
      }),
    ]),
  );

  return uploadsAreEqual(hydrated, manualUploads) ? manualUploads : hydrated;
};

const createInitialManualUploads = (
  preparedLibraryAssetsByBucket: Record<string, AssetMetadata[]>,
  initialSnapshot: AssetPrepSnapshot | undefined,
  libraryAssets: AssetMetadata[],
): Record<string, ManualPrepUpload[]> => {
  if (initialSnapshot?.materials.length) {
    const assetsById = new Map(libraryAssets.map((asset) => [asset.id, asset]));
    return initialSnapshot.materials.reduce<Record<string, ManualPrepUpload[]>>(
      (uploadsByBucket, material) => {
        const asset = material.assetId ? assetsById.get(material.assetId) : undefined;
        const upload: ManualPrepUpload = {
          id: asset?.id ?? material.assetId ?? `${material.bucketId}-${material.name}`,
          asset,
          mimeType: asset?.mimeType ?? material.mimeType,
          name: asset?.name ?? material.name,
          size: asset?.sizeBytes ?? material.sizeBytes ?? 0,
          source: asset ? "library" : material.source,
        };

        return {
          ...uploadsByBucket,
          [material.bucketId]: [...(uploadsByBucket[material.bucketId] ?? []), upload],
        };
      },
      {},
    );
  }

  return Object.fromEntries(
    Object.entries(preparedLibraryAssetsByBucket).map(([bucketId, assets]) => [
      bucketId,
      assets.map(createLibraryPrepUpload),
    ]),
  );
};

export const createAssetPrepSnapshotFromUploads = (
  manualUploads: Record<string, ManualPrepUpload[]>,
  _keywords: string[] = [],
): AssetPrepSnapshot => ({
  assetIds: Object.values(manualUploads)
    .flat()
    .map((upload) => upload.asset?.id)
    .filter((assetId): assetId is string => Boolean(assetId)),
  keywords: [],
  materials: Object.entries(manualUploads).flatMap(([bucketId, uploads]) =>
    uploads.map((upload) => ({
      assetId: upload.asset?.id,
      bucketId,
      mimeType: upload.mimeType,
      name: upload.name,
      sizeBytes: upload.size || undefined,
      source: upload.source,
      tags: upload.asset?.tags ?? [],
      type: upload.asset?.type,
    })),
  ),
});

export const filterPrepLibraryAssets = (
  assets: AssetMetadata[],
  category: AssetCategory,
  query: string,
) => {
  const normalizedQuery = query.trim().toLowerCase();
  return assets.filter((asset) => {
    if (!assetFitsPrepCategory(asset, category)) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return [asset.name, asset.mimeType, asset.type, ...asset.tags]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(normalizedQuery));
  });
};

export const AssetPrepPanel = ({
  defaultOpenLibraryBucketId,
  disabled,
  embedded = false,
  error,
  initialSnapshot,
  isGenerating,
  isImporting,
  language,
  onBack,
  onGenerateStoryboard,
  onImportFiles,
  onPreparationChange,
  onRemovePreparedAsset,
  libraryAssets = [],
  preparedLibraryAssetsByBucket = {},
}: AssetPrepPanelProps) => {
  const [manualUploads, setManualUploads] = useState<Record<string, ManualPrepUpload[]>>(() =>
    createInitialManualUploads(preparedLibraryAssetsByBucket, initialSnapshot, libraryAssets),
  );
  const [activeLibraryBucketId, setActiveLibraryBucketId] = useState<string | undefined>(
    defaultOpenLibraryBucketId,
  );
  const [libraryQuery, setLibraryQuery] = useState("");
  const [selectedLibraryAssetIds, setSelectedLibraryAssetIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [previewAsset, setPreviewAsset] = useState<AssetMetadata>();
  const copy = text[language];
  const buckets = getBuckets(language);
  const inputPrefix = `asset-prep-${language}`;
  const manualUploadCount = Object.values(manualUploads).reduce(
    (total, uploads) => total + uploads.length,
    0,
  );

  const handleBucketFiles = (bucketId: string, files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setManualUploads((current) => ({
      ...current,
      [bucketId]: [
        ...(current[bucketId] ?? []),
        ...files.map((file) => ({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          mimeType: file.type,
          name: file.name,
          size: file.size,
          source: "file" as const,
        })),
      ],
    }));
    onImportFiles(files);
  };

  const addLibraryAssetsToBucket = (bucketId: string, assets: AssetMetadata[]) => {
    if (assets.length === 0) {
      return;
    }
    setManualUploads((current) => {
      const currentBucketUploads = current[bucketId] ?? [];
      const existingIds = new Set(currentBucketUploads.map((upload) => upload.id));
      return {
        ...current,
        [bucketId]: [
          ...currentBucketUploads,
          ...assets
            .filter((asset) => !existingIds.has(asset.id))
            .map(createLibraryPrepUpload),
        ],
      };
    });
    setSelectedLibraryAssetIds(new Set());
    setActiveLibraryBucketId(undefined);
  };

  const openLibraryBucket = (bucketId: string) => {
    setActiveLibraryBucketId(bucketId);
    setLibraryQuery("");
    setSelectedLibraryAssetIds(new Set());
  };

  const toggleLibraryAsset = (assetId: string) => {
    setSelectedLibraryAssetIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const removePreparedUpload = (bucketId: string, upload: ManualPrepUpload) => {
    setManualUploads((current) => ({
      ...current,
      [bucketId]: (current[bucketId] ?? []).filter((candidate) => candidate.id !== upload.id),
    }));
    if (upload.asset) {
      onRemovePreparedAsset?.(upload.asset);
    }
  };

  const activeLibraryBucket = buckets.find((bucket) => bucket.id === activeLibraryBucketId);
  const activeLibraryAssets = activeLibraryBucket
    ? filterPrepLibraryAssets(libraryAssets, activeLibraryBucket.category, libraryQuery)
    : [];
  const selectedLibraryAssets = activeLibraryBucket
    ? libraryAssets.filter(
        (asset) =>
          assetFitsPrepCategory(asset, activeLibraryBucket.category) &&
          selectedLibraryAssetIds.has(asset.id),
      )
    : [];

  const useAssetPrepSnapshotEffect =
    typeof window === "undefined" ? useEffect : useLayoutEffect;

  useEffect(() => {
    setManualUploads((current) => hydratePrepUploadsWithLibraryAssets(current, libraryAssets));
  }, [libraryAssets]);

  useAssetPrepSnapshotEffect(() => {
    onPreparationChange?.(createAssetPrepSnapshotFromUploads(manualUploads));
  }, [manualUploads, onPreparationChange]);

  return (
    <section
      className={`panel asset-prep-panel ${embedded ? "is-embedded" : ""}`.trim()}
      id="asset-prep"
      aria-labelledby="asset-prep-title"
    >
      {embedded ? (
        <h2 className="sr-only" id="asset-prep-title">
          {copy.title}
        </h2>
      ) : (
        <div className="panel-heading asset-prep-heading">
          <div>
            <p className="eyebrow">{copy.step}</p>
            <h2 id="asset-prep-title">{copy.title}</h2>
            <p className="concept-panel-subtitle">{copy.body}</p>
          </div>
          <StatusPill tone={manualUploadCount > 0 ? "success" : "neutral"}>
            {manualUploadCount > 0 ? copy.complete : copy.uploaded(0, 4)}
          </StatusPill>
        </div>
      )}

      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="asset-prep-grid">
        {buckets.map((bucket) => {
          const bucketUploads = (manualUploads[bucket.id] ?? []).slice(0, bucket.limit);
          const Icon = bucket.icon;
          const inputId = `${inputPrefix}-${bucket.id}`;

          return (
            <section className="asset-prep-card" key={bucket.id} aria-labelledby={`${bucket.id}-title`}>
              <div className="asset-prep-card-heading">
                <div>
                  <h3 id={`${bucket.id}-title`}>{bucket.title}</h3>
                  <p>{bucket.helper}</p>
                </div>
                <StatusPill tone={bucketUploads.length > 0 ? "success" : "neutral"}>
                  {copy.uploaded(bucketUploads.length, bucket.limit)}
                </StatusPill>
              </div>
              <div className="asset-prep-strip" aria-live="polite">
                {bucketUploads.length > 0
                  ? bucketUploads.map((upload) => {
                      const asset = upload.asset;
                      return (
                        <article className="asset-prep-thumb" key={`${bucket.id}-${upload.id}`}>
                          {asset && (isPrepImageAsset(asset) || isPrepVideoAsset(asset)) ? (
                            <span className="asset-prep-thumb-media">
                              {isPrepImageAsset(asset) ? (
                                <img alt={upload.name} src={getAssetContentUrl(asset.id)} />
                              ) : (
                                <video
                                  aria-label={upload.name}
                                  muted
                                  preload="metadata"
                                  src={getAssetContentUrl(asset.id)}
                                />
                              )}
                            </span>
                          ) : (
                            <span className="asset-prep-thumb-icon" aria-hidden="true">
                              <Icon size={20} />
                            </span>
                          )}
                        <strong title={upload.name}>{upload.name}</strong>
                        <small>{formatSize(upload.size) || upload.mimeType}</small>
                        {asset ? (
                          <button
                            aria-label={copy.previewAsset(upload.name)}
                            className="asset-prep-thumb-preview"
                            onClick={() => setPreviewAsset(asset)}
                            type="button"
                          >
                            <Eye size={14} aria-hidden="true" />
                          </button>
                        ) : null}
                        <button
                          aria-label={`Remove ${upload.name}`}
                          className="asset-prep-thumb-remove"
                          disabled={disabled || isImporting}
                          onClick={() => removePreparedUpload(bucket.id, upload)}
                          type="button"
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                        <CheckCircle2 size={16} aria-hidden="true" />
                      </article>
                      );
                    })
                  : null}
                <label className="asset-prep-upload" htmlFor={inputId}>
                  <Plus size={20} aria-hidden="true" />
                  <span>{bucketUploads.length > 0 ? copy.addMore : copy.import}</span>
                  <input
                    accept={bucket.accept}
                    disabled={disabled || isImporting}
                    id={inputId}
                    multiple
                    onChange={(event) => {
                      handleBucketFiles(bucket.id, Array.from(event.target.files ?? []));
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                </label>
                <button
                  className="asset-prep-library-button"
                  onClick={() => openLibraryBucket(bucket.id)}
                  type="button"
                >
                  <FolderOpen size={20} aria-hidden="true" />
                  <span>{copy.importFromLibrary}</span>
                </button>
              </div>
              <small className="asset-prep-support">{bucket.support}</small>
            </section>
          );
        })}
      </div>

      {embedded ? null : (
        <div className="asset-prep-footer">
          <Button icon={<ArrowLeft size={18} />} onClick={onBack}>
            {copy.back}
          </Button>
          <p>{copy.estimate}</p>
          <Button
            disabled={disabled || isGenerating}
            icon={
              isGenerating ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />
            }
            onClick={onGenerateStoryboard}
            variant="primary"
          >
            {copy.generate}
            <ArrowRight size={18} aria-hidden="true" />
          </Button>
        </div>
      )}

      {activeLibraryBucket ? (
        <div className="asset-prep-library-backdrop" role="presentation">
          <section
            aria-labelledby="asset-prep-library-title"
            aria-modal="true"
            className="asset-prep-library-dialog"
            role="dialog"
          >
            <div className="asset-prep-library-heading">
              <div>
                <p className="eyebrow">{activeLibraryBucket.title}</p>
                <h3 id="asset-prep-library-title">{copy.libraryDialogTitle}</h3>
              </div>
              <button
                aria-label={copy.closeLibrary}
                className="icon-button"
                onClick={() => {
                  setActiveLibraryBucketId(undefined);
                  setSelectedLibraryAssetIds(new Set());
                }}
                type="button"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <label className="asset-prep-library-search">
              <Search size={18} aria-hidden="true" />
              <span>{copy.librarySearch}</span>
              <input
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder={copy.librarySearchPlaceholder}
              />
            </label>
            <div className="asset-prep-library-list asset-prep-library-grid">
              {activeLibraryAssets.length > 0 ? (
                activeLibraryAssets.map((asset) => {
                  const isSelected = selectedLibraryAssetIds.has(asset.id);
                  const assetContentUrl = getAssetContentUrl(asset.id);

                  return (
                    <article
                      className={`asset-prep-library-option ${
                        isSelected ? "is-selected" : ""
                      }`.trim()}
                      key={asset.id}
                    >
                      <button
                        aria-label={copy.previewAsset(asset.name)}
                        className="asset-prep-library-preview-frame"
                        onClick={() => setPreviewAsset(asset)}
                        type="button"
                      >
                        {isPrepImageAsset(asset) ? (
                          <img
                            alt={asset.name}
                            decoding="async"
                            loading="lazy"
                            src={assetContentUrl}
                          />
                        ) : isPrepVideoAsset(asset) ? (
                          <video
                            aria-label={asset.name}
                            muted
                            preload="metadata"
                            src={assetContentUrl}
                          />
                        ) : isPrepAudioAsset(asset) ? (
                          <span className="asset-prep-audio-preview" aria-hidden="true">
                            <FolderOpen size={28} />
                            <span>
                              <i />
                              <i />
                              <i />
                              <i />
                            </span>
                          </span>
                        ) : (
                          <>
                            <span className="asset-prep-preview-glow" aria-hidden="true" />
                            <FileText size={30} aria-hidden="true" />
                          </>
                        )}
                        <span className="asset-prep-preview-chip">
                          <Eye size={15} aria-hidden="true" />
                          {language === "zh" ? "预览" : "Preview"}
                        </span>
                      </button>
                      <span className="asset-prep-library-meta">
                        <strong title={asset.name}>{asset.name}</strong>
                        <small>{asset.mimeType ?? asset.type}</small>
                        <small>{formatSize(asset.sizeBytes)}</small>
                      </span>
                      <div className="asset-prep-library-actions">
                        <button
                          aria-label={copy.selectAsset(asset.name)}
                          aria-pressed={isSelected}
                          onClick={() => toggleLibraryAsset(asset.id)}
                          type="button"
                        >
                          <CheckCircle2 size={15} aria-hidden="true" />
                          {language === "zh" ? "选择" : "Select"}
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="empty-state compact-empty">
                  <strong>{copy.emptyLibrary}</strong>
                  <span>{activeLibraryBucket.support}</span>
                </div>
              )}
            </div>
            <div className="asset-prep-library-footer">
              <strong>{copy.selectedCount(selectedLibraryAssets.length)}</strong>
              <Button
                disabled={selectedLibraryAssets.length === 0}
                icon={<CheckCircle2 size={18} />}
                onClick={() => addLibraryAssetsToBucket(activeLibraryBucket.id, selectedLibraryAssets)}
                variant="primary"
              >
                {copy.importSelected}
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {previewAsset ? (
        <div className="asset-prep-library-backdrop" role="presentation">
          <section
            aria-labelledby="asset-prep-preview-title"
            aria-modal="true"
            className="asset-prep-preview-dialog"
            role="dialog"
          >
            <div className="asset-prep-library-heading">
              <div>
                <p className="eyebrow">{copy.previewTitle}</p>
                <h3 id="asset-prep-preview-title">{previewAsset.name}</h3>
              </div>
              <button
                aria-label={copy.closePreview}
                className="icon-button"
                onClick={() => setPreviewAsset(undefined)}
                type="button"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="asset-prep-preview-media">
              {previewAsset.type === "image" || previewAsset.mimeType?.startsWith("image/") ? (
                <img alt={previewAsset.name} src={getAssetContentUrl(previewAsset.id)} />
              ) : previewAsset.type === "video" || previewAsset.mimeType?.startsWith("video/") ? (
                <video controls src={getAssetContentUrl(previewAsset.id)} />
              ) : previewAsset.mimeType?.startsWith("audio/") ? (
                <audio controls src={getAssetContentUrl(previewAsset.id)} />
              ) : (
                <div className="asset-prep-document-preview">
                  <FileText size={42} aria-hidden="true" />
                  <strong>{previewAsset.name}</strong>
                  <span>{previewAsset.mimeType ?? previewAsset.type}</span>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
};
