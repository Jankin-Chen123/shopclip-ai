import type { ChangeEvent } from "react";
import type { ProjectBrief, ProjectSummary } from "@shopclip/shared";
import {
  Box,
  Clock3,
  FileText,
  FolderOpen,
  Gem,
  History,
  Loader2,
  Plus,
  Smile,
  Trash2,
  Users,
} from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import type { AppCopy } from "../../app/i18n";
import type { ProjectSnapshot } from "../../lib/api";

interface ProjectSetupProps {
  brief: ProjectBrief;
  copy: AppCopy["project"];
  disabled: boolean;
  error?: string;
  isHistoryLoading: boolean;
  isLoading: boolean;
  project?: ProjectSnapshot;
  projectHistory: ProjectSummary[];
  projectIdToLoad: string;
  onBriefChange: (brief: ProjectBrief) => void;
  onCreateProject: () => void;
  onDeleteProjectFromHistory: (projectId: string) => void;
  onLoadProject: () => void;
  onLoadProjectFromHistory: (projectId: string) => void;
  onProjectIdToLoadChange: (projectId: string) => void;
}

const splitSellingPoints = (value: string): string[] =>
  value
    .split("\n")
    .map((point) => point.trim())
    .filter(Boolean);

export const ProjectSetup = ({
  brief,
  copy,
  disabled,
  error,
  isHistoryLoading,
  isLoading,
  onBriefChange,
  onCreateProject,
  onDeleteProjectFromHistory,
  onLoadProject,
  onLoadProjectFromHistory,
  onProjectIdToLoadChange,
  project,
  projectHistory,
  projectIdToLoad,
}: ProjectSetupProps) => {
  const updateField =
    (field: keyof ProjectBrief) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = event.target.value;
      onBriefChange({
        ...brief,
        [field]:
          field === "targetDurationSeconds"
            ? Number(value)
            : field === "sellingPoints"
              ? splitSellingPoints(value)
              : value,
      });
    };

  return (
    <section
      className="panel project-panel concept-project-panel"
      id="project"
      aria-labelledby="project-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{copy.step}</p>
          <h2 id="project-title">{copy.title}</h2>
          <p className="concept-panel-subtitle">
            {copy.step.startsWith("步骤")
              ? "完善产品与创意方向，帮助 AI 生成更精准的脚本与镜头。"
              : "Complete the product and creative direction so AI can generate sharper scripts and shots."}
          </p>
        </div>
        <StatusPill tone={project ? "success" : "neutral"}>
          {project ? copy.loaded : copy.draft}
        </StatusPill>
      </div>

      <div className="form-grid concept-brief-grid">
        <label className="concept-field">
          <span>
            <FileText size={17} aria-hidden="true" />
            {copy.projectTitle}
          </span>
          <input value={brief.title} onChange={updateField("title")} />
        </label>
        <label className="concept-field">
          <span>
            <Box size={17} aria-hidden="true" />
            {copy.productName}
          </span>
          <input value={brief.productName} onChange={updateField("productName")} />
        </label>
        <label className="concept-field">
          <span>
            <Users size={17} aria-hidden="true" />
            {copy.audience}
          </span>
          <input value={brief.audience} onChange={updateField("audience")} />
        </label>
        <label className="concept-field">
          <span>
            <Smile size={17} aria-hidden="true" />
            {copy.creativeTone}
          </span>
          <input value={brief.tone} onChange={updateField("tone")} />
        </label>
        <label className="concept-field">
          <span>
            <Gem size={17} aria-hidden="true" />
            {copy.visualStyle}
          </span>
          <select value={brief.style} onChange={updateField("style")}>
            <option value="fast desk demo">{copy.styles.fastDeskDemo}</option>
            <option value="premium product closeups">{copy.styles.premiumProductCloseups}</option>
            <option value="ugc problem solution">{copy.styles.ugcProblemSolution}</option>
          </select>
        </label>
        <label className="concept-field">
          <span>
            <Clock3 size={17} aria-hidden="true" />
            {copy.targetDuration}
          </span>
          <select
            value={String(brief.targetDurationSeconds)}
            onChange={updateField("targetDurationSeconds")}
          >
            <option value="12">{copy.durations.seconds(12)}</option>
            <option value="15">{copy.durations.seconds(15)}</option>
          </select>
        </label>
        <label className="wide-field concept-field concept-selling-points">
          <span>
            <Gem size={17} aria-hidden="true" />
            {copy.sellingPoints}
          </span>
          <textarea
            value={brief.sellingPoints.join("\n")}
            onChange={updateField("sellingPoints")}
            rows={3}
          />
        </label>
      </div>

      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="action-row">
        <Button
          disabled={disabled || isLoading}
          icon={isLoading ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
          onClick={onCreateProject}
          variant="primary"
        >
          {copy.createProject}
        </Button>
        <div className="load-project">
          <label>
            {copy.existingProjectId}
            <input
              value={projectIdToLoad}
              onChange={(event) => onProjectIdToLoadChange(event.target.value)}
              placeholder={copy.projectIdPlaceholder}
            />
          </label>
          <Button
            disabled={!projectIdToLoad.trim() || isLoading}
            icon={<FolderOpen size={18} />}
            onClick={onLoadProject}
          >
            {copy.load}
          </Button>
        </div>
      </div>

      <section className="project-history-panel" aria-labelledby="project-history-title">
        <div className="project-history-heading">
          <span className="project-history-icon" aria-hidden="true">
            <History size={18} />
          </span>
          <div>
            <h3 id="project-history-title">{copy.historyTitle}</h3>
            <p>{copy.historyDescription}</p>
          </div>
          <StatusPill tone={projectHistory.length > 0 ? "success" : "neutral"}>
            {isHistoryLoading ? copy.historyLoading : copy.historyCount(projectHistory.length)}
          </StatusPill>
        </div>

        {projectHistory.length > 0 ? (
          <div className="project-history-list">
            {projectHistory.map((historyProject) => (
              <div
                className={`project-history-item${
                  project?.id === historyProject.id ? " active" : ""
                }`}
                key={historyProject.id}
              >
                <button
                  className="project-history-load"
                  disabled={disabled || isHistoryLoading}
                  onClick={() => onLoadProjectFromHistory(historyProject.id)}
                  type="button"
                >
                  <span className="project-history-main">
                    <strong>{historyProject.title}</strong>
                    <span>{historyProject.productName}</span>
                  </span>
                  <span className="project-history-meta">
                    <span>{historyProject.status}</span>
                    <span>{copy.assetCount(historyProject.assetCount)}</span>
                    <span>{copy.sceneCount(historyProject.sceneCount)}</span>
                    <span>{copy.updatedAt(formatUpdatedAt(historyProject.updatedAt))}</span>
                  </span>
                </button>
                <Button
                  aria-label={copy.deleteHistoryProject(historyProject.title)}
                  className="project-history-delete"
                  disabled={disabled || isHistoryLoading}
                  icon={<Trash2 size={16} />}
                  onClick={() => onDeleteProjectFromHistory(historyProject.id)}
                  variant="danger"
                >
                  <span className="sr-only">{copy.deleteHistoryProject(historyProject.title)}</span>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="project-history-empty">
            {isHistoryLoading ? copy.historyLoading : copy.historyEmpty}
          </p>
        )}
      </section>

      {project ? (
        <dl className="meta-list">
          <div>
            <dt>{copy.projectId}</dt>
            <dd>{project.id}</dd>
          </div>
          <div>
            <dt>{copy.status}</dt>
            <dd>{project.status}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
};

const formatUpdatedAt = (value: string): string => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};
