import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const workdirs: string[] = [];

const makeWorkdir = async () => {
  const directory = await mkdtemp(join(tmpdir(), "shopclip-ffmpeg-test-"));
  workdirs.push(directory);
  return directory;
};

describe("ffmpeg composer", () => {
  afterEach(async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env.RENDER_EXPORT_DIR;
    delete process.env.FFMPEG_PATH;
    await Promise.all(
      workdirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("downloads remote scene clips before ffmpeg receives concat inputs", async () => {
    const exportRoot = await makeWorkdir();
    const { materializeSceneClipInputs } = await import("./ffmpegComposer.js");
    const fetchMock = vi.fn(
      async (url: string | URL | Request) =>
        new Response(`clip:${String(url)}`, {
          headers: {
            "content-type": "video/mp4",
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const inputs = await materializeSceneClipInputs(
      [
        "https://cdn.example.test/hook.mp4?X-Amz-Signature=def",
        "https://cdn.example.test/detail.mp4?X-Amz-Signature=abc",
      ],
      exportRoot,
      fetchMock as unknown as typeof fetch,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(inputs).toEqual([join(exportRoot, "scene-1.mp4"), join(exportRoot, "scene-2.mp4")]);
    await expect(readFile(inputs[0]!, "utf8")).resolves.toContain("hook.mp4");
    await expect(readFile(inputs[1]!, "utf8")).resolves.toContain("detail.mp4");
  });

  it("includes the terminating signal when ffmpeg is killed", async () => {
    const { formatFfmpegExitError } = await import("./ffmpegComposer.js");

    expect(formatFfmpegExitError(null, "SIGTERM", "ffmpeg version 6.1-static").message).toContain(
      "signal SIGTERM",
    );
  });

  it("builds an ASS subtitle filter that reads storyboard copy from a file", async () => {
    const { buildSubtitleFilter } = await import("./ffmpegComposer.js");

    const filter = buildSubtitleFilter("/tmp/shopclip/subtitle:1.ass");

    expect(filter).toContain("ass=");
    expect(filter).toContain("filename='/tmp/shopclip/subtitle\\:1.ass'");
  });

  it("burns each scene subtitle before concatenating the captioned clips", async () => {
    const exportRoot = await makeWorkdir();
    process.env.RENDER_EXPORT_DIR = exportRoot;
    const { composeSceneClipsToLocalFile } = await import("./ffmpegComposer.js");
    const commands: Array<{ command: string; args: string[] }> = [];
    const fetchMock = vi.fn(
      async (url: string | URL | Request) =>
        new Response(`clip:${String(url)}`, {
          headers: {
            "content-type": "video/mp4",
          },
        }),
    );

    const result = await composeSceneClipsToLocalFile(
      "project-caption",
      [
        {
          sceneId: "scene-2",
          order: 2,
          subtitle: "Second scene copy",
          status: "completed",
          progress: 100,
          videoUrl: "https://cdn.example.test/scene-2.mp4",
        },
        {
          sceneId: "scene-1",
          order: 1,
          subtitle: "Opening hook copy",
          status: "completed",
          progress: 100,
          videoUrl: "https://cdn.example.test/scene-1.mp4",
        },
      ],
      {
        command: "ffmpeg-test",
        fetchImpl: fetchMock as unknown as typeof fetch,
        runCommand: async (command, args) => {
          commands.push({ command, args });
        },
      },
    );

    expect(result?.localUrl).toMatch(/^\/api\/render-exports\/project-caption\/.+\/export\.mp4$/);
    expect(commands).toHaveLength(3);
    expect(commands[0]?.args).toContain("-vf");
    expect(commands[0]?.args.join(" ")).toContain("ass=filename=");
    expect(commands[0]?.args.at(-1)).toContain("captioned-1.mp4");
    expect(commands[1]?.args.join(" ")).toContain("ass=filename=");
    expect(commands[1]?.args.at(-1)).toContain("captioned-2.mp4");
    expect(commands[2]?.args).toEqual(expect.arrayContaining(["-f", "concat", "-safe", "0", "-i"]));

    const firstSubtitleArg = commands[0]?.args[commands[0].args.indexOf("-vf") + 1];
    const secondSubtitleArg = commands[1]?.args[commands[1].args.indexOf("-vf") + 1];
    const firstSubtitlePath = firstSubtitleArg?.match(/filename='([^']+)'/)?.[1]?.replace(/\\:/gu, ":");
    const secondSubtitlePath = secondSubtitleArg?.match(/filename='([^']+)'/)?.[1]?.replace(/\\:/gu, ":");
    expect(firstSubtitlePath).toBeTruthy();
    expect(secondSubtitlePath).toBeTruthy();
    await expect(readFile(firstSubtitlePath!, "utf8")).resolves.toContain(
      "Dialogue: 0,0:00:00.00,9:59:59.00,Default,,0,0,0,,Opening hook copy",
    );
    await expect(readFile(secondSubtitlePath!, "utf8")).resolves.toContain(
      "Dialogue: 0,0:00:00.00,9:59:59.00,Default,,0,0,0,,Second scene copy",
    );

    const concatListPath = commands[2]?.args[commands[2].args.indexOf("-i") + 1];
    expect(concatListPath).toBeTruthy();
    await expect(readFile(concatListPath!, "utf8")).resolves.toContain("captioned-1.mp4");
    await expect(readFile(concatListPath!, "utf8")).resolves.toContain("captioned-2.mp4");
  });
});
