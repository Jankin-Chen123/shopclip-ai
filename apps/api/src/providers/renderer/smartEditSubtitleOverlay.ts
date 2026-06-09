import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SmartEditPlan, SmartEditSegment } from "@shopclip/shared";

import { buildSubtitleAss, buildSubtitleFilter } from "./ffmpegComposer.js";
import {
  isTimelineElementHiddenByTrack,
  isTimelineElementMutedByTrack,
  normalizeDuration,
  normalizeInSegmentClipDuration,
  normalizeInSegmentOffset,
  timelineElementTrackKind,
} from "./smartEditTimelinePlan.js";

type CommandRunner = (command: string, args: string[]) => Promise<void>;

export type SmartEditOutputDimensions = {
  height: number;
  width: number;
};

const containsReadableText = (text: string): boolean => /[\p{L}\p{N}]/u.test(text);

const isMostlyReplacementSymbols = (text: string): boolean => {
  const compact = text.replace(/\s/gu, "");
  if (!compact) {
    return true;
  }
  const replacementSymbolCodePoints = new Set([0x003f, 0xfffd, 0x25a1, 0x25a0, 0x25c7, 0x25c6]);
  const symbolCount = [...compact].filter((character) =>
    replacementSymbolCodePoints.has(character.codePointAt(0) ?? 0),
  ).length;
  return symbolCount / compact.length >= 0.6;
};

const isLikelyMojibake = (text: string): boolean => {
  const compact = text.replace(/\s/gu, "");
  if (!compact) {
    return false;
  }

  const mojibakeMarkerCharacters =
    "脙脗锟絔閸婃帟绻冮弶銉︽啚娑旂喍绗夊婊勭亸杈╁仯閸熸惂鈧偓鈩⑩偓艙鍊掕繃鏉ユ憞涔熶笉婕";
  const replacementCharacters = "?锛燂拷鈻♀枲鈼団梿";
  const markerCount = [...compact].filter((character) =>
    mojibakeMarkerCharacters.includes(character),
  ).length;
  const replacementCount = [...compact].filter((character) =>
    replacementCharacters.includes(character),
  ).length;
  const markerRatio = markerCount / compact.length;
  const replacementRatio = replacementCount / compact.length;

  return markerRatio >= 0.35 || (markerRatio >= 0.2 && replacementRatio >= 0.05);
};

const isReadableSubtitleText = (text: string): boolean =>
  containsReadableText(text) && !isMostlyReplacementSymbols(text) && !isLikelyMojibake(text);

export const subtitleTextForSegment = (segment: SmartEditSegment): string => {
  const subtitle = segment.subtitle.trim();
  if (subtitle && isReadableSubtitleText(subtitle)) {
    return subtitle;
  }

  const voiceover = segment.voiceover.trim();
  if (voiceover && isReadableSubtitleText(voiceover)) {
    return voiceover;
  }

  return "";
};

