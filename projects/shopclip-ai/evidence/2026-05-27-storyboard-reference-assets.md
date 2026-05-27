# 2026-05-27 Storyboard Reference Assets

## Scope

- 分镜图片生成改为按镜头绑定素材解析参考图，并在调用 `doubao-seedream` 时把参考图传给图片生成模型。
- 图片素材直接使用素材 `url` 作为参考图。
- 视频素材优先使用 `metadata.videoReferenceFrames[].imageUrl`；没有已存关键帧时，调用 ffmpeg 抽帧接口生成最多 3 张参考图。
- 视频脚本、fallback 分镜文案、分镜图片提示词固定为中文。

## Seedream Request Contract

图片生成请求通过 Ark `/images/generations` 发送，关键请求体字段：

```json
{
  "model": "doubao-seedream",
  "prompt": "中文分镜提示词，包含脚本上下文、镜头信息、绑定素材、禁止改变和生成要求",
  "size": "1440x2560",
  "n": 1,
  "response_format": "url",
  "sequential_image_generation": "disabled",
  "watermark": false,
  "image": [
    "https://example.com/bound-product.png",
    "https://example.com/video-frame-001.jpg"
  ]
}
```

`image` 只在当前镜头解析到参考图时发送。参考图上限由共享 schema 控制为 14 张。

模型返回按现有 Ark 图片接口解析：

```json
{
  "data": [
    {
      "url": "https://example.com/generated-storyboard.png"
    }
  ]
}
```

如果返回 `b64_json`，服务端会转换为 `data:image/png;base64,...`；如果既没有 `url` 也没有 `b64_json`，本次图片生成视为失败并回退到本地 SVG 分镜预览。

## Prompt Guardrails

分镜图片提示词包含固定中文段落：

- `【全局硬性规则】`
- `【视频脚本上下文】`
- `【本镜头信息】`
- `【绑定素材】`
- `【禁止改变】`
- `【生成要求】`

核心约束：产品外观必须严格匹配绑定素材和参考图，不得改变颜色、形状、材质、Logo、包装、结构、配件和可见文字。

## Script To Storyboard Structuring

`一键生成` 调用文本模型时，system prompt 现在要求只输出中文 Markdown 表格，表头固定为：

```text
| 时间 | 旁白 | 字幕 | 画面 |
```

`生成分镜` 调用 `/generate-script` 时，会优先解析当前文本框里的 Markdown 表格，并把每一行结构化为一个分镜：

- `时间` -> `durationSeconds`
- `旁白` -> `voiceover`
- `字幕` -> `subtitle`
- `画面` -> `visualPrompt`

如果文本框没有可识别的分镜表格，才会回到确定性 fallback 分镜。解析出的 `visualPrompt` 会自动补充“产品外观必须与绑定素材一致”约束。

## One Click Model Invocation

`一键生成` 现在会把步骤一项目资料和步骤二资料一起传给文本模型：

- 步骤一项目资料：产品名称、目标人群、语气、核心卖点。
- 步骤二资料：文本框草稿、素材准备区的 `assetIds`、关键词、素材名称、素材类型。
- 设置页模型配置：`apiConfig.general`，包括用户自定义或官方文本模型配置。

后端 `/rewrite-script` 在收到 `apiConfig.general` 时，即使 `AI_PROVIDER_MODE` 仍是默认 `mock`，也会调用配置的文本模型；只有没有可用模型配置时才使用确定性 fallback。

## Verification

- `corepack pnpm --filter @shopclip/shared test -- schemas.test.ts`
  - Result: pass, 16 tests.
- `corepack pnpm --filter @shopclip/api test -- arkInspirationProvider.test.ts`
  - Result: pass, API test command ran 14 test files / 55 tests.
- `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts arkInspirationProvider.test.ts`
  - Result: pass, API test command ran 14 test files / 57 tests.
- `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts`
  - Result: pass, API test command ran 14 test files / 58 tests.
- `corepack pnpm --filter @shopclip/web test -- App.test.tsx`
  - Result: pass, 57 tests.
- `corepack pnpm typecheck`
  - Result: pass.
- `corepack pnpm lint`
  - Result: pass.

## Residual Risks

- ffmpeg 抽帧需要运行环境配置 `FFMPEG_PATH`、`VIDEO_FRAME_OUTPUT_DIR` 和 `VIDEO_FRAME_PUBLIC_BASE_URL`；未配置时视频素材不会产生新关键帧，但仍会使用已存 `metadata.videoReferenceFrames`。
- 真实生产环境需要确保 `VIDEO_FRAME_PUBLIC_BASE_URL` 生成的帧图 URL 对 `doubao-seedream` 可访问。
- 当前实现按镜头绑定素材传参考图；如果脚本没有 `assetId`，会使用当前素材列表第一项作为兜底绑定素材。
