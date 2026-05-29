# Part 015 验证证据 - 多颗粒度素材结构化、爆款视频拆解与智能剪辑

日期：2026-05-29

## 已落地范围

- Shared schema：新增商品/素材/slice/参考视频拆解/灵感模板结构化合同，并扩展分镜 `assetRecallQuery`。
- API 数据层：扩展 `AssetSlice`、`AssetProcessingEvent`、`ReferenceVideo`、`ReferenceVideoSegment`、`ViralTemplate`、`StoryboardScene.assetRecallQuery`，补充 Prisma migration 与 store 方法。
- 素材处理：`POST /api/assets/:assetId/process` 可生成多阶段处理事件、结构化素材 metadata 与视频 slice。
- 混合检索：`GET /api/assets/search` 支持 `level=slice` 与 `sceneRole`，融合纯文本检索与 COS 智能检索候选。
- 爆款拆解：`POST /api/references/analyze` 保存来源声明和结构化拆解，`POST /api/references/templates` 聚合为灵感模板。
- 自有参考视频：`POST /api/references/analyze` 支持 `sourceAssetId`，可选择已上传视频素材，后端先复用素材处理链路生成结构化 slice，再保存参考拆解。
- 剧本接入：剧本生成请求支持 `productionMode`、`referenceId`、`templateId`，生成分镜包含 `assetRecallQuery`。
- 智能剪辑：`POST /api/scenes/:sceneId/asset-recall` 按分镜召回可用素材/slice，并排除 `public_reference` 原始公开视频素材。
- 前端接入：素材卡支持结构化分析入口，参考视频拆解面板支持提炼模板，剧本面板支持选择生产模式/参考视频/模板，Studio 支持召回候选切片并替换当前分镜素材。
- 真实多模态 provider：`apps/api/src/providers/vision/arkVisionUnderstandingProvider.ts` 已从 mock 占位升级为火山方舟/Ark Responses API wrapper。`VISION_PROVIDER_MODE=ark` 且配置 `ARK_API_KEY` 或 `AI_VISION_API_KEY`、`AI_VISION_MODEL_ID` 后，`POST /api/assets/:assetId/process` 会调用真实多模态模型；未配置或失败时自动回落 mock，并在结构化 metadata 中标记 `needs_review`。

## 验证命令

```powershell
corepack pnpm --filter @shopclip/api db:generate
corepack pnpm --filter @shopclip/shared test
corepack pnpm --filter @shopclip/shared build
corepack pnpm --filter @shopclip/api test
corepack pnpm --filter @shopclip/api test -- src/providers/vision/arkVisionUnderstandingProvider.test.ts src/part015-processing-flow.test.ts
corepack pnpm --filter @shopclip/api typecheck
corepack pnpm --filter @shopclip/web test
corepack pnpm --filter @shopclip/web typecheck
corepack pnpm --filter @shopclip/web build
corepack pnpm --filter @shopclip/web test:e2e -- part-015-structure-and-reference.spec.ts
git diff --check
```

补充验证：

```powershell
corepack pnpm --filter @shopclip/api test -- src/part015-processing-flow.test.ts
```

## 结果

- `@shopclip/api db:generate`：Prisma Client 生成通过。
- `@shopclip/shared`：3 个测试文件、21 个测试通过；build 通过。
- `@shopclip/api`：22 个测试文件、103 个测试通过；typecheck 通过。
- `@shopclip/api` 视觉 provider 定向验证：`arkVisionUnderstandingProvider.test.ts` 覆盖真实 Ark Responses 请求体、JSON 解析、未配置 mock fallback、无效模型输出 `needs_review` fallback；与 `part015-processing-flow.test.ts` 联跑通过。
- `@shopclip/web`：1 个测试文件、71 个测试通过；typecheck 与 production build 通过。
- `@shopclip/web` E2E：`part-015-structure-and-reference.spec.ts` 1 个浏览器用例通过，覆盖“上传自有参考视频 -> 参考拆解 -> 提炼模板 -> 剧本参考选择”，并生成截图 `projects/shopclip-ai/evidence/part-015-uploaded-reference-video.png`。
- `git diff --check`：无空白错误。
- `src/part015-processing-flow.test.ts` 覆盖了公开视频 URL 拆解、自有上传视频 `sourceAssetId` 拆解、素材处理后 slice 检索、模板提炼、剧本 `assetRecallQuery` 和分镜素材召回。
- E2E 启动方式已改为 `apps/web/e2e/run-with-servers.cjs`：显式启动 memory API 与 Vite web，等待健康检查后运行 Playwright，结束后按 PID 树清理本地 dev server，避免 Windows + pnpm 下 Playwright `webServer` 清理卡住。
- 修复验证中发现的 `sourceAssetId` 上传参考视频链路问题：前端提交和 API schema 均将空白 `sourceUrl` 归一为未提供，避免禁用 URL 输入框仍提交 `""` 导致校验失败。

## 已知边界

- 当前媒体抽帧、ASR、爆款拆解默认走 deterministic mock provider；视觉理解真实 provider 已接入，但需要可公网访问的素材 URL 和真实方舟环境变量后做线上 smoke test。
- COS 智能检索仍是召回加速层；数据库结构化 metadata 是事实源。
- 公开视频只保存来源和结构化拆解，不进入混剪素材池。
- 自有参考视频入口复用现有素材上传能力；参考拆解面板选择已上传视频素材，不另建重复上传表单。
- E2E 默认使用 memory store 和 mock providers；真实火山/Ark/COS 路径需要在配置真实环境变量后做单独线上 smoke test。
