import type {
  AssetMetadata,
  AssetProcessingJob,
  AssetSearchResponse,
  AssetSearchResult,
  AssetSlice,
  AssetUploadIntent,
  DashboardResponse,
  EditingSuggestion,
  ExternalAssetProviderConfig,
  ExternalAssetResult,
  ExternalAssetSearchRequest,
  ExternalAssetSearchResponse,
  AssetType,
  InspirationAssetType,
  InspirationGenerateResponse,
  InspirationGenerateRequest,
  InspirationMaterial,
  MediaSettings,
  Project,
  ProjectBrief,
  RenderRequest,
  RenderTask,
  SceneUpdate,
  ScriptResult,
  StoryboardScene,
  TraceEvent,
} from "@shopclip/shared";

export interface ProjectSnapshot extends Project {
  assets: AssetMetadata[];
  assetSlices: AssetSlice[];
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
  source?: AssetMetadata["source"];
  storageProvider?: AssetMetadata["storageProvider"];
  objectKey?: string;
  thumbnailKey?: string;
  embeddingText?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateAssetUploadIntentResult {
  asset: AssetMetadata;
  upload: AssetUploadIntent;
  processingJob: AssetProcessingJob;
}

export type AssetLibraryCategory = "image" | "video" | "audio" | "script" | "all";

export interface AssetLibraryResponse {
  projectId?: string;
  category: AssetLibraryCategory | "all";
  assets: AssetMetadata[];
  assetSlices: AssetSlice[];
}

export type UserApiConfig = NonNullable<InspirationGenerateRequest["apiConfig"]>;
export type StockProviderConfig = ExternalAssetProviderConfig;

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export const getAssetContentUrl = (assetId: string): string =>
  `${apiBaseUrl}/assets/${encodeURIComponent(assetId)}/content`;

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
  projectId: string | undefined,
  asset: CreateAssetInput,
): Promise<AssetMetadata> => {
  const response = await requestJson<{ asset: AssetMetadata }>(
    projectId ? `/projects/${projectId}/assets` : "/assets",
    {
    method: "POST",
    body: JSON.stringify(asset),
    },
  );
  return response.asset;
};

export const loadProjectAssets = async (
  projectId: string | undefined,
  category: AssetLibraryCategory,
): Promise<AssetLibraryResponse> => {
  const params = new URLSearchParams({ category });
  return requestJson(projectId ? `/projects/${projectId}/assets?${params.toString()}` : `/assets?${params.toString()}`);
};

export const deleteAssets = async (
  assetIds: string[],
): Promise<{ deletedAssets: AssetMetadata[] }> =>
  requestJson("/assets", {
    method: "DELETE",
    body: JSON.stringify({ assetIds }),
  });

export const createAssetUploadIntent = async (
  projectId: string | undefined,
  asset: CreateAssetInput,
): Promise<CreateAssetUploadIntentResult> =>
  requestJson(projectId ? `/projects/${projectId}/assets/upload-intent` : "/assets/upload-intent", {
    method: "POST",
    body: JSON.stringify(asset),
  });

export const confirmAssetUpload = async (
  assetId: string,
  confirmation: {
    checksum?: string;
    metadata?: Record<string, unknown>;
    objectKey?: string;
  } = {},
): Promise<{ asset: AssetMetadata; processingJob: AssetProcessingJob }> =>
  requestJson(`/assets/${assetId}/confirm-upload`, {
    method: "POST",
    body: JSON.stringify(confirmation),
  });

export const loadAssetProcessingJob = async (
  jobId: string,
): Promise<AssetProcessingJob> => {
  const response = await requestJson<{ processingJob: AssetProcessingJob }>(
    `/asset-processing-jobs/${jobId}`,
  );
  return response.processingJob;
};

export const uploadAssetFileToStorage = async (
  assetId: string,
  file: File,
): Promise<{
  asset: AssetMetadata;
  processingJob?: AssetProcessingJob;
  storage: {
    objectKey: string;
    provider: AssetUploadIntent["provider"];
    publicUrl: string;
  };
}> => {
  const response = await fetch(`${apiBaseUrl}/assets/${assetId}/upload`, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
    },
    body: file,
  });
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(getErrorMessage(body));
  }

  return body as {
    asset: AssetMetadata;
    processingJob?: AssetProcessingJob;
    storage: {
      objectKey: string;
      provider: AssetUploadIntent["provider"];
      publicUrl: string;
    };
  };
};

export const importExternalAsset = async (
  projectId: string | undefined,
  asset: ExternalAssetResult,
): Promise<{ asset: AssetMetadata; processingJob: AssetProcessingJob }> =>
  requestJson<{ asset: AssetMetadata; processingJob: AssetProcessingJob }>(
    projectId ? `/projects/${projectId}/assets/import-external` : "/assets/import-external",
    {
      method: "POST",
      body: JSON.stringify(asset),
    },
  );

