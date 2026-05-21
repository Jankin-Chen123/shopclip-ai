import type { ChangeEvent } from "react";
import type { ProjectBrief } from "@shopclip/shared";
import { FolderOpen, Loader2, Plus } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import type { ProjectSnapshot } from "../../lib/api";

interface ProjectSetupProps {
  brief: ProjectBrief;
  disabled: boolean;
  error?: string;
  isLoading: boolean;
  project?: ProjectSnapshot;
  projectIdToLoad: string;
  onBriefChange: (brief: ProjectBrief) => void;
  onCreateProject: () => void;
  onLoadProject: () => void;
  onProjectIdToLoadChange: (projectId: string) => void;
}

const splitSellingPoints = (value: string): string[] =>
  value
    .split("\n")
    .map((point) => point.trim())
    .filter(Boolean);

export const ProjectSetup = ({
  brief,
  disabled,
  error,
  isLoading,
  onBriefChange,
  onCreateProject,
  onLoadProject,
  onProjectIdToLoadChange,
  project,
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
    <section className="panel project-panel" id="project" aria-labelledby="project-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Step 01</p>
          <h2 id="project-title">Product setup</h2>
        </div>
        <StatusPill tone={project ? "success" : "neutral"}>
          {project ? "Project loaded" : "Draft"}
        </StatusPill>
      </div>

      <div className="form-grid">
        <label>
          Project title
          <input value={brief.title} onChange={updateField("title")} />
        </label>
        <label>
          Product name
          <input value={brief.productName} onChange={updateField("productName")} />
        </label>
        <label>
          Audience
          <input value={brief.audience} onChange={updateField("audience")} />
        </label>
        <label>
          Creative tone
          <input value={brief.tone} onChange={updateField("tone")} />
        </label>
        <label>
          Visual style
          <select value={brief.style} onChange={updateField("style")}>
            <option value="fast desk demo">Fast desk demo</option>
            <option value="premium product closeups">Premium product closeups</option>
            <option value="ugc problem solution">UGC problem solution</option>
          </select>
        </label>
        <label>
          Target duration
          <select
            value={String(brief.targetDurationSeconds)}
            onChange={updateField("targetDurationSeconds")}
          >
            <option value="12">12 seconds</option>
            <option value="15">15 seconds</option>
          </select>
        </label>
        <label className="wide-field">
          Selling points
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
          Create project
        </Button>
        <div className="load-project">
          <label>
            Existing project ID
            <input
              value={projectIdToLoad}
              onChange={(event) => onProjectIdToLoadChange(event.target.value)}
              placeholder="Paste a project ID"
            />
          </label>
          <Button
            disabled={!projectIdToLoad.trim() || isLoading}
            icon={<FolderOpen size={18} />}
            onClick={onLoadProject}
          >
            Load
          </Button>
        </div>
      </div>

      {project ? (
        <dl className="meta-list">
          <div>
            <dt>Project ID</dt>
            <dd>{project.id}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{project.status}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
};
