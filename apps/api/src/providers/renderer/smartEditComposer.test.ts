import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AssetMetadata, SmartEditPlan } from "@shopclip/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StorageProvider, StorageUploadObjectInput } from "../storage/storageProvider.js";

const workdirs: string[] = [];

const makeWorkdir = async () => {
  const directory = await mkdtemp(join(tmpdir(), "shopclip-smart-edit-test-"));
  workdirs.push(directory);
  return directory;
};

const dataImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const dataAudio = "data:audio/mp4;base64,AAAAHGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQ==";
const dataVideo = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=";

const assets: AssetMetadata[] = [
  {
    id: "asset-video",
    name: "demo product video.mp4",
    mimeType: "video/mp4",
    sizeBytes: 128,
    status: "ready",
    tags: ["product", "demo"],
    type: "video",
    url: dataVideo,
  },
  {
    id: "asset-image",
    name: "hero product.png",
    mimeType: "image/png",
    sizeBytes: 64,
    status: "ready",
    tags: ["hero", "packshot"],
    type: "image",
    url: dataImage,
  },
];

const createPlan = (): SmartEditPlan => ({
  id: "smart-plan-1",
  audio: {
    bgmTrack: "none",
    targetLanguage: "zh-CN",
    voice: "clear-host",
  },
  createdAt: "2026-06-02T00:00:00.000Z",
  projectId: "project-smart-edit",
  segments: [
    {
      id: "segment-video",
      assetTags: ["product", "demo"],
      durationSeconds: 4,
      enabled: true,
      timelineStartSecond: 0,
      order: 1,
      rationale: "Use the structured product demo slice.",
      sceneId: "scene-1",
      sourceAudioMuted: false,
      captionHidden: false,
      captionStartOffsetSeconds: 0,
      voiceoverStartOffsetSeconds: 0,
      source: {
        assetId: "asset-video",
        endSecond: 5,
        kind: "video-slice",
        sliceId: "slice-1",
        startSecond: 1,
      },
      subtitle: "倒过来摇也不漏",
      transition: "cut",
      voiceover: "倒过来摇也不漏",
    },
    {
      id: "segment-image",
      assetTags: ["hero", "packshot"],
      durationSeconds: 4,
      enabled: true,
      timelineStartSecond: 0,
      order: 2,
      rationale: "Use the product hero image for the CTA.",
      sceneId: "scene-2",
      sourceAudioMuted: false,
      captionHidden: false,
      captionStartOffsetSeconds: 0,
      voiceoverStartOffsetSeconds: 0,
      source: {
        assetId: "asset-image",
        imageUrl: dataImage,
        kind: "image-asset",
      },
      subtitle: "喜欢就点商品卡",
      transition: "fade",
      voiceover: "喜欢就点商品卡",
    },
  ],
  strategy: "Use slice trim, still conversion, subtitles, and final concat.",
  targetDurationSeconds: 8,
});

const createStorageProvider = () => {
  const uploads: StorageUploadObjectInput[] = [];
  const storageProvider: StorageProvider = {
    createReadUrl: ({ objectKey }) => ({ url: `https://storage.example.test/${objectKey}` }),
    createUploadIntent: () => {
      throw new Error("createUploadIntent is not used in smart edit composer tests.");
    },
    deleteObject: async () => undefined,
    uploadObject: async (input) => {
      uploads.push(input);
      return {
        objectKey: input.objectKey,
        provider: "tencent-cos",
        publicUrl: `https://storage.example.test/${input.objectKey}`,
      };
    },
  };
  return { storageProvider, uploads };
};

const writeCommandOutput = async (args: string[], content: string) => {
  const voiceOutputIndex = args.indexOf("-w") + 1;
  if (voiceOutputIndex > 0 && args[voiceOutputIndex]) {
    await writeFile(args[voiceOutputIndex], Buffer.from("voice"));
    return;
  }
  const outputPath = args.at(-1);
  if (outputPath && !outputPath.startsWith("-")) {
    await writeFile(outputPath, Buffer.from(content));
  }
};

