import { useState } from "react";
import type { AssetMetadata, ReferenceVideo, ViralTemplate } from "@shopclip/shared";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  WandSparkles,
} from "lucide-react";

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
  error?: string;
  initialDraft?: ReferenceDraft;
  isLoading: boolean;
  language: Language;
  onAnalyzeReference: (draft: ReferenceDraft) => void;
  onCreateTemplate: () => void;
  onDeleteReference?: (referenceId: string) => void;
  onDeleteReferences?: (referenceIds: string[]) => void;
  onUseReference: (referenceId: string) => void;
  references: ReferenceVideo[];
  selectedReferenceId?: string;
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
    analyzing: "Submitting...",
    activeTaskTitle: "Reference breakdown is running",
    activeTaskBody:
      "We are reading the video, understanding the scenes, and summarizing reusable ideas for scripts. This usually takes 1-3 minutes.",
    activeTaskSteps: [
      "Queued",
      "Reading video",
      "Understanding scenes",
      "Summarizing ideas",
      "Ready",
    ],
    activeTaskProgressLabel: "Progress",
    activeTaskProgressNote: "Progress is an estimate while the video is being processed.",
    elapsed: "used",
    processingCount: (count: number) => `${count} processing`,
    failedTaskTitle: "Some videos need a new link",
    failedTaskBody:
      "The video could not be read. Use a direct link that still plays in the browser, then retry.",
    failedCount: (count: number) => `${count} need attention`,
    stalledTaskTitle: "Some videos stopped updating",
    stalledTaskBody:
      "These videos have not updated for more than 10 minutes. Retry them or replace the source link.",
    stalledCount: (count: number) => `${count} need retry`,
    rowReadyStatus: "Usable",
    rowPendingStatus: "Processing",
    rowFailedStatus: "Needs new link",
    rowStalledStatus: "Needs retry",
    rowReadySummary:
      "Reusable ideas have been extracted. You can add this reference to the script library.",
    rowPendingSummary: "The system is reading this video and preparing reusable script ideas.",
    rowFailedSummary:
      "This video link cannot be read now. Replace it with a playable direct link and retry.",
    reusableIdeas: "Reusable ideas",
    untitledReference: "Reference video",
    defaultIdeaTags: ["Opening hook", "Product demo", "Trust point", "Call to action"],
    readyToSubmitTitle: "Ready to submit",
    readyToSubmitBody: "This reference will be saved as structured analysis only.",
    blockedSubmitTitle: "Complete required fields",
    missingSource: "source video",
    missingTitle: "reference title",
    missingPlatform: "platform",
    missingCategory: "category",
    missingDeclaration: "source declaration",
    missingFields: (fields: string) => `Add ${fields} before submitting.`,
    retryReference: "Retry breakdown",
    deleteReference: "Delete",
    deleteSelected: "Delete selected",
    selectedCount: (count: number) => `${count} selected`,
    selectReference: (title: string) => `Select ${title}`,
    createTemplate: "Create template",
    useReference: "Add to script library",
    selectedReference: "Added to script library",
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
    analyzing: "提交中...",
    activeTaskTitle: "参考视频正在拆解",
    activeTaskBody: "系统正在读取视频、理解画面内容，并整理可复用的剧本灵感，通常需要 1-3 分钟。",
    activeTaskSteps: ["排队中", "读取视频", "理解画面", "整理灵感", "可使用"],
    activeTaskProgressLabel: "处理进度",
    activeTaskProgressNote: "进度为处理中的预估值。",
    elapsed: "已耗时",
    processingCount: (count: number) => `${count} 个处理中`,
    failedTaskTitle: "有视频需要更换链接",
    failedTaskBody: "当前视频无法读取。请换成浏览器仍能直接播放的视频链接后重试。",
    failedCount: (count: number) => `${count} 个需处理`,
    stalledTaskTitle: "有视频长时间未更新",
    stalledTaskBody: "这些视频超过 10 分钟没有进展，可重新拆解或更换来源链接。",
    stalledCount: (count: number) => `${count} 个需重试`,
    rowReadyStatus: "可使用",
    rowPendingStatus: "处理中",
    rowFailedStatus: "需更换链接",
    rowStalledStatus: "需重试",
    rowReadySummary: "已整理出可复用灵感，可加入剧本素材库。",
    rowPendingSummary: "系统正在读取该视频并整理可复用剧本灵感。",
    rowFailedSummary: "当前视频链接无法读取，请换成可直接播放的视频链接后重试。",
    reusableIdeas: "可复用内容",
    untitledReference: "参考视频",
    defaultIdeaTags: ["开头吸引", "产品展示", "信任证明", "购买引导"],
    readyToSubmitTitle: "可以提交",
    readyToSubmitBody: "该参考视频将仅保存结构化拆解结果。",
    blockedSubmitTitle: "请补全必填信息",
    missingSource: "来源视频",
    missingTitle: "参考标题",
    missingPlatform: "平台",
    missingCategory: "类目",
    missingDeclaration: "来源声明",
    missingFields: (fields: string) => `提交前请补充：${fields}。`,
    retryReference: "重新拆解",
    deleteReference: "删除",
    deleteSelected: "删除已选",
    selectedCount: (count: number) => `已选 ${count} 条`,
    selectReference: (title: string) => `选择 ${title}`,
    createTemplate: "提炼模板",
    useReference: "加入剧本素材库",
    selectedReference: "已加入剧本素材库",
    empty: "暂无参考视频拆解",
    status: (count: number) => `${count} 条参考`,
    templateStatus: (count: number) => `${count} 个模板`,
  },
} as const;

