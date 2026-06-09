import { describe, expect, it } from "vitest";
import type { SmartEditPlan, SmartEditSegment, SmartEditVisualEffect } from "@shopclip/shared";

import {
  addSmartEditSegmentAudioVolumeKeyframeAtPlayhead,
  addSmartEditVisualEffectAmountKeyframe,
  addSmartEditVisualEffectToSegment,
  addSmartEditVisualKeyframeAtPlayhead,
  moveSmartEditVisualEffectOnSegment,
  removeSmartEditSegmentAudioVolumeKeyframe,
  removeSmartEditVisualEffectAmountKeyframe,
  removeSmartEditVisualEffectFromSegment,
  removeSmartEditVisualKeyframe,
  updateSmartEditVisualEffectOnSegment,
} from "./SmartEditVisualEditOperations";

const segment = (overrides: Partial<SmartEditSegment> = {}): SmartEditSegment => ({
  assetTags: [],
  durationSeconds: 8,
  enabled: true,
  id: "segment-1",
  order: 1,
  playbackRate: 1,
  rationale: "Keep the hero product centered.",
  sceneId: "scene-1",
  source: { assetId: "asset-1", type: "asset" },
  sourceAudioMuted: false,
  subtitle: "Hook",
  timelineStartSecond: 4,
  transition: "cut",
  voiceover: "Hook",
  voiceoverMuted: false,
  ...overrides,
});

const plan = (selected = segment()): SmartEditPlan => ({
  audio: { bgmTrack: "creator-pop" },
  createdAt: "2026-06-09T00:00:00.000Z",
  id: "plan-1",
  projectId: "project-1",
  segments: [selected],
  strategy: "Cut fast.",
  targetDurationSeconds: selected.durationSeconds,
});

const effect = (
  id: string,
  type: SmartEditVisualEffect["type"] = "blur",
): SmartEditVisualEffect => ({
  enabled: true,
  id,
  params: { amount: 0.5, radius: 4 },
  type,
});

