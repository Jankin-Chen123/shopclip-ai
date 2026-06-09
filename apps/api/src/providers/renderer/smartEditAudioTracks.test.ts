import { describe, expect, it } from "vitest";
import type { SmartEditPlan } from "@shopclip/shared";

import {
  addAudioTracks,
  createVoiceoverTrack,
  voiceForLanguage,
  type SmartEditCommandRunner,
} from "./smartEditAudioTracks.js";

const plan = (overrides: Partial<SmartEditPlan> = {}): SmartEditPlan =>
  ({
    audio: {
      bgmTrack: "none",
      targetLanguage: "zh-CN",
      voice: "clear-host",
    },
    createdAt: "2026-06-09T00:00:00.000Z",
    id: "plan-1",
    projectId: "project-1",
    segments: [],
    strategy: "test",
    targetDurationSeconds: 8,
    ...overrides,
  }) as SmartEditPlan;

describe("smart edit audio tracks", () => {
  it("maps target languages to espeak voices with stable fallbacks", () => {
    expect(voiceForLanguage("zh-CN")).toBe("cmn");
    expect(voiceForLanguage("en-US")).toBe("en-us");
    expect(voiceForLanguage("ja-JP")).toBe("ja");
    expect(voiceForLanguage("pt-BR")).toBe("pt-br");
    expect(voiceForLanguage(undefined)).toBe("en-us");
  });

  it("copies the input video when no replacement audio tracks are requested", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const run: SmartEditCommandRunner = async (command, args) => {
      calls.push({ command, args });
    };

    await addAudioTracks("ffmpeg", "input.mp4", "output.mp4", plan(), run);

    expect(calls).toEqual([
      {
        command: "ffmpeg",
        args: ["-y", "-i", "input.mp4", "-c", "copy", "output.mp4"],
      },
    ]);
  });

  it("renders voiceover lanes with target language, delay, fade, volume, and mix filters", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const run: SmartEditCommandRunner = async (command, args) => {
      calls.push({ command, args });
    };

    const outputPath = await createVoiceoverTrack(
      "ffmpeg",
      "espeak-ng",
      plan({
        segments: [
          {
            assetTags: [],
            captionHidden: false,
            captionStartOffsetSeconds: 0,
            durationSeconds: 4,
            enabled: true,
            id: "voice segment!*",
            order: 1,
            rationale: "test",
            sceneId: "scene-1",
            source: {
              kind: "video-slice",
            },
            sourceAudioMuted: false,
            subtitle: "caption",
            timelineStartSecond: 2,
            transition: "cut",
            voiceover: "  Product line  ",
            voiceoverDurationSeconds: 1.5,
            voiceoverFadeInSeconds: 0.2,
            voiceoverFadeOutSeconds: 0.3,
            voiceoverStartOffsetSeconds: 0.5,
            voiceoverVolume: 0.6,
          },
        ],
      }),
      "work",
      run,
    );

    expect(outputPath).toBe("work\\voiceover.wav");
    expect(calls[0]).toEqual({
      command: "espeak-ng",
      args: ["-v", "cmn", "-w", "work\\voice-voice-segment.wav", "Product line"],
    });
    expect(calls[1]?.command).toBe("ffmpeg");
    const voiceFilter = calls[1]?.args.at(calls[1]?.args.indexOf("-af") + 1);
    expect(voiceFilter).toContain("afade=t=in:st=0:d=0.2");
    expect(voiceFilter).toContain("afade=t=out:st=1.20:d=0.30");
    expect(voiceFilter).toContain("volume=0.600");
    expect(voiceFilter).toContain("adelay=2500:all=1");
    expect(calls[2]).toEqual({
      command: "ffmpeg",
      args: [
        "-y",
        "-i",
        "work\\voice-voice-segment-lane.wav",
        "-filter_complex",
        "[0:a]amix=inputs=1:duration=longest,atrim=0:6[aout]",
        "-map",
        "[aout]",
        "-c:a",
        "pcm_s16le",
        "work\\voiceover.wav",
      ],
    });
  });
});
