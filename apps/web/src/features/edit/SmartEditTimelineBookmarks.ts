import { TIMELINE_SNAP_SECONDS, formatTimelineTime } from "./SmartEditTimelineMath";

export type SmartEditTimelineBookmark = {
  id: string;
  label: string;
  second: number;
};

export const addSmartEditTimelineBookmark = ({
  bookmarks,
  createId,
  second,
}: {
  bookmarks: SmartEditTimelineBookmark[];
  createId: () => string;
  second: number;
}): SmartEditTimelineBookmark[] => {
  if (bookmarks.some((bookmark) => Math.abs(bookmark.second - second) < TIMELINE_SNAP_SECONDS)) {
    return bookmarks;
  }

  return [
    ...bookmarks,
    {
      id: createId(),
      label: formatTimelineTime(second),
      second,
    },
  ].sort((left, right) => left.second - right.second);
};

export const removeNearestSmartEditTimelineBookmark = ({
  bookmarks,
  second,
}: {
  bookmarks: SmartEditTimelineBookmark[];
  second: number;
}): SmartEditTimelineBookmark[] => {
  if (bookmarks.length === 0) {
    return bookmarks;
  }

  const nearest = bookmarks.reduce((closest, bookmark) =>
    Math.abs(bookmark.second - second) < Math.abs(closest.second - second)
      ? bookmark
      : closest,
  );

  return bookmarks.filter((bookmark) => bookmark.id !== nearest.id);
};