type ReferenceCopy = (typeof text)[Language];
const activeReferenceWindowMs = 10 * 60 * 1000;

const createReferenceDraft = (reference: ReferenceVideo): ReferenceDraft => ({
  category: reference.category,
  sourceDeclaration: reference.sourceDeclaration,
  sourceAssetId: reference.sourceAssetId,
  sourcePlatform: reference.sourcePlatform,
  sourceUrl: reference.sourceUrl,
  title: reference.title,
});

const getMissingFields = (draft: ReferenceDraft, copy: ReferenceCopy): string[] => {
  const fields: string[] = [];
  if (!draft.sourceAssetId && !draft.sourceUrl?.trim()) {
    fields.push(copy.missingSource);
  }
  if (!draft.title.trim()) {
    fields.push(copy.missingTitle);
  }
  if (!draft.sourcePlatform.trim()) {
    fields.push(copy.missingPlatform);
  }
  if (!draft.category.trim()) {
    fields.push(copy.missingCategory);
  }
  if (!draft.sourceDeclaration.trim()) {
    fields.push(copy.missingDeclaration);
  }
  return fields;
};

const getElapsedLabel = (reference: ReferenceVideo): string => {
  const timestamp = Date.parse(reference.updatedAt || reference.createdAt);
  if (Number.isNaN(timestamp)) {
    return "<1m";
  }
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }
  return `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`;
};

const getEstimatedProgress = (reference: ReferenceVideo): number => {
  if (reference.status === "registered") {
    return 12;
  }
  const timestamp = Date.parse(reference.createdAt);
  const elapsedSeconds = Number.isNaN(timestamp)
    ? 30
    : Math.max(0, (Date.now() - timestamp) / 1000);
  if (elapsedSeconds < 30) {
    return 34;
  }
  if (elapsedSeconds < 90) {
    return 58;
  }
  if (elapsedSeconds < 150) {
    return 78;
  }
  return 92;
};

const isPendingReference = (reference: ReferenceVideo): boolean =>
  reference.status === "registered" || reference.status === "analyzing";

const isStalledReference = (reference: ReferenceVideo, nowMs = Date.now()): boolean => {
  if (!isPendingReference(reference)) {
    return false;
  }
  const timestamp = Date.parse(reference.updatedAt || reference.createdAt);
  return Number.isNaN(timestamp) || nowMs - timestamp > activeReferenceWindowMs;
};

const segmentRoleLabels: Record<Language, Record<string, string>> = {
  en: {
    cta: "Call to action",
    demo: "Product demo",
    hook: "Opening hook",
    pain: "Buyer pain point",
    price: "Value point",
    solution: "Product solution",
    trust: "Trust proof",
  },
  zh: {
    cta: "购买引导",
    demo: "产品展示",
    hook: "开头吸引",
    pain: "痛点切入",
    price: "价格价值",
    solution: "解决方案",
    trust: "信任证明",
  },
};

const getReferenceStatusLabel = (reference: ReferenceVideo, copy: ReferenceCopy): string => {
  if (isStalledReference(reference)) {
    return copy.rowStalledStatus;
  }
  if (reference.status === "failed") {
    return copy.rowFailedStatus;
  }
  if (reference.status === "ready") {
    return copy.rowReadyStatus;
  }
  return copy.rowPendingStatus;
};

