export const MIN_SMART_EDIT_CLIP_SECONDS = 0.25;
export const MAX_SMART_EDIT_CLIP_SECONDS = 120;
export const TIMELINE_BASE_PX_PER_SECOND = 34;
export const TRIM_NUDGE_SECONDS = 0.1;
export const TIMELINE_SNAP_SECONDS = 0.1;
export const TIMELINE_EDGE_SNAP_SECONDS = 0.2;

export const smartEditTimelineKeyboardNudgeSeconds = (
  key: string,
  shiftKey: boolean,
): number | undefined => {
  const delta = shiftKey ? 1 : TRIM_NUDGE_SECONDS;
  if (key === "ArrowLeft") {
    return -delta;
  }
  if (key === "ArrowRight") {
    return delta;
  }
  return undefined;
};

export const clampSmartEditDuration = (durationSeconds: number): number =>
  Number.isFinite(durationSeconds)
    ? Math.max(MIN_SMART_EDIT_CLIP_SECONDS, Math.min(MAX_SMART_EDIT_CLIP_SECONDS, durationSeconds))
    : MIN_SMART_EDIT_CLIP_SECONDS;

export const clampPlaybackRate = (playbackRate: number): number =>
  Math.max(0.25, Math.min(4, playbackRate || 1));

export const clampTextFontSize = (fontSize: number): number =>
  Number.isFinite(fontSize) ? Math.max(12, Math.min(72, Math.round(fontSize))) : 42;

export const clampTextPositionYPercent = (positionPercent: number): number =>
  Number.isFinite(positionPercent) ? Math.max(8, Math.min(92, positionPercent)) : 12;

export const normalizeTextColor = (color: string | undefined): string | undefined => {
  const normalized = color?.trim();
  return normalized && /^#[0-9a-fA-F]{6}$/u.test(normalized) ? normalized.toLowerCase() : undefined;
};

export const clampInSegmentOffset = (offsetSeconds: number, durationSeconds: number): number =>
  Number.isFinite(offsetSeconds)
    ? Math.max(0, Math.min(Math.max(0, durationSeconds - 0.1), offsetSeconds))
    : 0;

export const clipDurationWithinSegment = (
  durationSeconds: number | undefined,
  startOffsetSeconds: number | undefined,
  segmentDurationSeconds: number,
): number => {
  const offsetSeconds = clampInSegmentOffset(startOffsetSeconds ?? 0, segmentDurationSeconds);
  const maxDuration = Math.max(MIN_SMART_EDIT_CLIP_SECONDS, segmentDurationSeconds - offsetSeconds);
  return Number.isFinite(durationSeconds ?? Number.NaN)
    ? Math.max(MIN_SMART_EDIT_CLIP_SECONDS, Math.min(maxDuration, durationSeconds!))
    : maxDuration;
};

export const clampClipDurationWithinSegment = (
  durationSeconds: number,
  startOffsetSeconds: number | undefined,
  segmentDurationSeconds: number,
): number => clipDurationWithinSegment(durationSeconds, startOffsetSeconds, segmentDurationSeconds);

export const clampTimelineStart = (startSecond: number): number =>
  Number.isFinite(startSecond) ? Math.max(0, Math.min(600, startSecond)) : 0;

export const clampTransformScale = (scale: number): number =>
  Number.isFinite(scale) ? Math.max(0.1, Math.min(4, scale)) : 1;

export const clampRotationDegrees = (degrees: number): number =>
  Number.isFinite(degrees) ? Math.max(-180, Math.min(180, degrees)) : 0;

export const clampPercentOffset = (percent: number): number =>
  Number.isFinite(percent) ? Math.max(-100, Math.min(100, percent)) : 0;

export const clampOpacity = (opacity: number): number =>
  Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;

export const clampBlur = (blur: number): number =>
  Number.isFinite(blur) ? Math.max(0, Math.min(20, blur)) : 0;

export const clampSharpen = (sharpen: number): number =>
  Number.isFinite(sharpen) ? Math.max(0, Math.min(2, sharpen)) : 0;

export const clampEffectFade = (seconds: number): number =>
  Number.isFinite(seconds) ? Math.max(0, Math.min(5, seconds)) : 0;

export const clampAudioFade = (seconds: number): number =>
  Number.isFinite(seconds) ? Number(Math.max(0, Math.min(10, seconds)).toFixed(2)) : 0;

