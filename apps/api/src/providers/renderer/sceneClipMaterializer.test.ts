import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import type { StorageProvider } from "../storage/storageProvider.js";
import {
  analyzeWaveformPcm,
  materializeSceneClipForSmartEdit,
} from "./sceneClipMaterializer.js";

const floatPcm = (samples: number[]): Buffer => {
  const buffer = Buffer.alloc(samples.length * Float32Array.BYTES_PER_ELEMENT);
  samples.forEach((sample, index) => {
    buffer.writeFloatLE(sample, index * Float32Array.BYTES_PER_ELEMENT);
  });
  return buffer;
};

describe("scene clip materializer", () => {
  it("computes RMS and peak waveform buckets from mono float PCM", () => {
    const waveform = analyzeWaveformPcm(floatPcm([0, 0.5, -1, 0.25]), 4, 2);

    expect(waveform).toMatchObject({
      sampleRate: 4,
      durationSeconds: 1,
      bucketDurationSeconds: 0.5,
      buckets: [
        { index: 0, startSecond: 0, durationSeconds: 0.5, peak: 0.5 },
        { index: 1, startSecond: 0.5, durationSeconds: 0.5, peak: 1 },
      ],
    });
    expect(waveform?.buckets[0]?.rms).toBeCloseTo(0.3536, 4);
    expect(waveform?.buckets[1]?.rms).toBeCloseTo(0.7289, 4);
  });

  it("stores generated scene clips as video, audio, text, and waveform materials", async () => {
    const uploads: Array<{ contentType: string; objectKey: string }> = [];
    const storageProvider: StorageProvider = {
      createUploadIntent: () => {
        throw new Error("not used");
      },
      createReadUrl: () => {
        throw new Error("not used");
      },
      deleteObject: async () => undefined,
      uploadObject: async (input) => {
        uploads.push({ contentType: input.contentType, objectKey: input.objectKey });
        return {
          objectKey: input.objectKey,
          provider: "local",
          publicUrl: `https://cdn.example.test/${input.objectKey}`,
        };
      },
    };

    const materialized = await materializeSceneClipForSmartEdit(
      "project-1",
      "render-1",
      {
        order: 1,
        progress: 100,
        sceneId: "scene-1",
        status: "completed",
        subtitle: "Hook line",
        videoUrl: "data:video/mp4;base64,c291cmNl",
      },
      {
        runCommand: async (_command, args) => {
          const outputPath = args.at(-1);
          if (!outputPath) {
            throw new Error("Missing output path");
          }
          await mkdir(dirname(outputPath), { recursive: true });
          if (args.includes("f32le")) {
            await writeFile(outputPath, floatPcm([0, 0.2, 0.6, -0.8, 1, -0.4, 0.1, 0]));
            return;
          }
          await writeFile(outputPath, Buffer.from("material"));
        },
        storageProvider,
      },
    );

    expect(materialized.material).toMatchObject({
      status: "ready",
      text: "Hook line",
      audioWaveform: {
        sampleRate: 8000,
        buckets: expect.arrayContaining([
          expect.objectContaining({ peak: expect.any(Number), rms: expect.any(Number) }),
        ]),
      },
    });
    expect(materialized.material?.audioWaveform?.buckets.some((bucket) => bucket.peak > 0)).toBe(
      true,
    );
    expect(uploads.map((upload) => upload.contentType)).toEqual(["video/mp4", "audio/mp4"]);
  });
});
