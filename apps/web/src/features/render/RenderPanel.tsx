import type { RenderTask, TraceEvent } from "@shopclip/shared";
import { Download, Loader2, Play, RotateCw } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import type { AppCopy } from "../../app/i18n";
import type { ExportResult } from "../../lib/api";

interface RenderPanelProps {
  copy: AppCopy["render"];
  disabled: boolean;
  error?: string;
  exportResult?: ExportResult;
  isExporting: boolean;
  isRendering: boolean;
  onExport: () => void;
  onRefreshRender: () => void;
  onStartRender: () => void;
  renderTask?: RenderTask;
  traceEvents: TraceEvent[];
}

const statusTone = (status?: string) => {
  if (status === "completed") {
    return "success";
  }
  if (status === "failed") {
    return "danger";
  }
  if (status === "running" || status === "queued" || status === "retrying") {
    return "info";
  }
  return "neutral";
};

export const RenderPanel = ({
  copy,
  disabled,
  error,
  exportResult,
  isExporting,
  isRendering,
  onExport,
  onRefreshRender,
  onStartRender,
  renderTask,
  traceEvents,
}: RenderPanelProps) => (
  <section className="panel render-panel" id="trace" aria-labelledby="trace-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{copy.step}</p>
          <h2 id="trace-title">{copy.title}</h2>
        </div>
        <StatusPill tone={statusTone(renderTask?.status)}>
          {renderTask?.status ?? copy.waiting}
      </StatusPill>
    </div>

    <div className="render-actions">
      <Button
        disabled={disabled || isRendering}
        icon={isRendering ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
        onClick={onStartRender}
        variant="primary"
      >
        {copy.startRender}
      </Button>
      <Button
        disabled={!renderTask || isRendering}
        icon={<RotateCw size={18} />}
        onClick={onRefreshRender}
      >
        {copy.refreshTrace}
      </Button>
    </div>

    <div className="progress-shell" aria-label={copy.progressLabel}>
      <span style={{ width: `${renderTask?.progress ?? 0}%` }} />
    </div>

    {error ? (
      <p className="inline-error" role="alert">
        {error}
      </p>
    ) : null}

    <ol className="trace-list">
      {traceEvents.length === 0 ? (
        <li className="empty-state">
          <strong>{copy.noTrace}</strong>
          <span>{copy.noTraceBody}</span>
        </li>
      ) : (
        traceEvents.map((event) => (
          <li key={event.id}>
            <StatusPill tone={statusTone(event.status)}>{event.status}</StatusPill>
            <div>
              <strong>{event.step}</strong>
              <span>{event.message}</span>
            </div>
          </li>
        ))
      )}
    </ol>

    <div className="preview-export" id="export" aria-labelledby="export-title">
      <div>
        <p className="eyebrow">{copy.exportStep}</p>
        <h2 id="export-title">{copy.exportTitle}</h2>
      </div>
      <div className="preview-box">
        {renderTask?.previewUrl ? (
          <>
            <strong>{copy.previewArtifact}</strong>
            <span>{renderTask.previewUrl}</span>
          </>
        ) : (
          <>
            <strong>{copy.previewUnavailable}</strong>
            <span>{copy.previewUnavailableBody}</span>
          </>
        )}
      </div>
      <Button
        disabled={!renderTask || renderTask.status !== "completed" || isExporting}
        icon={isExporting ? <Loader2 className="spin" size={18} /> : <Download size={18} />}
        onClick={onExport}
      >
        {copy.exportDemoVideo}
      </Button>
      {exportResult ? (
        <p className="fallback-note">
          {copy.exportReady} <a href={exportResult.downloadUrl}>{exportResult.downloadUrl}</a>
        </p>
      ) : null}
    </div>
  </section>
);
