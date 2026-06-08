import { describe, expect, it } from "vitest";
import type { RenderTask, StoryboardScene } from "@shopclip/shared";

import { markRenderTaskExported, selectInvalidSeedanceSceneDuration } from "./AppRenderUtils";

const sceneWithDuration = (id: string, durationSeconds: number): StoryboardScene =>
  ({
    durationSeconds,
    id,
    order: Number(id.replace(/\D/gu, "")) || 1,
  }) as StoryboardScene;

const renderTask = (id: string): RenderTask => ({ id }) as RenderTask;

describe("selectInvalidSeedanceSceneDuration", () => {
  it("returns undefined when there are no scenes", () => {
    expect(selectInvalidSeedanceSceneDuration([])).toBeUndefined();
  });

  it("treats the Seedance 4s and 12s duration limits as valid", () => {
    expect(
      selectInvalidSeedanceSceneDuration([
        sceneWithDuration("scene-1", 4),
        sceneWithDuration("scene-2", 12),
      ]),
    ).toBeUndefined();
  });

  it("returns the first scene below the Seedance duration limit", () => {
    const invalidScene = sceneWithDuration("scene-1", 3.99);

    expect(
      selectInvalidSeedanceSceneDuration([
        invalidScene,
        sceneWithDuration("scene-2", 8),
      ]),
    ).toBe(invalidScene);
  });

  it("returns the first scene above the Seedance duration limit", () => {
    const invalidScene = sceneWithDuration("scene-2", 12.01);

    expect(
      selectInvalidSeedanceSceneDuration([
        sceneWithDuration("scene-1", 8),
        invalidScene,
      ]),
    ).toBe(invalidScene);
  });

  it("returns the first invalid scene when multiple scenes are out of range", () => {
    const firstInvalidScene = sceneWithDuration("scene-1", 3);

    expect(
      selectInvalidSeedanceSceneDuration([
        firstInvalidScene,
        sceneWithDuration("scene-2", 13),
      ]),
    ).toBe(firstInvalidScene);
  });
});

describe("markRenderTaskExported", () => {
  it("sets export and preview urls on the current render task", () => {
    const task = renderTask("render-1");

    expect(markRenderTaskExported(task, "https://example.com/export.mp4")).toEqual(
      expect.objectContaining({
        exportUrl: "https://example.com/export.mp4",
        previewUrl: "https://example.com/export.mp4",
      }),
    );
  });

  it("preserves an undefined render task", () => {
    expect(markRenderTaskExported(undefined, "https://example.com/export.mp4")).toBeUndefined();
  });
});
