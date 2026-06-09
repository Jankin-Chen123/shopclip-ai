export type TimedScalarKeyframe = {
  easing?: string;
  timeSecond: number;
};

export const escapedFfmpegExpression = (expression: string): string =>
  expression.replace(/,/gu, "\\,");

export const linearKeyframeExpression = <TKeyframe extends TimedScalarKeyframe>(
  keyframes: TKeyframe[],
  valueAt: (keyframe: TKeyframe) => number,
  fallback: number,
): string => {
  if (keyframes.length < 2) {
    return fallback.toFixed(3);
  }
  const unique = keyframes.filter(
    (keyframe, index) =>
      index === 0 || Math.abs(keyframe.timeSecond - keyframes[index - 1]!.timeSecond) > 0.001,
  );
  if (unique.length < 2) {
    return valueAt(unique[0]!).toFixed(3);
  }
  const first = unique[0]!;
  const last = unique.at(-1)!;
  let expression = valueAt(last).toFixed(3);
  for (let index = unique.length - 2; index >= 0; index -= 1) {
    const left = unique[index]!;
    const right = unique[index + 1]!;
    const leftTime = left.timeSecond.toFixed(3);
    const rightTime = right.timeSecond.toFixed(3);
    const leftValue = valueAt(left).toFixed(3);
    const rightValue = valueAt(right).toFixed(3);
    const span = Math.max(0.001, right.timeSecond - left.timeSecond).toFixed(3);
    const interpolation =
      right.easing === "hold"
        ? leftValue
        : `(${leftValue}+(${rightValue}-${leftValue})*(t-${leftTime})/${span})`;
    expression = `if(lte(t,${leftTime}),${leftValue},if(gte(t,${rightTime}),${expression},${interpolation}))`;
  }
  return escapedFfmpegExpression(
    `if(lte(t,${first.timeSecond.toFixed(3)}),${valueAt(first).toFixed(3)},${expression})`,
  );
};
