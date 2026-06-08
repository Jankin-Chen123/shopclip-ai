import type { SmartEditAudioVolumeKeyframe } from "@shopclip/shared";

import type { AppCopy } from "../../app/i18n";
import { Button } from "../../components/ui/Button";
import { audioVolumeKeyframes } from "./SmartEditSegmentUtils";

interface SmartEditTrackClipAudioEnvelopeInspectorProps {
  copy: AppCopy["smartEdit"];
  durationSeconds: number;
  emptyKeyframesLabel: string;
  fadeInLabel: string;
  fadeInSeconds: number;
  fadeOutLabel: string;
  fadeOutSeconds: number;
  keyframes?: SmartEditAudioVolumeKeyframe[];
  keyframesTitle: string;
  onAddKeyframe: () => void;
  onFadeInChange: (value: number) => void;
  onFadeOutChange: (value: number) => void;
  onRemoveKeyframe: (keyframeId: string) => void;
  onVolumeChange: (value: number) => void;
  volume: number;
  volumeLabel: string;
}

export const SmartEditTrackClipAudioEnvelopeInspector = ({
  copy,
  durationSeconds,
  emptyKeyframesLabel,
  fadeInLabel,
  fadeInSeconds,
  fadeOutLabel,
  fadeOutSeconds,
  keyframes,
  keyframesTitle,
  onAddKeyframe,
  onFadeInChange,
  onFadeOutChange,
  onRemoveKeyframe,
  onVolumeChange,
  volume,
  volumeLabel,
}: SmartEditTrackClipAudioEnvelopeInspectorProps) => {
  const volumeKeyframes = audioVolumeKeyframes(keyframes, durationSeconds);

  return (
    <>
      <div className="smart-edit-trim-grid">
        <label>
          {volumeLabel}
          <input
            min={0}
            max={4}
            step={0.05}
            type="number"
            value={volume}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
          />
        </label>
        <label>
          {fadeInLabel}
          <input
            min={0}
            max={10}
            step={0.1}
            type="number"
            value={fadeInSeconds}
            onChange={(event) => onFadeInChange(Number(event.target.value))}
          />
        </label>
        <label>
          {fadeOutLabel}
          <input
            min={0}
            max={10}
            step={0.1}
            type="number"
            value={fadeOutSeconds}
            onChange={(event) => onFadeOutChange(Number(event.target.value))}
          />
        </label>
      </div>
      <div className="smart-edit-effect-keyframes">
        <div className="smart-edit-section-header">
          <h6>{keyframesTitle}</h6>
          <Button onClick={onAddKeyframe}>{copy.addVolumeKeyframe}</Button>
        </div>
        {volumeKeyframes.length > 0 ? (
          <div className="smart-edit-mini-keyframe-list">
            {volumeKeyframes.map((keyframe) => (
              <article className="smart-edit-mini-keyframe-row" key={keyframe.id}>
                <span>{keyframe.timeSecond.toFixed(1)}s</span>
                <strong>{keyframe.volume.toFixed(2)}</strong>
                <button
                  type="button"
                  onClick={() => onRemoveKeyframe(keyframe.id)}
                >
                  {copy.deleteKeyframe}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <small>{emptyKeyframesLabel}</small>
        )}
      </div>
    </>
  );
};
