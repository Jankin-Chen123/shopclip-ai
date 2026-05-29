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
    await Promise.all(workdirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("downloads remote scene clips before ffmpeg receives concat inputs", async () => {
    const exportRoot = await makeWorkdir();
    const { materializeSceneClipInputs } = await import("./ffmpegComposer.js");
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
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
    expect(inputs).toEqual([
      join(exportRoot, "scene-1.mp4"),
      join(exportRoot, "scene-2.mp4"),
    ]);
    await expect(readFile(inputs[0]!, "utf8")).resolves.toContain("hook.mp4");
    await expect(readFile(inputs[1]!, "utf8")).resolves.toContain("detail.mp4");
  });

  it("includes the terminating signal when ffmpeg is killed", async () => {
    const { formatFfmpegExitError } = await import("./ffmpegComposer.js");

    expect(formatFfmpegExitError(null, "SIGTERM", "ffmpeg version 6.1-static").message).toContain(
      "signal SIGTERM",
    );
  });
});
