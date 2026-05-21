import type {
  AssetMetadata,
  AssetType,
  Project,
  ProjectBrief,
  RenderTask,
  ScriptResult,
  StoryboardScene,
  TraceEvent,
} from "@shopclip/shared";

export interface ProjectSnapshot extends Project {
  assets: AssetMetadata[];
  scripts: ScriptResult[];
  scenes: StoryboardScene[];
  renderTasks: RenderTask[];
}

export interface RenderSnapshot {
  renderTask: RenderTask;
  traceEvents: TraceEvent[];
}

export interface ExportResult {
  projectId: string;
  exportUrl: string;
  downloadUrl: string;
  contentType: string;
  fallback?: {
    used: boolean;
    provider: string;
  };
}

export interface CreateAssetInput {
  type: AssetType;
  name: string;
  mimeType: string;
  sizeBytes: number;
  tags: string[];
}

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

const getErrorMessage = (body: unknown): string => {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }

  return "Request failed.";
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  const body = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(getErrorMessage(body));
  }

  return body as T;
};

export const createProject = async (brief: ProjectBrief): Promise<ProjectSnapshot> => {
  const response = await requestJson<{ project: ProjectSnapshot }>("/projects", {
    method: "POST",
    body: JSON.stringify(brief),
  });
  return response.project;
};

export const loadProject = async (projectId: string): Promise<ProjectSnapshot> => {
  const response = await requestJson<{ project: ProjectSnapshot }>(`/projects/${projectId}`);
  return response.project;
};

export const addAsset = async (
  projectId: string,
  asset: CreateAssetInput,
): Promise<AssetMetadata> => {
  const response = await requestJson<{ asset: AssetMetadata }>(`/projects/${projectId}/assets`, {
    method: "POST",
    body: JSON.stringify(asset),
  });
  return response.asset;
};

export const generateScript = async (
  projectId: string,
): Promise<{ fallback: { used: boolean; provider: string }; script: ScriptResult }> =>
  requestJson(`/projects/${projectId}/generate-script`, {
    method: "POST",
  });

export const startRender = async (projectId: string): Promise<RenderSnapshot> =>
  requestJson(`/projects/${projectId}/render`, {
    method: "POST",
  });

export const loadRenderTask = async (renderTaskId: string): Promise<RenderSnapshot> =>
  requestJson(`/render-tasks/${renderTaskId}`);

export const exportProject = async (projectId: string): Promise<ExportResult> =>
  requestJson(`/projects/${projectId}/export`);