export const searchAssets = async (
  projectId: string | undefined,
  query: string,
  tags: string[] = [],
): Promise<AssetSearchResponse> => {
  const params = new URLSearchParams({ q: query });
  if (projectId) {
    params.set("projectId", projectId);
  }
  if (tags.length > 0) {
    params.set("tags", tags.join(","));
  }

  return requestJson(`/assets/search?${params.toString()}`);
};

export const searchExternalStockAssets = async (
  request: ExternalAssetSearchRequest,
): Promise<ExternalAssetSearchResponse> =>
  requestJson("/assets/external-search", {
    method: "POST",
    body: JSON.stringify(request),
  });

export const generateScript = async (
  projectId: string,
): Promise<{ fallback: { used: boolean; provider: string }; script: ScriptResult }> =>
  requestJson(`/projects/${projectId}/generate-script`, {
    method: "POST",
  });

export const generateInspirationMaterial = async (
  prompt: string,
  assetType: InspirationAssetType,
  apiConfig?: UserApiConfig,
  options?: InspirationGenerateRequest["options"],
): Promise<InspirationGenerateResponse> =>
  requestJson("/inspiration/generate", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      assetType,
      options,
      apiConfig,
    }),
  });

export const loadInspirationVideoTask = async (
  taskId: string,
  prompt: string,
  apiConfig?: UserApiConfig,
): Promise<InspirationMaterial> => {
  const response = await requestJson<{ material: InspirationMaterial }>("/inspiration/video-task", {
    method: "POST",
    body: JSON.stringify({
      taskId,
      prompt,
      apiConfig,
    }),
  });
  return response.material;
};

export const startRender = async (
  projectId: string,
  request: RenderRequest = {
    mediaSettings: {
      bgmTrack: "creator-pop",
      subtitleStyle: "clean-lower-third",
      subtitlesEnabled: true,
      ttsVoice: "clear-host",
    },
    simulateFailure: false,
  },
): Promise<RenderSnapshot> =>
  requestJson(`/projects/${projectId}/render`, {
    method: "POST",
    body: JSON.stringify(request),
  });

export const loadRenderTask = async (renderTaskId: string): Promise<RenderSnapshot> =>
  requestJson(`/render-tasks/${renderTaskId}`);

export const retryRenderTask = async (
  renderTaskId: string,
  request: RenderRequest,
): Promise<RenderSnapshot> =>
  requestJson(`/render-tasks/${renderTaskId}/retry`, {
    method: "POST",
    body: JSON.stringify(request),
  });

export const exportProject = async (projectId: string): Promise<ExportResult> =>
  requestJson(`/projects/${projectId}/export`);

export const loadDashboard = async (projectId: string): Promise<DashboardResponse> =>
  requestJson(`/projects/${projectId}/dashboard`);

export const updateScene = async (
  sceneId: string,
  update: SceneUpdate,
): Promise<StoryboardScene> => {
  const response = await requestJson<{ scene: StoryboardScene }>(`/scenes/${sceneId}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
  return response.scene;
};

export const reorderScenes = async (
  projectId: string,
  sceneIds: string[],
): Promise<StoryboardScene[]> => {
  const response = await requestJson<{ scenes: StoryboardScene[] }>(
    `/projects/${projectId}/scenes/reorder`,
    {
      method: "POST",
      body: JSON.stringify({ sceneIds }),
    },
  );
  return response.scenes;
};

export const deleteScene = async (sceneId: string): Promise<StoryboardScene[]> => {
  const response = await requestJson<{ scenes: StoryboardScene[] }>(`/scenes/${sceneId}`, {
    method: "DELETE",
  });
  return response.scenes;
};

export const regenerateScene = async (
  sceneId: string,
): Promise<{ scene: StoryboardScene; traceEvent: TraceEvent }> =>
  requestJson(`/scenes/${sceneId}/regenerate`, {
    method: "POST",
  });

export const loadSceneSuggestions = async (sceneId: string): Promise<EditingSuggestion[]> => {
  const response = await requestJson<{ suggestions: EditingSuggestion[] }>(
    `/scenes/${sceneId}/suggestions`,
  );
  return response.suggestions;
};

export const applySceneSuggestion = async (
  sceneId: string,
  suggestionId: string,
): Promise<{ scene: StoryboardScene; traceEvent: TraceEvent }> =>
  requestJson(`/scenes/${sceneId}/suggestions/${suggestionId}/apply`, {
    method: "POST",
  });

export type {
  AssetSearchResult,
  DashboardResponse,
  EditingSuggestion,
  ExternalAssetProviderConfig,
  ExternalAssetResult,
  ExternalAssetSearchRequest,
  ExternalAssetSearchResponse,
  InspirationAssetType,
  InspirationGenerateResponse,
  InspirationMaterial,
  MediaSettings,
  RenderRequest,
};