export const clampAudioVolume = (volume: number): number =>
  Number.isFinite(volume) ? Number(Math.max(0, Math.min(4, volume)).toFixed(2)) : 1;

export const clampVisualKeyframeTime = (seconds: number, durationSeconds: number): number =>
  Number.isFinite(seconds)
    ? Math.max(0, Math.min(Math.max(0, durationSeconds), Number(seconds.toFixed(3))))
    : 0;

export const clampMaskPercentInput = (value: string, fallback: number, min: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(100, parsed)) : fallback;
};

export const formatTimelineTime = (seconds: number): string => {
  const boundedSeconds = Math.max(0, seconds);
  const minutes = Math.floor(boundedSeconds / 60);
  const remainingSeconds = boundedSeconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainingSeconds.toFixed(1).padStart(4, "0")}`;
};

export const sourceRangeLabel = (segment: {
  durationSeconds: number;
  source: { endSecond?: number; startSecond?: number };
}): string => {
  if (segment.source.startSecond === undefined) {
    return "source full";
  }
  const end = segment.source.endSecond ?? segment.source.startSecond + segment.durationSeconds;
  return `source ${formatTimelineTime(segment.source.startSecond)}-${formatTimelineTime(end)}`;
};

export const timelineRangeLabel = (startSecond: number, durationSeconds: number): string =>
  `${formatTimelineTime(startSecond)}-${formatTimelineTime(startSecond + durationSeconds)}`;

export const timelineRulerStep = (durationSeconds: number): number => {
  if (durationSeconds <= 15) {
    return 1;
  }
  if (durationSeconds <= 45) {
    return 5;
  }
  if (durationSeconds <= 120) {
    return 10;
  }
  return 30;
};

export const timelineRulerTicks = (durationSeconds: number): number[] => {
  const step = timelineRulerStep(durationSeconds);
  const ticks: number[] = [];
  for (let time = 0; time <= durationSeconds + 0.001; time += step) {
    ticks.push(Number(time.toFixed(1)));
  }
  if (ticks.at(-1) !== durationSeconds) {
    ticks.push(durationSeconds);
  }
  return ticks;
};

export const snapTimelineSeconds = (seconds: number): number =>
  Number((Math.round(seconds / TIMELINE_SNAP_SECONDS) * TIMELINE_SNAP_SECONDS).toFixed(3));

export const clampSnappedTimelineSecond = (
  seconds: number,
  durationSeconds: number,
): number => Math.min(durationSeconds, Math.max(0, snapTimelineSeconds(seconds)));

export const timelineSecondsFromPixelDistance = (
  pixelDistance: number,
  pixelsPerSecond: number,
): number => (pixelsPerSecond > 0 ? snapTimelineSeconds(pixelDistance / pixelsPerSecond) : 0);

export const nextTimelineScrollLeftForPlayhead = ({
  clientWidth,
  playheadX,
  scrollLeft,
  scrollWidth,
}: {
  clientWidth: number;
  playheadX: number;
  scrollLeft: number;
  scrollWidth: number;
}): number | undefined => {
  if (clientWidth <= 0 || scrollWidth <= clientWidth) {
    return undefined;
  }

  const guard = Math.min(180, Math.max(80, clientWidth * 0.24));
  const visibleStart = scrollLeft + guard;
  const visibleEnd = scrollLeft + clientWidth - guard;
  if (playheadX >= visibleStart && playheadX <= visibleEnd) {
    return undefined;
  }

  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
  const nextScrollLeft = Math.max(0, Math.min(playheadX - clientWidth / 2, maxScrollLeft));
  return Math.abs(scrollLeft - nextScrollLeft) > 1 ? nextScrollLeft : undefined;
};

export const playheadSecondsFromTimelinePointer = ({
  clientX,
  durationSeconds,
  pixelsPerSecond,
  scrollLeft = 0,
  timelineLeft,
}: {
  clientX: number;
  durationSeconds: number;
  pixelsPerSecond: number;
  scrollLeft?: number;
  timelineLeft: number;
}): number => {
  if (pixelsPerSecond <= 0) {
    return 0;
  }
  const rawSeconds = (clientX - timelineLeft + scrollLeft) / pixelsPerSecond;
  return Math.min(
    Math.max(0, snapTimelineSeconds(durationSeconds)),
    clampTimelineStart(snapTimelineSeconds(rawSeconds)),
  );
};