const formatAssTime = (seconds: number): string => {
  const bounded = Math.max(0, seconds);
  const hours = Math.floor(bounded / 3600);
  const minutes = Math.floor((bounded % 3600) / 60);
  const wholeSeconds = Math.floor(bounded % 60);
  const centiseconds = Math.floor((bounded - Math.floor(bounded)) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
};

const escapeAssText = (text: string): string =>
  text
    .replace(/\\/gu, "\\\\")
    .replace(/\{/gu, "\\{")
    .replace(/\}/gu, "\\}")
    .replace(/\r?\n/gu, "\\N");

type TimelineSubtitleCaption = {
  color?: string;
  endSecond: number;
  fontSize?: number;
  positionYPercent?: number;
  startSecond: number;
  text: string;
};

const clampTimelineTextFontSize = (fontSize: number | undefined, fallback: number): number =>
  Number.isFinite(fontSize ?? Number.NaN)
    ? Math.max(12, Math.min(72, Math.round(fontSize!)))
    : fallback;

const clampTimelineTextPositionYPercent = (positionYPercent: number | undefined): number =>
  Number.isFinite(positionYPercent ?? Number.NaN)
    ? Math.max(8, Math.min(92, positionYPercent!))
    : 12;

const cssHexColorToAss = (color: string | undefined): string => {
  const normalized = color?.trim().match(/^#([0-9a-fA-F]{6})$/u)?.[1];
  if (!normalized) {
    return "&H00FFFFFF";
  }
  const red = normalized.slice(0, 2);
  const green = normalized.slice(2, 4);
  const blue = normalized.slice(4, 6);
  return `&H00${blue}${green}${red}`.toUpperCase();
};

export const buildTimelineSubtitleAss = (
  captions: TimelineSubtitleCaption[],
  dimensions: SmartEditOutputDimensions,
): string => {
  const fontSize = Math.max(24, Math.round(dimensions.height * (42 / 1280)));
  const marginV = Math.max(48, Math.round(dimensions.height * (96 / 1280)));
  const captionStyles = captions.map((caption, index) => {
    const styleName = `Text${index + 1}`;
    const styleFontSize = clampTimelineTextFontSize(caption.fontSize, fontSize);
    const styleMarginV = Math.max(
      0,
      Math.round(dimensions.height * (clampTimelineTextPositionYPercent(caption.positionYPercent) / 100)),
    );
    return {
      line: `Style: ${styleName},Noto Sans CJK SC,${styleFontSize},${cssHexColorToAss(caption.color)},&H000000FF,&HDD000000,&H99000000,0,0,0,0,100,100,0,0,3,3,0,2,48,48,${styleMarginV},0`,
      name: styleName,
    };
  });
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 2",
    `PlayResX: ${dimensions.width}`,
    `PlayResY: ${dimensions.height}`,
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    `Style: Default,Noto Sans CJK SC,${fontSize},&H00FFFFFF,&H000000FF,&HDD000000,&H99000000,0,0,0,0,100,100,0,0,3,3,0,2,48,48,${marginV},0`,
    ...captionStyles.map((style) => style.line),
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ...captions.map(
      (caption, index) =>
        `Dialogue: 0,${formatAssTime(caption.startSecond)},${formatAssTime(caption.endSecond)},${captionStyles[index]?.name ?? "Default"},,0,0,0,,${escapeAssText(caption.text)}`,
    ),
    "",
  ].join("\n");
};

const globalTextTimelineCaptions = (
  plan: SmartEditPlan,
  timelineDurationSeconds: number,
): TimelineSubtitleCaption[] =>
  (plan.timeline?.elements ?? [])
    .filter(
      (element) =>
        timelineElementTrackKind(element) === "caption" &&
        !element.segmentId &&
        !element.hidden &&
        !isTimelineElementHiddenByTrack(plan, element) &&
        !isTimelineElementMutedByTrack(plan, element) &&
        (element.text?.trim() || element.label.trim()),
    )
    .map((element) => ({
      color: element.textColor,
      endSecond: Math.min(timelineDurationSeconds, element.startSecond + element.durationSeconds),
      fontSize: element.textFontSize,
      positionYPercent: element.textPositionYPercent,
      startSecond: Math.max(0, element.startSecond),
      text: element.text?.trim() || element.label.trim(),
    }))
    .filter((caption) => caption.endSecond > caption.startSecond + 0.01)
    .sort((left, right) => left.startSecond - right.startSecond);

export const applySegmentSubtitleOverlay = async ({
  command,
  dimensions,
  inputPath,
  outputPath,
  run,
  segment,
  subtitlesEnabled,
  workdir,
}: {
  command: string;
  dimensions: SmartEditOutputDimensions;
  inputPath: string;
  outputPath: string;
  run: CommandRunner;
  segment: SmartEditSegment;
  subtitlesEnabled: boolean;
  workdir: string;
}): Promise<string> => {
  const subtitleText = subtitleTextForSegment(segment);
  if (!subtitlesEnabled || segment.captionHidden || !subtitleText) {
    return inputPath;
  }

  const subtitleAssPath = join(workdir, `${segment.id}.ass`);
  const captionStartSecond = normalizeInSegmentOffset(segment.captionStartOffsetSeconds, segment);
  const captionDurationSeconds = normalizeInSegmentClipDuration(
    segment.captionDurationSeconds,
    segment.captionStartOffsetSeconds,
    segment,
  );
  await writeFile(
    subtitleAssPath,
    buildSubtitleAss(subtitleText, {
      color: segment.captionTextColor,
      endSecond: Math.min(normalizeDuration(segment), captionStartSecond + captionDurationSeconds),
      fontSize:
        segment.captionTextFontSize ??
        Math.max(24, Math.round(dimensions.height * (42 / 1280))),
      height: dimensions.height,
      marginV:
        segment.captionTextPositionYPercent === undefined
          ? Math.max(48, Math.round(dimensions.height * (96 / 1280)))
          : Math.max(0, Math.round(dimensions.height * (segment.captionTextPositionYPercent / 100))),
      startSecond: captionStartSecond,
      width: dimensions.width,
    }),
    "utf8",
  );
  await run(command, [
    "-y",
    "-i",
    inputPath,
    "-vf",
    buildSubtitleFilter(subtitleAssPath),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
  return outputPath;
};

export const applyGlobalTimelineTextOverlay = async (
  command: string,
  inputPath: string,
  outputPath: string,
  plan: SmartEditPlan,
  timelineDurationSeconds: number,
  dimensions: SmartEditOutputDimensions,
  workdir: string,
  run: CommandRunner,
): Promise<string> => {
  const captions = globalTextTimelineCaptions(plan, timelineDurationSeconds);
  if (captions.length === 0) {
    return inputPath;
  }
  const subtitleAssPath = join(workdir, "global-timeline-text.ass");
  await writeFile(subtitleAssPath, buildTimelineSubtitleAss(captions, dimensions), "utf8");
  await run(command, [
    "-y",
    "-i",
    inputPath,
    "-vf",
    buildSubtitleFilter(subtitleAssPath),
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
  return outputPath;
};
