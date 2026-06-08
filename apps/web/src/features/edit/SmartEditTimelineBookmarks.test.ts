import { describe, expect, it } from "vitest";

import {
  addSmartEditTimelineBookmark,
  removeNearestSmartEditTimelineBookmark,
  type SmartEditTimelineBookmark,
} from "./SmartEditTimelineBookmarks";

const bookmark = (id: string, second: number): SmartEditTimelineBookmark => ({
  id,
  label: `${second}s`,
  second,
});

describe("SmartEditTimelineBookmarks", () => {
  it("adds a bookmark with a formatted label and keeps bookmarks sorted", () => {
    expect(
      addSmartEditTimelineBookmark({
        bookmarks: [bookmark("later", 8), bookmark("earlier", 2)],
        createId: () => "middle",
        second: 4.5,
      }),
    ).toEqual([
      bookmark("earlier", 2),
      { id: "middle", label: "00:04.5", second: 4.5 },
      bookmark("later", 8),
    ]);
  });

  it("returns the existing bookmarks when a nearby bookmark already exists", () => {
    const bookmarks = [bookmark("existing", 4)];

    expect(
      addSmartEditTimelineBookmark({
        bookmarks,
        createId: () => "duplicate",
        second: 4.04,
      }),
    ).toBe(bookmarks);
  });

  it("removes the nearest bookmark to the requested second", () => {
    expect(
      removeNearestSmartEditTimelineBookmark({
        bookmarks: [bookmark("one", 1), bookmark("nearest", 4), bookmark("late", 10)],
        second: 5,
      }),
    ).toEqual([bookmark("one", 1), bookmark("late", 10)]);
  });

  it("returns the existing bookmarks when there is nothing to remove", () => {
    const bookmarks: SmartEditTimelineBookmark[] = [];

    expect(removeNearestSmartEditTimelineBookmark({ bookmarks, second: 5 })).toBe(bookmarks);
  });
});
