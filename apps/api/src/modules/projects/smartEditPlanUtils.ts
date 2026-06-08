import type {
  RenderTask,
  SceneRenderClip,
  SmartEditPlan,
  SmartEditSegmentOutput,
  SmartEditTimeline,
  StoryboardScene,
} from "@shopclip/shared";

export const segmentOutputsByScene = (
  outputs: SmartEditSegmentOutput[],
): Map<string, SmartEditSegmentOutput> =>
  new Map(outputs.map((output) => [output.sceneId, output]));

export const containsReadableTimelineText = (text: string): boolean =>
  /[\p{L}\p{N}]/u.test(text) &&
  !/^[\s?？�□■◇◆]+$/u.test(text.trim()) &&
  ([...text.replace(/\s/gu, "")].filter((character) => /[?？�□■◇◆]/u.test(character)).length /
    Math.max(1, [...text.replace(/\s/gu, "")].length) <
    0.35);

export const readableTimelineText = (
  ...candidates: Array<string | undefined>
): string | undefined =>
  candidates.find((candidate) => candidate && containsReadableTimelineText(candidate));

export const sanitizeSmartEditSegmentText = (
  segment: SmartEditPlan["segments"][number],
  scene: StoryboardScene | undefined,
): SmartEditPlan["segments"][number] => ({
  ...segment,
  subtitle:
    readableTimelineText(segment.subtitle, segment.voiceover, scene?.subtitle, scene?.voiceover) ??
    segment.subtitle,
  voiceover:
    readableTimelineText(segment.voiceover, segment.subtitle, scene?.voiceover, scene?.subtitle) ??
    segment.voiceover,
});

export const smartEditSegmentClipsForPlan = (
  plan: SmartEditPlan,
  videoUrl?: string,
): SceneRenderClip[] =>
  plan.segments
    .filter((segment) => segment.enabled)
    .map((segment) => ({
      sceneId: segment.sceneId,
      order: segment.order,
      progress: videoUrl ? 100 : 45,
      status: videoUrl ? ("completed" as const) : ("running" as const),
      subtitle: segment.subtitle,
      videoUrl,
    }));

export const buildSmartEditRefreshPlan = ({
  createId,
  currentPlan,
  nowIso,
  projectId,
  refreshedSegment,
  segmentOutputs,
  scenes,
  targetSceneId,
}: {
  createId: () => string;
  currentPlan: SmartEditPlan;
  nowIso: string;
  projectId: string;
  refreshedSegment: SmartEditPlan["segments"][number];
  segmentOutputs: SmartEditSegmentOutput[];
  scenes: StoryboardScene[];
  targetSceneId: string;
}): SmartEditPlan => {
  const outputsByScene = segmentOutputsByScene(segmentOutputs);
  const scenesById = new Map(scenes.map((scene) => [scene.id, scene]));
  const segments = currentPlan.segments.map((segment) => {
    if (segment.sceneId === targetSceneId) {
      return {
        ...sanitizeSmartEditSegmentText(refreshedSegment, scenesById.get(segment.sceneId)),
        id: `edit_segment_${targetSceneId}_${createId()}`,
        order: segment.order,
      };
    }
    if (!segment.enabled) {
      return segment;
    }
    const previousOutput = outputsByScene.get(segment.sceneId);
    if (!previousOutput) {
      throw new Error(
        `Missing reusable smart edit segment output for scene ${segment.sceneId}. Run a full smart edit first.`,
      );
    }
    return {
      ...sanitizeSmartEditSegmentText(segment, scenesById.get(segment.sceneId)),
      rationale: `${segment.rationale} Reused the previous uploaded segment during partial refresh.`,
      source: {
        kind: "generated-scene-clip" as const,
        sceneClipUrl: previousOutput.videoUrl,
      },
    };
  });
  const targetDurationSeconds = Math.min(
    600,
    Math.max(
      1,
      segments
        .filter((segment) => segment.enabled)
        .reduce((sum, segment) => sum + segment.durationSeconds, 0),
    ),
  );
  return {
    ...currentPlan,
    id: createId(),
    createdAt: nowIso,
    projectId,
    segments,
    strategy: `${currentPlan.strategy} Partial refresh reused existing segment outputs and recomposed the final video.`,
    targetDurationSeconds,
  };
};

export const smartEditFailureMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const latestReadySceneMaterialsByScene = (renderTasks: RenderTask[]): Map<string, SceneRenderClip> => {
  const sceneClipsByScene = new Map<string, SceneRenderClip>();
  const completedSceneRenders = renderTasks
    .filter(
      (task) =>
        task.provider === "volcengine-seedance" &&
        task.status === "completed" &&
        task.sceneClips?.some((clip) => clip.material?.status === "ready" && clip.material.videoOnlyUrl),
    )
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

  for (const task of completedSceneRenders) {
    for (const clip of task.sceneClips ?? []) {
      if (
        sceneClipsByScene.has(clip.sceneId) ||
        clip.status !== "completed" ||
        clip.material?.status !== "ready" ||
        !clip.material.videoOnlyUrl
      ) {
        continue;
      }
      sceneClipsByScene.set(clip.sceneId, clip);
    }
  }

  return sceneClipsByScene;
};

