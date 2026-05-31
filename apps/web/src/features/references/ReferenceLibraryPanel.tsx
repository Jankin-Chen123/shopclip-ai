import { useState } from "react";
import type { AssetMetadata, ReferenceVideo, ViralTemplate } from "@shopclip/shared";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  RefreshCw,
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
      "The backend is downloading the video, storing it, slicing real frames, and extracting reusable script factors. This usually takes 1-3 minutes and will switch to ready automatically.",
    activeTaskSteps: ["Queued", "Download & store", "Slice frames", "Extract factors", "Ready"],
    activeTaskProgressLabel: "Estimated progress",
    activeTaskProgressNote: "Elapsed-time guide; exact provider step may vary.",
    elapsed: "elapsed",
    failedTaskTitle: "Some breakdowns need attention",
    failedTaskBody:
      "Open the failed row below for the provider or download error, then retry with a fresh playable URL if needed.",
    stalledTaskTitle: "Some breakdowns stopped updating",
    stalledTaskBody:
      "These jobs have not changed for more than 10 minutes. The source may have expired or the provider may have stalled; retry from the row below.",
    stalledStatus: "stalled",
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
    activeTaskBody:
      "后端正在下载视频、写入素材库、真实切片抽帧并提取可复用脚本因子，通常需要 1-3 分钟，完成后会自动变为 ready。",
    activeTaskSteps: ["已排队", "下载入库", "切片抽帧", "提取因子", "完成"],
    activeTaskProgressLabel: "预估进度",
    activeTaskProgressNote: "基于已耗时估算，真实模型步骤可能略有差异。",
    elapsed: "已耗时",
    failedTaskTitle: "有拆解任务需要处理",
    failedTaskBody:
      "查看下方 failed 行的下载或模型错误；如果是公开视频链接失效，请换一个仍可播放的直链后重试。",
    stalledTaskTitle: "有拆解任务长时间未更新",
    stalledTaskBody:
      "这些任务超过 10 分钟没有状态变化，可能是链接过期或模型服务卡住；可在下方对应行重新拆解。",
    stalledStatus: "未更新",
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

export const ReferenceLibraryPanel = ({
  disabled,
  error,
  initialDraft,
  isLoading,
  language,
  onAnalyzeReference,
  onCreateTemplate,
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
      <Button
        disabled={
          disabled || isLoading || !references.some((reference) => reference.status === "ready")
        }
        icon={<WandSparkles size={18} />}
        onClick={onCreateTemplate}
      >
        {copy.createTemplate}
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
          <StatusPill tone="info">{activeReferences.length} analyzing</StatusPill>
          <div className="reference-task-progress-list">
            {activeReferences.slice(0, 3).map((reference) => {
              const progress = getEstimatedProgress(reference);
              return (
                <div className="reference-task-progress" key={reference.id}>
                  <div className="reference-task-progress-header">
                    <span>{reference.title}</span>
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
          <StatusPill tone="danger">{failedReferences.length} failed</StatusPill>
        </div>
      ) : null}
      {stalledReferences.length > 0 ? (
        <div className="reference-task-summary reference-task-summary-failed" role="status">
          <div>
            <strong>{copy.stalledTaskTitle}</strong>
            <p>{copy.stalledTaskBody}</p>
          </div>
          <StatusPill tone="danger">
            {stalledReferences.length} {copy.stalledStatus}
          </StatusPill>
        </div>
      ) : null}

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
                <p>
                  {isStalledReference(reference)
                    ? copy.stalledTaskBody
                    : reference.status === "failed"
                      ? (reference.errorMessage ?? "Reference analysis failed.")
                      : reference.status === "ready"
                        ? (reference.analysis?.contentFormula ?? reference.sourceDeclaration)
                        : "Analyzing video structure, slices, hook, pacing, and reusable script factors."}
                </p>
                <div className="constraint-list">
                  <StatusPill
                    tone={
                      reference.status === "failed" || isStalledReference(reference)
                        ? "danger"
                        : "info"
                    }
                  >
                    {isStalledReference(reference) ? copy.stalledStatus : reference.status}
                  </StatusPill>
                  {reference.analysis?.keyViralFactors.slice(0, 3).map((factor) => (
                    <StatusPill key={factor} tone="info">
                      {factor}
                    </StatusPill>
                  ))}
                </div>
              </div>
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
            </article>
          ))
        )}
      </div>
    </section>
  );
};
