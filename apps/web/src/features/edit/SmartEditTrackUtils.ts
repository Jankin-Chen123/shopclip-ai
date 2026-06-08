export type SmartEditTrackId = "video" | "caption" | "sourceAudio" | "voice" | "bgm";

export const smartEditTrackOrder = (trackId: SmartEditTrackId): number =>
  ({
    bgm: 4,
    caption: 1,
    sourceAudio: 2,
    video: 0,
    voice: 3,
  })[trackId];

export const smartEditSyncedScrollLeft = ({
  clientWidth,
  scrollLeft,
  scrollWidth,
}: {
  clientWidth: number;
  scrollLeft: number;
  scrollWidth: number;
}): number => {
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
  return Math.max(0, Math.min(maxScrollLeft, scrollLeft));
};

const intervalsOverlap = (
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean => leftStart < rightEnd && rightStart < leftEnd;

export const selectSmartEditTrackIdsInMarquee = (
  trackRows: Array<{
    bottom: number;
    locked?: boolean;
    top: number;
    trackId: SmartEditTrackId;
  }>,
  range: {
    endY: number;
    startY: number;
  },
): SmartEditTrackId[] => {
  const startY = Math.min(range.startY, range.endY);
  const endY = Math.max(range.startY, range.endY);
  if (endY - startY < 1) {
    return trackRows
      .filter((row) => !row.locked && startY >= row.top && startY <= row.bottom)
      .sort((left, right) => left.top - right.top)
      .map((row) => row.trackId);
  }
  return trackRows
    .filter((row) => !row.locked && intervalsOverlap(startY, endY, row.top, row.bottom))
    .sort((left, right) => left.top - right.top)
    .map((row) => row.trackId);
};
