import type {
  AssetMetadata,
  AssetSlice,
  SmartEditSegment,
  SmartEditTimelineElement,
  SmartEditVisualEffect,
} from "@shopclip/shared";

import type { AppCopy } from "../../app/i18n";
import type { SmartEditVisualEffectType } from "./SmartEditSegmentUtils";
import { SmartEditInspectorTabs } from "./SmartEditInspectorTabs";
import { SmartEditSelectedSegmentInspectorGroup } from "./SmartEditSelectedSegmentInspectorGroup";
import { SmartEditTimelineElementInspector } from "./SmartEditTimelineElementInspector";
import type {
  SmartEditTimelineElementPatch,
  SmartEditTrackSegment,
} from "./SmartEditTimelineOperations";
import { SmartEditTrackClipSegmentInspector } from "./SmartEditTrackClipSegmentInspector";
import type { SmartEditTrackId } from "./SmartEditTrackUtils";

interface SmartEditInspectorPanelProps {
  addSegmentAudioVolumeKeyframeAtPlayhead: (trackId: "sourceAudio" | "voice") => void;
  addTimelineElementAudioVolumeKeyframeAtPlayhead: () => void;
  addVisualEffectAmountKeyframe: (effectId: string) => void;
  addVisualEffectToSelectedSegment: (type: SmartEditVisualEffectType) => void;
  addVisualKeyframeAtPlayhead: () => void;
  assets: AssetMetadata[];
  canRelinkSelectedTimelineElement: boolean;
  copy: AppCopy["smartEdit"];
  copySelectedSegmentsToLocalClipboard: () => void;
  detachSelectedSceneVideo: () => void;
  detachSelectedSourceAudio: () => void;
  duplicateSelectedSegment: () => void;
  enableAdvancedVisualControls: boolean;
  hasPlan: boolean;
  linkedElementCount: number;
  minTimelineElementDurationSeconds: number;
  moveSelectedSegmentEarlier: () => void;
  moveSelectedSegmentLater: () => void;
  moveVisualEffectOnSelectedSegment: (effectId: string, direction: -1 | 1) => void;
  relinkSelectedTimelineElementGroup: () => void;
  removeSegmentAudioVolumeKeyframe: (
    trackId: "sourceAudio" | "voice",
    keyframeId: string,
  ) => void;
  removeSelectedSegment: () => void;
  removeSelectedTrackClip: () => void;
  removeTimelineElementAudioVolumeKeyframe: (keyframeId: string) => void;
  removeVisualEffectAmountKeyframe: (effectId: string, keyframeId: string) => void;
  removeVisualEffectFromSelectedSegment: (effectId: string) => void;
  removeVisualKeyframe: (keyframeId: string) => void;
  selectedBatchSegmentCount: number;
  selectedSegment?: SmartEditSegment;
  selectedSlices: AssetSlice[];
  selectedTimelineElement?: SmartEditTimelineElement;
  selectedTimelineTextLineCount: number;
  selectedTrackClip?: SmartEditTrackSegment;
  slipSelectedTimelineElementSource: (deltaSeconds: number) => void;
  sortedSegmentCount: number;
  splitSelectedSegment: () => void;
  splitSelectedTimelineTextMaterialByLines: () => void;
  trackLabels: Record<SmartEditTrackId, string>;
  unlinkSelectedTimelineElementGroup: () => void;
  updateSelectedSegment: (update: (segment: SmartEditSegment) => SmartEditSegment) => void;
  updateSelectedSegmentTimelineStart: (nextStartSecond: number) => void;
  updateSelectedTimelineElement: (patch: SmartEditTimelineElementPatch) => void;
  updateTrackClipSegment: (
    trackClip: SmartEditTrackSegment,
    update: (segment: SmartEditSegment) => SmartEditSegment,
  ) => void;
  updateVisualEffectOnSelectedSegment: (
    effectId: string,
    update: (effect: SmartEditVisualEffect) => SmartEditVisualEffect,
    label: string,
  ) => void;
}

