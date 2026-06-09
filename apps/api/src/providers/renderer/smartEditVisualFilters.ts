import type { SmartEditSegment, VideoGenerationSettings } from "@shopclip/shared";

import {
  escapedFfmpegExpression,
  linearKeyframeExpression,
} from "./smartEditFfmpegExpressions.js";
import {
  normalizeDuration,
  normalizePlaybackRate,
} from "./smartEditTimelinePlan.js";

export type OutputDimensions = {
  height: number;
  width: number;
};

const even = (value: number): number => {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
};

export const smartEditOutputDimensions = (
  videoSettings?: VideoGenerationSettings,
): OutputDimensions => {
  const base = Number.parseInt(videoSettings?.resolution ?? "720p", 10) || 720;
  const ratio = videoSettings?.ratio ?? "9:16";
  const [ratioWidth = 9, ratioHeight = 16] = ratio.split(":").map((part) => Number(part));
  if (!Number.isFinite(ratioWidth) || !Number.isFinite(ratioHeight) || ratioWidth <= 0 || ratioHeight <= 0) {
    return { height: even(base * (16 / 9)), width: even(base) };
  }
  if (ratioWidth === ratioHeight) {
    return { height: even(base), width: even(base) };
  }
  if (ratioWidth > ratioHeight) {
    return {
      height: even(base),
      width: even(base * (ratioWidth / ratioHeight)),
    };
  }
  return {
    height: even(base * (ratioHeight / ratioWidth)),
    width: even(base),
  };
};

const normalizedTransform = (segment: SmartEditSegment) => ({
  offsetXPercent: Math.max(-100, Math.min(100, segment.transform?.offsetXPercent ?? 0)),
  offsetYPercent: Math.max(-100, Math.min(100, segment.transform?.offsetYPercent ?? 0)),
  opacity: Math.max(0, Math.min(1, segment.transform?.opacity ?? 1)),
  rotateDegrees: Math.max(-180, Math.min(180, segment.transform?.rotateDegrees ?? 0)),
  scale: Math.max(0.1, Math.min(4, segment.transform?.scale ?? 1)),
});

const normalizedEffects = (segment: SmartEditSegment) => ({
  blur: Math.max(0, Math.min(20, segment.effects?.blur ?? 0)),
  fadeInSeconds: Math.max(0, Math.min(5, segment.effects?.fadeInSeconds ?? 0)),
  fadeOutSeconds: Math.max(0, Math.min(5, segment.effects?.fadeOutSeconds ?? 0)),
  sharpen: Math.max(0, Math.min(2, segment.effects?.sharpen ?? 0)),
});

const clampVisualEffectAmount = (
  type: NonNullable<SmartEditSegment["visualEffects"]>[number]["type"],
  amount: number,
): number => {
  if (type === "blur") {
    return Math.max(0, Math.min(20, amount));
  }
  if (type === "sharpen") {
    return Math.max(0, Math.min(2, amount));
  }
  if (type === "brightness") {
    return Math.max(-1, Math.min(1, amount));
  }
  if (type === "contrast" || type === "saturation") {
    return Math.max(0, Math.min(3, amount));
  }
  return Math.max(0, Math.min(1, amount));
};

const normalizedVisualEffects = (segment: SmartEditSegment) =>
  (segment.visualEffects ?? [])
    .filter((effect) => effect.enabled !== false)
    .slice(0, 20)
    .map((effect) => ({
      id: effect.id,
      type: effect.type,
      amount: clampVisualEffectAmount(
        effect.type,
        Number.isFinite(effect.params?.amount) ? effect.params.amount : 1,
      ),
      keyframes: (effect.keyframes ?? [])
        .filter((keyframe) => keyframe.param === "amount")
        .slice(0, 40)
        .map((keyframe) => ({
          easing: keyframe.easing,
          id: keyframe.id,
          param: keyframe.param,
          timeSecond: Math.max(0, Math.min(normalizeDuration(segment), keyframe.timeSecond)),
          value: clampVisualEffectAmount(effect.type, keyframe.value),
        }))
        .sort((left, right) => left.timeSecond - right.timeSecond),
      radius: Number.isFinite(effect.params?.radius) ? effect.params.radius : 4,
    }));

const visualEffectAmountExpression = (
  effect: ReturnType<typeof normalizedVisualEffects>[number],
): string => {
  if (effect.keyframes.length < 2) {
    return effect.amount.toFixed(2);
  }
  return `'${linearKeyframeExpression(effect.keyframes, (keyframe) => keyframe.value, effect.amount)}'`;
};

