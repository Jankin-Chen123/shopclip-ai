import type { SmartEditAudioVolumeKeyframe } from "@shopclip/shared";

import { audioVolumeKeyframes } from "./SmartEditSegmentUtils";

type SmartEditAudioKeyframeSegment = {
  audioVolumeKeyframes?: SmartEditAudioVolumeKeyframe[];
  durationSeconds: number;
  id: string;
  title: string;
};

export const SmartEditAudioKeyframeMarkers = ({
  label,
  segment,
}: {
  label: string;
  segment: SmartEditAudioKeyframeSegment;
}) => {
  const keyframes = audioVolumeKeyframes(
    segment.audioVolumeKeyframes,
    segment.durationSeconds,
  ).filter((keyframe) => keyframe.timeSecond >= 0 && keyframe.timeSecond <= segment.durationSeconds);

  if (keyframes.length === 0) {
    return null;
  }

  return (
    <div
      aria-label={`${label}: ${segment.title}`}
      className="smart-edit-audio-keyframes"
      title={label}
    >
      {keyframes.map((keyframe) => (
        <i
          key={`${segment.id}-${keyframe.id}`}
          style={{
            left: `${Math.min(
              100,
              Math.max(0, (keyframe.timeSecond / Math.max(0.1, segment.durationSeconds)) * 100),
            )}%`,
          }}
          title={`${keyframe.timeSecond.toFixed(1)}s / ${keyframe.volume.toFixed(2)}`}
        />
      ))}
    </div>
  );
};