export const SmartEditInspectorPanel = ({
  addSegmentAudioVolumeKeyframeAtPlayhead,
  addTimelineElementAudioVolumeKeyframeAtPlayhead,
  addVisualEffectAmountKeyframe,
  addVisualEffectToSelectedSegment,
  addVisualKeyframeAtPlayhead,
  assets,
  canRelinkSelectedTimelineElement,
  copy,
  copySelectedSegmentsToLocalClipboard,
  detachSelectedSceneVideo,
  detachSelectedSourceAudio,
  duplicateSelectedSegment,
  enableAdvancedVisualControls,
  hasPlan,
  linkedElementCount,
  minTimelineElementDurationSeconds,
  moveSelectedSegmentEarlier,
  moveSelectedSegmentLater,
  moveVisualEffectOnSelectedSegment,
  relinkSelectedTimelineElementGroup,
  removeSegmentAudioVolumeKeyframe,
  removeSelectedSegment,
  removeSelectedTrackClip,
  removeTimelineElementAudioVolumeKeyframe,
  removeVisualEffectAmountKeyframe,
  removeVisualEffectFromSelectedSegment,
  removeVisualKeyframe,
  selectedBatchSegmentCount,
  selectedSegment,
  selectedSlices,
  selectedTimelineElement,
  selectedTimelineTextLineCount,
  selectedTrackClip,
  slipSelectedTimelineElementSource,
  sortedSegmentCount,
  splitSelectedSegment,
  splitSelectedTimelineTextMaterialByLines,
  trackLabels,
  unlinkSelectedTimelineElementGroup,
  updateSelectedSegment,
  updateSelectedSegmentTimelineStart,
  updateSelectedTimelineElement,
  updateTrackClipSegment,
  updateVisualEffectOnSelectedSegment,
}: SmartEditInspectorPanelProps) => (
  <div className="smart-edit-inspector">
    <h3>{copy.inspector}</h3>
    <SmartEditInspectorTabs
      selectedBatchSegmentCount={selectedBatchSegmentCount}
      selectedSegment={selectedSegment}
      selectedTrackClip={selectedTrackClip}
    />
    {selectedTrackClip && selectedSegment && hasPlan ? (
      <SmartEditTrackClipSegmentInspector
        copy={copy}
        onAddAudioVolumeKeyframe={addSegmentAudioVolumeKeyframeAtPlayhead}
        onDetachSourceAudio={detachSelectedSourceAudio}
        onRemoveAudioVolumeKeyframe={removeSegmentAudioVolumeKeyframe}
        onUpdateSegment={(update) => updateTrackClipSegment(selectedTrackClip, update)}
        selectedSegment={selectedSegment}
        trackClip={selectedTrackClip}
        trackLabel={trackLabels[selectedTrackClip.trackId]}
      />
    ) : null}
    {selectedTrackClip && !selectedTrackClip.segmentId && selectedTimelineElement && hasPlan ? (
      <SmartEditTimelineElementInspector
        canRelinkElement={canRelinkSelectedTimelineElement}
        copy={copy}
        element={selectedTimelineElement}
        linkedElementCount={linkedElementCount}
        minDurationSeconds={minTimelineElementDurationSeconds}
        onAddAudioVolumeKeyframe={addTimelineElementAudioVolumeKeyframeAtPlayhead}
        onRelinkElementGroup={relinkSelectedTimelineElementGroup}
        onRemoveAudioVolumeKeyframe={removeTimelineElementAudioVolumeKeyframe}
        onRemoveTrackClip={removeSelectedTrackClip}
        onSlipSource={slipSelectedTimelineElementSource}
        onSplitTextByLines={splitSelectedTimelineTextMaterialByLines}
        onUnlinkElementGroup={unlinkSelectedTimelineElementGroup}
        onUpdateElement={updateSelectedTimelineElement}
        range={selectedTrackClip.range}
        textLineCount={selectedTimelineTextLineCount}
        trackLabel={trackLabels[selectedTrackClip.trackId]}
      />
    ) : null}
    {selectedSegment && hasPlan ? (
      <SmartEditSelectedSegmentInspectorGroup
        addSegmentAudioVolumeKeyframeAtPlayhead={addSegmentAudioVolumeKeyframeAtPlayhead}
        addVisualEffectAmountKeyframe={addVisualEffectAmountKeyframe}
        addVisualEffectToSelectedSegment={addVisualEffectToSelectedSegment}
        addVisualKeyframeAtPlayhead={addVisualKeyframeAtPlayhead}
        assets={assets}
        copy={copy}
        copySelectedSegmentsToLocalClipboard={copySelectedSegmentsToLocalClipboard}
        detachSelectedSceneVideo={detachSelectedSceneVideo}
        duplicateSelectedSegment={duplicateSelectedSegment}
        enableAdvancedVisualControls={enableAdvancedVisualControls}
        moveSelectedSegmentEarlier={moveSelectedSegmentEarlier}
        moveSelectedSegmentLater={moveSelectedSegmentLater}
        moveVisualEffectOnSelectedSegment={moveVisualEffectOnSelectedSegment}
        removeSegmentAudioVolumeKeyframe={removeSegmentAudioVolumeKeyframe}
        removeSelectedSegment={removeSelectedSegment}
        removeVisualEffectAmountKeyframe={removeVisualEffectAmountKeyframe}
        removeVisualEffectFromSelectedSegment={removeVisualEffectFromSelectedSegment}
        removeVisualKeyframe={removeVisualKeyframe}
        selectedSegment={selectedSegment}
        selectedSlices={selectedSlices}
        selectedTrackClip={selectedTrackClip}
        sortedSegmentCount={sortedSegmentCount}
        splitSelectedSegment={splitSelectedSegment}
        updateSelectedSegment={updateSelectedSegment}
        updateSelectedSegmentTimelineStart={updateSelectedSegmentTimelineStart}
        updateVisualEffectOnSelectedSegment={updateVisualEffectOnSelectedSegment}
      />
    ) : (
      <div className="empty-state compact">
        <strong>It's empty here</strong>
        <span>Click an element on the timeline to edit its properties</span>
      </div>
    )}
  </div>
);
