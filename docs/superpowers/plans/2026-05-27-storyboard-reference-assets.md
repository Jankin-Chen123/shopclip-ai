# Storyboard Reference Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make storyboard image generation send bound user image assets and ffmpeg-extracted video keyframes to doubao-seedream as reference images, while keeping script and storyboard prompts in Chinese.

**Architecture:** Extend the existing Ark image provider request contract with Seedream reference image fields. Resolve each scene's bound asset into reference image URLs before image generation: images pass through directly, videos use stored keyframes when available and an ffmpeg extractor interface for future extraction. Build the storyboard image prompt from a Chinese fixed-format contract that includes script context, scene intent, asset anchors, must-keep rules, and forbidden changes.

**Tech Stack:** TypeScript, Node.js, Express, Vitest, Volcengine Ark-compatible `/images/generations`, ffmpeg via child process.

---

### Task 1: Shared Contract For Reference Images

**Files:**
- Modify: `packages/shared/src/schemas.ts`
- Test: `packages/shared/src/schemas.test.ts`

- [x] **Step 1: Write failing schema tests**

Add a test that accepts `options.image.referenceImages` with up to 14 URL/base64 strings and rejects more than 14.

- [x] **Step 2: Run shared schema test**

Run: `corepack pnpm --filter @shopclip/shared test -- schemas.test.ts`
Expected: FAIL because `referenceImages` is not in the schema.

- [x] **Step 3: Add `referenceImages` to `InspirationGenerateRequestSchema`**

Add `referenceImages: z.array(z.string().trim().min(1)).max(14).default([]).optional()` under `options.image`.

- [x] **Step 4: Run shared schema test**

Run: `corepack pnpm --filter @shopclip/shared test -- schemas.test.ts`
Expected: PASS.

### Task 2: Ark Seedream Request Body Includes References

**Files:**
- Modify: `apps/api/src/providers/ai/arkInspirationProvider.ts`
- Test: `apps/api/src/providers/ai/arkInspirationProvider.test.ts`

- [x] **Step 1: Write failing provider test**

Assert image generation sends `image`, `sequential_image_generation: "disabled"`, and `watermark: false` when `referenceImages` are provided.

- [x] **Step 2: Run provider test**

Run: `corepack pnpm --filter @shopclip/api test -- arkInspirationProvider.test.ts`
Expected: FAIL because the body does not contain `image`.

- [x] **Step 3: Add Seedream reference fields**

In `generateImageWithArk`, include:

```ts
image: request.options?.image?.referenceImages,
sequential_image_generation: "disabled",
watermark: false,
```

Only include `image` when at least one reference URL exists.

- [x] **Step 4: Run provider test**

Run: `corepack pnpm --filter @shopclip/api test -- arkInspirationProvider.test.ts`
Expected: PASS.

### Task 3: Resolve Scene-Bound Reference Images

**Files:**
- Create: `apps/api/src/providers/media/videoFrameExtractor.ts`
- Modify: `apps/api/src/modules/projects/router.ts`
- Test: `apps/api/src/p0-flow.test.ts`

- [x] **Step 1: Write failing API test**

Stub `generateInspiration` fetch and verify `/generate-script` sends bound image asset URLs to Seedream. Add a video asset case with metadata keyframes and verify those frame URLs are sent.

- [x] **Step 2: Run API test**

Run: `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts`
Expected: FAIL because references are not sent.

- [x] **Step 3: Add video frame extractor interface**

Create a small ffmpeg wrapper that can extract frames to a configured directory. The router first uses stored `metadata.videoReferenceFrames`; if absent, it can call the extractor for video assets.

- [x] **Step 4: Resolve references per scene**

For each scene, use `scene.assetId` to select the bound asset. Images return `[asset.url]`. Videos return extracted/stored frame URLs. Pass those URLs into `generateInspiration({ options: { image: { referenceImages }}})`.

- [x] **Step 5: Run API test**

Run: `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts`
Expected: PASS.

### Task 4: Chinese Prompt Contract

**Files:**
- Modify: `apps/api/src/modules/projects/router.ts`
- Modify: `apps/api/src/providers/ai/mockScriptProvider.ts`
- Test: `apps/api/src/p0-flow.test.ts`

- [x] **Step 1: Write failing test**

Assert generated scene subtitles, voiceovers, and visual prompts are Chinese, and Seedream prompt contains the required Chinese sections: `【全局硬性规则】`, `【绑定素材】`, `【禁止改变】`.

- [x] **Step 2: Run API test**

Run: `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts`
Expected: FAIL because fallback scene text is English and prompt lacks sections.

- [x] **Step 3: Update fallback script and prompt builder**

Generate Chinese fallback script/scenes and build the Seedream prompt with the fixed Chinese template.

- [x] **Step 4: Run API test**

Run: `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts`
Expected: PASS.

### Task 5: Verification And Evidence

**Files:**
- Create: `projects/shopclip-ai/evidence/2026-05-27-storyboard-reference-assets.md`

- [x] **Step 1: Run focused tests**

Run:

```bash
corepack pnpm --filter @shopclip/shared test -- schemas.test.ts
corepack pnpm --filter @shopclip/api test -- arkInspirationProvider.test.ts
corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts
```

- [x] **Step 2: Run broader checks**

Run:

```bash
corepack pnpm typecheck
corepack pnpm lint
```

- [x] **Step 3: Record evidence**

Write the changed behavior, verification commands, and any residual risk into the evidence file.
