import type { SmartEditPlan } from "@shopclip/shared";
import { buildSmartEditTimeline } from "./SmartEditSegmentOperations";
import type { SmartEditTrack } from "./SmartEditTimelineOperations";
import { selectSmartEditTimelineElementIdsForTrack } from "./SmartEditTimelineElementOperations";
import type { SmartEditTrackId } from "./SmartEditTrackUtils";

export const smartEditTimelineTrackIdForTrack = (trackId: SmartEditTrackId): string =>
  trackId === "sourceAudio"
    ? "audio-source"
    : trackId === "caption"
      ? "text-copy"
      : trackId === "video"
        ? "video-main"
        : trackId === "bgm"
          ? "bgm-bed"
          : "voiceover";

export const smartEditTimelineTrackForTrack = (
  plan: SmartEditPlan | undefined,
  trackId: SmartEditTrackId,
): NonNullable<SmartEditPlan["timeline"]>["tracks"][number] | undefined =>
  (plan?.timeline ?? (plan ? buildSmartEditTimeline(plan) : undefined))?.tracks.find(
    (track) => track.id === smartEditTimelineTrackIdForTrack(trackId),
  );

export const smartEditTrackPresentationState = ({
  plan,
  track,
}: {
  plan: SmartEditPlan | undefined;
  track: SmartEditTrack;
}) => {
  const timelineTrack = smartEditTimelineTrackForTrack(plan, track.id);
  return {
    hidden: timelineTrack?.hidden ?? track.segments.every((segment) => segment.hidden),
    locked: timelineTrack?.locked ?? false,
    muted: timelineTrack?.muted ?? track.segments.every((segment) => segment.muted),
    selectableTrackMaterialCount: plan
      ? selectSmartEditTimelineElementIdsForTrack(plan, track.id).length
      : 0,
  };
};

export const isSmartEditTimelineTrackLocked = (
  plan: SmartEditPlan | undefined,
  trackId: SmartEditTrackId,
): boolean => smartEditTimelineTrackForTrack(plan, trackId)?.locked ?? false;
