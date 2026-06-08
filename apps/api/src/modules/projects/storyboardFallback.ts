import type { StoryboardScene } from "@shopclip/shared";

import type { ProjectSnapshot } from "./projectStore.js";

const escapeSvgText = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const hashString = (value: string): number => {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
};

const clampSvgText = (value: string, maxLength: number): string => {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1)}...` : compacted;
};

export const createStoryboardFallbackImageUrl = (
  project: ProjectSnapshot,
  scene: Pick<StoryboardScene, "order" | "subtitle" | "visualPrompt">,
): string => {
  const seed = hashString(`${project.id}:${scene.order}:${scene.subtitle}:${scene.visualPrompt}`);
  const hueA = seed % 360;
  const hueB = (hueA + 42) % 360;
  const subtitle = escapeSvgText(clampSvgText(scene.subtitle, 46));
  const prompt = escapeSvgText(clampSvgText(scene.visualPrompt, 92));
  const product = escapeSvgText(clampSvgText(project.productName, 34));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">`,
    "<defs>",
    `<linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="hsl(${hueA} 82% 46%)"/><stop offset="0.55" stop-color="#101827"/><stop offset="1" stop-color="hsl(${hueB} 86% 42%)"/></linearGradient>`,
    `<radialGradient id="glow" cx="50%" cy="38%" r="55%"><stop offset="0" stop-color="rgba(255,255,255,0.34)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/></radialGradient>`,
    "</defs>",
    '<rect width="1080" height="1920" fill="url(#bg)"/>',
    '<rect width="1080" height="1920" fill="url(#glow)"/>',
    '<rect x="110" y="230" width="860" height="1030" rx="54" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.34)" stroke-width="3"/>',
    '<rect x="172" y="330" width="736" height="560" rx="42" fill="rgba(0,0,0,0.24)"/>',
    '<circle cx="540" cy="610" r="176" fill="rgba(255,255,255,0.16)"/>',
    '<path d="M352 744c96-138 202-208 316-208 72 0 136 28 192 84v206H244c32-28 68-56 108-82Z" fill="rgba(255,255,255,0.30)"/>',
    `<text x="140" y="1460" fill="rgba(255,255,255,0.68)" font-family="Inter,Arial,sans-serif" font-size="40" letter-spacing="2">SCENE ${scene.order}</text>`,
    `<text x="140" y="1530" fill="#ffffff" font-family="Inter,Arial,sans-serif" font-size="66" font-weight="700">${subtitle}</text>`,
    `<text x="140" y="1610" fill="rgba(255,255,255,0.78)" font-family="Inter,Arial,sans-serif" font-size="34">${product}</text>`,
    `<text x="140" y="1690" fill="rgba(255,255,255,0.68)" font-family="Inter,Arial,sans-serif" font-size="30">${prompt}</text>`,
    "</svg>",
  ].join("");

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

export const canUseStoryboardFallbackImage = () =>
  (process.env.AI_PROVIDER_MODE ?? "ark").trim().toLowerCase() === "mock";
