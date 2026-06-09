import type {
  AssetMetadata,
  AssetProcessingEvent,
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
  ProjectPrepUpdate,
  ProjectSummary,
  ReferenceVideo,
  RenderRequest,
  RenderTask,
  SceneRegenerationRequest,
  SceneUpdate,
  ScriptGenerationRequest,
  ScriptResult,
  SmartEditRequest,
  SmartEditResult,
  SmartEditSegmentRefreshRequest,
  StoryboardScene,
  TraceEvent,
  ViralTemplate,
  VideoGenerationSettings,
} from "@shopclip/shared";

export interface ProjectSnapshot extends Project {
  assets: AssetMetadata[];
  assetSlices: AssetSlice[];
  assetProcessingEvents: AssetProcessingEvent[];
  assetProcessingJobs: AssetProcessingJob[];
  referenceVideos: ReferenceVideo[];
  viralTemplates: ViralTemplate[];
  scripts: ScriptResult[];
  scenes: StoryboardScene[];
  renderTasks: RenderTask[];
}

export type { ProjectSummary };

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

export interface AssetRecallCandidate {
  asset: AssetMetadata;
  reasons: string[];
  score: number;
  slice?: AssetSlice;
}

export type UserApiConfig = NonNullable<InspirationGenerateRequest["apiConfig"]>;
export type StockProviderConfig = ExternalAssetProviderConfig;

const apiBaseUrl = (
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:4000/api" : "/api")
).replace(/\/+$/u, "");

const absoluteApiBaseUrl = (): string => {
  const baseWithSlash = `${apiBaseUrl}/`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(baseWithSlash)) {
    return baseWithSlash;
  }
  const origin =
    typeof window === "undefined" ? "http://localhost:4000" : window.location.origin;
  return new URL(baseWithSlash, origin).toString();
};

export const getAssetContentUrl = (assetId: string): string =>
  `${apiBaseUrl}/assets/${encodeURIComponent(assetId)}/content`;

export const getAssetThumbnailUrl = (assetId: string): string =>
  `${apiBaseUrl}/assets/${encodeURIComponent(assetId)}/thumbnail`;

