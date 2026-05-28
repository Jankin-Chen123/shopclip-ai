import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const parseEnvValue = (value: string) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

type LoadLocalEnvFileOptions = {
  override?: boolean;
};

const findLocalEnvFile = (startDir = process.cwd()) => {
  let currentDir = resolve(startDir);

  while (true) {
    const candidate = join(currentDir, ".env");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
};

export const loadLocalEnvFile = (
  path?: string,
  options: LoadLocalEnvFileOptions = {},
) => {
  const envPath = path ? resolve(path) : findLocalEnvFile();
  if (!envPath) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    if (!key || (!options.override && process.env[key] !== undefined)) {
      continue;
    }

    process.env[key] = parseEnvValue(trimmedLine.slice(separatorIndex + 1));
  }
};