const getReferenceSummary = (reference: ReferenceVideo, copy: ReferenceCopy): string => {
  if (isStalledReference(reference)) {
    return copy.stalledTaskBody;
  }
  if (reference.status === "failed") {
    return copy.rowFailedSummary;
  }
  if (reference.status === "ready") {
    return copy.rowReadySummary;
  }
  return copy.rowPendingSummary;
};

const getReferenceIdeaTags = (
  reference: ReferenceVideo,
  language: Language,
  copy: ReferenceCopy,
): string[] => {
  if (reference.status !== "ready") {
    return [];
  }
  const labels = segmentRoleLabels[language];
  const roles =
    reference.analysis?.commerceNarrativeSegments
      .map((segment) => labels[segment.role] ?? segment.summary)
      .filter(Boolean) ?? [];
  const uniqueRoles = Array.from(new Set(roles));
  return (uniqueRoles.length ? uniqueRoles : copy.defaultIdeaTags).slice(0, 4);
};

const getReferenceDisplayTitle = (reference: ReferenceVideo, copy: ReferenceCopy): string => {
  const normalized = reference.title.replace(/[？?\s#]+/g, "");
  if (!normalized || /[�]{2,}/.test(reference.title)) {
    return copy.untitledReference;
  }
  return reference.title;
};

export const ReferenceLibraryPanel = ({
  disabled,
  error,
  initialDraft,
  isLoading,
  language,
  onAnalyzeReference,
  onDeleteReference = () => undefined,
  onDeleteReferences,
  onUseReference,
  references,
  selectedReferenceId,
  sourceAssets,
  templates,
}: ReferenceLibraryPanelProps) => {
  const copy = text[language];
  const [draft, setDraft] = useState<ReferenceDraft>(
    initialDraft ?? {
      category: "Kitchen appliances",
      sourceDeclaration: "Public reference URL; save structured analysis only.",
      sourceAssetId: undefined,
      sourcePlatform: "tiktok",
      sourceUrl: "",
      title: "",
    },
  );
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<Set<string>>(new Set());

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
  const missingFields = getMissingFields(draft, copy);
  const activeReferences = references.filter(
    (reference) => isPendingReference(reference) && !isStalledReference(reference),
  );
  const stalledReferences = references.filter((reference) => isStalledReference(reference));
  const failedReferences = references.filter((reference) => reference.status === "failed");
  const selectedCount = selectedReferenceIds.size;
  const deleteReferences = (referenceIds: string[]) => {
    if (referenceIds.length === 0) {
      return;
    }
    if (onDeleteReferences) {
      onDeleteReferences(referenceIds);
    } else {
      referenceIds.forEach((referenceId) => onDeleteReference(referenceId));
    }
    setSelectedReferenceIds(new Set());
  };
  const toggleReferenceSelection = (referenceId: string) => {
    setSelectedReferenceIds((current) => {
      const next = new Set(current);
      if (next.has(referenceId)) {
        next.delete(referenceId);
      } else {
        next.add(referenceId);
      }
      return next;
    });
  };

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
            onChange={(event) => updateDraft("sourceAssetId", event.target.value || undefined)}
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
      <div
        className={`reference-readiness ${canAnalyze ? "is-ready" : "is-blocked"}`}
        role="status"
      >
        {canAnalyze ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
        <div>
          <strong>{canAnalyze ? copy.readyToSubmitTitle : copy.blockedSubmitTitle}</strong>
          <p>
            {canAnalyze ? copy.readyToSubmitBody : copy.missingFields(missingFields.join(", "))}
          </p>
        </div>
      </div>
      <Button
        disabled={disabled || isLoading || !canAnalyze}
        icon={isLoading ? <Loader2 className="spin" size={18} /> : <WandSparkles size={18} />}
        onClick={submitDraft}
        variant="primary"
      >
        {isLoading ? copy.analyzing : copy.analyze}
      </Button>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
      {activeReferences.length > 0 ? (
        <div className="reference-task-summary" role="status">
          <Loader2 className="spin" size={18} />
          <div>
            <strong>{copy.activeTaskTitle}</strong>
            <p>{copy.activeTaskBody}</p>
          </div>
          <StatusPill tone="info">{copy.processingCount(activeReferences.length)}</StatusPill>
          <div className="reference-task-progress-list">
            {activeReferences.slice(0, 3).map((reference) => {
              const progress = getEstimatedProgress(reference);
              return (
                <div className="reference-task-progress" key={reference.id}>
                  <div className="reference-task-progress-header">
                    <span>{getReferenceDisplayTitle(reference, copy)}</span>
                    <span>
                      <Clock3 size={14} />
                      {copy.elapsed} {getElapsedLabel(reference)}
                    </span>
                  </div>
                  <div
                    className="reference-progress-track"
                    aria-label={`${copy.activeTaskProgressLabel}: ${progress}%`}
                  >
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <div className="reference-task-progress-label">
                    <span>{copy.activeTaskProgressLabel}</span>
                    <strong>{progress}%</strong>
                  </div>
                  <div className="reference-task-steps" aria-label={copy.activeTaskProgressNote}>
                    {copy.activeTaskSteps.map((step, index) => (
                      <span
                        key={step}
                        className={index <= Math.floor(progress / 25) ? "is-active" : undefined}
                      >
                        {step}
                      </span>
                    ))}
                  </div>
                  <small>{copy.activeTaskProgressNote}</small>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {failedReferences.length > 0 ? (
        <div className="reference-task-summary reference-task-summary-failed" role="status">
          <div>
            <strong>{copy.failedTaskTitle}</strong>
            <p>{copy.failedTaskBody}</p>
          </div>
          <StatusPill tone="danger">{copy.failedCount(failedReferences.length)}</StatusPill>
        </div>
      ) : null}
      {stalledReferences.length > 0 ? (
        <div className="reference-task-summary reference-task-summary-failed" role="status">
          <div>
            <strong>{copy.stalledTaskTitle}</strong>
            <p>{copy.stalledTaskBody}</p>
          </div>
          <StatusPill tone="danger">{copy.stalledCount(stalledReferences.length)}</StatusPill>
        </div>
      ) : null}

      <div className="reference-breakdown-list">
        {references.length === 0 ? (
          <div className="empty-state compact-empty">
            <strong>{copy.empty}</strong>
          </div>
        ) : (
          <>
            <div className="reference-bulk-actions">
              <strong>{copy.selectedCount(selectedCount)}</strong>
              <Button
                disabled={disabled || selectedCount === 0}
                icon={<Trash2 size={18} />}
                onClick={() => deleteReferences([...selectedReferenceIds])}
                variant="danger"
              >
                {copy.deleteSelected}
              </Button>
            </div>
            {references.map((reference) => {
              const displayTitle = getReferenceDisplayTitle(reference, copy);
              const isSelected = selectedReferenceIds.has(reference.id);
              return (
                <article className="suggestion-row reference-history-row" key={reference.id}>
                  <button
                    aria-label={copy.selectReference(displayTitle)}
                    aria-pressed={isSelected}
                    className="asset-selection-control reference-selection-control"
                    disabled={disabled}
                    onClick={() => toggleReferenceSelection(reference.id)}
                    type="button"
                  >
                    {isSelected ? <CheckCircle2 size={16} /> : null}
                  </button>
                  <div>
                    <h4>{displayTitle}</h4>
                    <p>{getReferenceSummary(reference, copy)}</p>
                    <div className="constraint-list">
                      <StatusPill
                        tone={
                          reference.status === "failed" || isStalledReference(reference)
                            ? "danger"
                            : "info"
                        }
                      >
                        {getReferenceStatusLabel(reference, copy)}
                      </StatusPill>
                      {getReferenceIdeaTags(reference, language, copy).map((tag) => (
                        <StatusPill key={tag} tone="info">
                          {tag}
                        </StatusPill>
                      ))}
                    </div>
                  </div>
                  <div className="reference-row-actions">
                    <Button
                      disabled={
                        disabled ||
                        (reference.status !== "ready" &&
                          reference.status !== "failed" &&
                          !isStalledReference(reference))
                      }
                      icon={
                        reference.status === "failed" || isStalledReference(reference) ? (
                          <RefreshCw size={18} />
                        ) : (
                          <Plus size={18} />
                        )
                      }
                      onClick={() =>
                        reference.status === "failed" || isStalledReference(reference)
                          ? onAnalyzeReference(createReferenceDraft(reference))
                          : onUseReference(reference.id)
                      }
                    >
                      {reference.status === "failed" || isStalledReference(reference)
                        ? copy.retryReference
                        : selectedReferenceId === reference.id
                          ? copy.selectedReference
                          : copy.useReference}
                    </Button>
                    <Button
                      aria-label={`${copy.deleteReference} ${displayTitle}`}
                      disabled={disabled}
                      icon={<Trash2 size={18} />}
                      onClick={() => deleteReferences([reference.id])}
                      variant="danger"
                    >
                      {copy.deleteReference}
                    </Button>
                  </div>
                </article>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
};
