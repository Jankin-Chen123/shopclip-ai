import type { ProjectSnapshot } from "../../modules/projects/projectStore.js";
import type {
  AssetMetadata,
  ScriptGenerationRequest,
  ScriptResult,
  StoryboardScene,
} from "@shopclip/shared";

export interface ScriptProviderResult {
  fallback: {
    used: boolean;
    provider: string;
  };
  script: Omit<ScriptResult, "id" | "projectId">;
}

export interface ScriptGenerationContext {
  assets?: AssetMetadata[];
  request?: ScriptGenerationRequest;
  scriptSource?: "fallback" | "model";
}

const compactList = (values: Array<string | undefined>, fallback: string) => {
  const compacted = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return compacted.length > 0 ? compacted.join(", ") : fallback;
};

const targetDurationForProject = (project: ProjectSnapshot): number =>
  Math.min(Math.max(project.targetDurationSeconds || 15, 1), 15);

const effectiveKeywords = (
  project: ProjectSnapshot,
  request: ScriptGenerationRequest | undefined,
): string[] => (request?.keywords.length ? request.keywords : project.prepKeywords);

const productionConstraints = (request: ScriptGenerationRequest | undefined): string[] => {
  if (!request) {
    return [];
  }

  return [
    request.productionMode && request.productionMode !== "automatic"
      ? `生产模式：${request.productionMode}`
      : undefined,
    request.referenceId
      ? "参考视频只用于 Hook、节奏和叙事结构提炼，不保存、不复刻、不混剪公开视频素材"
      : undefined,
    request.templateId
      ? "已应用灵感模板：按 Hook + Demo + Trust + CTA 压缩为 15 秒以内结构"
      : undefined,
  ].filter((constraint): constraint is string => Boolean(constraint));
};

const distributeSceneDurations = (totalDurationSeconds: number, sceneCount: number): number[] => {
  const baseDuration = Math.floor(totalDurationSeconds / sceneCount);
  let remainingSeconds = totalDurationSeconds - baseDuration * sceneCount;
  return Array.from({ length: sceneCount }, (_, index) => {
    const remainingSlots = sceneCount - index;
    const extraSecond = remainingSeconds >= remainingSlots ? 1 : 0;
    remainingSeconds -= extraSecond;
    return baseDuration + extraSecond;
  });
};

const isStoryboardAsset = (asset: AssetMetadata): boolean =>
  asset.type === "image" ||
  asset.type === "video" ||
  asset.mimeType?.startsWith("image/") === true ||
  asset.mimeType?.startsWith("video/") === true;

const getStoryboardAssetCandidates = (assets: AssetMetadata[]): AssetMetadata[] => {
  const visualAssets = assets.filter(isStoryboardAsset);
  return visualAssets.length > 0 ? visualAssets : assets;
};

const selectSceneFallbackAsset = (
  assets: AssetMetadata[],
  sceneIndex: number,
  fallbackAssetId: string | undefined,
): AssetMetadata | undefined => {
  const candidates = getStoryboardAssetCandidates(assets);
  if (candidates.length > 0) {
    return candidates[sceneIndex % candidates.length];
  }
  return fallbackAssetId ? assets.find((asset) => asset.id === fallbackAssetId) : undefined;
};

const createTimeRanges = (durations: number[]): string[] => {
  let cursor = 0;
  return durations.map((duration) => {
    const start = cursor;
    cursor += duration;
    return `${start}-${cursor}s`;
  });
};

const hasChineseText = (value: string): boolean => /[\u3400-\u9fff]/u.test(value);

const cleanScriptCell = (value: string | undefined): string =>
  (value ?? "")
    .replace(/\*\*/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const isMarkdownSeparator = (value: string): boolean =>
  /^:?-{2,}:?$/u.test(value.replace(/\s+/g, ""));

type DraftScriptTableMode = "storyboard-fields" | "legacy";

const splitMarkdownRow = (line: string): string[] => {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) {
    return [];
  }

  return trimmed.replace(/^\|/u, "").replace(/\|$/u, "").split("|").map(cleanScriptCell);
};

const durationFromTimeCell = (value: string, maxDurationSeconds: number): number | undefined => {
  const normalized = value.replace(/秒/gu, "s").replace(/\s+/g, "");
  const range = /(\d+(?:\.\d+)?)(?:s)?(?:-|–|—|~|至|到)(\d+(?:\.\d+)?)(?:s)?/u.exec(normalized);
  if (range) {
    const start = Number.parseFloat(range[1]!);
    const end = Number.parseFloat(range[2]!);
    const duration = end - start;
    return duration > 0 ? Math.min(duration, maxDurationSeconds) : undefined;
  }

  const single = /(\d+(?:\.\d+)?)(?:s)?/u.exec(normalized);
  if (!single) {
    return undefined;
  }

  const duration = Number.parseFloat(single[1]!);
  return duration > 0 ? Math.min(duration, maxDurationSeconds) : undefined;
};