describe("smart edit composer", () => {
  afterEach(async () => {
    vi.resetModules();
    delete process.env.RENDER_EXPORT_DIR;
    await Promise.all(
      workdirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("trims video slices, converts image assets, burns ASS subtitles, concatenates, and uploads", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider, uploads } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];

    const result = await composeSmartEditToStorage("project-smart-edit", createPlan(), assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    expect(result.publicUrl).toMatch(
      /^https:\/\/storage\.example\.test\/projects\/project-smart-edit\/smart-edits\/.+\/export\.mp4$/,
    );
    expect(uploads).toHaveLength(3);
    expect(uploads.every((upload) => upload.contentType === "video/mp4")).toBe(true);
    expect(uploads.map((upload) => upload.objectKey)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/segments/segment-video.mp4"),
        expect.stringContaining("/segments/segment-image.mp4"),
        result.objectKey,
      ]),
    );
    expect(result.segmentOutputs).toHaveLength(2);
    expect(result.segmentOutputs[0]).toMatchObject({
      sceneId: "scene-1",
      segmentId: "segment-video",
    });

    const videoSliceCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("segment-video-raw.mp4")),
    );
    expect(videoSliceCommand?.args).toEqual(expect.arrayContaining(["-ss", "1", "-t", "4"]));
    expect(videoSliceCommand?.args.join(" ")).toContain("scale=720:1280");

    const imageCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("segment-image-raw.mp4")),
    );
    expect(imageCommand?.args).toEqual(expect.arrayContaining(["-loop", "1", "-t", "4"]));

    const subtitleCommands = commands.filter((entry) =>
      entry.args.some((arg) => arg.includes("ass=filename=")),
    );
    expect(subtitleCommands).toHaveLength(2);
    const firstSubtitlePath = subtitleCommands[0]?.args
      .find((arg) => arg.includes("ass=filename="))
      ?.match(/filename='([^']+)'/)?.[1]
      ?.replace(/\\:/gu, ":");
    expect(firstSubtitlePath).toBeTruthy();
    await expect(readFile(firstSubtitlePath!, "utf8")).resolves.toContain("倒过来摇也不漏");
    await expect(readFile(firstSubtitlePath!, "utf8")).resolves.toContain("Noto Sans CJK SC");

    expect(
      commands.some((entry) => entry.args.some((arg) => arg.endsWith("smart-edit-clips.txt"))),
    ).toBe(true);
    expect(commands.some((entry) => entry.command === "espeak-test")).toBe(true);
    expect(commands.at(-1)?.args).toEqual(expect.arrayContaining(["-map", "1:a:0"]));
  });

  it("adds a real ffmpeg BGM mix stage when the plan requests music", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.audio.bgmTrack = "creator-pop";

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const bgmCommand = commands.at(-1);
    expect(bgmCommand?.args).toEqual(expect.arrayContaining(["-f", "lavfi"]));
    expect(bgmCommand?.args.join(" ")).toContain("sine=frequency=523");
    expect(bgmCommand?.args.join(" ")).toContain("[2:a]volume=0.05[bgm]");
    expect(bgmCommand?.args.join(" ")).toContain("amix=inputs=2");
  });

  it("uses separated generated scene audio as a source audio track in final mixing", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments[0] = {
      ...plan.segments[0]!,
      durationSeconds: 4,
      playbackRate: 2,
      source: {
        endSecond: 8,
        kind: "generated-scene-clip",
        sceneClipAudioUrl: dataAudio,
        sceneClipUrl: dataVideo,
        sceneClipVideoOnlyUrl: dataVideo,
        startSecond: 0,
      },
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const sourceAudioCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("source-audio-segment-video-padded.wav")),
    );
    expect(sourceAudioCommand?.args.join(" ")).toContain("atrim=0:8");
    expect(sourceAudioCommand?.args.join(" ")).toContain("atempo=2.0000");
    expect(sourceAudioCommand?.args.join(" ")).toContain("apad,atrim=0:4");

    const finalMixCommand = commands.at(-1);
    expect(finalMixCommand?.args.some((arg) => arg.endsWith("source-audio.wav"))).toBe(true);
    expect(finalMixCommand?.args.some((arg) => arg.endsWith("voiceover.wav"))).toBe(true);
    expect(finalMixCommand?.args.join(" ")).toContain("[1:a]volume=0.900[src]");
    expect(finalMixCommand?.args.join(" ")).toContain("[2:a]volume=1.000[voice]");
    expect(finalMixCommand?.args.join(" ")).toContain("[src][voice]amix=inputs=2");
  });

  it("bridges persistent timeline elements into ffmpeg subtitle and source audio timing", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments = [
      {
        ...plan.segments[0]!,
        durationSeconds: 4,
        playbackRate: 1,
        subtitle: "Segment caption",
        voiceover: "",
        source: {
          endSecond: 4,
          kind: "generated-scene-clip",
          sceneClipAudioUrl: dataAudio,
          sceneClipUrl: dataVideo,
          sceneClipVideoOnlyUrl: dataVideo,
          startSecond: 0,
        },
      },
    ];
    plan.targetDurationSeconds = 5;
    plan.timeline = {
      scale: 1,
      durationSeconds: 5,
      tracks: [
        { hidden: false, id: "video-main", kind: "video", label: "Video", locked: false, muted: false },
        { hidden: false, id: "audio-source", kind: "audio", label: "Source audio", locked: false, muted: false },
        { hidden: false, id: "text-copy", kind: "text", label: "Text", locked: false, muted: false },
      ],
      elements: [
        {
          detachedAudio: false,
          durationSeconds: 4,
          hidden: false,
          id: "persisted-video",
          kind: "video",
          label: "Timeline video",
          muted: false,
          playbackRate: 1,
          sceneId: "scene-1",
          segmentId: "segment-video",
          sourceUrl: dataVideo,
          startSecond: 0.5,
          trackId: "video-main",
          trimEndSecond: 4,
          trimStartSecond: 0,
        },
        {
          detachedAudio: true,
          durationSeconds: 1.5,
          audioFadeInSeconds: 0.25,
          audioFadeOutSeconds: 0.35,
          hidden: false,
          id: "persisted-source-audio",
          kind: "audio",
          label: "Timeline source audio",
          muted: false,
          playbackRate: 1,
          sceneId: "scene-1",
          segmentId: "segment-video",
          sourceUrl: dataAudio,
          startSecond: 1.25,
          trackId: "audio-source",
          trimEndSecond: 2.5,
          trimStartSecond: 1,
        },
        {
          detachedAudio: false,
          durationSeconds: 1.1,
          hidden: false,
          id: "persisted-caption",
          kind: "text",
          label: "Timeline caption",
          muted: false,
          playbackRate: 1,
          sceneId: "scene-1",
          segmentId: "segment-video",
          startSecond: 1.5,
          text: "Timeline caption",
          trackId: "text-copy",
          trimStartSecond: 0,
        },
      ],
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const subtitleCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.includes("ass=filename=")),
    );
    const subtitlePath = subtitleCommand?.args
      .find((arg) => arg.includes("ass=filename="))
      ?.match(/filename='([^']+)'/)?.[1]
      ?.replace(/\\:/gu, ":");
    expect(subtitlePath).toBeTruthy();
    await expect(readFile(subtitlePath!, "utf8")).resolves.toContain("Timeline caption");
    await expect(readFile(subtitlePath!, "utf8")).resolves.toContain("0:00:01.00,0:00:02.10");

    const sourceAudioCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("source-audio-segment-video-padded.wav")),
    );
    expect(sourceAudioCommand?.args.join(" ")).toContain("atrim=1:2.5");
    expect(sourceAudioCommand?.args.join(" ")).toContain("adelay=750:all=1");
    expect(sourceAudioCommand?.args.join(" ")).toContain("apad,atrim=0:4");
  });

  it("renders persistent video timeline elements as independent export units", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider, uploads } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments = [
      {
        ...plan.segments[0]!,
        durationSeconds: 6,
        playbackRate: 1,
        source: {
          endSecond: 6,
          kind: "generated-scene-clip",
          sceneClipAudioUrl: dataAudio,
          sceneClipUrl: dataVideo,
          sceneClipVideoOnlyUrl: dataVideo,
          startSecond: 0,
        },
      },
    ];
    plan.targetDurationSeconds = 6;
    plan.timeline = {
      scale: 1,
      durationSeconds: 6,
      tracks: [
        { hidden: false, id: "video-main", kind: "video", label: "Video", locked: false, muted: false },
        { hidden: false, id: "text-copy", kind: "text", label: "Text", locked: false, muted: false },
      ],
      elements: [
        {
          detachedAudio: false,
          durationSeconds: 2,
          hidden: false,
          id: "clip-a",
          kind: "video",
          label: "Clip A",
          muted: false,
          playbackRate: 1,
          sceneId: "scene-1",
          segmentId: "segment-video",
          sourceUrl: dataVideo,
          startSecond: 0,
          trackId: "video-main",
          trimEndSecond: 2,
          trimStartSecond: 0,
        },
        {
          detachedAudio: false,
          durationSeconds: 2,
          hidden: false,
          id: "clip-b",
          kind: "video",
          label: "Clip B",
          muted: false,
          playbackRate: 1,
          sceneId: "scene-1",
          segmentId: "segment-video",
          sourceUrl: dataVideo,
          startSecond: 3,
          trackId: "video-main",
          trimEndSecond: 5,
          trimStartSecond: 3,
        },
      ],
    };

    const result = await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    expect(result.segmentOutputs.map((output) => output.segmentId)).toEqual(["clip-a", "clip-b"]);
    expect(uploads.map((upload) => upload.objectKey)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/segments/clip-a.mp4"),
        expect.stringContaining("/segments/clip-b.mp4"),
      ]),
    );
    const firstRawCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("clip-a-raw.mp4")),
    );
    const secondRawCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("clip-b-raw.mp4")),
    );
    expect(firstRawCommand?.args).toEqual(expect.arrayContaining(["-ss", "0", "-t", "2"]));
    expect(secondRawCommand?.args).toEqual(expect.arrayContaining(["-ss", "3", "-t", "2"]));
    expect(
      commands.some((entry) => entry.args.some((arg) => arg.endsWith("timeline-gap-2.mp4"))),
    ).toBe(true);
  });

  it("keeps derived timeline video elements segment-backed", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const plan = createPlan();
    plan.timeline = {
      scale: 1,
      durationSeconds: 8,
      tracks: [
        { hidden: false, id: "video-main", kind: "video", label: "Video", locked: false, muted: false },
      ],
      elements: plan.segments.map((segment, index) => ({
        detachedAudio: false,
        durationSeconds: segment.durationSeconds,
        hidden: false,
        id: `${segment.id}-video`,
        kind: "video" as const,
        label: `Scene ${index + 1}`,
        muted: false,
        playbackRate: 1,
        sceneId: segment.sceneId,
        segmentId: segment.id,
        sourceUrl: segment.source.sceneClipVideoOnlyUrl ?? segment.source.sceneClipUrl ?? segment.source.imageUrl ?? dataVideo,
        startSecond: index * 4,
        trackId: "video-main",
        trimStartSecond: segment.source.startSecond ?? 0,
      })),
    };

    const result = await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (_command, args) => {
        await writeCommandOutput(args, "output");
      },
    });

    expect(result.segmentOutputs.map((output) => output.segmentId)).toEqual([
      "segment-video",
      "segment-image",
    ]);
  });

  it("renders global source-audio and text timeline elements without segment ownership", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments = [
      {
        ...plan.segments[0]!,
        captionHidden: true,
        durationSeconds: 4,
        sourceAudioMuted: true,
        voiceover: "",
      },
    ];
    plan.targetDurationSeconds = 4;
    plan.timeline = {
      scale: 1,
      durationSeconds: 4,
      tracks: [
        { hidden: false, id: "video-main", kind: "video", label: "Video", locked: false, muted: false },
        { hidden: false, id: "audio-source", kind: "audio", label: "Source audio", locked: false, muted: false },
        { hidden: false, id: "text-copy", kind: "text", label: "Text", locked: false, muted: false },
      ],
      elements: [
        {
          detachedAudio: true,
          durationSeconds: 1.5,
          audioFadeInSeconds: 0.25,
          audioFadeOutSeconds: 0.35,
          hidden: false,
          id: "free-audio",
          kind: "audio",
          label: "Free audio",
          muted: false,
          playbackRate: 1,
          sourceUrl: dataAudio,
          startSecond: 1,
          trackId: "audio-source",
          trimEndSecond: 2.5,
          trimStartSecond: 1,
        },
        {
          detachedAudio: false,
          durationSeconds: 1.25,
          hidden: false,
          id: "free-caption",
          kind: "text",
          label: "Floating caption",
          muted: false,
          playbackRate: 1,
          startSecond: 2.25,
          text: "Timeline only caption",
          trackId: "text-copy",
          trimStartSecond: 0,
        },
      ],
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const freeAudioCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("source-audio-free-audio-padded.wav")),
    );
    expect(freeAudioCommand).toBeTruthy();
    expect(freeAudioCommand!.args.join(" ")).toContain("atrim=1:2.5");
    expect(freeAudioCommand!.args.join(" ")).toContain("afade=t=in:st=0:d=0.25");
    expect(freeAudioCommand!.args.join(" ")).toContain("afade=t=out:st=1.15:d=0.35");
    expect(freeAudioCommand!.args.join(" ")).toContain("apad,atrim=0:1.5");
    expect(
      commands.some((entry) => entry.args.some((arg) => arg.endsWith("source-audio-gap-1.wav"))),
    ).toBe(true);

    const globalSubtitleCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.includes("global-timeline-text.ass")),
    );
    const globalSubtitlePath = globalSubtitleCommand?.args
      .find((arg) => arg.includes("global-timeline-text.ass"))
      ?.match(/filename='([^']+)'/)?.[1]
      ?.replace(/\\:/gu, ":");
    expect(globalSubtitlePath).toBeTruthy();
    await expect(readFile(globalSubtitlePath!, "utf8")).resolves.toContain("Timeline only caption");
    await expect(readFile(globalSubtitlePath!, "utf8")).resolves.toContain(
      "Dialogue: 0,0:00:02.25,0:00:03.50",
    );
  });

  it("mixes overlapping global source-audio timeline elements as lanes", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments = [
      {
        ...plan.segments[0]!,
        captionHidden: true,
        durationSeconds: 4,
        sourceAudioMuted: true,
        voiceover: "",
      },
    ];
    plan.targetDurationSeconds = 4;
    plan.timeline = {
      scale: 1,
      durationSeconds: 4,
      tracks: [
        { hidden: false, id: "video-main", kind: "video", label: "Video", locked: false, muted: false },
        { hidden: false, id: "audio-source", kind: "audio", label: "Source audio", locked: false, muted: false },
      ],
      elements: [
        {
          detachedAudio: true,
          durationSeconds: 2,
          hidden: false,
          id: "audio-lane-a",
          kind: "audio",
          label: "Audio lane A",
          muted: false,
          playbackRate: 1,
          sourceUrl: dataAudio,
          startSecond: 0,
          trackId: "audio-source",
          trimEndSecond: 2,
          trimStartSecond: 0,
        },
        {
          detachedAudio: true,
          durationSeconds: 2,
          hidden: false,
          id: "audio-lane-b",
          kind: "audio",
          label: "Audio lane B",
          muted: false,
          playbackRate: 1,
          sourceUrl: dataAudio,
          startSecond: 1,
          trackId: "audio-source",
          trimEndSecond: 3,
          trimStartSecond: 1,
        },
      ],
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const laneACommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("source-audio-audio-lane-a-lane.wav")),
    );
    const laneBCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("source-audio-audio-lane-b-lane.wav")),
    );
    expect(laneACommand).toBeTruthy();
    expect(laneBCommand).toBeTruthy();
    expect(laneACommand!.args.join(" ")).toContain("adelay=0:all=1");
    expect(laneACommand!.args.join(" ")).toContain("apad,atrim=0:4");
    expect(laneBCommand!.args.join(" ")).toContain("adelay=1000:all=1");
    expect(laneBCommand!.args.join(" ")).toContain("apad,atrim=0:4");

    const mixCommand = commands.find((entry) => entry.args.join(" ").includes("amix=inputs=2"));
    expect(mixCommand?.args.join(" ")).toContain("amix=inputs=2:duration=longest");
    expect(mixCommand?.args.join(" ")).toContain("atrim=0:4");
    expect(
      commands.some((entry) => entry.args.some((arg) => arg.includes("smart-edit-source-audio.txt"))),
    ).toBe(false);
  });

  it("generates voiceover audio from unowned timeline voice elements", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments = [
      {
        ...plan.segments[0]!,
        captionHidden: true,
        durationSeconds: 4,
        sourceAudioMuted: true,
        voiceover: "",
      },
    ];
    plan.targetDurationSeconds = 5;
    plan.timeline = {
      scale: 1,
      durationSeconds: 5,
      tracks: [
        { hidden: false, id: "video-main", kind: "video", label: "Video", locked: false, muted: false },
        { hidden: false, id: "voiceover", kind: "audio", label: "Voice", locked: false, muted: false },
      ],
      elements: [
        {
          detachedAudio: false,
          durationSeconds: 1.5,
          audioFadeInSeconds: 0.2,
          audioFadeOutSeconds: 0.3,
          hidden: false,
          id: "free-voice",
          kind: "audio",
          label: "Timeline voice",
          muted: false,
          playbackRate: 1,
          startSecond: 2,
          text: "Timeline generated voice",
          trackId: "voiceover",
          trimStartSecond: 0,
        },
      ],
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const ttsCommand = commands.find((entry) => entry.command === "espeak-test");
    expect(ttsCommand?.args).toEqual(expect.arrayContaining(["Timeline generated voice"]));

    const voiceLaneCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("voice-free-voice-lane.wav")),
    );
    expect(voiceLaneCommand).toBeTruthy();
    expect(voiceLaneCommand!.args.join(" ")).toContain("atrim=0:1.5");
    expect(voiceLaneCommand!.args.join(" ")).toContain("afade=t=in:st=0:d=0.20");
    expect(voiceLaneCommand!.args.join(" ")).toContain("afade=t=out:st=1.20:d=0.30");
    expect(voiceLaneCommand!.args.join(" ")).toContain("adelay=2000:all=1");
    expect(voiceLaneCommand!.args.join(" ")).toContain("apad,atrim=0:5");

    const finalMixCommand = commands.at(-1);
    expect(finalMixCommand?.args.some((arg) => arg.endsWith("voiceover.wav"))).toBe(true);
    expect(finalMixCommand?.args).toEqual(expect.arrayContaining(["-map", "1:a:0"]));
  });

  it("mutes selected separated scene audio while preserving the source audio timeline", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments = plan.segments.map((segment, index) => ({
      ...segment,
      durationSeconds: index === 0 ? 2.5 : 1.5,
      source: {
        kind: "generated-scene-clip",
        sceneClipAudioUrl: dataAudio,
        sceneClipUrl: dataVideo,
        sceneClipVideoOnlyUrl: dataVideo,
        startSecond: 0,
        endSecond: index === 0 ? 2.5 : 1.5,
      },
      sourceAudioMuted: index === 0,
      voiceover: "",
    }));

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const mutedGapCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("source-audio-gap-1.wav")),
    );
    expect(mutedGapCommand?.args).toEqual(expect.arrayContaining(["-f", "lavfi"]));
    expect(mutedGapCommand?.args.join(" ")).toContain("anullsrc=channel_layout=stereo");
    expect(mutedGapCommand?.args).toEqual(expect.arrayContaining(["-t", "2.5"]));

    const liveAudioCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("source-audio-segment-image-padded.wav")),
    );
    expect(liveAudioCommand?.args.join(" ")).toContain("atrim=0:1.5");

    const finalMixCommand = commands.at(-1);
    expect(finalMixCommand?.args.some((arg) => arg.endsWith("source-audio.wav"))).toBe(true);
    expect(finalMixCommand?.args).toEqual(expect.arrayContaining(["-map", "1:a:0"]));
  });

  it("maps each BGM selection to a distinct generated ffmpeg music bed", async () => {
    const { smartEditBgmProfile } = await import("./smartEditComposer.js");

    expect(smartEditBgmProfile("creator-pop")).toEqual({
      lavfi: "sine=frequency=523:sample_rate=44100",
      volume: 0.05,
    });
    expect(smartEditBgmProfile("soft-lift")).toEqual({
      lavfi: "sine=frequency=330:sample_rate=44100",
      volume: 0.035,
    });
    expect(smartEditBgmProfile("tech-pulse")).toEqual({
      lavfi: "sine=frequency=176:sample_rate=44100",
      volume: 0.045,
    });
    expect(smartEditBgmProfile("none")).toBeUndefined();
  });

  it("uses requested video ratio and resolution for segment filters and ASS subtitles", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage, smartEditOutputDimensions } = await import(
      "./smartEditComposer.js"
    );
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];

    expect(smartEditOutputDimensions({ generateAudio: false, ratio: "16:9", resolution: "480p", watermark: false })).toEqual({
      height: 480,
      width: 854,
    });

    await composeSmartEditToStorage("project-smart-edit", createPlan(), assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      videoSettings: {
        generateAudio: false,
        ratio: "16:9",
        resolution: "480p",
        watermark: false,
      },
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const videoSliceCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("segment-video-raw.mp4")),
    );
    expect(videoSliceCommand?.args.join(" ")).toContain("scale=854:480");
    expect(videoSliceCommand?.args.join(" ")).toContain("crop=854:480");

    const firstSubtitlePath = commands
      .flatMap((entry) => entry.args)
      .find((arg) => arg.includes("ass=filename="))
      ?.match(/filename='([^']+)'/)?.[1]
      ?.replace(/\\:/gu, ":");
    expect(firstSubtitlePath).toBeTruthy();
    const subtitleAss = await readFile(firstSubtitlePath!, "utf8");
    expect(subtitleAss).toContain("PlayResX: 854");
    expect(subtitleAss).toContain("PlayResY: 480");
  });

  it("applies segment transform and effect controls to ffmpeg video filters", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments[0] = {
      ...plan.segments[0]!,
      durationSeconds: 4,
      transform: {
        offsetXPercent: 12,
        offsetYPercent: -8,
        opacity: 0.72,
        rotateDegrees: -4,
        scale: 1.25,
      },
      effects: {
        blur: 1.6,
        fadeInSeconds: 0.4,
        fadeOutSeconds: 0.5,
        sharpen: 0.7,
      },
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const firstRawCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("segment-video-raw.mp4")),
    );
    const videoFilter = firstRawCommand?.args[firstRawCommand.args.indexOf("-vf") + 1] ?? "";
    expect(videoFilter).toContain("scale=900:1600");
    expect(videoFilter).toContain("crop=720:1280:x='(in_w-720)/2+86'");
    expect(videoFilter).toContain("rotate=-0.0698");
    expect(videoFilter).toContain("format=yuva420p,colorchannelmixer=aa=0.720");
    expect(videoFilter).toContain("gblur=sigma=1.60");
    expect(videoFilter).toContain("unsharp=5:5:0.70:5:5:0.00");
    expect(videoFilter).toContain("fade=t=in:st=0:d=0.40");
    expect(videoFilter).toContain("fade=t=out:st=3.50:d=0.50");
  });

  it("exports ordered visual effect stacks as ffmpeg filters", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments[0] = {
      ...plan.segments[0]!,
      visualEffects: [
        {
          enabled: true,
          id: "effect-brightness",
          params: { amount: 0.2, radius: 4 },
          type: "brightness",
        },
        {
          enabled: false,
          id: "effect-disabled-blur",
          params: { amount: 9, radius: 4 },
          type: "blur",
        },
        {
          enabled: true,
          id: "effect-saturation",
          params: { amount: 1.35, radius: 4 },
          type: "saturation",
        },
      ],
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const firstRawCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("segment-video-raw.mp4")),
    );
    const videoFilter = firstRawCommand?.args[firstRawCommand.args.indexOf("-vf") + 1] ?? "";
    expect(videoFilter).toContain("eq=brightness=0.20");
    expect(videoFilter).toContain("eq=saturation=1.35");
    expect(videoFilter).not.toContain("gblur=sigma=9.00");
    expect(videoFilter.indexOf("eq=brightness=0.20")).toBeLessThan(
      videoFilter.indexOf("eq=saturation=1.35"),
    );
  });

  it("exports visual effect amount keyframes as time-based ffmpeg expressions", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments[0] = {
      ...plan.segments[0]!,
      durationSeconds: 4,
      visualEffects: [
        {
          enabled: true,
          id: "effect-brightness",
          keyframes: [
            {
              easing: "linear",
              id: "brightness-kf-start",
              param: "amount",
              timeSecond: 0,
              value: -0.2,
            },
            {
              easing: "linear",
              id: "brightness-kf-end",
              param: "amount",
              timeSecond: 2,
              value: 0.35,
            },
          ],
          params: { amount: 0.1, radius: 4 },
          type: "brightness",
        },
        {
          enabled: true,
          id: "effect-contrast",
          keyframes: [
            {
              easing: "hold",
              id: "contrast-kf-start",
              param: "amount",
              timeSecond: 0,
              value: 0.85,
            },
            {
              easing: "hold",
              id: "contrast-kf-end",
              param: "amount",
              timeSecond: 2,
              value: 1.5,
            },
          ],
          params: { amount: 1, radius: 4 },
          type: "contrast",
        },
      ],
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const firstRawCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("segment-video-raw.mp4")),
    );
    const videoFilter = firstRawCommand?.args[firstRawCommand.args.indexOf("-vf") + 1] ?? "";
    expect(videoFilter).toContain("eq=brightness='if(lte(t\\,0.000)");
    expect(videoFilter).toContain("0.350");
    expect(videoFilter).toContain("eq=contrast='if(lte(t\\,0.000)");
    expect(videoFilter).toContain("if(gte(t\\,2.000)");
    expect(videoFilter).toContain("0.850");
  });

  it("exports visual transform keyframes as time-based ffmpeg video expressions", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments[0] = {
      ...plan.segments[0]!,
      durationSeconds: 4,
      transform: {
        offsetXPercent: 0,
        offsetYPercent: 0,
        opacity: 1,
        rotateDegrees: 0,
        scale: 1,
      },
      visualKeyframes: [
        {
          id: "kf-start",
          easing: "linear",
          timeSecond: 0,
          transform: {
            offsetXPercent: 0,
            offsetYPercent: 0,
            opacity: 1,
            rotateDegrees: 0,
            scale: 1,
          },
        },
        {
          id: "kf-push",
          easing: "linear",
          timeSecond: 2,
          transform: {
            offsetXPercent: 16,
            offsetYPercent: -10,
            opacity: 0.65,
            rotateDegrees: 0,
            scale: 1.4,
          },
        },
      ],
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const firstRawCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("segment-video-raw.mp4")),
    );
    const videoFilter = firstRawCommand?.args[firstRawCommand.args.indexOf("-vf") + 1] ?? "";
    expect(videoFilter).toContain("eval=frame");
    expect(videoFilter).toContain("if(lte(t\\,0.000)");
    expect(videoFilter).toContain("if(gte(t\\,2.000)");
    expect(videoFilter).toContain("colorchannelmixer=aa='");
    expect(videoFilter).toContain("0.650");
    expect(videoFilter).toContain("crop=720:1280:x='(in_w-720)/2+");
  });

  it("exports visual masks as ffmpeg pixel expressions", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments[0] = {
      ...plan.segments[0]!,
      durationSeconds: 4,
      visualMask: {
        heightPercent: 60,
        id: "mask-product-focus",
        inverted: true,
        type: "ellipse",
        widthPercent: 70,
        xPercent: 50,
        yPercent: 45,
      },
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const firstRawCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("segment-video-raw.mp4")),
    );
    const videoFilter = firstRawCommand?.args[firstRawCommand.args.indexOf("-vf") + 1] ?? "";
    expect(videoFilter).toContain("geq=");
    expect(videoFilter).toContain("pow((X-360.00)/252.00\\,2)+pow((Y-576.00)/384.00\\,2)");
    expect(videoFilter).toContain("lte(");
    expect(videoFilter).toContain("0\\,p(X\\,Y)");
  });

  it("uses real ffmpeg fade and xfade filters for requested visual transitions", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments[0] = {
      ...plan.segments[0]!,
      transition: "fade",
    };
    plan.segments[1] = {
      ...plan.segments[1]!,
      transition: "crossfade",
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const firstRawCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("segment-video-raw.mp4")),
    );
    expect(firstRawCommand?.args.join(" ")).toContain("fade=t=in");
    expect(firstRawCommand?.args.join(" ")).toContain("fade=t=out");

    const xfadeCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.includes("xfade=transition=fade")),
    );
    expect(xfadeCommand?.args).toEqual(expect.arrayContaining(["-filter_complex"]));
    expect(xfadeCommand?.args.join(" ")).toContain("xfade=transition=fade");
    expect(xfadeCommand?.args.join(" ")).not.toContain("smart-edit-clips.txt");
  });

  it("maps wipe timeline transitions to a real xfade wipe filter", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments[1] = {
      ...plan.segments[1]!,
      transition: "wipe",
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    expect(commands.some((entry) => entry.args.some((arg) => arg.includes("xfade=transition=wipeleft")))).toBe(
      true,
    );
  });

  it("reuses precomposed generated scene clips without rebuilding unchanged segment subtitles", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments[0] = {
      ...plan.segments[0]!,
      source: {
        kind: "generated-scene-clip",
        sceneClipUrl: "https://storage.example.test/reused-segment-1.mp4",
      },
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      fetchImpl: async () =>
        new Response(Buffer.from("reused segment"), {
          headers: { "content-type": "video/mp4" },
      }),
      storageProvider,
      subtitlesEnabled: false,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    expect(commands.some((entry) => entry.args.some((arg) => arg.endsWith("segment-video-raw.mp4")))).toBe(
      false,
    );
    expect(
      commands.some((entry) =>
        entry.args.some((arg) => arg.includes("segment-video.ass") || arg.includes("segment-video-captioned")),
      ),
    ).toBe(false);
    expect(commands.some((entry) => entry.args.some((arg) => arg.endsWith("segment-image-raw.mp4")))).toBe(
      true,
    );
  });

  it("falls back to voiceover text when subtitle text is replacement symbols", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    const readableVoiceover = "\u8c01\u80fd\u62d2\u7edd\u8fd9\u4e48\u53ef\u7231\u7684\u5c0f\u732b\u6c34\u676f\u554a\uff01";
    plan.segments[0] = {
      ...plan.segments[0]!,
      subtitle: "????????????",
      voiceover: readableVoiceover,
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const subtitleCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.includes("segment-video.ass")),
    );
    const subtitlePath = subtitleCommand?.args
      .find((arg) => arg.includes("segment-video.ass"))
      ?.match(/filename='([^']+)'/)?.[1]
      ?.replace(/\\:/gu, ":");
    expect(subtitlePath).toBeTruthy();
    await expect(readFile(subtitlePath!, "utf8")).resolves.toContain(readableVoiceover);
  });

  it("falls back to voiceover text when subtitle text is mojibake", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    const readableVoiceover = "倒过来摇也不漏";
    plan.segments[0] = {
      ...plan.segments[0]!,
      subtitle: "鍊掕繃鏉ユ憞涔熶笉婕?",
      voiceover: readableVoiceover,
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const subtitleCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.includes("segment-video.ass")),
    );
    const subtitlePath = subtitleCommand?.args
      .find((arg) => arg.includes("segment-video.ass"))
      ?.match(/filename='([^']+)'/)?.[1]
      ?.replace(/\\:/gu, ":");
    expect(subtitlePath).toBeTruthy();
    await expect(readFile(subtitlePath!, "utf8")).resolves.toContain(readableVoiceover);
    await expect(readFile(subtitlePath!, "utf8")).resolves.not.toContain("鍊掕繃");
  });

  it("does not burn unreadable symbol captions when no readable copy exists", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments[0] = {
      ...plan.segments[0]!,
      subtitle: "????????????",
      voiceover: "□□□□□□",
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    expect(commands.some((entry) => entry.args.some((arg) => arg.includes("segment-video.ass")))).toBe(
      false,
    );
    expect(commands.some((entry) => entry.args.some((arg) => arg.includes("segment-image.ass")))).toBe(
      true,
    );
  });

  it("skips ASS subtitle burn-in when subtitles are disabled", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];

    await composeSmartEditToStorage("project-smart-edit", createPlan(), assets, {
      command: "ffmpeg-test",
      storageProvider,
      subtitlesEnabled: false,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    expect(commands.some((entry) => entry.args.some((arg) => arg.includes("ass=filename=")))).toBe(
      false,
    );
  });

  it("skips ASS subtitle burn-in only for caption-hidden segments", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments[0] = {
      ...plan.segments[0]!,
      captionHidden: true,
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const subtitleFilterArgs = commands
      .flatMap((entry) => entry.args)
      .filter((arg) => arg.includes("ass=filename="));
    expect(subtitleFilterArgs).toHaveLength(1);
    expect(subtitleFilterArgs[0]).toContain("segment-image.ass");
    expect(subtitleFilterArgs[0]).not.toContain("segment-video.ass");
  });

  it("burns segment captions at the requested in-segment offset", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments[0] = {
      ...plan.segments[0]!,
      captionStartOffsetSeconds: 1.2,
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const subtitleCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.includes("segment-video.ass")),
    );
    const subtitlePath = subtitleCommand?.args
      .find((arg) => arg.includes("segment-video.ass"))
      ?.match(/filename='([^']+)'/)?.[1]
      ?.replace(/\\:/gu, ":");
    expect(subtitlePath).toBeTruthy();
    const subtitleAss = await readFile(subtitlePath!, "utf8");
    expect(subtitleAss).toContain("Dialogue: 0,0:00:01.20,0:00:04.00");
  });

  it("burns segment captions only for the requested track duration", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments[0] = {
      ...plan.segments[0]!,
      captionDurationSeconds: 1.4,
      captionStartOffsetSeconds: 0.8,
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const subtitleCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.includes("segment-video.ass")),
    );
    const subtitlePath = subtitleCommand?.args
      .find((arg) => arg.includes("segment-video.ass"))
      ?.match(/filename='([^']+)'/)?.[1]
      ?.replace(/\\:/gu, ":");
    expect(subtitlePath).toBeTruthy();
    const subtitleAss = await readFile(subtitlePath!, "utf8");
    expect(subtitleAss).toContain("Dialogue: 0,0:00:00.80,0:00:02.20");
  });

  it("trims separated source audio by its independent offset and duration", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments = plan.segments.map((segment, index) => ({
      ...segment,
      durationSeconds: 4,
      source: {
        endSecond: 6,
        kind: "generated-scene-clip",
        sceneClipAudioUrl: dataAudio,
        sceneClipUrl: dataVideo,
        sceneClipVideoOnlyUrl: dataVideo,
        startSecond: 1,
      },
      sourceAudioDurationSeconds: index === 0 ? 1.5 : undefined,
      sourceAudioFadeInSeconds: index === 0 ? 0.2 : 0,
      sourceAudioFadeOutSeconds: index === 0 ? 0.3 : 0,
      sourceAudioStartOffsetSeconds: index === 0 ? 0.7 : 0,
      transition: "cut",
    }));

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const sourceAudioCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("source-audio-segment-video-padded.wav")),
    );
    expect(sourceAudioCommand?.args.join(" ")).toContain("atrim=1:2.5");
    expect(sourceAudioCommand?.args.join(" ")).toContain("afade=t=in:st=0:d=0.20");
    expect(sourceAudioCommand?.args.join(" ")).toContain("afade=t=out:st=1.20:d=0.30");
    expect(sourceAudioCommand?.args.join(" ")).toContain("adelay=700:all=1");
    expect(sourceAudioCommand?.args.join(" ")).toContain("apad,atrim=0:4");
  });

  it("delays in-segment voiceover before concatenating the voice track", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments[0] = {
      ...plan.segments[0]!,
      voiceoverStartOffsetSeconds: 0.8,
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const voicePadCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("voice-segment-video-lane.wav")),
    );
    expect(voicePadCommand).toBeTruthy();
    expect(voicePadCommand!.args.join(" ")).toContain("adelay=800:all=1");
    expect(voicePadCommand!.args.join(" ")).toContain("atrim=0:4");
    expect(voicePadCommand!.args.join(" ")).toContain("apad,atrim=0:4");
  });

  it("trims voiceover audio to the requested track duration before padding", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments[0] = {
      ...plan.segments[0]!,
      voiceoverFadeInSeconds: 0.2,
      voiceoverFadeOutSeconds: 0.4,
      voiceoverDurationSeconds: 1.6,
      voiceoverStartOffsetSeconds: 0.5,
    };

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const voicePadCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("voice-segment-video-lane.wav")),
    );
    expect(voicePadCommand).toBeTruthy();
    expect(voicePadCommand!.args.join(" ")).toContain("atrim=0:1.6");
    expect(voicePadCommand!.args.join(" ")).toContain("afade=t=in:st=0:d=0.20");
    expect(voicePadCommand!.args.join(" ")).toContain("afade=t=out:st=1.20:d=0.40");
    expect(voicePadCommand!.args.join(" ")).toContain("adelay=500:all=1");
    expect(voicePadCommand!.args.join(" ")).toContain("apad,atrim=0:4");
  });

  it("preserves manual timeline gaps across video, source audio, and voice tracks", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSmartEditToStorage } = await import("./smartEditComposer.js");
    const { storageProvider } = createStorageProvider();
    const commands: Array<{ command: string; args: string[] }> = [];
    const plan = createPlan();
    plan.segments = plan.segments.map((segment, index) => ({
      ...segment,
      durationSeconds: 4,
      timelineStartSecond: index === 0 ? 0 : 6,
      source: {
        endSecond: 4,
        kind: "generated-scene-clip",
        sceneClipAudioUrl: dataAudio,
        sceneClipUrl: dataVideo,
        sceneClipVideoOnlyUrl: dataVideo,
        startSecond: 0,
      },
      transition: "cut",
    }));

    await composeSmartEditToStorage("project-smart-edit", plan, assets, {
      command: "ffmpeg-test",
      storageProvider,
      ttsCommand: "espeak-test",
      runCommand: async (command, args) => {
        commands.push({ command, args });
        await writeCommandOutput(args, `output:${commands.length}`);
      },
    });

    const videoGapCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("timeline-gap-2.mp4")),
    );
    expect(videoGapCommand?.args).toEqual(expect.arrayContaining(["-f", "lavfi"]));
    expect(videoGapCommand?.args.join(" ")).toContain("color=c=black");
    expect(videoGapCommand?.args.join(" ")).toContain("d=2.00");

    const sourceAudioGapCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("source-audio-gap-2.wav")),
    );
    expect(sourceAudioGapCommand?.args).toEqual(expect.arrayContaining(["-t", "2"]));

    const secondVoiceLaneCommand = commands.find((entry) =>
      entry.args.some((arg) => arg.endsWith("voice-segment-image-lane.wav")),
    );
    expect(secondVoiceLaneCommand).toBeTruthy();
    expect(secondVoiceLaneCommand!.args.join(" ")).toContain("adelay=6000:all=1");
  });
});
