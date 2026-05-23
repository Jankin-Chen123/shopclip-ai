import type {
  ExternalAssetProviderConfig,
  ExternalAssetProviderName,
  ExternalAssetResult,
} from "@shopclip/shared";

export interface ExternalAssetSearchInput {
  query: string;
  page?: number;
  perPage?: number;
  type?: "image" | "video" | "audio" | "script";
}

export interface ExternalAssetProvider {
  source: ExternalAssetProviderName;
  search: (input: ExternalAssetSearchInput) => Promise<ExternalAssetResult[]>;
}

type AnyRecord = Record<string, unknown>;

const PEXELS_LICENSE_URL = "https://www.pexels.com/license/";
const PIXABAY_LICENSE_URL = "https://pixabay.com/service/license-summary/";
const FREESOUND_SEARCH_URL = "https://freesound.org/apiv2/search/text/";

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

const licenseLabelFromUrl = (licenseUrl?: string): string => {
  if (!licenseUrl) {
    return "Freesound License";
  }
  if (licenseUrl.includes("/zero/")) {
    return "Creative Commons 0";
  }
  if (licenseUrl.includes("/by-nc/")) {
    return "Creative Commons Attribution NonCommercial";
  }
  if (licenseUrl.includes("/by/")) {
    return "Creative Commons Attribution";
  }
  return "Freesound License";
};

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

export const normalizeFreesoundSound = (sound: AnyRecord): ExternalAssetResult => {
  const id = String(sound.id);
  const previews = getRecord(sound.previews);
  const previewUrl =
    getString(previews?.["preview-hq-mp3"]) ??
    getString(previews?.["preview-hq-ogg"]) ??
    getString(previews?.["preview-lq-mp3"]) ??
    getString(previews?.["preview-lq-ogg"]) ??
    "";
  const title = getString(sound.name) ?? createFallbackTitle("Freesound audio", id);
  const username = getString(sound.username) ?? "Freesound creator";
  const licenseUrl = getString(sound.license);

  return {
    id: `freesound:sound:${id}`,
    source: "freesound",
    externalId: id,
    type: "audio",
    title,
    thumbnailUrl: "",
    previewUrl,
    downloadUrl: previewUrl,
    externalUrl: getString(sound.url) ?? `https://freesound.org/s/${id}/`,
    authorName: username,
    authorUrl: `https://freesound.org/people/${encodeURIComponent(username)}/`,
    licenseLabel: licenseLabelFromUrl(licenseUrl),
    licenseUrl,
    canUseCommercially: !licenseUrl?.includes("/by-nc/"),
    requiresAttribution: Boolean(licenseUrl && !licenseUrl.includes("/zero/")),
    tags: Array.isArray(sound.tags) ? sound.tags.filter((tag): tag is string => Boolean(getString(tag))) : [],
    durationSeconds: getNumber(sound.duration),
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
  results.filter(
    (result) =>
      result.previewUrl &&
      (result.type === "video" || result.type === "audio" || result.thumbnailUrl),
  );

export const createPexelsProvider = (apiKey: string): ExternalAssetProvider => ({
  source: "pexels",
  search: async ({ query, page = 1, perPage = 8, type }) => {
    if (!query.trim() || type === "audio") {
      return [];
    }

    const encodedQuery = encodeURIComponent(query);
    const headers = { authorization: apiKey };
    const results: ExternalAssetResult[] = [];

    if (!type || type === "image") {
      const body = await fetchJson(
        `https://api.pexels.com/v1/search?query=${encodedQuery}&page=${page}&per_page=${perPage}`,
        { headers },
      );
      results.push(...getRecordArray(getRecord(body)?.photos).map(normalizePexelsPhoto));
    }

    if (!type || type === "video") {
      const body = await fetchJson(
        `https://api.pexels.com/videos/search?query=${encodedQuery}&page=${page}&per_page=${perPage}`,
        { headers },
      );
      results.push(...getRecordArray(getRecord(body)?.videos).map(normalizePexelsVideo));
    }

    return filterValidResults(results);
  },
});

export const createPixabayProvider = (apiKey: string): ExternalAssetProvider => ({
  source: "pixabay",
  search: async ({ query, page = 1, perPage = 8, type }) => {
    if (!query.trim() || type === "audio") {
      return [];
    }

    const params = new URLSearchParams({
      key: apiKey,
      page: String(page),
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

export const createFreesoundProvider = (apiKey: string): ExternalAssetProvider => ({
  source: "freesound",
  search: async ({ query, page = 1, perPage = 8, type }) => {
    if (!query.trim() || (type && type !== "audio")) {
      return [];
    }

    const params = new URLSearchParams({
      query,
      page: String(page),
      page_size: String(perPage),
      fields: [
        "id",
        "name",
        "url",
        "username",
        "license",
        "tags",
        "duration",
        "previews",
      ].join(","),
    });
    const body = await fetchJson(`${FREESOUND_SEARCH_URL}?${params.toString()}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });

    return filterValidResults(
      getRecordArray(getRecord(body)?.results).map(normalizeFreesoundSound),
    );
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
  const freesoundApiKey = process.env.FREESOUND_API_KEY?.trim();

  if (pexelsApiKey && (enabled.size === 0 || enabled.has("pexels"))) {
    providers.push(createPexelsProvider(pexelsApiKey));
  }
  if (pixabayApiKey && (enabled.size === 0 || enabled.has("pixabay"))) {
    providers.push(createPixabayProvider(pixabayApiKey));
  }
  if (freesoundApiKey && (enabled.size === 0 || enabled.has("freesound"))) {
    providers.push(createFreesoundProvider(freesoundApiKey));
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
    if (config.source === "pexels" && apiKey) {
      providers.push(createPexelsProvider(apiKey));
    }
    if (config.source === "pixabay" && apiKey) {
      providers.push(createPixabayProvider(apiKey));
    }
    if (config.source === "freesound" && apiKey) {
      providers.push(createFreesoundProvider(apiKey));
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
