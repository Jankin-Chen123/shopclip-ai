import type { RenderTask, TraceEvent } from "@shopclip/shared";
import { Download, Loader2, Play, RotateCw } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import type { ExportResult } from "../../lib/api";

interface RenderPanelProps {
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
        <p className="eyebrow">Step 05</p>
        <h2 id="trace-title">Render trace</h2>
      </div>
      <StatusPill tone={statusTone(renderTask?.status)}>
        {renderTask?.status ?? "Waiting"}
      </StatusPill>
    </div>

    <div className="render-actions">
      <Button
        disabled={disabled || isRendering}
        icon={isRendering ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
        onClick={onStartRender}
        variant="primary"
      >
        Start render
      </Button>
      <Button
        disabled={!renderTask || isRendering}
        icon={<RotateCw size={18} />}
        onClick={onRefreshRender}
      >
        Refresh trace
      </Button>
    </div>

    <div className="progress-shell" aria-label="Render progress">
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
          <strong>No trace yet</strong>
          <span>
            Start render after storyboard generation to see queue, validation, and preview events.
          </span>
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
        <p className="eyebrow">Step 06</p>
        <h2 id="export-title">Preview and export</h2>
      </div>
      <div className="preview-box">
        {renderTask?.previewUrl ? (
          <>
            <strong>Preview artifact</strong>
            <span>{renderTask.previewUrl}</span>
          </>
        ) : (
          <>
            <strong>Preview unavailable</strong>
            <span>Completed render output will appear here.</span>
          </>
        )}
      </div>
      <Button
        disabled={!renderTask || renderTask.status !== "completed" || isExporting}
        icon={isExporting ? <Loader2 className="spin" size={18} /> : <Download size={18} />}
        onClick={onExport}
      >
        Export demo video
      </Button>
      {exportResult ? (
        <p className="fallback-note">
          Export ready: <a href={exportResult.downloadUrl}>{exportResult.downloadUrl}</a>
        </p>
      ) : null}
    </div>
  </section>
);
