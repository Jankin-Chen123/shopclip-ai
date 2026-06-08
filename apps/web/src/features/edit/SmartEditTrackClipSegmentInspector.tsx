import type { SmartEditSegment } from "@shopclip/shared";
import { Volume2 } from "lucide-react";

import type { AppCopy } from "../../app/i18n";
import { Button } from "../../components/ui/Button";
import { SmartEditTrackClipAudioEnvelopeInspector } from "./SmartEditTrackClipAudioEnvelopeInspector";
import {
  MIN_SMART_EDIT_CLIP_SECONDS,
  clampAudioFade,
  clampAudioVolume,
  clampClipDurationWithinSegment,
  clampInSegmentOffset,
  clipDurationWithinSegment,
} from "./SmartEditTimelineMath";
import type { SmartEditTrackSegment } from "./SmartEditTimelineOperations";

interface SmartEditTrackClipSegmentInspectorProps {
  copy: AppCopy["smartEdit"];
  onAddAudioVolumeKeyframe: (trackId: "sourceAudio" | "voice") => void;
  onDetachSourceAudio: () => void;
  onRemoveAudioVolumeKeyframe: (
    trackId: "sourceAudio" | "voice",
    keyframeId: string,
  ) => void;
  onUpdateSegment: (update: (segment: SmartEditSegment) => SmartEditSegment) => void;
  selectedSegment: SmartEditSegment;
  trackClip: SmartEditTrackSegment;
  trackLabel: string;
}

