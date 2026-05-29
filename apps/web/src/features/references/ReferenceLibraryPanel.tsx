import { useState } from "react";
import type { AssetMetadata, ReferenceVideo, ViralTemplate } from "@shopclip/shared";
import { Loader2, Plus, WandSparkles } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import type { Language } from "../../app/i18n";

interface ReferenceDraft {
  category: string;
  sourceDeclaration: string;
  sourceAssetId?: string;
  sourcePlatform: string;
  sourceUrl?: string;
  title: string;
}

interface ReferenceLibraryPanelProps {
  disabled: boolean;
  isLoading: boolean;
  language: Language;
  onAnalyzeReference: (draft: ReferenceDraft) => void;
  onCreateTemplate: () => void;
  references: ReferenceVideo[];
  sourceAssets: AssetMetadata[];
  templates: ViralTemplate[];
}

const text = {
  en: {
    step: "Reference DNA",
    title: "Viral video breakdown",
    body: "Register public references as source-declared analysis only, then reuse their hook, pacing, narrative, and conversion factors for scripts.",
    url: "Source URL",
    sourceAsset: "Uploaded reference video",
    noSourceAsset: "Use public URL",
    platform: "Platform",
    sourceDeclaration: "Source declaration",
    category: "Category",
    referenceTitle: "Reference title",
    analyze: "Analyze reference",
    createTemplate: "Create template",
    empty: "No reference breakdowns yet",
    status: (count: number) => `${count} reference${count === 1 ? "" : "s"}`,
    templateStatus: (count: number) => `${count} template${count === 1 ? "" : "s"}`,
  },
  zh: {
    step: "爆款 DNA",
    title: "参考视频拆解",
    body: "登记公开视频来源，只保存结构化分析，不保存、不复刻、不混剪原视频，用于剧本方法论和转化因子复用。",
    url: "来源 URL",
    sourceAsset: "已上传参考视频",
    noSourceAsset: "使用公开视频 URL",
    platform: "平台",
    sourceDeclaration: "来源声明",
    category: "类目",
    referenceTitle: "参考标题",
    analyze: "拆解参考视频",
    createTemplate: "提炼模板",
    empty: "暂无参考视频拆解",
    status: (count: number) => `${count} 条参考`,
    templateStatus: (count: number) => `${count} 个模板`,
  },
} as const;

export const ReferenceLibraryPanel = ({
  disabled,
  isLoading,
  language,
  onAnalyzeReference,
  onCreateTemplate,
  references,
  sourceAssets,
  templates,
}: ReferenceLibraryPanelProps) => {
  const copy = text[language];
  const [draft, setDraft] = useState<ReferenceDraft>({
    category: "Kitchen appliances",
    sourceDeclaration: "Public reference URL; save structured analysis only.",
    sourceAssetId: undefined,
    sourcePlatform: "tiktok",
    sourceUrl: "",
    title: "",
  });

  const updateDraft = (field: keyof ReferenceDraft, value: string | undefined) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const submitDraft = () => {
    onAnalyzeReference({
      ...draft,
      sourceUrl: draft.sourceUrl?.trim() || undefined,
    });
  };

  const canAnalyze =
    (draft.sourceAssetId || draft.sourceUrl?.trim()) &&
    draft.sourcePlatform.trim() &&
    draft.sourceDeclaration.trim() &&
    draft.title.trim() &&
    draft.category.trim();

  return (
    <section className="panel reference-library-panel" aria-labelledby="reference-library-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{copy.step}</p>
          <h2 id="reference-library-title">{copy.title}</h2>
          <p className="concept-panel-subtitle">{copy.body}</p>
        </div>
        <StatusPill tone={references.length ? "success" : "neutral"}>
          {copy.status(references.length)}
        </StatusPill>
        <StatusPill tone={templates.length ? "success" : "neutral"}>
          {copy.templateStatus(templates.length)}
        </StatusPill>
      </div>

      <div className="reference-form-grid">
        <label>
          {copy.sourceAsset}
          <select
            onChange={(event) =>
              updateDraft("sourceAssetId", event.target.value || undefined)
            }
            value={draft.sourceAssetId ?? ""}
          >
            <option value="">{copy.noSourceAsset}</option>
            {sourceAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy.url}
          <input
            onChange={(event) => updateDraft("sourceUrl", event.target.value)}
            placeholder="https://..."
            disabled={Boolean(draft.sourceAssetId)}
            value={draft.sourceUrl ?? ""}
          />
        </label>
        <label>
          {copy.referenceTitle}
          <input
            onChange={(event) => updateDraft("title", event.target.value)}
            value={draft.title}
          />
        </label>
        <label>
          {copy.platform}
          <input
            onChange={(event) => updateDraft("sourcePlatform", event.target.value)}
            value={draft.sourcePlatform}
          />
        </label>
        <label>
          {copy.category}
          <input
            onChange={(event) => updateDraft("category", event.target.value)}
            value={draft.category}
          />
        </label>
      </div>
      <label className="script-draft-editor">
        <span>{copy.sourceDeclaration}</span>
        <textarea
          onChange={(event) => updateDraft("sourceDeclaration", event.target.value)}
          rows={2}
          value={draft.sourceDeclaration}
        />
      </label>
      <Button
        disabled={disabled || isLoading || !canAnalyze}
        icon={isLoading ? <Loader2 className="spin" size={18} /> : <WandSparkles size={18} />}
        onClick={submitDraft}
        variant="primary"
      >
        {copy.analyze}
      </Button>
      <Button
        disabled={disabled || isLoading || !references.some((reference) => reference.status === "ready")}
        icon={<WandSparkles size={18} />}
        onClick={onCreateTemplate}
      >
        {copy.createTemplate}
      </Button>

      <div className="reference-breakdown-list">
        {references.length === 0 ? (
          <div className="empty-state compact-empty">
            <strong>{copy.empty}</strong>
          </div>
        ) : (
          references.map((reference) => (
            <article className="suggestion-row" key={reference.id}>
              <div>
                <h4>{reference.title}</h4>
                <p>{reference.analysis?.contentFormula ?? reference.sourceDeclaration}</p>
                <div className="constraint-list">
                  <StatusPill tone="info">{reference.status}</StatusPill>
                  {reference.analysis?.keyViralFactors.slice(0, 3).map((factor) => (
                    <StatusPill key={factor} tone="info">
                      {factor}
                    </StatusPill>
                  ))}
                </div>
              </div>
              <Plus size={18} aria-hidden="true" />
            </article>
          ))
        )}
      </div>
    </section>
  );
};
