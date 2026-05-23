import type {
  ExternalAssetProviderConfig,
  ExternalAssetProviderName,
  ExternalAssetResult,
} from "@shopclip/shared";

export interface ExternalAssetSearchInput {
  query: string;
  perPage?: number;
  type?: "image" | "video";
}

export interface ExternalAssetProvider {
  source: ExternalAssetProviderName;
  search: (input: ExternalAssetSearchInput) => Promise<ExternalAssetResult[]>;
}

type AnyRecord = Record<string, unknown>;

const PEXELS_LICENSE_URL = "https://www.pexels.com/license/";
const PIXABAY_LICENSE_URL = "https://pixabay.com/service/license-summary/";
const DEMO_LICENSE_URL = "https://example.com/shopclip-demo-stock-license";

const isRecord = (value: unknown): value is AnyRecord => typeof value === "object" && value !== null;

const getString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const getNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const getRecord = (value: unknown): AnyRecord | undefined => (isRecord(value) ? value : undefined);

const getRecordArray = (value: unknown): AnyRecord[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const tagsFromText = (value: unknown): string[] =>
  getString(value)
    ?.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean) ?? [];

const createFallbackTitle = (prefix: string, id: string) => `${prefix} ${id}`;

export const normalizePexelsPhoto = (photo: AnyRecord): ExternalAssetResult => {
  const id = String(photo.id);
  const src = getRecord(photo.src);
  const previewUrl =
    getString(src?.medium) ?? getString(src?.large) ?? getString(src?.original) ?? "";
  const title = getString(photo.alt) ?? createFallbackTitle("Pexels photo", id);

  return {
    id: `pexels:photo:${id}`,
    source: "pexels",
    externalId: id,
    type: "image",
    title,
    thumbnailUrl: getString(src?.small) ?? previewUrl,
    previewUrl,
    downloadUrl: getString(src?.original) ?? previewUrl,
    externalUrl: getString(photo.url) ?? `https://www.pexels.com/photo/${id}/`,
    authorName: getString(photo.photographer) ?? "Pexels creator",
    authorUrl: getString(photo.photographer_url),
    licenseLabel: "Pexels License",
    licenseUrl: PEXELS_LICENSE_URL,
    canUseCommercially: true,
    requiresAttribution: false,
    tags: tagsFromText(title),
    width: getNumber(photo.width),
    height: getNumber(photo.height),
  };
};

export const normalizePexelsVideo = (video: AnyRecord): ExternalAssetResult => {
  const id = String(video.id);
  const files = getRecordArray(video.video_files).filter(
    (file) => getString(file.file_type) === "video/mp4" && getString(file.link),
  );
  const previewFile = files.find((file) => getString(file.quality) === "sd") ?? files[0];
  const downloadFile = files.find((file) => getString(file.quality) === "hd") ?? previewFile;
  const user = getRecord(video.user);

  return {
    id: `pexels:video:${id}`,
    source: "pexels",
    externalId: id,
    type: "video",
    title: createFallbackTitle("Pexels video", id),
    thumbnailUrl: getString(video.image) ?? getString(previewFile?.link) ?? "",
    previewUrl: getString(previewFile?.link) ?? "",
    downloadUrl: getString(downloadFile?.link),
    externalUrl: getString(video.url) ?? `https://www.pexels.com/video/${id}/`,
    authorName: getString(user?.name) ?? "Pexels creator",
    authorUrl: getString(user?.url),
    licenseLabel: "Pexels License",
    licenseUrl: PEXELS_LICENSE_URL,
    canUseCommercially: true,
    requiresAttribution: false,
    tags: [],
    width: getNumber(video.width),
    height: getNumber(video.height),
    durationSeconds: getNumber(video.duration),
  };
};

export const normalizePixabayImage = (image: AnyRecord): ExternalAssetResult => {
  const id = String(image.id);
  const tags = tagsFromText(image.tags);
  const title = tags.length > 0 ? tags.join(", ") : createFallbackTitle("Pixabay image", id);

  return {
    id: `pixabay:image:${id}`,
    source: "pixabay",
    externalId: id,
    type: "image",
    title,
    thumbnailUrl: getString(image.previewURL) ?? getString(image.webformatURL) ?? "",
    previewUrl: getString(image.webformatURL) ?? getString(image.previewURL) ?? "",
    downloadUrl: getString(image.largeImageURL) ?? getString(image.webformatURL),
    externalUrl: getString(image.pageURL) ?? `https://pixabay.com/images/id-${id}/`,
    authorName: getString(image.user) ?? "Pixabay creator",
    authorUrl: getNumber(image.user_id) ? `https://pixabay.com/users/${image.user_id}/` : undefined,
    licenseLabel: "Pixabay Content License",
    licenseUrl: PIXABAY_LICENSE_URL,
    canUseCommercially: true,
    requiresAttribution: false,
    tags,
    width: getNumber(image.imageWidth),
    height: getNumber(image.imageHeight),
  };
};

