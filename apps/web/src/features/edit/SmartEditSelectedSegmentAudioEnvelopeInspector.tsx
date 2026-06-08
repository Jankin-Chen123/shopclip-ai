import type { SmartEditSegment } from "@shopclip/shared";

import type { AppCopy } from "../../app/i18n";
import { Button } from "../../components/ui/Button";
import { audioVolumeKeyframes } from "./SmartEditSegmentUtils";
import { clampAudioVolume } from "./SmartEditTimelineMath";

type SmartEditSegmentAudioTrackId = "sourceAudio" | "voice";

type UpdateSelectedSegment = (
  update: (segment: SmartEditSegment) => SmartEditSegment,
) => void;

interface SmartEditSelectedSegmentAudioEnvelopeInspectorProps {
  addSegmentAudioVolumeKeyframeAtPlayhead: (trackId: SmartEditSegmentAudioTrackId) => void;
  copy: AppCopy["smartEdit"];
  removeSegmentAudioVolumeKeyframe: (
    trackId: SmartEditSegmentAudioTrackId,
    keyframeId: string,
  ) => void;
  selectedSegment: SmartEditSegment;
  updateSelectedSegment: UpdateSelectedSegment;
}

export const SmartEditSelectedSegmentAudioEnvelopeInspector = ({
  addSegmentAudioVolumeKeyframeAtPlayhead,
  copy,
  removeSegmentAudioVolumeKeyframe,
  selectedSegment,
  updateSelectedSegment,
}: SmartEditSelectedSegmentAudioEnvelopeInspectorProps) => {
  const sourceAudioKeyframes = audioVolumeKeyframes(
    selectedSegment.sourceAudioVolumeKeyframes,
    selectedSegment.sourceAudioDurationSeconds ?? selectedSegment.durationSeconds,
  );
  const voiceKeyframes = audioVolumeKeyframes(
    selectedSegment.voiceoverVolumeKeyframes,
    selectedSegment.voiceoverDurationSeconds ?? selectedSegment.durationSeconds,
  );

  return (
    <section className="smart-edit-inspector-section">
      <div className="smart-edit-section-header">
        <h4>{copy.audioVolumeEnvelopes}</h4>
      </div>
      <div className="smart-edit-trim-grid">
        <label>
          {copy.sourceAudioVolume}
          <input
            min={0}
            max={4}
            step={0.05}
            type="number"
            value={selectedSegment.sourceAudioVolume ?? 1}
            onChange={(event) =>
              updateSelectedSegment((segment) => ({
                ...segment,
                sourceAudioVolume: clampAudioVolume(Number(event.target.value)),
              }))
            }
          />
        </label>
        <label>
          {copy.voiceVolume}
          <input
            min={0}
            max={4}
            step={0.05}
            type="number"
            value={selectedSegment.voiceoverVolume ?? 1}
            onChange={(event) =>
              updateSelectedSegment((segment) => ({
                ...segment,
                voiceoverVolume: clampAudioVolume(Number(event.target.value)),
              }))
            }
          />
        </label>
      </div>
      <div className="smart-edit-effect-keyframes">
        <div className="smart-edit-section-header">
          <h6>{copy.sourceAudioVolumeKeyframesTitle}</h6>
          <Button onClick={() => addSegmentAudioVolumeKeyframeAtPlayhead("sourceAudio")}>
            {copy.addVolumeKeyframe}
          </Button>
        </div>
        {sourceAudioKeyframes.length > 0 ? (
          <div className="smart-edit-mini-keyframe-list">
            {sourceAudioKeyframes.map((keyframe) => (
              <article className="smart-edit-mini-keyframe-row" key={keyframe.id}>
                <span>{keyframe.timeSecond.toFixed(1)}s</span>
                <strong>{keyframe.volume.toFixed(2)}</strong>
                <button
                  type="button"
                  onClick={() => removeSegmentAudioVolumeKeyframe("sourceAudio", keyframe.id)}
                >
                  {copy.deleteKeyframe}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <small>{copy.noSourceAudioVolumeKeyframes}</small>
        )}
      </div>
      <div className="smart-edit-effect-keyframes">
        <div className="smart-edit-section-header">
          <h6>{copy.voiceVolumeKeyframesTitle}</h6>
          <Button onClick={() => addSegmentAudioVolumeKeyframeAtPlayhead("voice")}>
            {copy.addVolumeKeyframe}
          </Button>
        </div>
        {voiceKeyframes.length > 0 ? (
          <div className="smart-edit-mini-keyframe-list">
            {voiceKeyframes.map((keyframe) => (
              <article className="smart-edit-mini-keyframe-row" key={keyframe.id}>
                <span>{keyframe.timeSecond.toFixed(1)}s</span>
                <strong>{keyframe.volume.toFixed(2)}</strong>
                <button
                  type="button"
                  onClick={() => removeSegmentAudioVolumeKeyframe("voice", keyframe.id)}
                >
                  {copy.deleteKeyframe}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <small>{copy.noVoiceVolumeKeyframes}</small>
        )}
      </div>
    </section>
  );
};
