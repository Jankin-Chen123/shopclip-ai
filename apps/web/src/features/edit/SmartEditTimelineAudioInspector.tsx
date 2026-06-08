import type { SmartEditTimelineElement } from "@shopclip/shared";

import type { AppCopy } from "../../app/i18n";
import { Button } from "../../components/ui/Button";
import { audioVolumeKeyframes } from "./SmartEditSegmentUtils";
import type { SmartEditTimelineElementPatch } from "./SmartEditTimelineOperations";

interface SmartEditTimelineAudioInspectorProps {
  copy: AppCopy["smartEdit"];
  element: SmartEditTimelineElement;
  onAddVolumeKeyframe: () => void;
  onRemoveVolumeKeyframe: (keyframeId: string) => void;
  onUpdateElement: (patch: SmartEditTimelineElementPatch) => void;
}

export const SmartEditTimelineAudioInspector = ({
  copy,
  element,
  onAddVolumeKeyframe,
  onRemoveVolumeKeyframe,
  onUpdateElement,
}: SmartEditTimelineAudioInspectorProps) => {
  const volumeKeyframes = audioVolumeKeyframes(
    element.audioVolumeKeyframes,
    element.durationSeconds,
  );

  return (
    <>
      <div className="smart-edit-trim-grid">
        <label>
          {copy.speed}
          <input
            min={0.25}
            max={4}
            step={0.25}
            type="number"
            value={element.playbackRate ?? 1}
            onChange={(event) =>
              onUpdateElement({
                playbackRate: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          {copy.audioVolume}
          <input
            min={0}
            max={4}
            step={0.05}
            type="number"
            value={element.audioVolume ?? 1}
            onChange={(event) =>
              onUpdateElement({
                audioVolume: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          {copy.audioFadeIn}
          <input
            min={0}
            max={10}
            step={0.1}
            type="number"
            value={element.audioFadeInSeconds ?? 0}
            onChange={(event) =>
              onUpdateElement({
                audioFadeInSeconds: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          {copy.audioFadeOut}
          <input
            min={0}
            max={10}
            step={0.1}
            type="number"
            value={element.audioFadeOutSeconds ?? 0}
            onChange={(event) =>
              onUpdateElement({
                audioFadeOutSeconds: Number(event.target.value),
              })
            }
          />
        </label>
      </div>
      <div className="smart-edit-effect-keyframes">
        <div className="smart-edit-section-header">
          <h6>{copy.audioVolumeKeyframesTitle}</h6>
          <Button onClick={onAddVolumeKeyframe}>{copy.addVolumeKeyframe}</Button>
        </div>
        {volumeKeyframes.length > 0 ? (
          <div className="smart-edit-mini-keyframe-list">
            {volumeKeyframes.map((keyframe) => (
              <article className="smart-edit-mini-keyframe-row" key={keyframe.id}>
                <span>{keyframe.timeSecond.toFixed(1)}s</span>
                <strong>{keyframe.volume.toFixed(2)}</strong>
                <button
                  type="button"
                  onClick={() => onRemoveVolumeKeyframe(keyframe.id)}
                >
                  {copy.deleteKeyframe}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <small>{copy.noAudioVolumeKeyframes}</small>
        )}
      </div>
      <label className="toggle-row">
        <input
          checked={element.muted ?? false}
          type="checkbox"
          onChange={(event) =>
            onUpdateElement({ muted: event.target.checked })
          }
        />
        {element.muted ? copy.unmuteSelected : copy.muteSelected}
      </label>
    </>
  );
};
