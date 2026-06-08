export type SmartEditSrtCue = {
  durationSeconds: number;
  startSecond: number;
  text: string;
};

const parseSrtTimestampSeconds = (input: string): number => {
  const match = input.trim().replace(",", ".").match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{1,3})$/);
  if (!match) {
    return Number.NaN;
  }
  const [, hours, minutes, seconds, milliseconds] = match;
  return (
    Number.parseInt(hours ?? "0", 10) * 3600 +
    Number.parseInt(minutes ?? "0", 10) * 60 +
    Number.parseInt(seconds ?? "0", 10) +
    Number.parseInt((milliseconds ?? "0").padEnd(3, "0"), 10) / 1000
  );
};

export const parseSmartEditSrtCues = (input: string): SmartEditSrtCue[] => {
  const normalized = input.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return [];
  }
  return normalized
    .split(/\n{2,}/)
    .flatMap((block): SmartEditSrtCue[] => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const timestampIndex = lines.findIndex((line) => line.includes("-->"));
      if (timestampIndex < 0) {
        return [];
      }
      const timestampLine = lines[timestampIndex] ?? "";
      const [rawStart, rawEnd] = timestampLine.split(/\s*-->\s*/);
      if (!rawStart || !rawEnd) {
        return [];
      }
      const startSecond = parseSrtTimestampSeconds(rawStart);
      const endSecond = parseSrtTimestampSeconds(rawEnd.split(/\s+/)[0] ?? "");
      const text = lines.slice(timestampIndex + 1).join("\n").trim();
      if (!text || !Number.isFinite(startSecond) || !Number.isFinite(endSecond) || endSecond <= startSecond) {
        return [];
      }
      return [
        {
          durationSeconds: Number((endSecond - startSecond).toFixed(3)),
          startSecond: Number(startSecond.toFixed(3)),
          text,
        },
      ];
    });
};

export const formatSmartEditSrtTimestamp = (seconds: number): string => {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const milliseconds = totalMilliseconds % 1000;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const displaySeconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const displayMinutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return [
    String(hours).padStart(2, "0"),
    String(displayMinutes).padStart(2, "0"),
    String(displaySeconds).padStart(2, "0"),
  ].join(":") + `,${String(milliseconds).padStart(3, "0")}`;
};
