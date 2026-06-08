import {
  Check,
  Copy,
  Film,
  Plus,
  RotateCcw,
  RotateCw,
  Scissors,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import type { AppCopy } from "../../app/i18n";
import { Button } from "../../components/ui/Button";
import { formatTimelineTime } from "./SmartEditTimelineMath";
import type {
  SmartEditCommandHistory,
  SmartEditTimelineEditMode,
  TimelinePreviewRangeState,
} from "./SmartEditTimelineOperations";

export interface SmartEditTimelineToolbarState {
  boundedPlayheadSeconds: number;
  commandHistory: SmartEditCommandHistory;
  commandHistoryLabel: (label: string) => string;
  hasMaterializableSegments: boolean;
  hasPlan: boolean;
  hasSelectedEditableMaterials: boolean;
  hasSmartEditClipboard: boolean;
  normalizedPreviewRange?: { endSecond: number; startSecond: number };
  previewRange: TimelinePreviewRangeState;
  previewRangeLabel: string;
  previewRangeLoopEnabled: boolean;
  timelineDurationSeconds: number;
  timelineEditMode: SmartEditTimelineEditMode;
}

export interface SmartEditTimelineToolbarActions {
  addTextElementAtPlayhead: () => void;
  addVoiceElementAtPlayhead: () => void;
  alignSelectedTimelineMaterialsToPlayhead: (edge: "start" | "end") => void;
  clearPreviewRange: () => void;
  closeGapAtPlayhead: () => void;
  cutTimelineMaterialsInPreviewRange: () => void;
  jumpPlayheadToEditPoint: (direction: "previous" | "next") => void;
  materializeRenderedScenes: () => void;
  pasteClipboardAtPlayhead: () => void;
  redoPlanChange: () => void;
  selectTrackClipsAtPlayhead: () => void;
  selectTrackClipsInPreviewRange: () => void;
  setPlayheadAndSeekPreview: (second: number) => void;
  setPreviewRangeLoopEnabled: (update: (current: boolean) => boolean) => void;
  setPreviewRangePoint: (point: "in" | "out") => void;
  setTimelineEditMode: (mode: SmartEditTimelineEditMode) => void;
  setTimelineZoom: (update: (current: number) => number) => void;
  splitAtPlayhead: () => void;
  trimAtPlayhead: (side: "left" | "right") => void;
  undoPlanChange: () => void;
}

interface SmartEditTimelineToolbarProps {
  actions: SmartEditTimelineToolbarActions;
  copy: AppCopy["smartEdit"];
  state: SmartEditTimelineToolbarState;
}

const smartEditTimelineEditModes: SmartEditTimelineEditMode[] = [
  "magnetic",
  "insert",
  "overwrite",
  "ripple",
];

export const SmartEditTimelineToolbar = ({
  actions,
  copy,
  state,
}: SmartEditTimelineToolbarProps) => {
  const {
    boundedPlayheadSeconds,
    commandHistory,
    commandHistoryLabel,
    hasMaterializableSegments,
    hasPlan,
    hasSelectedEditableMaterials,
    hasSmartEditClipboard,
    normalizedPreviewRange,
    previewRange,
    previewRangeLabel,
    previewRangeLoopEnabled,
    timelineDurationSeconds,
    timelineEditMode,
  } = state;
  const {
    addTextElementAtPlayhead,
    addVoiceElementAtPlayhead,
    alignSelectedTimelineMaterialsToPlayhead,
    clearPreviewRange,
    closeGapAtPlayhead,
    cutTimelineMaterialsInPreviewRange,
    jumpPlayheadToEditPoint,
    materializeRenderedScenes,
    pasteClipboardAtPlayhead,
    redoPlanChange,
    selectTrackClipsAtPlayhead,
    selectTrackClipsInPreviewRange,
    setPlayheadAndSeekPreview,
    setPreviewRangeLoopEnabled,
    setPreviewRangePoint,
    setTimelineEditMode,
    setTimelineZoom,
    splitAtPlayhead,
    trimAtPlayhead,
    undoPlanChange,
  } = actions;

  return <div className="timeline-toolbar" aria-label={copy.timelineControls}>
    <Button
      disabled={commandHistory.undoStack.length === 0}
      icon={<RotateCcw size={16} />}
      onClick={undoPlanChange}
    >
      {commandHistory.undoLabel(copy.undo, commandHistoryLabel)}
    </Button>
    <Button
      disabled={commandHistory.redoStack.length === 0}
      icon={<RotateCw size={16} />}
      onClick={redoPlanChange}
    >
      {commandHistory.redoLabel(copy.redo, commandHistoryLabel)}
    </Button>
    <div className="timeline-edit-mode-toggle" aria-label={copy.editMode}>
      {smartEditTimelineEditModes.map((mode) => (
        <button
          aria-pressed={timelineEditMode === mode}
          className={timelineEditMode === mode ? "active" : ""}
          key={mode}
          type="button"
          onClick={() => setTimelineEditMode(mode)}
        >
          {copy.editModes[mode]}
        </button>
      ))}
    </div>
    <Button
      icon={<ZoomOut size={16} />}
      onClick={() =>
        setTimelineZoom((current) => Math.max(0.5, Number((current - 0.25).toFixed(2))))
      }
    >
      {copy.zoomOut}
    </Button>
    <label>
      {copy.playhead}
      <input
        max={timelineDurationSeconds}
        min={0}
        step={0.1}
        type="range"
        value={boundedPlayheadSeconds}
        onChange={(event) => setPlayheadAndSeekPreview(Number(event.target.value))}
      />
    </label>
    <strong>{formatTimelineTime(boundedPlayheadSeconds)}</strong>
    <Button disabled={!hasPlan} onClick={() => setPreviewRangePoint("in")}>
      {copy.setPreviewIn}
    </Button>
    <Button disabled={!hasPlan} onClick={() => setPreviewRangePoint("out")}>
      {copy.setPreviewOut}
    </Button>
    <span className="timeline-range-label">
      {copy.previewRange}: <strong>{previewRangeLabel}</strong>
    </span>
    <Button
      disabled={!normalizedPreviewRange}
      onClick={() => setPreviewRangeLoopEnabled((current) => !current)}
      variant={previewRangeLoopEnabled ? "primary" : "secondary"}
    >
      {previewRangeLoopEnabled ? copy.loopPreviewRangeOn : copy.loopPreviewRange}
    </Button>
    <Button
      disabled={!normalizedPreviewRange}
      icon={<Check size={16} />}
      onClick={selectTrackClipsInPreviewRange}
    >
      {copy.selectPreviewRange}
    </Button>
    <Button
      disabled={!normalizedPreviewRange}
      icon={<Scissors size={16} />}
      onClick={cutTimelineMaterialsInPreviewRange}
    >
      {copy.cutPreviewRange}
    </Button>
    <Button
      disabled={previewRange.inSecond === undefined && previewRange.outSecond === undefined}
      onClick={clearPreviewRange}
    >
      {copy.clearPreviewRange}
    </Button>
    <Button disabled={!hasPlan} icon={<Check size={16} />} onClick={selectTrackClipsAtPlayhead}>
      {copy.selectAtPlayhead}
    </Button>
    <Button
      disabled={!hasPlan || !hasSelectedEditableMaterials}
      icon={<SkipBack size={16} />}
      onClick={() => alignSelectedTimelineMaterialsToPlayhead("start")}
    >
      {copy.alignStartToPlayhead}
    </Button>
    <Button
      disabled={!hasPlan || !hasSelectedEditableMaterials}
      icon={<SkipForward size={16} />}
      onClick={() => alignSelectedTimelineMaterialsToPlayhead("end")}
    >
      {copy.alignEndToPlayhead}
    </Button>
    <Button disabled={!hasPlan} icon={<SkipBack size={16} />} onClick={() => jumpPlayheadToEditPoint("previous")}>
      {copy.previousEditPoint}
    </Button>
    <Button disabled={!hasPlan} icon={<SkipForward size={16} />} onClick={() => jumpPlayheadToEditPoint("next")}>
      {copy.nextEditPoint}
    </Button>
    <Button disabled={!hasPlan} icon={<Scissors size={16} />} onClick={splitAtPlayhead}>
      {copy.splitAtPlayhead}
    </Button>
    <Button disabled={!hasPlan} icon={<Scissors size={16} />} onClick={() => trimAtPlayhead("right")}>
      {copy.trimLeftAtPlayhead}
    </Button>
    <Button disabled={!hasPlan} icon={<Scissors size={16} />} onClick={() => trimAtPlayhead("left")}>
      {copy.trimRightAtPlayhead}
    </Button>
    <Button disabled={!hasPlan} icon={<SkipBack size={16} />} onClick={closeGapAtPlayhead}>
      {copy.closeGapAtPlayhead}
    </Button>
    <Button disabled={!hasPlan} icon={<Plus size={16} />} onClick={addVoiceElementAtPlayhead}>
      {copy.addVoiceClip}
    </Button>
    <Button disabled={!hasPlan} icon={<Plus size={16} />} onClick={addTextElementAtPlayhead}>
      {copy.addTextClip}
    </Button>
    <Button
      disabled={!hasPlan || !hasMaterializableSegments}
      icon={<Film size={16} />}
      onClick={materializeRenderedScenes}
    >
      {copy.materializeRenderedScenes}
    </Button>
    <Button disabled={!hasSmartEditClipboard} icon={<Copy size={16} />} onClick={pasteClipboardAtPlayhead}>
      {copy.pasteClipboardAtPlayhead}
    </Button>
    <Button
      icon={<ZoomIn size={16} />}
      onClick={() =>
        setTimelineZoom((current) => Math.min(3, Number((current + 0.25).toFixed(2))))
      }
    >
      {copy.zoomIn}
    </Button>
  </div>;
};
