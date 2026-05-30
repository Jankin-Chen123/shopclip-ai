import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { access } from "node:fs/promises";

const require = createRequire(import.meta.url);

export const resolveFfmpegCommand = async (): Promise<string> => {
  const candidates = [
    process.env.FFMPEG_PATH?.trim(),
    process.env.FFMPEG_BINARY?.trim(),
    (() => {
      try {
        return (require("@ffmpeg-installer/ffmpeg") as { path?: string }).path;
      } catch {
        return undefined;
      }
    })(),
    (() => {
      try {
        const value = require("ffmpeg-static") as string | undefined;
        return value;
      } catch {
        return undefined;
      }
    })(),
    "ffmpeg",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (candidate === "ffmpeg") {
      return candidate;
    }
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("ffmpeg executable was not found. Set FFMPEG_PATH or install @ffmpeg-installer/ffmpeg.");
};

export const resolveFfprobeCommand = async (): Promise<string> => {
  const candidates = [
    process.env.FFPROBE_PATH?.trim(),
    process.env.FFPROBE_BINARY?.trim(),
    (() => {
      try {
        return (require("ffprobe-static") as { path?: string }).path;
      } catch {
        return undefined;
      }
    })(),
    "ffprobe",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (candidate === "ffprobe") {
      return candidate;
    }
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("ffprobe executable was not found. Set FFPROBE_PATH or install ffprobe-static.");
};

export const runMediaCommand = (command: string, args: string[]): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const exit = code === null ? `signal ${signal ?? "unknown"}` : `code ${code}`;
      reject(new Error(`${command} exited with ${exit}. ${stderr.slice(0, 1200)}`));
    });
  });
