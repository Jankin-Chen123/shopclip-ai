import type { SmartEditSegment } from "@shopclip/shared";
import {
  Copy,
  Scissors,
  SkipBack,
  SkipForward,
  Trash2,
} from "lucide-react";

import type { AppCopy } from "../../app/i18n";
import { Button } from "../../components/ui/Button";
import { TRIM_NUDGE_SECONDS } from "./SmartEditTimelineMath";
import type {
  SmartEditTimelineElementPatch,
  SmartEditTrackSegment,
} from "./SmartEditTimelineOperations";

interface SmartEditTimelineBatchToolbarProps {
  addSelectedTimelineMaterialAudioKeyframes: () => void;
  alignSelectedTimelineMaterialsToPlayhead: (edge: "start" | "end") => void;
  clearMultiSelection: () => void;
  copy: AppCopy["smartEdit"];
  copySelectedSegmentsToLocalClipboard: () => void;
  cutSelectedTimelineMaterialsToLocalClipboard: () => void;
  duplicateSelectedSegments: () => void;
  duplicateSelectedTimelineMaterials: () => void;
  hasSelectedTextTimelineMaterials: boolean;
  mergeSelectedTimelineTextMaterials: () => void;
  moveSelectedTrackClips: (deltaSeconds: number) => void;
  pasteSelectedSegmentsAtPlayhead: () => void;
  removeSelectedTrackClip: () => void;
  removeSegments: (segmentIds: string[]) => void;
  selectAllSegments: () => void;
  selectedBatchSegments: SmartEditSegment[];
  selectedBatchTrackClips: SmartEditTrackSegment[];
  selectedSegmentIds: string[];
  selectedTextTimelineMaterialCount: number;
  slipSelectedTimelineMaterialsSource: (deltaSeconds: number) => void;
  sortedSegmentsCount: number;
  updateSelectedSegments: (update: (segment: SmartEditSegment) => SmartEditSegment) => void;
  updateSelectedTimelineMaterialAudio: (patch: SmartEditTimelineElementPatch, label: string) => void;
  updateSelectedTimelineMaterialSpeed: (playbackRate: number) => void;
  updateSelectedTimelineMaterialState: (patch: SmartEditTimelineElementPatch) => void;
  updateSelectedTimelineMaterialTextStyle: (patch: SmartEditTimelineElementPatch, label: string) => void;
}

