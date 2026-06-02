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
      order: 1,
      rationale: "Use the structured product demo slice.",
      sceneId: "scene-1",
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
      order: 2,
      rationale: "Use the product hero image for the CTA.",
      sceneId: "scene-2",
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
});
