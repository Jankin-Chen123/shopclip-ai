import type { SmartEditAudioWaveform } from "@shopclip/shared";

type SmartEditWaveformSegment = {
  durationSeconds: number;
  id: string;
  title: string;
  trimStartSecond?: number;
  waveform?: SmartEditAudioWaveform;
};

const waveformBucketsForClip = (
  waveform: SmartEditAudioWaveform | undefined,
  trimStartSecond: number | undefined,
  durationSeconds: number,
): SmartEditAudioWaveform["buckets"] => {
  if (!waveform?.buckets.length) {
    return [];
  }
  const startSecond = Math.max(0, trimStartSecond ?? 0);
  const endSecond = Math.min(waveform.durationSeconds, startSecond + Math.max(0, durationSeconds));
  const buckets = waveform.buckets.filter((bucket) => {
    const bucketEndSecond = bucket.startSecond + bucket.durationSeconds;
    return bucketEndSecond > startSecond && bucket.startSecond < endSecond;
  });
  return buckets.length > 0 ? buckets : waveform.buckets.slice(0, Math.min(24, waveform.buckets.length));
};

export const SmartEditWaveformStrip = ({ segment }: { segment: SmartEditWaveformSegment }) => {
  const buckets = waveformBucketsForClip(
    segment.waveform,
    segment.trimStartSecond,
    segment.durationSeconds,
  ).slice(0, 96);

  if (buckets.length === 0) {
    return null;
  }

  return (
    <div
      aria-label={`Waveform RMS preview for ${segment.title}`}
      className="smart-edit-waveform"
      title="Waveform RMS preview"
    >
      {buckets.map((bucket) => (
        <i
          className={`smart-edit-waveform-bar ${bucket.peak >= 0.98 ? "clipped" : ""}`.trim()}
          key={`${segment.id}-${bucket.index}`}
          style={{ height: `${Math.max(12, Math.round(bucket.rms * 92))}%` }}
        />
      ))}
    </div>
  );
};