const ensureMaterialConsistency = (visualPrompt: string, assetName?: string): string => {
  const promptWithAsset =
    assetName && !normalizeAssetMention(visualPrompt).includes(normalizeAssetMention(assetName))
      ? `${visualPrompt}；主要参考素材：${assetName}`
      : visualPrompt;
  return promptWithAsset.includes("产品外观必须与绑定素材一致")
    ? promptWithAsset
    : `${promptWithAsset}；产品外观必须与绑定素材一致。`;
};

const normalizeAssetMention = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[「」『』“”"'[\]【】（）()]/gu, "")
    .replace(/\s+/gu, "");

const resolveDraftSceneAsset = (
  assetReference: string,
  visualPrompt: string,
  assets: AssetMetadata[],
  fallbackAsset: AssetMetadata | undefined,
): AssetMetadata | undefined => {
  const normalizedPrompt = normalizeAssetMention(`${assetReference} ${visualPrompt}`);
  const explicitMatch = [...getStoryboardAssetCandidates(assets)]
    .sort((left, right) => right.name.length - left.name.length)
    .find(
      (asset) =>
        normalizedPrompt.includes(normalizeAssetMention(asset.name)) ||
        normalizedPrompt.includes(normalizeAssetMention(asset.id)),
    );

  return explicitMatch ?? fallbackAsset;
};

const chooseChineseText = (primary: string, fallback: string): string => {
  if (hasChineseText(primary)) {
    return primary;
  }
  if (hasChineseText(fallback)) {
    return fallback;
  }
  return primary || fallback;
};

const detectDraftScriptTableMode = (cells: string[]): DraftScriptTableMode | undefined => {
  const normalizedCells = cells.map((cell) => normalizeAssetMention(cell));
  const normalizedHeader = normalizedCells.join("|");
  const hasDurationHeader =
    normalizedCells[0]?.includes("时间") === true ||
    normalizedCells[0]?.includes("时长") === true ||
    normalizedCells[0] === "time" ||
    normalizedCells[0] === "duration";

  if (!hasDurationHeader) {
    return undefined;
  }

  const hasStoryboardFieldHeaders =
    normalizedHeader.includes("文案") &&
    (normalizedHeader.includes("画面提示词") || normalizedHeader.includes("visualprompt")) &&
    (normalizedHeader.includes("素材槽位") ||
      normalizedHeader.includes("materialslot") ||
      normalizedHeader.includes("assetslot"));
  if (hasStoryboardFieldHeaders) {
    return "storyboard-fields";
  }

  const hasLegacyHeaders =
    normalizedHeader.includes("旁白") ||
    normalizedHeader.includes("字幕") ||
    normalizedHeader.includes("voiceover") ||
    normalizedHeader.includes("subtitle");
  if (hasLegacyHeaders) {
    return "legacy";
  }

  return undefined;
};

const parseDraftScriptScenes = (
  project: ProjectSnapshot,
  draftScript: string | undefined,
  assets: AssetMetadata[],
  fallbackAssetId: string | undefined,
): StoryboardScene[] => {
  if (!draftScript?.trim()) {
    return [];
  }

  const scenes: StoryboardScene[] = [];
  let totalDurationSeconds = 0;
  const targetDurationSeconds = targetDurationForProject(project);
  let tableMode: DraftScriptTableMode | undefined;
  for (const line of draftScript.split(/\r?\n/u)) {
    const cells = splitMarkdownRow(line);
    if (cells.length < 3) {
      continue;
    }
    const firstCell = cells[0] ?? "";
    const detectedTableMode = detectDraftScriptTableMode(cells);
    if (detectedTableMode) {
      tableMode = detectedTableMode;
      continue;
    }
    if (cells.every((cell) => isMarkdownSeparator(cell))) {
      continue;
    }

    const parsedDuration = durationFromTimeCell(firstCell, targetDurationSeconds);
    if (!parsedDuration || totalDurationSeconds >= targetDurationSeconds) {
      continue;
    }

    const durationSeconds = Math.min(parsedDuration, targetDurationSeconds - totalDurationSeconds);
    const usesStoryboardFieldColumns =
      tableMode === "storyboard-fields" ||
      (tableMode === undefined && cells.length === 4 && cleanScriptCell(cells[3]).length > 0);
    const rawCopy = usesStoryboardFieldColumns
      ? cleanScriptCell(cells[1])
      : chooseChineseText(cleanScriptCell(cells[1]), cleanScriptCell(cells[2]));
    const rawVisual = usesStoryboardFieldColumns
      ? cleanScriptCell(cells[2]) || rawCopy
      : cleanScriptCell(cells[3]) || rawCopy;
    const rawAssetReference = usesStoryboardFieldColumns
      ? cleanScriptCell(cells[3])
      : cleanScriptCell(cells[4]);
    const copy = rawCopy || `${project.productName} 分镜`;
    const fallbackAsset = selectSceneFallbackAsset(assets, scenes.length, fallbackAssetId);
    const sceneAsset = resolveDraftSceneAsset(rawAssetReference, rawVisual, assets, fallbackAsset);
    const visualPrompt = ensureMaterialConsistency(
      rawVisual || `根据脚本内容展示${project.productName}的核心卖点`,
      sceneAsset?.name ?? rawAssetReference,
    );

    scenes.push({
      id: `scene-draft-${scenes.length + 1}`,
      projectId: project.id,
      order: scenes.length + 1,
      durationSeconds,
      subtitle: copy,
      voiceover: copy,
      visualPrompt,
      assetRecallQuery: `${copy} ${rawVisual} ${rawAssetReference}`.trim(),
      assetId: sceneAsset?.id,
      status: "generated",
    });
    totalDurationSeconds += durationSeconds;
  }

  return scenes;
};

export const rewriteFallbackScript = (
  project: ProjectSnapshot,
  context: ScriptGenerationContext = {},
): { fallback: { used: boolean; provider: string }; scriptText: string } => {
  const request = context.request;
  const draftScript = request?.draftScript?.trim();
  const targetDurationSeconds = targetDurationForProject(project);
  const [firstRange, secondRange, thirdRange, fourthRange] = createTimeRanges(
    distributeSceneDurations(targetDurationSeconds, 4),
  );
  const materialNames = compactList(
    [
      ...(context.assets ?? []).map((asset) => asset.name),
      ...(request?.materials ?? []).map((material) => material.name),
    ].slice(0, 6),
    "已准备产品素材",
  );
  const storyboardAssets = getStoryboardAssetCandidates(context.assets ?? []);
  const sceneAssetName = (index: number): string =>
    storyboardAssets[index % storyboardAssets.length]?.name ?? materialNames;
  const keywordLine = compactList(
    [...effectiveKeywords(project, request), ...project.sellingPoints].slice(0, 8),
    "清晰产品卖点",
  );

  return {
    fallback: {
      used: true,
      provider: "mock-script-provider",
    },
    scriptText: [
      "| 时间 | 旁白 | 字幕 | 画面 | 参考素材 |",
      "|---|---|---|---|---|",
      `| ${firstRange} | 还在为${project.sellingPoints[0] ?? "产品使用不方便"}发愁吗？ | 痛点开场 | 展示${project.audience}的真实使用痛点，主要参考素材：${sceneAssetName(0)}，产品外观必须与用户素材一致 | ${sceneAssetName(0)} |`,
      `| ${secondRange} | ${project.productName}一步解决这个问题。 | 展示解决方案 | 展示${keywordLine}，主要参考素材：${sceneAssetName(1)}，产品外观必须与用户素材一致 | ${sceneAssetName(1)} |`,
      `| ${thirdRange} | ${project.sellingPoints.slice(0, 2).join("，")}。 | 证明核心卖点 | 近景展示产品细节和使用效果，主要参考素材：${sceneAssetName(2)}，产品外观必须与用户素材一致 | ${sceneAssetName(2)} |`,
      `| ${fourthRange} | 现在就了解${project.productName}，让每次使用更省心。 | 行动号召 | 最终产品定格和购买引导，主要参考素材：${sceneAssetName(3)}，产品外观必须与用户素材一致 | ${sceneAssetName(3)} |`,
      draftScript ? `\n用户原始草稿参考：${draftScript}` : "",
    ].join("\n"),
  };
};

export const generateFallbackScript = (
  project: ProjectSnapshot,
  context: ScriptGenerationContext = {},
): ScriptProviderResult => {
  const primaryAsset = context.assets?.[0] ?? project.assets[0];
  const assetId = primaryAsset?.id;
  const assets = context.assets ?? project.assets;
  const sceneAsset = (index: number): AssetMetadata | undefined =>
    selectSceneFallbackAsset(assets, index, assetId);
  const draftScript = context.request?.draftScript?.trim();
  const targetDurationSeconds = targetDurationForProject(project);
  const fallbackDurations = distributeSceneDurations(targetDurationSeconds, 4);
  const keywordSummary = compactList(
    [...effectiveKeywords(project, context.request), ...project.sellingPoints].slice(0, 4),
    project.sellingPoints[0] ?? "清晰产品卖点",
  );
  const parsedScenes = parseDraftScriptScenes(project, draftScript, assets, assetId);
  const hasParsedScenes = parsedScenes.length > 0;
  const usesModelScript = context.scriptSource === "model" && hasParsedScenes;

  return {
    fallback: {
      used: true,
      provider: "mock-script-provider",
    },
    script: {
      hook: `${project.productName} 解决你的高频使用痛点。`,
      narrative:
        draftScript ||
        `先呈现目标用户的痛点，再展示${project.productName}如何解决问题，最后给出明确购买引导。`,
      constraints: [
        "使用中文生成视频脚本和分镜描述",
        `完整分镜总时长必须等于 ${targetDurationSeconds} 秒`,
        usesModelScript
          ? "分镜字段已根据真实文本模型返回的脚本文本结构化生成"
          : hasParsedScenes
            ? "分镜字段已根据步骤二脚本文本结构化生成"
            : "未识别到结构化脚本文本，使用确定性 fallback 分镜",
        usesModelScript ? undefined : "没有服务端配置时使用确定性 fallback，不调用外部 AI",
        `参考准备关键词：${keywordSummary}`,
        ...productionConstraints(context.request),
      ].filter((constraint): constraint is string => Boolean(constraint)),
      scenes: hasParsedScenes
        ? parsedScenes
        : [
            {
              id: "scene-draft-1",
              projectId: project.id,
              order: 1,
              durationSeconds: fallbackDurations[0]!,
              subtitle: "痛点开场",
              voiceover: `还在为${project.sellingPoints[0] ?? "产品展示不清晰"}发愁吗？`,
              visualPrompt: ensureMaterialConsistency(
                "快速开场镜头，展示目标用户的痛点",
                sceneAsset(0)?.name,
              ),
              assetRecallQuery: `hook pain ${keywordSummary}`,
              assetId: sceneAsset(0)?.id,
              status: "generated",
            },
            {
              id: "scene-draft-2",
              projectId: project.id,
              order: 2,
              durationSeconds: fallbackDurations[1]!,
              subtitle: "展示解决方案",
              voiceover: `${project.productName}一步就能让使用过程更简单。`,
              visualPrompt: ensureMaterialConsistency(
                "产品近景演示镜头，必须使用绑定素材中的同款产品",
                sceneAsset(1)?.name,
              ),
              assetRecallQuery: `demo solution ${keywordSummary}`,
              assetId: sceneAsset(1)?.id,
              status: "generated",
            },
            {
              id: "scene-draft-3",
              projectId: project.id,
              order: 3,
              durationSeconds: fallbackDurations[2]!,
              subtitle: "证明核心卖点",
              voiceover: project.sellingPoints.slice(0, 2).join("。"),
              visualPrompt: ensureMaterialConsistency(
                "使用前后对比镜头，背景可以变化",
                sceneAsset(2)?.name,
              ),
              assetRecallQuery: `trust proof close-up ${keywordSummary}`,
              assetId: sceneAsset(2)?.id,
              status: "generated",
            },
            {
              id: "scene-draft-4",
              projectId: project.id,
              order: 4,
              durationSeconds: fallbackDurations[3]!,
              subtitle: "行动号召",
              voiceover: `现在就了解${project.productName}，让每次展示更省心。`,
              visualPrompt: ensureMaterialConsistency(
                "最终产品定格镜头和明确购买引导",
                sceneAsset(3)?.name,
              ),
              assetRecallQuery: `cta packshot ${keywordSummary}`,
              assetId: sceneAsset(3)?.id,
              status: "generated",
            },
          ],
    },
  };
};

export const structureModelScript = (
  project: ProjectSnapshot,
  context: ScriptGenerationContext,
  provider: string,
): ScriptProviderResult => {
  const draftScript = context.request?.draftScript?.trim();
  const assets = context.assets ?? project.assets;
  const primaryAsset = assets[0] ?? project.assets[0];
  const parsedScenes = parseDraftScriptScenes(project, draftScript, assets, primaryAsset?.id);
  if (!draftScript || parsedScenes.length === 0) {
    throw new Error(
      "Real script generation returned text that could not be parsed into storyboard scenes. The model must return a Markdown table with duration, copy, visual prompt, and material slot columns.",
    );
  }

  const targetDurationSeconds = targetDurationForProject(project);
  const keywordSummary = compactList(
    [...effectiveKeywords(project, context.request), ...project.sellingPoints].slice(0, 4),
    project.sellingPoints[0] ?? "清晰产品卖点",
  );

  return {
    fallback: {
      used: false,
      provider,
    },
    script: {
      hook: parsedScenes[0]?.voiceover ?? `${project.productName} 真实模型生成脚本`,
      narrative: draftScript,
      constraints: [
        "使用中文生成视频脚本和分镜描述",
        `完整分镜总时长必须等于 ${targetDurationSeconds} 秒`,
        "分镜字段已根据真实文本模型返回的脚本文本结构化生成",
        `参考准备关键词：${keywordSummary}`,
        ...productionConstraints(context.request),
      ],
      scenes: parsedScenes,
    },
  };
};