describe("SmartEditVisualEditOperations", () => {
  it("adds and removes visual keyframes relative to the segment timeline start", () => {
    const selected = segment({ timelineStartSecond: 4 });
    const nextPlan = addSmartEditVisualKeyframeAtPlayhead({
      boundedPlayheadSeconds: 6,
      createToken: () => "token",
      plan: plan(selected),
      selectedSegment: selected,
    });

    const keyframe = nextPlan.segments[0]?.visualKeyframes?.[0];
    expect(keyframe).toMatchObject({
      id: "segment-1-visual-kf-token",
      timeSecond: 2,
      transform: { offsetXPercent: 0, offsetYPercent: 0, scale: 1 },
    });

    const removedPlan = removeSmartEditVisualKeyframe({
      keyframeId: keyframe!.id,
      plan: nextPlan,
      selectedSegment: nextPlan.segments[0]!,
    });
    expect(removedPlan.segments[0]?.visualKeyframes).toEqual([]);
  });

  it("adds, updates, removes, and reorders visual effects", () => {
    const selected = segment({
      visualEffects: [effect("blur-1", "blur"), effect("contrast-1", "contrast")],
    });

    const addedPlan = addSmartEditVisualEffectToSegment({
      createToken: () => "token",
      plan: plan(selected),
      selectedSegment: selected,
      type: "brightness",
    });
    expect(addedPlan.segments[0]?.visualEffects?.map((item) => item.type)).toEqual([
      "blur",
      "contrast",
      "brightness",
    ]);

    const updatedPlan = updateSmartEditVisualEffectOnSegment({
      effectId: "blur-1",
      plan: addedPlan,
      selectedSegment: addedPlan.segments[0]!,
      update: (item) => ({ ...item, enabled: false }),
    });
    expect(updatedPlan.segments[0]?.visualEffects?.[0]?.enabled).toBe(false);

    const movedPlan = moveSmartEditVisualEffectOnSegment({
      direction: 1,
      effectId: "blur-1",
      plan: updatedPlan,
      selectedSegment: updatedPlan.segments[0]!,
    });
    expect(movedPlan.segments[0]?.visualEffects?.map((item) => item.id)).toEqual([
      "contrast-1",
      "blur-1",
      "segment-1-brightness-effect-token",
    ]);

    const removedPlan = removeSmartEditVisualEffectFromSegment({
      effectId: "blur-1",
      plan: movedPlan,
      selectedSegment: movedPlan.segments[0]!,
    });
    expect(removedPlan.segments[0]?.visualEffects?.map((item) => item.id)).toEqual([
      "contrast-1",
      "segment-1-brightness-effect-token",
    ]);
  });

  it("adds and removes visual effect amount keyframes at the playhead", () => {
    const selected = segment({
      timelineStartSecond: 3,
      visualEffects: [effect("blur-1")],
    });
    const nextPlan = addSmartEditVisualEffectAmountKeyframe({
      boundedPlayheadSeconds: 5,
      createToken: () => "token",
      effectId: "blur-1",
      plan: plan(selected),
      selectedSegment: selected,
    });

    const keyframe = nextPlan.segments[0]?.visualEffects?.[0]?.keyframes?.[0];
    expect(keyframe).toMatchObject({
      id: "blur-1-amount-kf-token",
      param: "amount",
      timeSecond: 2,
      value: 0.5,
    });

    const removedPlan = removeSmartEditVisualEffectAmountKeyframe({
      effectId: "blur-1",
      keyframeId: keyframe!.id,
      plan: nextPlan,
      selectedSegment: nextPlan.segments[0]!,
    });
    expect(removedPlan.segments[0]?.visualEffects?.[0]?.keyframes).toEqual([]);
  });

  it("adds and removes source and voice volume keyframes using clip-local time", () => {
    const selected = segment({
      durationSeconds: 10,
      sourceAudioDurationSeconds: 6,
      sourceAudioStartOffsetSeconds: 1,
      sourceAudioVolume: 0.8,
      timelineStartSecond: 2,
      voiceoverDurationSeconds: 5,
      voiceoverStartOffsetSeconds: 2,
      voiceoverVolume: 0.6,
    });

    const sourcePlan = addSmartEditSegmentAudioVolumeKeyframeAtPlayhead({
      boundedPlayheadSeconds: 5,
      createToken: () => "source-token",
      plan: plan(selected),
      selectedSegment: selected,
      selectedTrackClip: undefined,
      trackId: "sourceAudio",
    });
    expect(sourcePlan.segments[0]?.sourceAudioVolumeKeyframes?.[0]).toMatchObject({
      id: "segment-1-source-volume-kf-source-token",
      timeSecond: 2,
      volume: 0.8,
    });

    const voicePlan = addSmartEditSegmentAudioVolumeKeyframeAtPlayhead({
      boundedPlayheadSeconds: 8,
      createToken: () => "voice-token",
      plan: sourcePlan,
      selectedSegment: sourcePlan.segments[0]!,
      selectedTrackClip: undefined,
      trackId: "voice",
    });
    expect(voicePlan.segments[0]?.voiceoverVolumeKeyframes?.[0]).toMatchObject({
      id: "segment-1-voice-volume-kf-voice-token",
      timeSecond: 4,
      volume: 0.6,
    });

    const removedPlan = removeSmartEditSegmentAudioVolumeKeyframe({
      keyframeId: "segment-1-source-volume-kf-source-token",
      plan: voicePlan,
      selectedSegment: voicePlan.segments[0]!,
      trackId: "sourceAudio",
    });
    expect(removedPlan.segments[0]?.sourceAudioVolumeKeyframes).toEqual([]);
    expect(removedPlan.segments[0]?.voiceoverVolumeKeyframes).toHaveLength(1);
  });
});
