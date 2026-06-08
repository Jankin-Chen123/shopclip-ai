import type {
  AssetMetadata,
  AssetSlice,
  SmartEditSegment,
  SmartEditVisualEffect,
} from "@shopclip/shared";

import type { AppCopy } from "../../app/i18n";
import type { SmartEditVisualEffectType } from "./SmartEditSegmentUtils";
import { SmartEditSelectedSegmentAdvancedEffectsInspector } from "./SmartEditSelectedSegmentAdvancedEffectsInspector";
import { SmartEditSelectedSegmentAudioEnvelopeInspector } from "./SmartEditSelectedSegmentAudioEnvelopeInspector";
import { SmartEditSelectedSegmentCopyStateInspector } from "./SmartEditSelectedSegmentCopyStateInspector";
import { SmartEditSelectedSegmentMaskKeyframeInspector } from "./SmartEditSelectedSegmentMaskKeyframeInspector";
import { SmartEditSelectedSegmentTimingInspector } from "./SmartEditSelectedSegmentTimingInspector";
import { SmartEditSelectedSegmentTransformInspector } from "./SmartEditSelectedSegmentTransformInspector";
import type { SmartEditTrackSegment } from "./SmartEditTimelineOperations";

type UpdateSelectedSegment = (
  update: (segment: SmartEditSegment) => SmartEditSegment,
) => void;

interface SmartEditSelectedSegmentInspectorGroupProps {
  addSegmentAudioVolumeKeyframeAtPlayhead: (
    trackId: "sourceAudio" | "voice",
  ) => void;
  addVisualEffectAmountKeyframe: (effectId: string) => void;
  addVisualEffectToSelectedSegment: (type: SmartEditVisualEffectType) => void;
  addVisualKeyframeAtPlayhead: () => void;
  assets: AssetMetadata[];
  copy: AppCopy["smartEdit"];
  copySelectedSegmentsToLocalClipboard: () => void;
  detachSelectedSceneVideo: () => void;
  duplicateSelectedSegment: () => void;
  enableAdvancedVisualControls: boolean;
  moveSelectedSegmentEarlier: () => void;
  moveSelectedSegmentLater: () => void;
  moveVisualEffectOnSelectedSegment: (effectId: string, direction: -1 | 1) => void;
  removeSegmentAudioVolumeKeyframe: (
    trackId: "sourceAudio" | "voice",
    keyframeId: string,
  ) => void;
  removeSelectedSegment: () => void;
  removeVisualEffectAmountKeyframe: (effectId: string, keyframeId: string) => void;
  removeVisualEffectFromSelectedSegment: (effectId: string) => void;
  removeVisualKeyframe: (keyframeId: string) => void;
  selectedSegment: SmartEditSegment;
  selectedSlices: AssetSlice[];
  selectedTrackClip?: SmartEditTrackSegment;
  sortedSegmentCount: number;
  splitSelectedSegment: () => void;
  updateSelectedSegment: UpdateSelectedSegment;
  updateSelectedSegmentTimelineStart: (nextStartSecond: number) => void;
  updateVisualEffectOnSelectedSegment: (
    effectId: string,
    update: (effect: SmartEditVisualEffect) => SmartEditVisualEffect,
    label: string,
  ) => void;
}

export const SmartEditSelectedSegmentInspectorGroup = ({
  addSegmentAudioVolumeKeyframeAtPlayhead,
  addVisualEffectAmountKeyframe,
  addVisualEffectToSelectedSegment,
  addVisualKeyframeAtPlayhead,
  assets,
  copy,
  copySelectedSegmentsToLocalClipboard,
  detachSelectedSceneVideo,
  duplicateSelectedSegment,
  enableAdvancedVisualControls,
  moveSelectedSegmentEarlier,
  moveSelectedSegmentLater,
  moveVisualEffectOnSelectedSegment,
  removeSegmentAudioVolumeKeyframe,
  removeSelectedSegment,
  removeVisualEffectAmountKeyframe,
  removeVisualEffectFromSelectedSegment,
  removeVisualKeyframe,
  selectedSegment,
  selectedSlices,
  selectedTrackClip,
  sortedSegmentCount,
  splitSelectedSegment,
  updateSelectedSegment,
  updateSelectedSegmentTimelineStart,
  updateVisualEffectOnSelectedSegment,
}: SmartEditSelectedSegmentInspectorGroupProps) => (
  <>
    <SmartEditSelectedSegmentTimingInspector
      assets={assets}
      copy={copy}
      copySelectedSegmentsToLocalClipboard={copySelectedSegmentsToLocalClipboard}
      detachSelectedSceneVideo={detachSelectedSceneVideo}
      duplicateSelectedSegment={duplicateSelectedSegment}
      moveSelectedSegmentEarlier={moveSelectedSegmentEarlier}
      moveSelectedSegmentLater={moveSelectedSegmentLater}
      removeSelectedSegment={removeSelectedSegment}
      selectedSegment={selectedSegment}
      selectedSlices={selectedSlices}
      selectedTrackClip={selectedTrackClip}
      sortedSegmentCount={sortedSegmentCount}
      splitSelectedSegment={splitSelectedSegment}
      updateSelectedSegment={updateSelectedSegment}
      updateSelectedSegmentTimelineStart={updateSelectedSegmentTimelineStart}
    />
    <SmartEditSelectedSegmentTransformInspector
      selectedSegment={selectedSegment}
      updateSelectedSegment={updateSelectedSegment}
    />
    {enableAdvancedVisualControls ? (
      <>
        <SmartEditSelectedSegmentAdvancedEffectsInspector
          addVisualEffectAmountKeyframe={addVisualEffectAmountKeyframe}
          addVisualEffectToSelectedSegment={addVisualEffectToSelectedSegment}
          moveVisualEffectOnSelectedSegment={moveVisualEffectOnSelectedSegment}
          removeVisualEffectAmountKeyframe={removeVisualEffectAmountKeyframe}
          removeVisualEffectFromSelectedSegment={removeVisualEffectFromSelectedSegment}
          selectedSegment={selectedSegment}
          updateSelectedSegment={updateSelectedSegment}
          updateVisualEffectOnSelectedSegment={updateVisualEffectOnSelectedSegment}
        />
        <SmartEditSelectedSegmentMaskKeyframeInspector
          addVisualKeyframeAtPlayhead={addVisualKeyframeAtPlayhead}
          removeVisualKeyframe={removeVisualKeyframe}
          selectedSegment={selectedSegment}
          updateSelectedSegment={updateSelectedSegment}
        />
      </>
    ) : null}
    <SmartEditSelectedSegmentAudioEnvelopeInspector
      addSegmentAudioVolumeKeyframeAtPlayhead={
        addSegmentAudioVolumeKeyframeAtPlayhead
      }
      copy={copy}
      removeSegmentAudioVolumeKeyframe={removeSegmentAudioVolumeKeyframe}
      selectedSegment={selectedSegment}
      updateSelectedSegment={updateSelectedSegment}
    />
    <SmartEditSelectedSegmentCopyStateInspector
      copy={copy}
      selectedSegment={selectedSegment}
      updateSelectedSegment={updateSelectedSegment}
    />
  </>
);
