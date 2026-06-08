import type {
  SmartEditAudioVolumeKeyframe,
  SmartEditAudioWaveform,
  SmartEditSegment,
  SmartEditTimeline,
} from "@shopclip/shared";

import type { SmartEditTrackId } from "./SmartEditTrackUtils";

export type SmartEditTimelineEditMode = "magnetic" | "insert" | "overwrite" | "ripple";

export type SmartEditTrackSegment = {
  id: string;
  segmentId?: string;
  trackId: SmartEditTrackId;
  title: string;
  range: string;
  meta: string;
  durationSeconds: number;
  startSecond: number;
  muted?: boolean;
  hidden?: boolean;
  audioVolumeKeyframes?: SmartEditAudioVolumeKeyframe[];
  text?: string;
  textColor?: string;
  textFontSize?: number;
  textPositionYPercent?: number;
  trimStartSecond?: number;
  waveform?: SmartEditAudioWaveform;
};

export type SmartEditTimelineElement = SmartEditTimeline["elements"][number];

export type SmartEditTimelineElementPatch = Partial<
  Pick<
    SmartEditTimelineElement,
    | "audioFadeInSeconds"
    | "audioFadeOutSeconds"
    | "audioVolume"
    | "audioVolumeKeyframes"
    | "durationSeconds"
    | "hidden"
    | "label"
    | "muted"
    | "playbackRate"
    | "startSecond"
    | "text"
    | "textColor"
    | "textFontSize"
    | "textPositionYPercent"
    | "trimEndSecond"
    | "trimStartSecond"
  >
>;

export type SmartEditTimelineTrackPatch = Partial<
  Pick<SmartEditTimeline["tracks"][number], "hidden" | "locked" | "muted">
>;

export type SmartEditTrack = {
  id: SmartEditTrackId;
  segments: SmartEditTrackSegment[];
};

export type TrimDragState = {
  edge: "in" | "out";
  pointerId: number;
  segmentId: string;
  startClientX: number;
};

export type TimelineMoveDragState = {
  pointerId: number;
  segmentId: string;
  startClientX: number;
};

export type TrackClipMoveDragState = {
  currentClientX: number;
  pointerId: number;
  startClientX: number;
  trackClip: SmartEditTrackSegment;
};

export type TrackClipTrimDragState = {
  currentClientX: number;
  edge: "in" | "out";
  pointerId: number;
  startClientX: number;
  trackClip: SmartEditTrackSegment;
};

export type TimelinePreviewRangeState = {
  inSecond?: number;
  outSecond?: number;
};

export type PlayheadDragState = {
  pointerId: number;
};

export type TrackBoxSelectDragState = {
  currentClientX: number;
  currentClientY: number;
  currentLaneX: number;
  currentTimelineY: number;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startLaneX: number;
  startTimelineY: number;
  trackId: SmartEditTrackId;
  trackRows: Array<{
    bottom: number;
    locked: boolean;
    top: number;
    trackId: SmartEditTrackId;
  }>;
};

export type SmartEditClipboard = {
  items: Array<{
    elements?: SmartEditTimeline["elements"];
    segment: SmartEditSegment;
    startSecond: number;
  }>;
  timelineItems?: Array<{
    element: SmartEditTimelineElement;
    startSecond: number;
  }>;
};