export const SmartEditTrackClipSegmentInspector = ({
  copy,
  onAddAudioVolumeKeyframe,
  onDetachSourceAudio,
  onRemoveAudioVolumeKeyframe,
  onUpdateSegment,
  selectedSegment,
  trackClip,
  trackLabel,
}: SmartEditTrackClipSegmentInspectorProps) => {
  const sourceAudioDuration = clipDurationWithinSegment(
    selectedSegment.sourceAudioDurationSeconds,
    selectedSegment.sourceAudioStartOffsetSeconds,
    selectedSegment.durationSeconds,
  );
  const voiceDuration = clipDurationWithinSegment(
    selectedSegment.voiceoverDurationSeconds,
    selectedSegment.voiceoverStartOffsetSeconds,
    selectedSegment.durationSeconds,
  );

  return (
    <section className="smart-edit-inspector-section track-clip-inspector">
      <h4>{copy.trackClipInspector}</h4>
      <div className="smart-edit-track-clip-summary">
        <strong>{trackClip.title}</strong>
        <span>{trackLabel}</span>
        <small>{trackClip.range}</small>
      </div>
      {trackClip.trackId === "sourceAudio" ? (
        <>
          <label>
            Audio start
            <input
              min={0}
              max={Math.max(0, selectedSegment.durationSeconds - 0.1)}
              step={0.1}
              type="number"
              value={selectedSegment.sourceAudioStartOffsetSeconds ?? 0}
              onChange={(event) =>
                onUpdateSegment((segment) => ({
                  ...segment,
                  sourceAudioStartOffsetSeconds: clampInSegmentOffset(
                    Number(event.target.value),
                    segment.durationSeconds,
                  ),
                }))
              }
            />
          </label>
          <label>
            Audio duration
            <input
              min={MIN_SMART_EDIT_CLIP_SECONDS}
              max={Math.max(
                MIN_SMART_EDIT_CLIP_SECONDS,
                selectedSegment.durationSeconds -
                  (selectedSegment.sourceAudioStartOffsetSeconds ?? 0),
              )}
              step={0.1}
              type="number"
              value={sourceAudioDuration}
              onChange={(event) =>
                onUpdateSegment((segment) => ({
                  ...segment,
                  sourceAudioDurationSeconds: clampClipDurationWithinSegment(
                    Number(event.target.value),
                    segment.sourceAudioStartOffsetSeconds,
                    segment.durationSeconds,
                  ),
                }))
              }
            />
          </label>
          <SmartEditTrackClipAudioEnvelopeInspector
            copy={copy}
            durationSeconds={sourceAudioDuration}
            emptyKeyframesLabel={copy.noAudioVolumeKeyframes}
            fadeInLabel={copy.audioFadeIn}
            fadeInSeconds={selectedSegment.sourceAudioFadeInSeconds ?? 0}
            fadeOutLabel={copy.audioFadeOut}
            fadeOutSeconds={selectedSegment.sourceAudioFadeOutSeconds ?? 0}
            keyframes={selectedSegment.sourceAudioVolumeKeyframes}
            keyframesTitle={copy.audioVolumeKeyframesTitle}
            onAddKeyframe={() => onAddAudioVolumeKeyframe("sourceAudio")}
            onFadeInChange={(value) =>
              onUpdateSegment((segment) => ({
                ...segment,
                sourceAudioFadeInSeconds: clampAudioFade(value),
              }))
            }
            onFadeOutChange={(value) =>
              onUpdateSegment((segment) => ({
                ...segment,
                sourceAudioFadeOutSeconds: clampAudioFade(value),
              }))
            }
            onRemoveKeyframe={(keyframeId) =>
              onRemoveAudioVolumeKeyframe("sourceAudio", keyframeId)
            }
            onVolumeChange={(value) =>
              onUpdateSegment((segment) => ({
                ...segment,
                sourceAudioVolume: clampAudioVolume(value),
              }))
            }
            volume={selectedSegment.sourceAudioVolume ?? 1}
            volumeLabel={copy.audioVolume}
          />
          {selectedSegment.source.sceneClipAudioUrl ? (
            <Button icon={<Volume2 size={16} />} onClick={onDetachSourceAudio}>
              {copy.detachAudio}
            </Button>
          ) : null}
          <label className="toggle-row">
            <input
              checked={selectedSegment.sourceAudioMuted ?? false}
              type="checkbox"
              onChange={(event) =>
                onUpdateSegment((segment) => ({
                  ...segment,
                  sourceAudioMuted: event.target.checked,
                }))
              }
            />
            {selectedSegment.sourceAudioMuted ? copy.unmuteSelected : copy.muteSelected}
          </label>
        </>
      ) : null}
      {trackClip.trackId === "caption" ? (
        <>
          <label>
            {copy.subtitle}
            <textarea
              rows={2}
              value={selectedSegment.subtitle}
              onChange={(event) =>
                onUpdateSegment((segment) => ({
                  ...segment,
                  subtitle: event.target.value,
                }))
              }
            />
          </label>
          <label>
            {copy.captionStart}
            <input
              min={0}
              max={Math.max(0, selectedSegment.durationSeconds - 0.1)}
              step={0.1}
              type="number"
              value={selectedSegment.captionStartOffsetSeconds ?? 0}
              onChange={(event) =>
                onUpdateSegment((segment) => ({
                  ...segment,
                  captionStartOffsetSeconds: clampInSegmentOffset(
                    Number(event.target.value),
                    segment.durationSeconds,
                  ),
                }))
              }
            />
          </label>
          <label>
            {copy.captionDuration}
            <input
              min={MIN_SMART_EDIT_CLIP_SECONDS}
              max={Math.max(
                MIN_SMART_EDIT_CLIP_SECONDS,
                selectedSegment.durationSeconds -
                  (selectedSegment.captionStartOffsetSeconds ?? 0),
              )}
              step={0.1}
              type="number"
              value={clipDurationWithinSegment(
                selectedSegment.captionDurationSeconds,
                selectedSegment.captionStartOffsetSeconds,
                selectedSegment.durationSeconds,
              )}
              onChange={(event) =>
                onUpdateSegment((segment) => ({
                  ...segment,
                  captionDurationSeconds: clampClipDurationWithinSegment(
                    Number(event.target.value),
                    segment.captionStartOffsetSeconds,
                    segment.durationSeconds,
                  ),
                }))
              }
            />
          </label>
          <label className="toggle-row">
            <input
              checked={!selectedSegment.captionHidden}
              type="checkbox"
              onChange={(event) =>
                onUpdateSegment((segment) => ({
                  ...segment,
                  captionHidden: !event.target.checked,
                }))
              }
            />
            {selectedSegment.captionHidden ? copy.showCaption : copy.hideCaption}
          </label>
        </>
      ) : null}
      {trackClip.trackId === "voice" ? (
        <>
          <label>
            {copy.voiceover}
            <textarea
              rows={2}
              value={selectedSegment.voiceover}
              onChange={(event) =>
                onUpdateSegment((segment) => ({
                  ...segment,
                  voiceover: event.target.value,
                }))
              }
            />
          </label>
          <label>
            {copy.voiceoverStart}
            <input
              min={0}
              max={Math.max(0, selectedSegment.durationSeconds - 0.1)}
              step={0.1}
              type="number"
              value={selectedSegment.voiceoverStartOffsetSeconds ?? 0}
              onChange={(event) =>
                onUpdateSegment((segment) => ({
                  ...segment,
                  voiceoverStartOffsetSeconds: clampInSegmentOffset(
                    Number(event.target.value),
                    segment.durationSeconds,
                  ),
                }))
              }
            />
          </label>
          <label>
            {copy.voiceDuration}
            <input
              min={MIN_SMART_EDIT_CLIP_SECONDS}
              max={Math.max(
                MIN_SMART_EDIT_CLIP_SECONDS,
                selectedSegment.durationSeconds -
                  (selectedSegment.voiceoverStartOffsetSeconds ?? 0),
              )}
              step={0.1}
              type="number"
              value={voiceDuration}
              onChange={(event) =>
                onUpdateSegment((segment) => ({
                  ...segment,
                  voiceoverDurationSeconds: clampClipDurationWithinSegment(
                    Number(event.target.value),
                    segment.voiceoverStartOffsetSeconds,
                    segment.durationSeconds,
                  ),
                }))
              }
            />
          </label>
          <SmartEditTrackClipAudioEnvelopeInspector
            copy={copy}
            durationSeconds={voiceDuration}
            emptyKeyframesLabel={copy.noVoiceVolumeKeyframes}
            fadeInLabel={copy.voiceFadeIn}
            fadeInSeconds={selectedSegment.voiceoverFadeInSeconds ?? 0}
            fadeOutLabel={copy.voiceFadeOut}
            fadeOutSeconds={selectedSegment.voiceoverFadeOutSeconds ?? 0}
            keyframes={selectedSegment.voiceoverVolumeKeyframes}
            keyframesTitle={copy.voiceVolumeKeyframesTitle}
            onAddKeyframe={() => onAddAudioVolumeKeyframe("voice")}
            onFadeInChange={(value) =>
              onUpdateSegment((segment) => ({
                ...segment,
                voiceoverFadeInSeconds: clampAudioFade(value),
              }))
            }
            onFadeOutChange={(value) =>
              onUpdateSegment((segment) => ({
                ...segment,
                voiceoverFadeOutSeconds: clampAudioFade(value),
              }))
            }
            onRemoveKeyframe={(keyframeId) =>
              onRemoveAudioVolumeKeyframe("voice", keyframeId)
            }
            onVolumeChange={(value) =>
              onUpdateSegment((segment) => ({
                ...segment,
                voiceoverVolume: clampAudioVolume(value),
              }))
            }
            volume={selectedSegment.voiceoverVolume ?? 1}
            volumeLabel={copy.voiceVolume}
          />
        </>
      ) : null}
    </section>
  );
};
