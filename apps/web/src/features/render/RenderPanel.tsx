import type {
  MediaSettings,
  RenderTask,
  TraceEvent,
  VideoGenerationSettings,
} from "@shopclip/shared";
import { Download, Loader2, Play, RotateCw, Volume2 } from "lucide-react";

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
  mediaSettings: MediaSettings;
  videoSettings: VideoGenerationSettings;
  onForceFailureChange: (enabled: boolean) => void;
  onExport: () => void;
  onMediaSettingsChange: (settings: MediaSettings) => void;
  onVideoSettingsChange: (settings: VideoGenerationSettings) => void;
  onRefreshRender: () => void;
  onRetryRender: () => void;
  onStartRender: () => void;
  forceRenderFailure: boolean;
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

export const defaultVideoSettings: VideoGenerationSettings = {
  ratio: "9:16",
  resolution: "720p",
  generateAudio: false,
  watermark: false,
};

const seedFromInput = (value: string) => {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const playableSceneClips = (renderTask: RenderTask | undefined) =>
  renderTask?.sceneClips?.filter((clip) => clip.videoUrl) ?? [];

export const RenderPanel = ({
  copy,
  disabled,
  error,
  exportResult,
  forceRenderFailure,
  isExporting,
  isRendering,
  mediaSettings,
  videoSettings,
  onForceFailureChange,
  onExport,
  onMediaSettingsChange,
  onVideoSettingsChange,
  onRefreshRender,
  onRetryRender,
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

    <div className="media-controls" aria-label={copy.mediaControls}>
      <h3 className="media-controls-title">{copy.postProductionSettings}</h3>
      <label>
        {copy.ttsVoice}
        <select
          value={mediaSettings.ttsVoice}
          onChange={(event) =>
            onMediaSettingsChange({
              ...mediaSettings,
              ttsVoice: event.target.value as MediaSettings["ttsVoice"],
            })
          }
        >
          <option value="clear-host">{copy.voices.clearHost}</option>
          <option value="warm-creator">{copy.voices.warmCreator}</option>
          <option value="energetic-seller">{copy.voices.energeticSeller}</option>
        </select>
      </label>
      <label>
        {copy.subtitleStyle}
        <select
          value={mediaSettings.subtitleStyle}
          onChange={(event) =>
            onMediaSettingsChange({
              ...mediaSettings,
              subtitleStyle: event.target.value as MediaSettings["subtitleStyle"],
            })
          }
        >
          <option value="clean-lower-third">{copy.subtitleStyles.cleanLowerThird}</option>
          <option value="high-contrast">{copy.subtitleStyles.highContrast}</option>
          <option value="creator-caption">{copy.subtitleStyles.creatorCaption}</option>
        </select>
      </label>
      <label>
        {copy.bgmTrack}
        <select
          value={mediaSettings.bgmTrack}
          onChange={(event) =>
            onMediaSettingsChange({
              ...mediaSettings,
              bgmTrack: event.target.value as MediaSettings["bgmTrack"],
            })
          }
        >
          <option value="none">{copy.bgmTracks.none}</option>
          <option value="creator-pop">{copy.bgmTracks.creatorPop}</option>
          <option value="soft-lift">{copy.bgmTracks.softLift}</option>
          <option value="tech-pulse">{copy.bgmTracks.techPulse}</option>
        </select>
      </label>
      <label className="toggle-row">
        <input
          checked={mediaSettings.subtitlesEnabled}
          type="checkbox"
          onChange={(event) =>
            onMediaSettingsChange({
              ...mediaSettings,
              subtitlesEnabled: event.target.checked,
            })
          }
        />
        {copy.subtitlesEnabled}
      </label>
      <label className="toggle-row">
        <input
          checked={forceRenderFailure}
          type="checkbox"
          onChange={(event) => onForceFailureChange(event.target.checked)}
        />
        {copy.simulateFailure}
      </label>
      <h3 className="media-controls-title">{copy.videoGenerationSettings}</h3>
      <label>
        {copy.aspectRatio}
        <select
          value={videoSettings.ratio}
          onChange={(event) =>
            onVideoSettingsChange({
              ...videoSettings,
              ratio: event.target.value as VideoGenerationSettings["ratio"],
            })
          }
        >
          <option value="9:16">{copy.aspectRatios.vertical}</option>
          <option value="16:9">{copy.aspectRatios.landscape}</option>
          <option value="1:1">{copy.aspectRatios.square}</option>
          <option value="4:3">{copy.aspectRatios.standard}</option>
          <option value="3:4">{copy.aspectRatios.portrait}</option>
          <option value="21:9">{copy.aspectRatios.wide}</option>
        </select>
      </label>
      <label>
        {copy.resolution}
        <select
          value={videoSettings.resolution}
          onChange={(event) =>
            onVideoSettingsChange({
              ...videoSettings,
              resolution: event.target.value as VideoGenerationSettings["resolution"],
            })
          }
        >
          <option value="480p">480p</option>
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
        </select>
      </label>
      <label>
        {copy.seed}
        <input
          inputMode="numeric"
          min={-1}
          max={2_147_483_647}
          placeholder={copy.seedPlaceholder}
          type="number"
          value={videoSettings.seed ?? ""}
          onChange={(event) =>
            onVideoSettingsChange({
              ...videoSettings,
              seed: seedFromInput(event.target.value),
            })
          }
        />
      </label>
      <label className="toggle-row">
        <input
          checked={videoSettings.generateAudio}
          type="checkbox"
          onChange={(event) =>
            onVideoSettingsChange({
              ...videoSettings,
              generateAudio: event.target.checked,
            })
          }
        />
        {copy.generateAudio}
      </label>
      <label className="toggle-row">
        <input
          checked={videoSettings.watermark}
          type="checkbox"
          onChange={(event) =>
            onVideoSettingsChange({
              ...videoSettings,
              watermark: event.target.checked,
            })
          }
        />
        {copy.watermark}
      </label>
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
      <Button
        disabled={renderTask?.status !== "failed" || isRendering}
        icon={<RotateCw size={18} />}
        onClick={onRetryRender}
        variant="danger"
      >
        {copy.retryRender}
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
        {playableSceneClips(renderTask).length > 0 ? (
          <>
            <strong>{copy.clipPreviewTitle}</strong>
            <div className="scene-clip-grid">
              {playableSceneClips(renderTask).map((clip) => (
                <article className="scene-clip-card" key={clip.sceneId}>
                  <video
                    controls
                    playsInline
                    preload="metadata"
                    poster={clip.coverUrl && clip.coverUrl !== clip.videoUrl ? clip.coverUrl : undefined}
                    src={clip.videoUrl}
                  >
                    <a href={clip.videoUrl}>{clip.videoUrl}</a>
                  </video>
                  <div>
                    <strong>
                      {clip.order}. {clip.subtitle}
                    </strong>
                    <span>{clip.videoUrl}</span>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : renderTask?.previewUrl ? (
          <>
            <strong>{copy.previewArtifact}</strong>
            <span>{renderTask.previewUrl}</span>
            {renderTask.mediaSettings ? (
              <small className="media-summary">
                <Volume2 size={14} aria-hidden="true" />
                {copy.mediaSummary(
                  renderTask.mediaSettings.ttsVoice,
                  renderTask.mediaSettings.subtitlesEnabled
                    ? renderTask.mediaSettings.subtitleStyle
                    : "off",
                  renderTask.mediaSettings.bgmTrack,
                )}
              </small>
            ) : null}
          </>
        ) : (
          <>
            <strong>{copy.previewUnavailable}</strong>
            <span>
              {renderTask?.sceneClips?.some((clip) => clip.status === "running")
                ? copy.clipPreviewFallback
                : copy.previewUnavailableBody}
            </span>
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
