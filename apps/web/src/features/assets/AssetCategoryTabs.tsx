import type { AssetMetadata, ExternalAssetResult } from "@shopclip/shared";
import { FileText, Image, Music, Video } from "lucide-react";

import type { Language } from "../../app/i18n";
import type { CreateAssetInput } from "../../lib/api";

export type AssetCategory = "image" | "video" | "audio" | "script";

const categoryLabels: Record<Language, Record<AssetCategory, string>> = {
  en: {
    image: "Images",
    video: "Video",
    audio: "Audio",
    script: "Scripts",
  },
  zh: {
    image: "图片",
    video: "视频",
    audio: "音频",
    script: "剧本",
  },
};

const categoryIcons = {
  image: Image,
  video: Video,
  audio: Music,
  script: FileText,
} as const;

const draftDefaults: Record<
  Language,
  Record<AssetCategory, Pick<CreateAssetInput, "type" | "mimeType" | "name" | "tags">>
> = {
  en: {
    image: {
      type: "image",
      mimeType: "image/png",
      name: "Product image reference",
      tags: ["product", "image"],
    },
    video: {
      type: "video",
      mimeType: "video/mp4",
      name: "Product video reference",
      tags: ["product", "video"],
    },
    audio: {
      type: "reference",
      mimeType: "audio/mpeg",
      name: "Voice or music reference",
      tags: ["audio", "reference"],
    },
    script: {
      type: "reference",
      mimeType: "text/plain",
      name: "Script reference",
      tags: ["script", "copy"],
    },
  },
  zh: {
    image: {
      type: "image",
      mimeType: "image/png",
      name: "产品图片素材",
      tags: ["产品", "图片"],
    },
    video: {
      type: "video",
      mimeType: "video/mp4",
      name: "产品视频素材",
      tags: ["产品", "视频"],
    },
    audio: {
      type: "reference",
      mimeType: "audio/mpeg",
      name: "旁白或音乐素材",
      tags: ["音频", "参考"],
    },
    script: {
      type: "reference",
      mimeType: "text/plain",
      name: "剧本素材",
      tags: ["剧本", "文案"],
    },
  },
};

export const assetCategories: AssetCategory[] = ["image", "video", "audio", "script"];

export const getAssetCategoryLabel = (category: AssetCategory, language: Language) =>
  categoryLabels[language][category];

export const getAssetDraftDefaults = (
  category: AssetCategory,
  language: Language = "en",
): Pick<CreateAssetInput, "type" | "mimeType" | "name" | "tags"> => draftDefaults[language][category];

export const assetMatchesCategory = (asset: AssetMetadata, category: AssetCategory) => {
  const tags = asset.tags.map((tag) => tag.toLowerCase());

  if (category === "image") {
    return asset.type === "image";
  }

  if (category === "video") {
    return asset.type === "video";
  }

  if (category === "audio") {
    return asset.mimeType?.startsWith("audio/") || tags.includes("audio") || tags.includes("音频");
  }

  return (
    asset.mimeType === "text/plain" ||
    tags.some((tag) => tag === "script" || tag === "copy" || tag === "剧本" || tag === "文案")
  );
};

export const externalAssetMatchesCategory = (
  asset: ExternalAssetResult,
  category: AssetCategory,
) => {
  if (category === "image") {
    return asset.type === "image";
  }

  if (category === "video") {
    return asset.type === "video";
  }

  return false;
};

interface AssetCategoryTabsProps {
  activeCategory: AssetCategory;
  language: Language;
  onCategoryChange: (category: AssetCategory) => void;
}

export const AssetCategoryTabs = ({
  activeCategory,
  language,
  onCategoryChange,
}: AssetCategoryTabsProps) => (
  <nav className="asset-browser-tabs" aria-label={language === "zh" ? "素材类型" : "Asset types"}>
    {assetCategories.map((category) => {
      const Icon = categoryIcons[category];
      const isActive = category === activeCategory;
      return (
        <button
          aria-pressed={isActive}
          className={isActive ? "active" : undefined}
          key={category}
          onClick={() => onCategoryChange(category)}
          type="button"
        >
          <Icon size={16} aria-hidden="true" />
          <span>{getAssetCategoryLabel(category, language)}</span>
        </button>
      );
    })}
  </nav>
);