export const SmartEditTimelineBatchToolbar = ({
  addSelectedTimelineMaterialAudioKeyframes,
  alignSelectedTimelineMaterialsToPlayhead,
  clearMultiSelection,
  copy,
  copySelectedSegmentsToLocalClipboard,
  cutSelectedTimelineMaterialsToLocalClipboard,
  duplicateSelectedSegments,
  duplicateSelectedTimelineMaterials,
  hasSelectedTextTimelineMaterials,
  mergeSelectedTimelineTextMaterials,
  moveSelectedTrackClips,
  pasteSelectedSegmentsAtPlayhead,
  removeSelectedTrackClip,
  removeSegments,
  selectAllSegments,
  selectedBatchSegments,
  selectedBatchTrackClips,
  selectedSegmentIds,
  selectedTextTimelineMaterialCount,
  slipSelectedTimelineMaterialsSource,
  sortedSegmentsCount,
  updateSelectedSegments,
  updateSelectedTimelineMaterialAudio,
  updateSelectedTimelineMaterialSpeed,
  updateSelectedTimelineMaterialState,
  updateSelectedTimelineMaterialTextStyle,
}: SmartEditTimelineBatchToolbarProps) => {
  if (selectedBatchTrackClips.length > 1) {
    return (
      <div className="timeline-batch-toolbar" aria-label={copy.batchActions}>
        <strong>{copy.selectedCount(selectedBatchTrackClips.length)}</strong>
        <Button
          icon={<SkipBack size={16} />}
          onClick={() => moveSelectedTrackClips(-TRIM_NUDGE_SECONDS)}
        >
          -0.1s
        </Button>
        <Button
          icon={<SkipForward size={16} />}
          onClick={() => moveSelectedTrackClips(TRIM_NUDGE_SECONDS)}
        >
          +0.1s
        </Button>
        <Button icon={<SkipBack size={16} />} onClick={() => alignSelectedTimelineMaterialsToPlayhead("start")}>
          {copy.alignStartToPlayhead}
        </Button>
        <Button icon={<SkipForward size={16} />} onClick={() => alignSelectedTimelineMaterialsToPlayhead("end")}>
          {copy.alignEndToPlayhead}
        </Button>
        <Button icon={<Copy size={16} />} onClick={copySelectedSegmentsToLocalClipboard}>
          {copy.copySelected}
        </Button>
        <Button icon={<Scissors size={16} />} onClick={cutSelectedTimelineMaterialsToLocalClipboard}>
          {copy.cutSelected}
        </Button>
        <Button icon={<Copy size={16} />} onClick={duplicateSelectedTimelineMaterials}>
          {copy.duplicateSelected}
        </Button>
        <Button onClick={() => updateSelectedTimelineMaterialSpeed(0.5)}>0.5x</Button>
        <Button onClick={() => updateSelectedTimelineMaterialSpeed(1)}>1x</Button>
        <Button onClick={() => updateSelectedTimelineMaterialSpeed(2)}>2x</Button>
        <Button icon={<SkipBack size={16} />} onClick={() => slipSelectedTimelineMaterialsSource(-TRIM_NUDGE_SECONDS)}>
          {copy.slipSourceBackward}
        </Button>
        <Button icon={<SkipForward size={16} />} onClick={() => slipSelectedTimelineMaterialsSource(TRIM_NUDGE_SECONDS)}>
          {copy.slipSourceForward}
        </Button>
        {hasSelectedTextTimelineMaterials ? (
          <>
            <Button
              disabled={selectedTextTimelineMaterialCount < 2}
              onClick={mergeSelectedTimelineTextMaterials}
            >
              {copy.mergeTextClips}
            </Button>
            <Button
              onClick={() =>
                updateSelectedTimelineMaterialTextStyle(
                  {
                    textColor: "#ffffff",
                    textFontSize: 42,
                    textPositionYPercent: 82,
                  },
                  "Set selected text style bottom white",
                )
              }
            >
              {copy.bottomWhiteTextStyle}
            </Button>
            <Button
              onClick={() =>
                updateSelectedTimelineMaterialTextStyle(
                  {
                    textColor: "#facc15",
                    textFontSize: 44,
                    textPositionYPercent: 82,
                  },
                  "Set selected text style highlight",
                )
              }
            >
              {copy.highlightTextStyle}
            </Button>
            <Button
              onClick={() =>
                updateSelectedTimelineMaterialTextStyle(
                  {
                    textColor: "#ffffff",
                    textFontSize: 36,
                    textPositionYPercent: 18,
                  },
                  "Set selected text style top note",
                )
              }
            >
              {copy.topNoteTextStyle}
            </Button>
          </>
        ) : null}
        <Button onClick={() => updateSelectedTimelineMaterialAudio({ audioVolume: 0.5 }, "Set selected audio volume 50%")}>
          {copy.audioVolume50}
        </Button>
        <Button onClick={() => updateSelectedTimelineMaterialAudio({ audioVolume: 1 }, "Set selected audio volume 100%")}>
          {copy.audioVolume100}
        </Button>
        <Button onClick={() => updateSelectedTimelineMaterialAudio({ audioVolume: 1.5 }, "Set selected audio volume 150%")}>
          {copy.audioVolume150}
        </Button>
        <Button onClick={() => updateSelectedTimelineMaterialAudio({ audioFadeInSeconds: 0.3 }, "Set selected audio fade in")}>
          {copy.audioFadeInQuick}
        </Button>
        <Button onClick={() => updateSelectedTimelineMaterialAudio({ audioFadeOutSeconds: 0.3 }, "Set selected audio fade out")}>
          {copy.audioFadeOutQuick}
        </Button>
        <Button onClick={addSelectedTimelineMaterialAudioKeyframes}>
          {copy.addAudioKeyframe}
        </Button>
        <Button onClick={() => updateSelectedTimelineMaterialState({ muted: true })}>
          {copy.muteSelected}
        </Button>
        <Button onClick={() => updateSelectedTimelineMaterialState({ muted: false })}>
          {copy.unmuteSelected}
        </Button>
        <Button onClick={() => updateSelectedTimelineMaterialState({ hidden: true })}>
          {copy.hideSelectedMaterials}
        </Button>
        <Button onClick={() => updateSelectedTimelineMaterialState({ hidden: false })}>
          {copy.showSelectedMaterials}
        </Button>
        <Button icon={<Trash2 size={16} />} onClick={removeSelectedTrackClip}>
          {copy.deleteSelected}
        </Button>
        <Button onClick={clearMultiSelection}>{copy.clearSelection}</Button>
      </div>
    );
  }

  if (selectedBatchSegments.length > 1) {
    return (
      <div className="timeline-batch-toolbar" aria-label={copy.batchActions}>
        <strong>{copy.selectedCount(selectedBatchSegments.length)}</strong>
        <Button onClick={() => updateSelectedSegments((segment) => ({ ...segment, enabled: true }))}>
          {copy.enableSelected}
        </Button>
        <Button onClick={() => updateSelectedSegments((segment) => ({ ...segment, enabled: false }))}>
          {copy.disableSelected}
        </Button>
        <Button onClick={() => updateSelectedSegments((segment) => ({ ...segment, sourceAudioMuted: true }))}>
          {copy.muteSelected}
        </Button>
        <Button onClick={() => updateSelectedSegments((segment) => ({ ...segment, sourceAudioMuted: false }))}>
          {copy.unmuteSelected}
        </Button>
        <Button onClick={() => updateSelectedSegments((segment) => ({ ...segment, captionHidden: true }))}>
          {copy.hideCaptionsSelected}
        </Button>
        <Button onClick={() => updateSelectedSegments((segment) => ({ ...segment, captionHidden: false }))}>
          {copy.showCaptionsSelected}
        </Button>
        <Button icon={<Copy size={16} />} onClick={copySelectedSegmentsToLocalClipboard}>
          {copy.copySelected}
        </Button>
        <Button icon={<Copy size={16} />} onClick={duplicateSelectedSegments}>
          {copy.duplicateSelected}
        </Button>
        <Button icon={<Copy size={16} />} onClick={pasteSelectedSegmentsAtPlayhead}>
          {copy.pasteSelectedAtPlayhead}
        </Button>
        <Button
          disabled={selectedBatchSegments.length >= sortedSegmentsCount}
          icon={<Trash2 size={16} />}
          onClick={() => removeSegments(selectedSegmentIds)}
        >
          {copy.deleteSelected}
        </Button>
        <Button onClick={clearMultiSelection}>{copy.clearSelection}</Button>
      </div>
    );
  }

  return (
    <div className="timeline-selection-hint">
      <span>{copy.multiSelectHint}</span>
      <button type="button" onClick={selectAllSegments}>
        {copy.selectAll}
      </button>
    </div>
  );
};
