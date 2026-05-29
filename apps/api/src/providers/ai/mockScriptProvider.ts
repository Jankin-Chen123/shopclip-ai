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
}

const compactList = (values: Array<string | undefined>, fallback: string) => {
  const compacted = values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  return compacted.length > 0 ? compacted.join(", ") : fallback;
};

const targetDurationForProject = (project: ProjectSnapshot): number =>
  Math.min(Math.max(project.targetDurationSeconds || 15, 1), 15);

const effectiveKeywords = (
  project: ProjectSnapshot,
  request: ScriptGenerationRequest | undefined,
): string[] => (request?.keywords.length ? request.keywords : project.prepKeywords);

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

const splitMarkdownRow = (line: string): string[] => {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) {
    return [];
  }

  return trimmed
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map(cleanScriptCell);
};

const durationFromTimeCell = (value: string, maxDurationSeconds: number): number | undefined => {
  const normalized = value.replace(/秒/gu, "s").replace(/\s+/g, "");
  const range = /(\d+(?:\.\d+)?)(?:s)?(?:-|–|—|~|至|到)(\d+(?:\.\d+)?)(?:s)?/u.exec(
    normalized,
  );
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

const ensureMaterialConsistency = (visualPrompt: string): string =>
  visualPrompt.includes("产品外观必须与绑定素材一致")
    ? visualPrompt
    : `${visualPrompt}；产品外观必须与绑定素材一致。`;

const normalizeAssetMention = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[「」『』“”"'[\]【】（）()]/gu, "")
    .replace(/\s+/gu, "");

const resolveDraftSceneAssetId = (
  visualPrompt: string,
  assets: AssetMetadata[],
  fallbackAssetId: string | undefined,
): string | undefined => {
  const normalizedPrompt = normalizeAssetMention(visualPrompt);
  const explicitMatch = [...assets]
    .sort((left, right) => right.name.length - left.name.length)
    .find((asset) => normalizedPrompt.includes(normalizeAssetMention(asset.name)));

  return explicitMatch?.id ?? fallbackAssetId;
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
  for (const line of draftScript.split(/\r?\n/u)) {
    const cells = splitMarkdownRow(line);
    if (cells.length < 3) {
      continue;
    }
    const firstCell = cells[0] ?? "";
    if (
      firstCell.includes("时间") ||
      firstCell.toLowerCase() === "time" ||
      cells.every((cell) => isMarkdownSeparator(cell))
    ) {
      continue;
    }

    const parsedDuration = durationFromTimeCell(firstCell, targetDurationSeconds);
    if (!parsedDuration || totalDurationSeconds >= targetDurationSeconds) {
      continue;
    }

    const durationSeconds = Math.min(parsedDuration, targetDurationSeconds - totalDurationSeconds);
    const rawVoiceover = cleanScriptCell(cells[1]);
    const rawSubtitle = cleanScriptCell(cells[2]);
    const rawVisual = cleanScriptCell(cells[3]) || rawVoiceover || rawSubtitle;
    const subtitle = chooseChineseText(rawSubtitle, rawVoiceover) || `${project.productName} 分镜`;
    const voiceover = chooseChineseText(rawVoiceover, rawSubtitle) || subtitle;
    const visualPrompt = ensureMaterialConsistency(
      rawVisual || `根据脚本内容展示${project.productName}的核心卖点`,
    );
    const sceneAssetId = resolveDraftSceneAssetId(rawVisual, assets, fallbackAssetId);

    scenes.push({
      id: `scene-draft-${scenes.length + 1}`,
      projectId: project.id,
      order: scenes.length + 1,
      durationSeconds,
      subtitle,
      voiceover,
      visualPrompt,
      assetId: sceneAssetId,
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
      "| 时间 | 旁白 | 字幕 | 画面 |",
      "|---|---|---|---|",
      `| ${firstRange} | 还在为${project.sellingPoints[0] ?? "产品使用不方便"}发愁吗？ | 痛点开场 | 展示${project.audience}的真实使用痛点，产品外观必须与用户素材一致 |`,
      `| ${secondRange} | ${project.productName}一步解决这个问题。 | 展示解决方案 | 使用${materialNames}展示${keywordLine}，产品外观必须与用户素材一致 |`,
      `| ${thirdRange} | ${project.sellingPoints.slice(0, 2).join("，")}。 | 证明核心卖点 | 近景展示产品细节和使用效果，产品外观必须与用户素材一致 |`,
      `| ${fourthRange} | 现在就了解${project.productName}，让每次使用更省心。 | 行动号召 | 最终产品定格和购买引导，产品外观必须与用户素材一致 |`,
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
  const draftScript = context.request?.draftScript?.trim();
  const targetDurationSeconds = targetDurationForProject(project);
  const fallbackDurations = distributeSceneDurations(targetDurationSeconds, 4);
  const keywordSummary = compactList(
    [...effectiveKeywords(project, context.request), ...project.sellingPoints].slice(0, 4),
    project.sellingPoints[0] ?? "清晰产品卖点",
  );
  const parsedScenes = parseDraftScriptScenes(project, draftScript, assets, assetId);
  const hasParsedScenes = parsedScenes.length > 0;

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
        hasParsedScenes ? "分镜字段已根据步骤二脚本文本结构化生成" : "未识别到结构化脚本文本，使用确定性 fallback 分镜",
        "没有服务端配置时使用确定性 fallback，不调用外部 AI",
        `参考准备关键词：${keywordSummary}`,
      ],
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
          visualPrompt: `快速开场镜头，展示目标用户的痛点；产品外观必须与绑定素材一致。`,
          assetId,
          status: "generated",
        },
        {
          id: "scene-draft-2",
          projectId: project.id,
          order: 2,
          durationSeconds: fallbackDurations[1]!,
          subtitle: "展示解决方案",
          voiceover: `${project.productName}一步就能让使用过程更简单。`,
          visualPrompt: `产品近景演示镜头，必须使用绑定素材中的同款产品，产品外观必须与绑定素材一致。`,
          assetId,
          status: "generated",
        },
        {
          id: "scene-draft-3",
          projectId: project.id,
          order: 3,
          durationSeconds: fallbackDurations[2]!,
          subtitle: "证明核心卖点",
          voiceover: project.sellingPoints.slice(0, 2).join("。"),
          visualPrompt: `使用前后对比镜头，背景可以变化，但产品外观必须与绑定素材一致。`,
          assetId,
          status: "generated",
        },
        {
          id: "scene-draft-4",
          projectId: project.id,
          order: 4,
          durationSeconds: fallbackDurations[3]!,
          subtitle: "行动号召",
          voiceover: `现在就了解${project.productName}，让每次展示更省心。`,
          visualPrompt: `最终产品定格镜头和明确购买引导；产品外观必须与绑定素材一致。`,
          assetId,
          status: "generated",
        },
      ],
    },
  };
};
