import type { RefObject } from "react";
import type {
  SmartEditResult,
  SmartEditSegment,
} from "@shopclip/shared";
import {
  Maximize2,
  SkipForward,
} from "lucide-react";

import type { AppCopy } from "../../app/i18n";
import { formatTimelineTime } from "./SmartEditTimelineMath";

type SmartEditPreviewMedia = {
  kind: "image" | "video";
  label: string;
  url: string;
};

type SmartEditPreviewTransform = {
  offsetXPercent: number;
  offsetYPercent: number;
  opacity: number;
  rotateDegrees: number;
  scale: number;
};

type SmartEditNormalizedPreviewRange = {
  endSecond: number;
  startSecond: number;
};

interface SmartEditPreviewPaneProps {
  boundedPlayheadSeconds: number;
  copy: AppCopy["smartEdit"];
  normalizedPreviewRange?: SmartEditNormalizedPreviewRange;
  nudgeSelectedTransform: (delta: { offsetXPercent?: number; offsetYPercent?: number }) => void;
  previewRangeLoopEnabled: boolean;
  previewRef: RefObject<HTMLVideoElement | null>;
  result?: SmartEditResult;
  selectedPreviewMedia?: SmartEditPreviewMedia;
  selectedSegment?: SmartEditSegment;
  selectedSegmentLabel: string;
  selectedTransform?: SmartEditPreviewTransform;
  setPlayheadFromPreviewTime: (seconds: number) => void;
  setPreviewCurrentTime: (seconds: number) => void;
  timelineDurationSeconds: number;
  togglePreviewPlayback: () => boolean;
}

export const SmartEditPreviewPane = ({
  boundedPlayheadSeconds,
  copy,
  normalizedPreviewRange,
  nudgeSelectedTransform,
  previewRangeLoopEnabled,
  previewRef,
  result,
  selectedPreviewMedia,
  selectedSegment,
  selectedSegmentLabel,
  selectedTransform,
  setPlayheadFromPreviewTime,
  setPreviewCurrentTime,
  timelineDurationSeconds,
  togglePreviewPlayback,
}: SmartEditPreviewPaneProps) => (
  <div className="smart-edit-preview">
    <h3>{copy.previewTitle}</h3>
    {result?.previewUrl ? (
      <video
        controls
        playsInline
        preload="metadata"
        ref={previewRef}
        src={result.previewUrl}
        tabIndex={0}
        onLoadedMetadata={() => setPreviewCurrentTime(boundedPlayheadSeconds)}
        onSeeked={(event) => {
          setPlayheadFromPreviewTime(event.currentTarget.currentTime);
        }}
        onTimeUpdate={(event) => {
          const currentTime = event.currentTarget.currentTime;
          if (
            previewRangeLoopEnabled &&
            normalizedPreviewRange &&
            currentTime >= normalizedPreviewRange.endSecond - 0.025
          ) {
            event.currentTarget.currentTime = normalizedPreviewRange.startSecond;
            setPlayheadFromPreviewTime(normalizedPreviewRange.startSecond);
            return;
          }
          setPlayheadFromPreviewTime(currentTime);
        }}
        onKeyDown={(event) => {
          if (event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            togglePreviewPlayback();
          }
        }}
      >
        <a href={result.previewUrl}>{result.previewUrl}</a>
      </video>
    ) : (
      <div className="empty-state compact">
        <strong>{copy.emptyTitle}</strong>
        <span>{copy.noPreview}</span>
      </div>
    )}
    {selectedSegment && selectedTransform ? (
      <div
        aria-label="Preview transform handles"
        className="smart-edit-preview-transform-overlay"
        style={{
          opacity: selectedTransform.opacity,
          transform: `translate(${selectedTransform.offsetXPercent}%, ${selectedTransform.offsetYPercent}%) rotate(${selectedTransform.rotateDegrees}deg) scale(${selectedTransform.scale})`,
        }}
      >
        <button
          aria-label="Move selected clip up"
          className="top"
          type="button"
          onClick={() => nudgeSelectedTransform({ offsetYPercent: -5 })}
        />
        <button
          aria-label="Move selected clip right"
          className="right"
          type="button"
          onClick={() => nudgeSelectedTransform({ offsetXPercent: 5 })}
        />
        <button
          aria-label="Move selected clip down"
          className="bottom"
          type="button"
          onClick={() => nudgeSelectedTransform({ offsetYPercent: 5 })}
        />
        <button
          aria-label="Move selected clip left"
          className="left"
          type="button"
          onClick={() => nudgeSelectedTransform({ offsetXPercent: -5 })}
        />
        <span>{selectedSegmentLabel}</span>
      </div>
    ) : null}
    <div className="smart-edit-opencut-preview-controls" aria-label="Preview controls">
      <code>{formatTimelineTime(boundedPlayheadSeconds)}</code>
      <span>/</span>
      <code>{formatTimelineTime(timelineDurationSeconds)}</code>
      <button type="button" onClick={togglePreviewPlayback} aria-label="Play preview">
        <SkipForward size={16} aria-hidden="true" />
      </button>
      <button type="button" aria-label="Fit preview">
        Fit
      </button>
      <button type="button" aria-label="Fullscreen preview">
        <Maximize2 size={16} aria-hidden="true" />
      </button>
    </div>
    <small>{copy.reused}</small>
    <div className="smart-edit-live-preview" aria-label={copy.segmentPreview}>
      <h4>{copy.segmentPreview}</h4>
      {selectedSegment && selectedPreviewMedia ? (
        <div className="smart-edit-live-frame">
          {selectedPreviewMedia.kind === "video" ? (
            <video
              aria-label={selectedPreviewMedia.label}
              controls
              muted
              playsInline
              preload="metadata"
              src={selectedPreviewMedia.url}
            />
          ) : (
            <img alt={selectedPreviewMedia.label} src={selectedPreviewMedia.url} />
          )}
          <p>{selectedSegment.subtitle}</p>
        </div>
      ) : (
        <div className="empty-state compact">
          <strong>{copy.emptyTitle}</strong>
          <span>{copy.noSegmentPreview}</span>
        </div>
      )}
    </div>
  </div>
);
