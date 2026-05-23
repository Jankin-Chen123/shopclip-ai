import { describe, expect, it } from "vitest";

import {
  normalizePexelsPhoto,
  normalizePexelsVideo,
  normalizePixabayImage,
  normalizePixabayVideo,
  normalizeFreesoundSound,
  createConfiguredExternalAssetProviders,
  createExternalAssetProvidersFromConfig,
} from "./externalAssetProviders";

describe("external asset provider normalization", () => {
  it("normalizes Pexels photo payloads without exposing provider secrets", () => {
    const result = normalizePexelsPhoto({
      id: 123,
      alt: "Desk product setup",
      url: "https://www.pexels.com/photo/desk-product-123/",
      photographer: "Creator Name",
      photographer_url: "https://www.pexels.com/@creator",
      width: 1600,
      height: 900,
      src: {
        medium: "https://images.pexels.com/photos/123/medium.jpeg",
        original: "https://images.pexels.com/photos/123/original.jpeg",
      },
    });

    expect(result).toMatchObject({
      id: "pexels:photo:123",
      source: "pexels",
      externalId: "123",
      type: "image",
      title: "Desk product setup",
      previewUrl: "https://images.pexels.com/photos/123/medium.jpeg",
      downloadUrl: "https://images.pexels.com/photos/123/original.jpeg",
      authorName: "Creator Name",
      licenseLabel: "Pexels License",
      canUseCommercially: true,
      requiresAttribution: false,
    });
    expect(JSON.stringify(result)).not.toContain("api");
  });

  it("normalizes Pexels video payloads with preview and download URLs", () => {
    const result = normalizePexelsVideo({
      id: 456,
      url: "https://www.pexels.com/video/product-demo-456/",
      image: "https://images.pexels.com/videos/456/thumbnail.jpg",
      duration: 7,
      width: 1080,
      height: 1920,
      user: {
        name: "Video Creator",
        url: "https://www.pexels.com/@video-creator",
      },
      video_files: [
        {
          quality: "sd",
          file_type: "video/mp4",
          link: "https://videos.pexels.com/video-files/456/sd.mp4",
        },
        {
          quality: "hd",
          file_type: "video/mp4",
          link: "https://videos.pexels.com/video-files/456/hd.mp4",
        },
      ],
    });

    expect(result).toMatchObject({
      id: "pexels:video:456",
      source: "pexels",
      externalId: "456",
      type: "video",
      title: "Pexels video 456",
      thumbnailUrl: "https://images.pexels.com/videos/456/thumbnail.jpg",
      previewUrl: "https://videos.pexels.com/video-files/456/sd.mp4",
      downloadUrl: "https://videos.pexels.com/video-files/456/hd.mp4",
      durationSeconds: 7,
    });
  });

  it("normalizes Pixabay image and video payloads", () => {
    const image = normalizePixabayImage({
      id: 789,
      tags: "desk, product, ecommerce",
      pageURL: "https://pixabay.com/photos/desk-product-789/",
      previewURL: "https://cdn.pixabay.com/photo/preview.jpg",
      largeImageURL: "https://cdn.pixabay.com/photo/large.jpg",
      user: "Pixabay Image Creator",
      user_id: 42,
      imageWidth: 1200,
      imageHeight: 800,
    });

    const video = normalizePixabayVideo({
      id: 987,
      tags: "phone stand, product video",
      pageURL: "https://pixabay.com/videos/phone-stand-987/",
      user: "Pixabay Video Creator",
      user_id: 43,
      duration: 12,
      videos: {
        small: {
          url: "https://cdn.pixabay.com/video/small.mp4",
          width: 640,
          height: 360,
        },
        medium: {
          url: "https://cdn.pixabay.com/video/medium.mp4",
          width: 1280,
          height: 720,
        },
      },
    });

    expect(image).toMatchObject({
      id: "pixabay:image:789",
      source: "pixabay",
      type: "image",
      title: "desk, product, ecommerce",
      previewUrl: "https://cdn.pixabay.com/photo/preview.jpg",
      downloadUrl: "https://cdn.pixabay.com/photo/large.jpg",
      authorName: "Pixabay Image Creator",
      tags: ["desk", "product", "ecommerce"],
    });
    expect(video).toMatchObject({
      id: "pixabay:video:987",
      source: "pixabay",
      type: "video",
      title: "phone stand, product video",
      previewUrl: "https://cdn.pixabay.com/video/small.mp4",
      downloadUrl: "https://cdn.pixabay.com/video/medium.mp4",
      durationSeconds: 12,
      tags: ["phone stand", "product video"],
    });
  });

  it("normalizes Freesound sound payloads with high-quality playable previews", () => {
    const result = normalizeFreesoundSound({
      id: 12345,
      name: "Cash register button click",
      url: "https://freesound.org/people/creator/sounds/12345/",
      username: "Freesound Creator",
      license: "https://creativecommons.org/publicdomain/zero/1.0/",
      tags: ["click", "cash register"],
      duration: 1.2,
      previews: {
        "preview-lq-mp3": "https://cdn.freesound.org/previews/12/12345-lq.mp3",
        "preview-hq-mp3": "https://cdn.freesound.org/previews/12/12345-hq.mp3",
      },
    });

    expect(result).toMatchObject({
      id: "freesound:sound:12345",
      source: "freesound",
      externalId: "12345",
      type: "audio",
      title: "Cash register button click",
      thumbnailUrl: "",
      previewUrl: "https://cdn.freesound.org/previews/12/12345-hq.mp3",
      downloadUrl: "https://cdn.freesound.org/previews/12/12345-hq.mp3",
      authorName: "Freesound Creator",
      authorUrl: "https://freesound.org/people/Freesound%20Creator/",
      licenseLabel: "Creative Commons 0",
      canUseCommercially: true,
      requiresAttribution: false,
      tags: ["click", "cash register"],
      durationSeconds: 1.2,
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("does not create providers when no external provider keys are configured", () => {
    const previousProviders = process.env.EXTERNAL_ASSET_PROVIDERS;
    const previousPexels = process.env.PEXELS_API_KEY;
    const previousPixabay = process.env.PIXABAY_API_KEY;
    const previousFreesound = process.env.FREESOUND_API_KEY;
    delete process.env.EXTERNAL_ASSET_PROVIDERS;
    delete process.env.PEXELS_API_KEY;
    delete process.env.PIXABAY_API_KEY;
    delete process.env.FREESOUND_API_KEY;

    try {
      expect(createConfiguredExternalAssetProviders().map((provider) => provider.source)).toEqual(
        [],
      );
    } finally {
      if (previousProviders === undefined) {
        delete process.env.EXTERNAL_ASSET_PROVIDERS;
      } else {
        process.env.EXTERNAL_ASSET_PROVIDERS = previousProviders;
      }
      if (previousPexels === undefined) {
        delete process.env.PEXELS_API_KEY;
      } else {
        process.env.PEXELS_API_KEY = previousPexels;
      }
      if (previousPixabay === undefined) {
        delete process.env.PIXABAY_API_KEY;
      } else {
        process.env.PIXABAY_API_KEY = previousPixabay;
      }
      if (previousFreesound === undefined) {
        delete process.env.FREESOUND_API_KEY;
      } else {
        process.env.FREESOUND_API_KEY = previousFreesound;
      }
    }
  });

  it("creates user-configured providers only when enabled and keyed", () => {
    const providers = createExternalAssetProvidersFromConfig([
      { source: "pexels", apiKey: "pexels-secret", enabled: true },
      { source: "pixabay", enabled: true },
      { source: "pixabay", apiKey: "pixabay-secret", enabled: false },
      { source: "freesound", apiKey: "freesound-secret", enabled: true },
    ]);

    expect(providers.map((provider) => provider.source)).toEqual(["pexels", "freesound"]);
    expect(JSON.stringify(providers.map((provider) => provider.source))).not.toContain("secret");
  });
});