export const normalizePixabayVideo = (video: AnyRecord): ExternalAssetResult => {
  const id = String(video.id);
  const tags = tagsFromText(video.tags);
  const videos = getRecord(video.videos);
  const small = getRecord(videos?.small);
  const medium = getRecord(videos?.medium);
  const previewUrl = getString(small?.url) ?? getString(medium?.url) ?? "";
  const title = tags.length > 0 ? tags.join(", ") : createFallbackTitle("Pixabay video", id);

  return {
    id: `pixabay:video:${id}`,
    source: "pixabay",
    externalId: id,
    type: "video",
    title,
    thumbnailUrl: previewUrl,
    previewUrl,
    downloadUrl: getString(medium?.url) ?? previewUrl,
    externalUrl: getString(video.pageURL) ?? `https://pixabay.com/videos/id-${id}/`,
    authorName: getString(video.user) ?? "Pixabay creator",
    authorUrl: getNumber(video.user_id) ? `https://pixabay.com/users/${video.user_id}/` : undefined,
    licenseLabel: "Pixabay Content License",
    licenseUrl: PIXABAY_LICENSE_URL,
    canUseCommercially: true,
    requiresAttribution: false,
    tags,
    width: getNumber(medium?.width) ?? getNumber(small?.width),
    height: getNumber(medium?.height) ?? getNumber(small?.height),
    durationSeconds: getNumber(video.duration),
  };
};

const fetchJson = async (url: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`External asset provider request failed with HTTP ${response.status}.`);
  }
  return response.json();
};

const filterValidResults = (results: ExternalAssetResult[]): ExternalAssetResult[] =>
  results.filter((result) => result.previewUrl && result.thumbnailUrl);

export const createPexelsProvider = (apiKey: string): ExternalAssetProvider => ({
  source: "pexels",
  search: async ({ query, perPage = 8, type }) => {
    if (!query.trim()) {
      return [];
    }

    const encodedQuery = encodeURIComponent(query);
    const headers = { authorization: apiKey };
    const results: ExternalAssetResult[] = [];

    if (!type || type === "image") {
      const body = await fetchJson(
        `https://api.pexels.com/v1/search?query=${encodedQuery}&per_page=${perPage}`,
        { headers },
      );
      results.push(...getRecordArray(getRecord(body)?.photos).map(normalizePexelsPhoto));
    }

    if (!type || type === "video") {
      const body = await fetchJson(
        `https://api.pexels.com/videos/search?query=${encodedQuery}&per_page=${perPage}`,
        { headers },
      );
      results.push(...getRecordArray(getRecord(body)?.videos).map(normalizePexelsVideo));
    }

    return filterValidResults(results);
  },
});

export const createPixabayProvider = (apiKey: string): ExternalAssetProvider => ({
  source: "pixabay",
  search: async ({ query, perPage = 8, type }) => {
    if (!query.trim()) {
      return [];
    }

    const params = new URLSearchParams({
      key: apiKey,
      q: query,
      per_page: String(perPage),
      safesearch: "true",
    });
    const results: ExternalAssetResult[] = [];

    if (!type || type === "image") {
      params.set("image_type", "photo");
      const body = await fetchJson(`https://pixabay.com/api/?${params.toString()}`);
      results.push(...getRecordArray(getRecord(body)?.hits).map(normalizePixabayImage));
    }

    if (!type || type === "video") {
      params.delete("image_type");
      const body = await fetchJson(`https://pixabay.com/api/videos/?${params.toString()}`);
      results.push(...getRecordArray(getRecord(body)?.hits).map(normalizePixabayVideo));
    }

    return filterValidResults(results);
  },
});