export const applyLatestSceneMaterialsToSmartEditPlan = (
  plan: SmartEditPlan,
  renderTasks: RenderTask[],
): { appliedCount: number; plan: SmartEditPlan } => {
  const latestMaterials = latestReadySceneMaterialsByScene(renderTasks);
  let appliedCount = 0;
  const segments = plan.segments.map((segment) => {
    const clip = latestMaterials.get(segment.sceneId);
    const material = clip?.material;
    if (!clip || material?.status !== "ready" || !material.videoOnlyUrl) {
      return segment;
    }

    appliedCount += 1;
    return {
      ...segment,
      sourceAudioDurationSeconds:
        segment.sourceAudioDurationSeconds ?? material.audioWaveform?.durationSeconds,
      sourceAudioMuted: material.audioUrl ? false : segment.sourceAudioMuted,
      sourceAudioVolume: material.audioUrl ? (segment.sourceAudioVolume ?? 1) : segment.sourceAudioVolume,
      source: {
        ...segment.source,
        kind: "generated-scene-clip" as const,
        sceneClipAudioUrl: material.audioUrl,
        sceneClipAudioWaveform: material.audioWaveform,
        sceneClipUrl: clip.videoUrl ?? segment.source.sceneClipUrl,
        sceneClipVideoOnlyUrl: material.videoOnlyUrl,
      },
    };
  });
  const timeline = plan.timeline
    ? {
        ...plan.timeline,
        elements: plan.timeline.elements.map((element) => {
          const clip = element.sceneId ? latestMaterials.get(element.sceneId) : undefined;
          const material = clip?.material;
          if (!clip || material?.status !== "ready" || !material.videoOnlyUrl) {
            return element;
          }
          if (element.kind === "video" || element.trackId === "video-main") {
            return {
              ...element,
              sourceObjectKey: material.videoObjectKey ?? element.sourceObjectKey,
              sourceUrl: material.videoOnlyUrl,
            };
          }
          if ((element.kind === "audio" || element.trackId === "audio-source") && material.audioUrl) {
            return {
              ...element,
              audioWaveform: material.audioWaveform ?? element.audioWaveform,
              sourceObjectKey: material.audioObjectKey ?? element.sourceObjectKey,
              sourceUrl: material.audioUrl,
            };
          }
          return element;
        }),
      }
    : plan.timeline;

  return {
    appliedCount,
    plan: {
      ...plan,
      segments,
      timeline,
    },
  };
};