const buildVisualEffectStackFilters = (segment: SmartEditSegment): string[] =>
  normalizedVisualEffects(segment).flatMap((effect) => {
    const amountExpression = visualEffectAmountExpression(effect);
    if (effect.type === "blur") {
      return [`gblur=sigma=${amountExpression}`];
    }
    if (effect.type === "sharpen") {
      return [`unsharp=5:5:${amountExpression}:5:5:0.00`];
    }
    if (effect.type === "brightness") {
      return [`eq=brightness=${amountExpression}`];
    }
    if (effect.type === "contrast") {
      return [`eq=contrast=${amountExpression}`];
    }
    if (effect.type === "saturation") {
      return [`eq=saturation=${amountExpression}`];
    }
    if (effect.type === "vignette") {
      if (effect.keyframes.length >= 2) {
        const angleExpression = linearKeyframeExpression(
          effect.keyframes,
          (keyframe) => Math.PI / 8 + keyframe.value * (Math.PI / 4),
          Math.PI / 8 + effect.amount * (Math.PI / 4),
        );
        return [`vignette=angle='${angleExpression}'`];
      }
      const angle = effect.amount;
      return [`vignette=angle=${(Math.PI / 8 + angle * (Math.PI / 4)).toFixed(4)}`];
    }
    return [];
  });

const normalizedVisualMask = (segment: SmartEditSegment) => {
  const mask = segment.visualMask;
  if (!mask) {
    return undefined;
  }
  return {
    heightPercent: Math.max(1, Math.min(100, mask.heightPercent)),
    id: mask.id,
    inverted: mask.inverted,
    type: mask.type,
    widthPercent: Math.max(1, Math.min(100, mask.widthPercent)),
    xPercent: Math.max(0, Math.min(100, mask.xPercent)),
    yPercent: Math.max(0, Math.min(100, mask.yPercent)),
  };
};

const normalizedVisualKeyframes = (segment: SmartEditSegment) =>
  (segment.visualKeyframes ?? [])
    .map((keyframe) => ({
      ...keyframe,
      timeSecond: Math.max(0, Math.min(normalizeDuration(segment), keyframe.timeSecond)),
      transform: {
        offsetXPercent: Math.max(-100, Math.min(100, keyframe.transform.offsetXPercent)),
        offsetYPercent: Math.max(-100, Math.min(100, keyframe.transform.offsetYPercent)),
        opacity: Math.max(0, Math.min(1, keyframe.transform.opacity)),
        rotateDegrees: Math.max(-180, Math.min(180, keyframe.transform.rotateDegrees)),
        scale: Math.max(0.1, Math.min(4, keyframe.transform.scale)),
      },
    }))
    .sort((left, right) => left.timeSecond - right.timeSecond);

const buildVisualMaskFilter = (
  segment: SmartEditSegment,
  dimensions: OutputDimensions,
): string | undefined => {
  const mask = normalizedVisualMask(segment);
  if (!mask) {
    return undefined;
  }
  const centerX = (dimensions.width * mask.xPercent) / 100;
  const centerY = (dimensions.height * mask.yPercent) / 100;
  const halfWidth = Math.max(1, (dimensions.width * mask.widthPercent) / 100 / 2);
  const halfHeight = Math.max(1, (dimensions.height * mask.heightPercent) / 100 / 2);
  const insideExpression =
    mask.type === "ellipse"
      ? `lte(pow((X-${centerX.toFixed(2)})/${halfWidth.toFixed(2)},2)+pow((Y-${centerY.toFixed(2)})/${halfHeight.toFixed(2)},2),1)`
      : `between(X,${(centerX - halfWidth).toFixed(2)},${(centerX + halfWidth).toFixed(2)})*between(Y,${(centerY - halfHeight).toFixed(2)},${(centerY + halfHeight).toFixed(2)})`;
  const lumaExpression = mask.inverted
    ? `if(${insideExpression},0,p(X,Y))`
    : `if(${insideExpression},p(X,Y),0)`;
  const chromaExpression = mask.inverted
    ? `if(${insideExpression},128,p(X,Y))`
    : `if(${insideExpression},p(X,Y),128)`;
  return [
    `lum='${escapedFfmpegExpression(lumaExpression)}'`,
    `cb='${escapedFfmpegExpression(chromaExpression)}'`,
    `cr='${escapedFfmpegExpression(chromaExpression)}'`,
  ].join(":");
};