const demoPreview = (label: string, hue: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#101217"/><rect x="80" y="70" width="800" height="400" rx="28" fill="${hue}" opacity="0.28"/><circle cx="270" cy="220" r="74" fill="#22d3ee" opacity="0.42"/><rect x="390" y="170" width="250" height="150" rx="22" fill="#f8fafc" opacity="0.86"/><rect x="420" y="205" width="190" height="16" rx="8" fill="#111827" opacity="0.55"/><rect x="420" y="240" width="142" height="16" rx="8" fill="#111827" opacity="0.38"/><text x="100" y="455" fill="#f8fafc" font-family="Arial, sans-serif" font-size="42" font-weight="700">${label}</text></svg>`,
  )}`;

export const createDemoExternalAssetProvider = (): ExternalAssetProvider => ({
  source: "demo",
  search: async ({ query, perPage = 8, type }) => {
    if (!query.trim()) {
      return [];
    }

    const queryTags = query
      .split(/\s+/)
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    const candidates: ExternalAssetResult[] = [
      {
        id: "demo:image:desk-packshot",
        source: "demo",
        externalId: "desk-packshot",
        type: "image",
        title: "Demo stock desk product packshot",
        thumbnailUrl: demoPreview("Desk packshot", "#ec4899"),
        previewUrl: demoPreview("Desk packshot", "#ec4899"),
        downloadUrl: demoPreview("Desk packshot", "#ec4899"),
        externalUrl: "https://example.com/shopclip-demo-stock/desk-packshot",
        authorName: "ShopClip demo stock",
        licenseLabel: "Demo stock license",
        licenseUrl: DEMO_LICENSE_URL,
        canUseCommercially: true,
        requiresAttribution: false,
        tags: ["desk", "product", "packshot", ...queryTags],
        width: 960,
        height: 540,
      },
      {
        id: "demo:video:creator-broll",
        source: "demo",
        externalId: "creator-broll",
        type: "video",
        title: "Demo stock creator desk B-roll",
        thumbnailUrl: demoPreview("Creator B-roll", "#22d3ee"),
        previewUrl: demoPreview("Creator B-roll", "#22d3ee"),
        downloadUrl: demoPreview("Creator B-roll", "#22d3ee"),
        externalUrl: "https://example.com/shopclip-demo-stock/creator-broll",
        authorName: "ShopClip demo stock",
        licenseLabel: "Demo stock license",
        licenseUrl: DEMO_LICENSE_URL,
        canUseCommercially: true,
        requiresAttribution: false,
        tags: ["desk", "creator", "video", ...queryTags],
        width: 960,
        height: 540,
        durationSeconds: 6,
      },
    ];

    return candidates
      .filter((candidate) => !type || candidate.type === type)
      .slice(0, Math.max(1, perPage));
  },
});

const enabledProviders = (): Set<string> =>
  new Set(
    (process.env.EXTERNAL_ASSET_PROVIDERS ?? "")
      .split(",")
      .map((provider) => provider.trim().toLowerCase())
      .filter(Boolean),
  );

export const createConfiguredExternalAssetProviders = (): ExternalAssetProvider[] => {
  const enabled = enabledProviders();
  const providers: ExternalAssetProvider[] = [];
  const pexelsApiKey = process.env.PEXELS_API_KEY?.trim();
  const pixabayApiKey = process.env.PIXABAY_API_KEY?.trim();

  if (pexelsApiKey && (enabled.size === 0 || enabled.has("pexels"))) {
    providers.push(createPexelsProvider(pexelsApiKey));
  }
  if (pixabayApiKey && (enabled.size === 0 || enabled.has("pixabay"))) {
    providers.push(createPixabayProvider(pixabayApiKey));
  }
  if (enabled.has("demo")) {
    providers.push(createDemoExternalAssetProvider());
  }
  if (enabled.size === 0 && !pexelsApiKey && !pixabayApiKey) {
    providers.push(createDemoExternalAssetProvider());
  }

  return providers;
};

export const createExternalAssetProvidersFromConfig = (
  configs: ExternalAssetProviderConfig[] = [],
): ExternalAssetProvider[] => {
  const providers: ExternalAssetProvider[] = [];

  for (const config of configs) {
    if (config.enabled === false) {
      continue;
    }

    const apiKey = config.apiKey?.trim();
    if (config.source === "demo") {
      providers.push(createDemoExternalAssetProvider());
    }
    if (config.source === "pexels" && apiKey) {
      providers.push(createPexelsProvider(apiKey));
    }
    if (config.source === "pixabay" && apiKey) {
      providers.push(createPixabayProvider(apiKey));
    }
  }

  return providers;
};

export const searchExternalAssets = async (
  input: ExternalAssetSearchInput,
  providers = createConfiguredExternalAssetProviders(),
): Promise<ExternalAssetResult[]> => {
  const settled = await Promise.allSettled(providers.map((provider) => provider.search(input)));
  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
};