export const resolveApiDownloadUrl = (url: string): string => {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return url;
  }
  return new URL(url, absoluteApiBaseUrl()).toString();
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const compactResponseText = (value: string, maxLength = 220): string => {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1)}...` : compacted;
};

const getErrorMessage = (body: unknown, response?: Response): string => {
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

  const statusPrefix = response
    ? `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`
    : "Request failed";

  if (typeof body === "string" && body.trim()) {
    if (body.trimStart().startsWith("<")) {
      return `${statusPrefix}. The server returned an HTML error page instead of JSON. This usually means the API timed out or was rejected by the reverse proxy; check the backend logs for the real provider error.`;
    }
    return `${statusPrefix}. ${compactResponseText(body)}`;
  }

  if (response) {
    return `${statusPrefix}. Request failed.`;
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

  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(body, response));
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

export const updateProjectPrep = async (
  projectId: string,
  update: ProjectPrepUpdate,
): Promise<ProjectSnapshot> => {
  const response = await requestJson<{ project: ProjectSnapshot }>(`/projects/${projectId}/prep`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
  return response.project;
};

export const updateProjectBrief = async (
  projectId: string,
  brief: ProjectBrief,
): Promise<ProjectSnapshot> => {
  const response = await requestJson<{ project: ProjectSnapshot }>(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(brief),
  });
  return response.project;
};

export const listProjects = async (): Promise<ProjectSummary[]> => {
  const response = await requestJson<{ projects: ProjectSummary[] }>("/projects");
  return Array.isArray(response.projects) ? response.projects : [];
};

export const deleteProject = async (
  projectId: string,
): Promise<{ deletedProject: ProjectSummary; deletedAssets: AssetMetadata[] }> =>
  requestJson(`/projects/${projectId}`, {
    method: "DELETE",
  });

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
  return requestJson(
    projectId
      ? `/projects/${projectId}/assets?${params.toString()}`
      : `/assets?${params.toString()}`,
  );
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

export const loadAssetProcessingJob = async (jobId: string): Promise<AssetProcessingJob> => {
  const response = await requestJson<{ processingJob: AssetProcessingJob }>(
    `/asset-processing-jobs/${jobId}`,
  );
  return response.processingJob;
};

export const processAssetStructure = async (
  assetId: string,
): Promise<{
  asset: AssetMetadata;
  events: AssetProcessingEvent[];
  job: AssetProcessingJob;
  slices: AssetSlice[];
}> =>
  requestJson(`/assets/${assetId}/process`, {
    method: "POST",
    body: JSON.stringify({ mode: "full", forceRegenerate: true }),
  });

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
  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(body, response));
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
  options: { level?: "asset" | "slice"; sceneRole?: string } = {},
): Promise<AssetSearchResponse> => {
  const params = new URLSearchParams({ q: query });
  if (projectId) {
    params.set("projectId", projectId);
  }
  if (tags.length > 0) {
    params.set("tags", tags.join(","));
  }
  if (options.level) {
    params.set("level", options.level);
  }
  if (options.sceneRole) {
    params.set("sceneRole", options.sceneRole);
  }

  return requestJson(`/assets/search?${params.toString()}`);
};

export const analyzeReferenceVideo = async (input: {
  author?: string;
  category: string;
  projectId?: string;
  publicStats?: ReferenceVideo["publicStats"];
  sourceDeclaration: string;
  sourceAssetId?: string;
  sourcePlatform: string;
  sourceUrl?: string;
  title: string;
}): Promise<ReferenceVideo> => {
  const response = await requestJson<{ reference: ReferenceVideo }>("/references/analyze", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.reference;
};

export const listReferenceVideos = async (projectId?: string): Promise<ReferenceVideo[]> => {
  const params = new URLSearchParams();
  if (projectId) {
    params.set("projectId", projectId);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await requestJson<{ references: ReferenceVideo[] }>(`/references${suffix}`);
  return response.references;
};

export const addReferenceToScriptLibrary = async (
  referenceId: string,
  projectId?: string,
): Promise<AssetMetadata> => {
  const response = await requestJson<{ asset: AssetMetadata }>(
    `/references/${encodeURIComponent(referenceId)}/script-asset`,
    {
      method: "POST",
      body: JSON.stringify({ projectId }),
    },
  );
  return response.asset;
};

export const deleteReferenceVideo = async (
  referenceId: string,
): Promise<{
  deletedAssets: AssetMetadata[];
  deletedReference: ReferenceVideo;
  deletedTemplateIds: string[];
}> =>
  requestJson(`/references/${encodeURIComponent(referenceId)}`, {
    method: "DELETE",
  });

export const createReferenceTemplate = async (input: {
  category: string;
  referenceIds: string[];
  templateName: string;
}): Promise<ViralTemplate> => {
  const response = await requestJson<{ template: ViralTemplate }>("/references/templates", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.template;
};

export const extractTemplateFromScriptAssets = async (input: {
  apiConfig?: UserApiConfig;
  assetIds: string[];
  category?: string;
  templateName?: string;
}): Promise<ViralTemplate> => {
  const response = await requestJson<{ template: ViralTemplate }>(
    "/references/templates/from-script-assets",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return response.template;
};

export const listReferenceTemplates = async (category?: string): Promise<ViralTemplate[]> => {
  const params = new URLSearchParams();
  if (category?.trim()) {
    params.set("category", category.trim());
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await requestJson<{ templates: ViralTemplate[] }>(
    `/references/templates${suffix}`,
  );
  return response.templates;
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
  request: ScriptGenerationRequest = {
    assetIds: [],
    keywords: [],
    materials: [],
    productionMode: "automatic",
  },
): Promise<{ fallback: { used: boolean; provider: string }; script: ScriptResult }> =>
  requestJson(`/projects/${projectId}/generate-script`, {
    method: "POST",
    body: JSON.stringify(request),
  });

export const saveScript = async (
  projectId: string,
  request: ScriptGenerationRequest,
): Promise<{ script: ScriptResult }> =>
  requestJson(`/projects/${projectId}/scripts`, {
    method: "POST",
    body: JSON.stringify(request),
  });

export const generateScriptStoryboard = async (
  projectId: string,
  scriptId: string,
): Promise<{ script: ScriptResult }> =>
  requestJson(
    `/projects/${encodeURIComponent(projectId)}/scripts/${encodeURIComponent(scriptId)}/storyboard`,
    {
      method: "POST",
    },
  );

export const deleteScript = async (scriptId: string): Promise<{ deletedScript: ScriptResult }> =>
  requestJson(`/scripts/${encodeURIComponent(scriptId)}`, {
    method: "DELETE",
  });

export const updateScriptDisplayName = async (
  scriptId: string,
  displayName: string | undefined,
): Promise<{ script: ScriptResult }> =>
  requestJson(`/scripts/${encodeURIComponent(scriptId)}`, {
    method: "PATCH",
    body: JSON.stringify({ displayName }),
  });

export const rewriteScript = async (
  projectId: string,
  request: ScriptGenerationRequest,
): Promise<{ fallback: { used: boolean; provider: string }; scriptText: string }> =>
  requestJson(`/projects/${projectId}/rewrite-script`, {
    method: "POST",
    body: JSON.stringify(request),
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
    videoSettings: {
      ratio: "9:16",
      resolution: "720p",
      generateAudio: false,
      watermark: false,
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

export const deleteRenderTask = async (
  renderTaskId: string,
): Promise<{ deletedRenderTask: RenderTask }> =>
  requestJson(`/render-tasks/${encodeURIComponent(renderTaskId)}`, {
    method: "DELETE",
  });

export const updateRenderTaskDisplayName = async (
  renderTaskId: string,
  displayName: string | undefined,
): Promise<RenderSnapshot> =>
  requestJson(`/render-tasks/${encodeURIComponent(renderTaskId)}`, {
    method: "PATCH",
    body: JSON.stringify({ displayName }),
  });

export const retryRenderTask = async (
  renderTaskId: string,
  request: RenderRequest,
): Promise<RenderSnapshot> =>
  requestJson(`/render-tasks/${renderTaskId}/retry`, {
    method: "POST",
    body: JSON.stringify(request),
  });

export const startSmartEdit = async (
  projectId: string,
  request: SmartEditRequest,
): Promise<RenderSnapshot> =>
  requestJson(`/projects/${projectId}/smart-edit`, {
    method: "POST",
    body: JSON.stringify(request),
  });

export const refreshSmartEditSegment = async (
  projectId: string,
  sceneId: string,
  request: SmartEditSegmentRefreshRequest,
): Promise<RenderSnapshot> =>
  requestJson(`/projects/${projectId}/smart-edit/segments/${sceneId}/refresh`, {
    method: "POST",
    body: JSON.stringify(request),
  });

export const exportProject = async (projectId: string): Promise<ExportResult> => {
  const response = await requestJson<ExportResult>(`/projects/${projectId}/export`);
  return {
    ...response,
    downloadUrl: resolveApiDownloadUrl(response.downloadUrl),
    exportUrl: resolveApiDownloadUrl(response.exportUrl),
  };
};

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
  request?: SceneRegenerationRequest,
): Promise<{ scene: StoryboardScene; traceEvent: TraceEvent }> =>
  requestJson(`/scenes/${sceneId}/regenerate`, {
    method: "POST",
    body: JSON.stringify(request ?? {}),
  });

export const recallSceneAssets = async (
  sceneId: string,
): Promise<{ scene: StoryboardScene; candidates: AssetRecallCandidate[] }> =>
  requestJson(`/scenes/${sceneId}/asset-recall`, {
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
  AssetProcessingEvent,
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
  ReferenceVideo,
  RenderRequest,
  SmartEditRequest,
  SmartEditResult,
  SmartEditSegmentRefreshRequest,
  ViralTemplate,
  VideoGenerationSettings,
};
