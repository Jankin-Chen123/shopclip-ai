import type { SmartEditTimelineElement } from "@shopclip/shared";
import { Link, Trash2, Unlink } from "lucide-react";

import type { AppCopy } from "../../app/i18n";
import { Button } from "../../components/ui/Button";
import { SmartEditTimelineAudioInspector } from "./SmartEditTimelineAudioInspector";
import { SmartEditTimelineElementBaseInspector } from "./SmartEditTimelineElementBaseInspector";
import { SmartEditTimelineSourceTrimInspector } from "./SmartEditTimelineSourceTrimInspector";
import { SmartEditTimelineTextInspector } from "./SmartEditTimelineTextInspector";
import type { SmartEditTimelineElementPatch } from "./SmartEditTimelineOperations";

interface SmartEditTimelineElementInspectorProps {
  canRelinkElement: boolean;
  copy: AppCopy["smartEdit"];
  element: SmartEditTimelineElement;
  linkedElementCount: number;
  minDurationSeconds: number;
  onAddAudioVolumeKeyframe: () => void;
  onRelinkElementGroup: () => void;
  onRemoveAudioVolumeKeyframe: (keyframeId: string) => void;
  onRemoveTrackClip: () => void;
  onSlipSource: (deltaSeconds: number) => void;
  onSplitTextByLines: () => void;
  onUnlinkElementGroup: () => void;
  onUpdateElement: (patch: SmartEditTimelineElementPatch) => void;
  range: string;
  textLineCount: number;
  trackLabel: string;
}

export const SmartEditTimelineElementInspector = ({
  canRelinkElement,
  copy,
  element,
  linkedElementCount,
  minDurationSeconds,
  onAddAudioVolumeKeyframe,
  onRelinkElementGroup,
  onRemoveAudioVolumeKeyframe,
  onRemoveTrackClip,
  onSlipSource,
  onSplitTextByLines,
  onUnlinkElementGroup,
  onUpdateElement,
  range,
  textLineCount,
  trackLabel,
}: SmartEditTimelineElementInspectorProps) => (
  <section className="smart-edit-inspector-section track-clip-inspector">
    <h4>{copy.trackClipInspector}</h4>
    <div className="smart-edit-track-clip-summary">
      <strong>{element.label}</strong>
      <span>{trackLabel}</span>
      <small>{range}</small>
      {element.linkedGroupId ? (
        <small>{copy.linkedMaterialGroup(linkedElementCount)}</small>
      ) : (
        <small>{copy.unlinkedMaterial}</small>
      )}
    </div>
    {element.kind === "video" || element.kind === "audio" ? (
      <div className="smart-edit-linked-actions">
        {element.linkedGroupId ? (
          <Button icon={<Unlink size={16} />} onClick={onUnlinkElementGroup}>
            {copy.unlinkAudioVideo}
          </Button>
        ) : (
          <Button
            disabled={!canRelinkElement}
            icon={<Link size={16} />}
            onClick={onRelinkElementGroup}
          >
            {copy.relinkSceneMaterial}
          </Button>
        )}
      </div>
    ) : null}
    {element.kind === "text" ? (
      <SmartEditTimelineTextInspector
        copy={copy}
        element={element}
        includeStyleControls={false}
        lineCount={textLineCount}
        onSplitByLines={onSplitTextByLines}
        onUpdateElement={onUpdateElement}
      />
    ) : null}
    <SmartEditTimelineElementBaseInspector
      copy={copy}
      element={element}
      includeLabelField={element.kind !== "text"}
      minDurationSeconds={minDurationSeconds}
      onUpdateElement={onUpdateElement}
    />
    {element.kind === "video" || element.kind === "audio" ? (
      <SmartEditTimelineSourceTrimInspector
        copy={copy}
        element={element}
        onSlipSource={onSlipSource}
      />
    ) : null}
    {element.kind === "audio" ? (
      <SmartEditTimelineAudioInspector
        copy={copy}
        element={element}
        onAddVolumeKeyframe={onAddAudioVolumeKeyframe}
        onRemoveVolumeKeyframe={onRemoveAudioVolumeKeyframe}
        onUpdateElement={onUpdateElement}
      />
    ) : null}
    {element.kind === "text" ? (
      <SmartEditTimelineTextInspector
        copy={copy}
        element={element}
        includeTextField={false}
        lineCount={textLineCount}
        onSplitByLines={onSplitTextByLines}
        onUpdateElement={onUpdateElement}
      />
    ) : null}
    <label className="toggle-row">
      <input
        checked={element.hidden ?? false}
        type="checkbox"
        onChange={(event) => onUpdateElement({ hidden: event.target.checked })}
      />
      {element.hidden ? copy.showTimelineElement : copy.hideTimelineElement}
    </label>
    <Button icon={<Trash2 size={16} />} onClick={onRemoveTrackClip}>
      {copy.deleteTimelineElement}
    </Button>
  </section>
);