const buildScaleFilter = (segment: SmartEditSegment, dimensions: OutputDimensions): string => {
  const transform = normalizedTransform(segment);
  const keyframes = normalizedVisualKeyframes(segment);
  if (keyframes.length >= 2) {
    const scaleExpression = linearKeyframeExpression(
      keyframes,
      (keyframe) => keyframe.transform.scale,
      transform.scale,
    );
    const offsetXExpression = linearKeyframeExpression(
      keyframes,
      (keyframe) => keyframe.transform.offsetXPercent,
      transform.offsetXPercent,
    );
    const offsetYExpression = linearKeyframeExpression(
      keyframes,
      (keyframe) => keyframe.transform.offsetYPercent,
      transform.offsetYPercent,
    );
    return [
      `scale=w='trunc((${dimensions.width}*${scaleExpression})/2)*2':h='trunc((${dimensions.height}*${scaleExpression})/2)*2':force_original_aspect_ratio=increase:eval=frame`,
      `crop=${dimensions.width}:${dimensions.height}:x='(in_w-${dimensions.width})/2+(${dimensions.width}*${offsetXExpression}/100)':y='(in_h-${dimensions.height})/2+(${dimensions.height}*${offsetYExpression}/100)'`,
      "fps=30",
      "format=yuv420p",
    ].join(",");
  }
  const scaledWidth = Math.max(2, Math.round((dimensions.width * transform.scale) / 2) * 2);
  const scaledHeight = Math.max(2, Math.round((dimensions.height * transform.scale) / 2) * 2);
  const offsetX = Math.round((dimensions.width * transform.offsetXPercent) / 100);
  const offsetY = Math.round((dimensions.height * transform.offsetYPercent) / 100);
  if (
    transform.scale === 1 &&
    offsetX === 0 &&
    offsetY === 0
  ) {
    return `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=increase,crop=${dimensions.width}:${dimensions.height},fps=30,format=yuv420p`;
  }
  return [
    `scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=increase`,
    `crop=${dimensions.width}:${dimensions.height}:x='(in_w-${dimensions.width})/2${offsetX >= 0 ? "+" : ""}${offsetX}':y='(in_h-${dimensions.height})/2${offsetY >= 0 ? "+" : ""}${offsetY}'`,
    "fps=30",
    "format=yuv420p",
  ].join(",");
};

export const transitionDurationSeconds = (segment: SmartEditSegment): number => {
  if (segment.transition === "cut") {
    return 0;
  }
  return Math.min(0.45, Math.max(0.2, normalizeDuration(segment) / 5));
};

export const ffmpegXfadeTransition = (transition: SmartEditSegment["transition"]): string => {
  if (transition === "wipe") {
    return "wipeleft";
  }
  return "fade";
};

export const buildSegmentVideoFilter = (
  segment: SmartEditSegment,
  dimensions: OutputDimensions,
): string => {
  const transform = normalizedTransform(segment);
  const effects = normalizedEffects(segment);
  const keyframes = normalizedVisualKeyframes(segment);
  const filters = [buildScaleFilter(segment, dimensions)];
  if (keyframes.length >= 2) {
    const rotationExpression = linearKeyframeExpression(
      keyframes,
      (keyframe) => (keyframe.transform.rotateDegrees * Math.PI) / 180,
      (transform.rotateDegrees * Math.PI) / 180,
    );
    if (keyframes.some((keyframe) => keyframe.transform.rotateDegrees !== 0)) {
      filters.push(`rotate='${rotationExpression}':fillcolor=black`);
    }
    const opacityExpression = linearKeyframeExpression(
      keyframes,
      (keyframe) => keyframe.transform.opacity,
      transform.opacity,
    );
    filters.push("format=yuva420p");
    filters.push(`colorchannelmixer=aa='${opacityExpression}'`);
  } else if (transform.rotateDegrees !== 0) {
    filters.push(`rotate=${((transform.rotateDegrees * Math.PI) / 180).toFixed(4)}:fillcolor=black`);
  }
  if (keyframes.length < 2 && transform.opacity < 1) {
    filters.push("format=yuva420p");
    filters.push(`colorchannelmixer=aa=${transform.opacity.toFixed(3)}`);
  }
  if (effects.blur > 0) {
    filters.push(`gblur=sigma=${effects.blur.toFixed(2)}`);
  }
  if (effects.sharpen > 0) {
    filters.push(`unsharp=5:5:${effects.sharpen.toFixed(2)}:5:5:0.00`);
  }
  filters.push(...buildVisualEffectStackFilters(segment));
  const maskFilter = buildVisualMaskFilter(segment, dimensions);
  if (maskFilter) {
    filters.push(`geq=${maskFilter}`);
  }
  const playbackRate = normalizePlaybackRate(segment);
  if (playbackRate !== 1) {
    filters.push(`setpts=${(1 / playbackRate).toFixed(4)}*PTS`);
  }
  const duration = normalizeDuration(segment);
  if (effects.fadeInSeconds > 0 && duration > effects.fadeInSeconds) {
    filters.push(`fade=t=in:st=0:d=${effects.fadeInSeconds.toFixed(2)}`);
  }
  if (effects.fadeOutSeconds > 0 && duration > effects.fadeOutSeconds) {
    filters.push(
      `fade=t=out:st=${Math.max(0, duration - effects.fadeOutSeconds).toFixed(2)}:d=${effects.fadeOutSeconds.toFixed(2)}`,
    );
  }
  const fadeDuration = transitionDurationSeconds(segment);
  if (segment.transition === "fade" && fadeDuration > 0 && duration > fadeDuration * 2) {
    filters.push(`fade=t=in:st=0:d=${fadeDuration.toFixed(2)}`);
    filters.push(`fade=t=out:st=${(duration - fadeDuration).toFixed(2)}:d=${fadeDuration.toFixed(2)}`);
  }
  if (transform.opacity < 1 || keyframes.length >= 2) {
    filters.push("format=yuv420p");
  }
  return filters.join(",");
};
