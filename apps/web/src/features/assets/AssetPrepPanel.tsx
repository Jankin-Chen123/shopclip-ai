import { useState } from "react";
import type { AssetMetadata } from "@shopclip/shared";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  FolderOpen,
  Image,
  Loader2,
  Plus,
  Tag,
  UploadCloud,
  Video,
  X,
} from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import type { Language } from "../../app/i18n";
import type { AssetCategory } from "./AssetCategoryTabs";

interface AssetPrepPanelProps {
  libraryAssets?: AssetMetadata[];
  disabled: boolean;
  error?: string;
  isGenerating: boolean;
  isImporting: boolean;
  language: Language;
  onBack: () => void;
  onGenerateStoryboard: () => void;
  onImportFiles: (files: File[]) => void;
}

interface PrepBucket {
  id: string;
  category: AssetCategory;
  icon: typeof Image;
  limit: number;
  title: string;
  helper: string;
  support: string;
}

interface ManualPrepUpload {
  id: string;
  name: string;
  size: number;
  source: "file" | "library";
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
    emptyLibrary: "No matching library assets",
    closeLibrary: "Close asset library",
    addMore: "Add more",
    keywords: "Product keywords",
    addKeyword: "Add keyword",
    keywordInput: "Keyword",
    keywordPlaceholder: "Enter keyword",
    editKeyword: (keyword: string) => `Edit keyword: ${keyword}`,
    removeKeyword: (keyword: string) => `Remove keyword: ${keyword}`,
    keywordList: ["portable", "foldable", "desktop stable", "anti-slip base", "aluminum", "TikTok vertical"],
    back: "Back",
    generate: "Generate storyboard",
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
    emptyLibrary: "暂无匹配的素材库素材",
    closeLibrary: "关闭素材库",
    addMore: "继续上传",
    keywords: "产品关键词（可选）",
    addKeyword: "添加关键词",
    keywordInput: "关键词内容",
    keywordPlaceholder: "输入关键词",
    editKeyword: (keyword: string) => `编辑关键词：${keyword}`,
    removeKeyword: (keyword: string) => `删除关键词：${keyword}`,
    keywordList: ["便携", "可折叠", "桌面稳定", "防滑底座", "铝合金材质", "TikTok 竖屏"],
    back: "返回上一步",
    generate: "生成分镜",
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
    { id: "hero", category: "image", icon: Image, limit: 4, ...localized.hero },
    { id: "scene", category: "image", icon: Image, limit: 8, ...localized.scene },
    { id: "demo", category: "video", icon: Video, limit: 2, ...localized.demo },
    { id: "brand", category: "script", icon: FileText, limit: 3, ...localized.brand },
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

const assetFitsPrepBucket = (asset: AssetMetadata, bucket: PrepBucket) => {
  if (bucket.category === "image") {
    return asset.type === "image" || asset.mimeType?.startsWith("image/");
  }
  if (bucket.category === "video") {
    return asset.type === "video" || asset.mimeType?.startsWith("video/");
  }
  if (bucket.category === "audio") {
    return asset.mimeType?.startsWith("audio/");
  }
  return (
    asset.type === "reference" ||
    asset.mimeType?.startsWith("text/") ||
    asset.mimeType === "application/pdf" ||
    asset.mimeType?.includes("document") ||
    asset.mimeType?.includes("presentation")
  );
};

export const AssetPrepPanel = ({
  disabled,
  error,
  isGenerating,
  isImporting,
  language,
  onBack,
  onGenerateStoryboard,
  onImportFiles,
  libraryAssets = [],
}: AssetPrepPanelProps) => {
  const [manualUploads, setManualUploads] = useState<Record<string, ManualPrepUpload[]>>({});
  const [activeLibraryBucketId, setActiveLibraryBucketId] = useState<string>();
  const [keywords, setKeywords] = useState<string[]>(() => [...text[language].keywordList]);
  const [newKeyword, setNewKeyword] = useState("");
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
          name: file.name,
          size: file.size,
          source: "file" as const,
        })),
      ],
    }));
    onImportFiles(files);
  };

  const addLibraryAssetToBucket = (bucketId: string, asset: AssetMetadata) => {
    setManualUploads((current) => {
      const currentBucketUploads = current[bucketId] ?? [];
      if (currentBucketUploads.some((upload) => upload.id === asset.id)) {
        return current;
      }
      return {
        ...current,
        [bucketId]: [
          ...currentBucketUploads,
          {
            id: asset.id,
            name: asset.name,
            size: asset.sizeBytes ?? 0,
            source: "library",
          },
        ],
      };
    });
    setActiveLibraryBucketId(undefined);
  };

  const updateKeyword = (index: number, value: string) => {
    setKeywords((current) =>
      current.map((keyword, keywordIndex) => (keywordIndex === index ? value : keyword)),
    );
  };

  const removeKeyword = (index: number) => {
    setKeywords((current) => current.filter((_, keywordIndex) => keywordIndex !== index));
  };

  const addKeyword = () => {
    const keyword = newKeyword.trim();
    if (!keyword) {
      return;
    }
    setKeywords((current) => [...current, keyword]);
    setNewKeyword("");
  };

  const activeLibraryBucket = buckets.find((bucket) => bucket.id === activeLibraryBucketId);
  const activeLibraryAssets = activeLibraryBucket
    ? libraryAssets.filter((asset) => assetFitsPrepBucket(asset, activeLibraryBucket))
    : [];

  return (
    <section className="panel asset-prep-panel" id="asset-prep" aria-labelledby="asset-prep-title">
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
                  ? bucketUploads.map((upload) => (
                      <article className="asset-prep-thumb" key={`${bucket.id}-${upload.id}`}>
                        <span className="asset-prep-thumb-icon" aria-hidden="true">
                          <Icon size={20} />
                        </span>
                        <strong title={upload.name}>{upload.name}</strong>
                        <small>{formatSize(upload.size)}</small>
                        <CheckCircle2 size={16} aria-hidden="true" />
                      </article>
                    ))
                  : null}
                <label className="asset-prep-upload" htmlFor={inputId}>
                  <Plus size={20} aria-hidden="true" />
                  <span>{bucketUploads.length > 0 ? copy.addMore : copy.import}</span>
                  <input
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
                  onClick={() => setActiveLibraryBucketId(bucket.id)}
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

      <section className="asset-prep-keywords" aria-labelledby="asset-prep-keywords-title">
        <h3 id="asset-prep-keywords-title">
          <Tag size={16} aria-hidden="true" />
          {copy.keywords}
        </h3>
        <div className="asset-keyword-list">
          {keywords.map((keyword, index) => (
            <span className="asset-keyword-chip" key={`${keyword}-${index}`}>
              <input
                aria-label={copy.editKeyword(keyword)}
                value={keyword}
                onChange={(event) => updateKeyword(index, event.target.value)}
              />
              <button
                aria-label={copy.removeKeyword(keyword)}
                onClick={() => removeKeyword(index)}
                type="button"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ))}
          <label className="asset-keyword-add">
            <span>{copy.keywordInput}</span>
            <input
              value={newKeyword}
              onChange={(event) => setNewKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addKeyword();
                }
              }}
              placeholder={copy.keywordPlaceholder}
            />
            <button onClick={addKeyword} type="button">
              <Plus size={15} aria-hidden="true" />
              {copy.addKeyword}
            </button>
          </label>
        </div>
      </section>

      <div className="asset-prep-footer">
        <Button icon={<ArrowLeft size={18} />} onClick={onBack}>
          {copy.back}
        </Button>
        <p>{copy.estimate}</p>
        <Button
          disabled={disabled || isGenerating}
          icon={isGenerating ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
          onClick={onGenerateStoryboard}
          variant="primary"
        >
          {copy.generate}
          <ArrowRight size={18} aria-hidden="true" />
        </Button>
      </div>

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
                onClick={() => setActiveLibraryBucketId(undefined)}
                type="button"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="asset-prep-library-list">
              {activeLibraryAssets.length > 0 ? (
                activeLibraryAssets.map((asset) => (
                  <button
                    className="asset-prep-library-option"
                    key={asset.id}
                    onClick={() => addLibraryAssetToBucket(activeLibraryBucket.id, asset)}
                    type="button"
                  >
                    <FolderOpen size={20} aria-hidden="true" />
                    <span>
                      <strong>{asset.name}</strong>
                      <small>{asset.mimeType ?? asset.type}</small>
                    </span>
                    <small>{formatSize(asset.sizeBytes)}</small>
                  </button>
                ))
              ) : (
                <div className="empty-state compact-empty">
                  <strong>{copy.emptyLibrary}</strong>
                  <span>{activeLibraryBucket.support}</span>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
};