export const withSmartEditTimeline = (plan: SmartEditPlan): SmartEditPlan => {
  const enabledSegments = [...plan.segments]
    .filter((segment) => segment.enabled)
    .sort((left, right) => left.order - right.order);
  let cursor = 0;
  const hasManualTimelineStarts = enabledSegments.some(
    (segment) => (segment.timelineStartSecond ?? 0) > 0,
  );
  const tracks: SmartEditTimeline["tracks"] = [
    {
      hidden: false,
      id: "video-main",
      kind: "video" as const,
      label: "Video",
      locked: false,
      muted: false,
    },
    {
      hidden: false,
      id: "audio-source",
      kind: "audio" as const,
      label: "Source audio",
      locked: false,
      muted: false,
    },
    {
      hidden: false,
      id: "text-copy",
      kind: "text" as const,
      label: "Text",
      locked: false,
      muted: false,
    },
    {
      hidden: false,
      id: "voiceover",
      kind: "audio" as const,
      label: "Voice",
      locked: false,
      muted: false,
    },
    ...(plan.audio.bgmTrack !== "none"
      ? [
          {
            hidden: false,
            id: "bgm-bed",
            kind: "bgm" as const,
            label: "BGM",
            locked: false,
            muted: false,
          },
        ]
      : []),
  ];
  const clipDurationWithinSegment = (
    durationSeconds: number | undefined,
    offsetSeconds: number | undefined,
    segmentDurationSeconds: number,
  ): number => {
    const offset = Math.max(0, Math.min(Math.max(0, segmentDurationSeconds - 0.1), offsetSeconds ?? 0));
    const maxDuration = Math.max(0.1, segmentDurationSeconds - offset);
    return Math.max(0.1, Math.min(maxDuration, durationSeconds ?? maxDuration));
  };
  const elements: SmartEditTimeline["elements"] = enabledSegments.flatMap((segment) => {
    const startSecond = hasManualTimelineStarts
      ? Math.max(0, Math.min(600, segment.timelineStartSecond ?? 0))
      : cursor;
    const durationSeconds = segment.durationSeconds;
    cursor = Math.max(cursor, startSecond + durationSeconds);
    const sourceStart = segment.source.startSecond ?? 0;
    const sourceEnd = segment.source.endSecond;
    const sourceAudioOffsetSeconds = segment.sourceAudioStartOffsetSeconds ?? 0;
    const sourceAudioDurationSeconds = clipDurationWithinSegment(
      segment.sourceAudioDurationSeconds,
      sourceAudioOffsetSeconds,
      durationSeconds,
    );
    const captionOffsetSeconds = segment.captionStartOffsetSeconds ?? 0;
    const captionDurationSeconds = clipDurationWithinSegment(
      segment.captionDurationSeconds,
      captionOffsetSeconds,
      durationSeconds,
    );
    const voiceoverOffsetSeconds = segment.voiceoverStartOffsetSeconds ?? 0;
    const voiceoverDurationSeconds = clipDurationWithinSegment(
      segment.voiceoverDurationSeconds,
      voiceoverOffsetSeconds,
      durationSeconds,
    );
    return [
      {
        detachedAudio: false,
        durationSeconds,
        hidden: false,
        id: `${segment.id}-video`,
        kind: "video" as const,
        label: `Scene ${segment.order}`,
        muted: false,
        playbackRate: segment.playbackRate ?? 1,
        sceneId: segment.sceneId,
        segmentId: segment.id,
        sourceDurationSeconds:
          sourceEnd !== undefined ? Math.max(0.1, sourceEnd - sourceStart) : durationSeconds,
        sourceUrl: segment.source.sceneClipVideoOnlyUrl ?? segment.source.sceneClipUrl ?? segment.source.imageUrl,
        startSecond,
        trackId: "video-main",
        trimEndSecond: sourceEnd,
        trimStartSecond: sourceStart,
      },
      ...(segment.source.sceneClipAudioUrl
        ? [
            {
              detachedAudio: true,
              durationSeconds: sourceAudioDurationSeconds,
              hidden: false,
              id: `${segment.id}-audio`,
              kind: "audio" as const,
              label: `Scene ${segment.order} audio`,
              muted: segment.sourceAudioMuted ?? false,
              audioFadeInSeconds: segment.sourceAudioFadeInSeconds ?? 0,
              audioFadeOutSeconds: segment.sourceAudioFadeOutSeconds ?? 0,
              audioVolume: segment.sourceAudioVolume ?? 1,
              audioVolumeKeyframes: segment.sourceAudioVolumeKeyframes,
              audioWaveform: segment.source.sceneClipAudioWaveform,
              playbackRate: segment.playbackRate ?? 1,
              sceneId: segment.sceneId,
              segmentId: segment.id,
              sourceUrl: segment.source.sceneClipAudioUrl,
              startSecond: startSecond + sourceAudioOffsetSeconds,
              trackId: "audio-source",
              trimEndSecond:
                sourceEnd === undefined
                  ? sourceStart + sourceAudioDurationSeconds * (segment.playbackRate ?? 1)
                  : Math.min(
                      sourceEnd,
                      sourceStart + sourceAudioDurationSeconds * (segment.playbackRate ?? 1),
                    ),
              trimStartSecond: sourceStart,
            },
          ]
        : []),
      {
        detachedAudio: false,
        durationSeconds: captionDurationSeconds,
        hidden: segment.captionHidden ?? false,
        id: `${segment.id}-text`,
        kind: "text" as const,
        label: segment.subtitle,
        muted: false,
        playbackRate: 1,
        sceneId: segment.sceneId,
        segmentId: segment.id,
        startSecond: startSecond + captionOffsetSeconds,
        text: segment.subtitle,
        trackId: "text-copy",
        trimStartSecond: 0,
      },
      ...(segment.voiceover.trim()
        ? [
            {
              detachedAudio: false,
              durationSeconds: voiceoverDurationSeconds,
              hidden: false,
              id: `${segment.id}-voice`,
              kind: "audio" as const,
              label: segment.voiceover,
              muted: false,
              audioFadeInSeconds: segment.voiceoverFadeInSeconds ?? 0,
              audioFadeOutSeconds: segment.voiceoverFadeOutSeconds ?? 0,
              audioVolume: segment.voiceoverVolume ?? 1,
              audioVolumeKeyframes: segment.voiceoverVolumeKeyframes,
              playbackRate: 1,
              sceneId: segment.sceneId,
              segmentId: segment.id,
              startSecond: startSecond + voiceoverOffsetSeconds,
              text: segment.voiceover,
              trackId: "voiceover",
              trimStartSecond: 0,
            },
          ]
        : []),
    ];
  });

  if (plan.audio.bgmTrack !== "none" && cursor > 0) {
    elements.push({
      detachedAudio: false,
      durationSeconds: cursor,
      hidden: false,
      id: "bgm-bed",
      kind: "bgm",
      label: plan.audio.bgmTrack,
      muted: false,
      playbackRate: 1,
      startSecond: 0,
      trackId: "bgm-bed",
      trimStartSecond: 0,
    });
  }

  return {
    ...plan,
    timeline: {
      durationSeconds: cursor,
      elements,
      scale: 1,
      tracks,
    },
  };
};
