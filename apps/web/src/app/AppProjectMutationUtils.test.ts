import { describe, expect, it } from "vitest";
import type {
  AssetMetadata,
  AssetProcessingEvent,
  AssetProcessingJob,
  AssetSlice,
  ScriptResult,
  StoryboardScene,
} from "@shopclip/shared";

import type { ProjectSnapshot } from "../lib/api";
import {
  appendProjectAsset,
  mergeImportedProjectAssets,
  removeProjectAssets,
  replaceProcessedProjectAsset,
  upsertProjectAsset,
} from "./AppProjectMutationUtils";

const asset = (id: string): AssetMetadata => ({ id }) as AssetMetadata;
const slice = (id: string, assetId: string): AssetSlice => ({ id, assetId }) as AssetSlice;
const processingEvent = (id: string, assetId: string): AssetProcessingEvent =>
  ({ id, assetId }) as AssetProcessingEvent;
const processingJob = (id: string, assetId: string): AssetProcessingJob =>
  ({ id, assetId }) as AssetProcessingJob;
const scene = (id: string, assetId?: string): StoryboardScene =>
  ({ id, assetId }) as StoryboardScene;

describe("removeProjectAssets", () => {
  it("removes assets and slices while clearing scene asset references", () => {
    const project = {
      assets: [asset("asset-keep"), asset("asset-delete")],
      assetSlices: [slice("slice-keep", "asset-keep"), slice("slice-delete", "asset-delete")],
      scenes: [scene("scene-keep", "asset-keep"), scene("scene-delete", "asset-delete")],
      scripts: [
        {
          id: "script-1",
          scenes: [
            scene("script-scene-keep", "asset-keep"),
            scene("script-scene-delete", "asset-delete"),
          ],
        } as ScriptResult,
      ],
    } as ProjectSnapshot;

    const nextProject = removeProjectAssets(project, new Set(["asset-delete"]));

    expect(nextProject?.assets.map((candidate) => candidate.id)).toEqual(["asset-keep"]);
    expect(nextProject?.assetSlices.map((candidate) => candidate.id)).toEqual(["slice-keep"]);
    expect(nextProject?.scenes).toEqual([
      expect.objectContaining({ id: "scene-keep", assetId: "asset-keep" }),
      expect.objectContaining({ id: "scene-delete", assetId: undefined }),
    ]);
    expect(nextProject?.scripts[0]?.scenes).toEqual([
      expect.objectContaining({ id: "script-scene-keep", assetId: "asset-keep" }),
      expect.objectContaining({ id: "script-scene-delete", assetId: undefined }),
    ]);
  });

  it("preserves an undefined project", () => {
    expect(removeProjectAssets(undefined, new Set(["asset-delete"]))).toBeUndefined();
  });
});

describe("single project asset mutations", () => {
  it("appends an asset that belongs to the current project", () => {
    const project = {
      id: "project-1",
      assets: [asset("asset-1")],
    } as ProjectSnapshot;

    expect(
      appendProjectAsset(project, { ...asset("asset-2"), projectId: "project-1" }).assets.map(
        (candidate) => candidate.id,
      ),
    ).toEqual(["asset-1", "asset-2"]);
  });

  it("leaves the project unchanged when the appended asset belongs elsewhere", () => {
    const project = {
      id: "project-1",
      assets: [asset("asset-1")],
    } as ProjectSnapshot;

    expect(appendProjectAsset(project, { ...asset("asset-2"), projectId: "project-2" })).toBe(
      project,
    );
  });

  it("replaces an existing asset before appending the latest version", () => {
    const project = {
      id: "project-1",
      assets: [
        { ...asset("asset-1"), name: "Old" },
        { ...asset("asset-2"), name: "Keep" },
      ],
    } as ProjectSnapshot;

    expect(
      upsertProjectAsset(project, {
        ...asset("asset-1"),
        name: "New",
        projectId: "project-1",
      }).assets,
    ).toEqual([
      expect.objectContaining({ id: "asset-2", name: "Keep" }),
      expect.objectContaining({ id: "asset-1", name: "New" }),
    ]);
  });
});

