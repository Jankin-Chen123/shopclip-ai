import { describe, expect, it } from "vitest";
import type { AssetMetadata, SmartEditSegment } from "@shopclip/shared";

import {
  extensionForUrl,
  isImageSourceForSegment,
  isRemoteUrl,
  sourceUrlForSegment,
} from "./smartEditMediaSources.js";

const imageAsset = (overrides: Partial<AssetMetadata> = {}): AssetMetadata =>
  ({
    id: "asset-image",
    type: "image",
    url: "https://cdn.example.test/image.png",
    ...overrides,
  }) as AssetMetadata;

const segment = (overrides: Partial<SmartEditSegment> = {}): SmartEditSegment =>
  ({
    assetTags: [],
    captionHidden: false,
    captionStartOffsetSeconds: 0,
    durationSeconds: 4,
    enabled: true,
    id: "segment-1",
    order: 1,
    rationale: "test",
    sceneId: "scene-1",
    source: {
      assetId: "asset-image",
      kind: "image-asset",
    },
    sourceAudioMuted: false,
    subtitle: "caption",
    timelineStartSecond: 0,
    transition: "cut",
    voiceover: "",
    voiceoverStartOffsetSeconds: 0,
    ...overrides,
  }) as SmartEditSegment;

describe("smart edit media sources", () => {
  it("resolves source URLs with generated video precedence before image and asset URLs", () => {
    const mediaSegment = segment({
      source: {
        assetId: "asset-image",
        imageUrl: "https://cdn.example.test/fallback-image.png",
        kind: "image-asset",
        sceneClipUrl: "https://cdn.example.test/scene.mp4",
        sceneClipVideoOnlyUrl: "https://cdn.example.test/video-only.mp4",
      },
    });

    expect(sourceUrlForSegment(mediaSegment, [imageAsset()])).toBe(
      "https://cdn.example.test/video-only.mp4",
    );
    expect(
      sourceUrlForSegment(
        segment({
          source: {
            assetId: "asset-image",
            imageUrl: "https://cdn.example.test/fallback-image.png",
            kind: "image-asset",
          },
        }),
        [imageAsset()],
      ),
    ).toBe("https://cdn.example.test/fallback-image.png");
    expect(sourceUrlForSegment(segment(), [imageAsset()])).toBe(
      "https://cdn.example.test/image.png",
    );
  });

  it("classifies image sources while treating generated clips as video sources", () => {
    const generatedVideoSegment = segment({
      source: {
        assetId: "asset-image",
        imageUrl: "https://cdn.example.test/image.png",
        kind: "image-asset",
        sceneClipVideoOnlyUrl: "https://cdn.example.test/video-only.mp4",
      },
    });
    const asset = imageAsset();

    expect(
      isImageSourceForSegment(
        generatedVideoSegment,
        asset,
        "https://cdn.example.test/video-only.mp4",
      ),
    ).toBe(false);
    expect(
      isImageSourceForSegment(
        generatedVideoSegment,
        asset,
        "https://cdn.example.test/image.png",
      ),
    ).toBe(true);
  });

  it("detects remote URLs and keeps extension fallbacks stable", () => {
    expect(isRemoteUrl("https://cdn.example.test/video.mp4")).toBe(true);
    expect(isRemoteUrl("file:///tmp/video.mp4")).toBe(false);
    expect(extensionForUrl("https://cdn.example.test/video.mp4?token=1", ".bin")).toBe(".mp4");
    expect(extensionForUrl("data:image/png;base64,aGVsbG8=", ".png")).toBe(".png");
  });
});