describe("mergeImportedProjectAssets", () => {
  it("adds imported project assets and replaces slices for imported asset ids", () => {
    const project = {
      id: "project-1",
      assets: [asset("asset-existing")],
      assetSlices: [
        slice("slice-old-existing", "asset-existing"),
        slice("slice-keep", "asset-keep"),
      ],
    } as ProjectSnapshot;

    const nextProject = mergeImportedProjectAssets({
      assets: [
        { ...asset("asset-existing"), projectId: "project-1" },
        { ...asset("asset-new"), projectId: "project-1" },
        { ...asset("asset-elsewhere"), projectId: "project-2" },
      ],
      assetSlices: [
        slice("slice-new-existing", "asset-existing"),
        slice("slice-new", "asset-new"),
        slice("slice-elsewhere", "asset-elsewhere"),
      ],
      project,
    });

    expect(nextProject?.assets.map((candidate) => candidate.id)).toEqual([
      "asset-existing",
      "asset-existing",
      "asset-new",
    ]);
    expect(nextProject?.assetSlices.map((candidate) => candidate.id)).toEqual([
      "slice-keep",
      "slice-new-existing",
      "slice-new",
    ]);
  });

  it("leaves the project unchanged when imported assets belong elsewhere", () => {
    const project = {
      id: "project-1",
      assets: [asset("asset-existing")],
      assetSlices: [slice("slice-existing", "asset-existing")],
    } as ProjectSnapshot;

    expect(
      mergeImportedProjectAssets({
        assets: [{ ...asset("asset-elsewhere"), projectId: "project-2" }],
        assetSlices: [slice("slice-elsewhere", "asset-elsewhere")],
        project,
      }),
    ).toBe(project);
  });
});

describe("replaceProcessedProjectAsset", () => {
  it("replaces the processed asset, refreshes its slices, and appends processing records", () => {
    const project = {
      id: "project-1",
      assets: [
        { ...asset("asset-1"), name: "Old" },
        { ...asset("asset-2"), name: "Keep" },
      ],
      assetSlices: [slice("slice-old", "asset-1"), slice("slice-keep", "asset-2")],
      assetProcessingEvents: [processingEvent("event-old", "asset-1")],
      assetProcessingJobs: [processingJob("job-old", "asset-1")],
    } as ProjectSnapshot;

    const nextProject = replaceProcessedProjectAsset(project, {
      asset: { ...asset("asset-1"), name: "Processed", projectId: "project-1" },
      events: [processingEvent("event-new", "asset-1")],
      job: processingJob("job-new", "asset-1"),
      slices: [slice("slice-new-a", "asset-1"), slice("slice-new-b", "asset-1")],
    });

    expect(nextProject?.assets).toEqual([
      expect.objectContaining({ id: "asset-1", name: "Processed" }),
      expect.objectContaining({ id: "asset-2", name: "Keep" }),
    ]);
    expect(nextProject?.assetSlices.map((candidate) => candidate.id)).toEqual([
      "slice-keep",
      "slice-new-a",
      "slice-new-b",
    ]);
    expect(nextProject?.assetProcessingEvents.map((candidate) => candidate.id)).toEqual([
      "event-old",
      "event-new",
    ]);
    expect(nextProject?.assetProcessingJobs.map((candidate) => candidate.id)).toEqual([
      "job-old",
      "job-new",
    ]);
  });

  it("leaves the project unchanged when the processed asset belongs elsewhere", () => {
    const project = {
      id: "project-1",
      assets: [asset("asset-1")],
      assetSlices: [slice("slice-old", "asset-1")],
      assetProcessingEvents: [],
      assetProcessingJobs: [],
    } as ProjectSnapshot;

    expect(
      replaceProcessedProjectAsset(project, {
        asset: { ...asset("asset-2"), projectId: "project-2" },
        events: [processingEvent("event-new", "asset-2")],
        job: processingJob("job-new", "asset-2"),
        slices: [slice("slice-new", "asset-2")],
      }),
    ).toBe(project);
  });
});
