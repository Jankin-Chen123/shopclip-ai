# Part 015 验证证据 - 多颗粒度素材结构化、爆款视频拆解与智能剪辑

日期：2026-05-29

## 已落地范围

- Shared schema：新增商品/素材/slice/参考视频拆解/灵感模板结构化合同，并扩展分镜 `assetRecallQuery`。
- API 数据层：扩展 `AssetSlice`、`AssetProcessingEvent`、`ReferenceVideo`、`ReferenceVideoSegment`、`ViralTemplate`、`StoryboardScene.assetRecallQuery`，补充 Prisma migration 与 store 方法。
- 素材处理：`POST /api/assets/:assetId/process` 可生成多阶段处理事件、结构化素材 metadata 与视频 slice。
- 混合检索：`GET /api/assets/search` 支持 `level=slice` 与 `sceneRole`，融合纯文本检索与 COS 智能检索候选。
- 爆款拆解：`POST /api/references/analyze` 保存来源声明和结构化拆解，`POST /api/references/templates` 聚合为灵感模板。
- 公开视频主动拆解：只有 `sourceUrl` 时，后端通过 `ReferenceDownloadProvider` 创建 `source=public_reference` 的分析型视频资产，复用 `processAssetStructure()` 生成 slice，再把结构化上下文交给爆款拆解 provider。
- 自有参考视频：`POST /api/references/analyze` 支持 `sourceAssetId`，可选择已上传视频素材，后端先复用素材处理链路生成结构化 slice，再保存参考拆解。
- 剧本接入：剧本生成请求支持 `productionMode`、`referenceId`、`templateId`，生成分镜包含 `assetRecallQuery`。
- 智能剪辑：`POST /api/scenes/:sceneId/asset-recall` 按分镜召回可用素材/slice，并排除 `public_reference` 原始公开视频素材。
- 前端接入：素材卡支持结构化分析入口，参考视频拆解面板已迁移到灵感分区并支持提炼模板，剧本面板支持选择生产模式/参考视频/模板，Studio 支持召回候选切片并替换当前分镜素材。
- 真实媒体处理：`apps/api/src/modules/media/mediaProbe.ts` 使用 ffprobe 读取真实视频元数据，`frameSampler.ts` 使用 ffmpeg 输出真实 JPG 帧；默认文字提取走视觉模型 OCR，不依赖 ASR。
- ASR provider：新增 `apps/api/src/providers/asr/speechToTextProvider.ts`。`ASR_PROVIDER_MODE=http/real` 时才上传抽取后的音频到真实 ASR endpoint；默认不抽音频、不伪造 transcript。
- 真实多模态 provider：`apps/api/src/providers/vision/arkVisionUnderstandingProvider.ts` 已从 mock 占位升级为火山方舟/Ark Responses API wrapper。业务默认真实模式，`VISION_PROVIDER_MODE=ark` 缺 key/model 或模型失败会直接报错；只有显式 `VISION_PROVIDER_MODE=mock` 才保持 deterministic fixture。
- 真实参考拆解 provider：`apps/api/src/providers/references/arkViralBreakdownProvider.ts` 已从 mock wrapper 升级为火山方舟/Ark Responses API wrapper。业务默认真实模式，`REFERENCE_PROVIDER_MODE=ark` 缺 key/model 会直接报配置错误；只有显式 `REFERENCE_PROVIDER_MODE=mock` 才保持 deterministic fixture。
- 公开视频下载 provider：`apps/api/src/providers/references/referenceDownloadProviderFactory.ts` 默认返回真实 HTTP downloader；只有显式 `REFERENCE_DOWNLOAD_PROVIDER_MODE=mock` 才返回 fixture。抖音/TikTok 短链仍建议后续接 `yt-dlp` 或托管下载服务。
- 真实模式不再静默降级：灵感生成、脚本生成、分镜图生成、视觉理解、参考拆解、公开视频下载、Seedance 渲染在真实模式下失败会抛出错误；自动化测试中需要 fixture 的用例均显式设置 mock 环境变量。

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
corepack pnpm --filter @shopclip/web test -- App.test.tsx
corepack pnpm --filter @shopclip/api test -- src/providers/references/arkViralBreakdownProvider.test.ts
corepack pnpm --filter @shopclip/api test -- src/part015-processing-flow.test.ts src/providers/references/arkViralBreakdownProvider.test.ts
corepack pnpm --filter @shopclip/api test src/modules/media/realMediaProcessing.test.ts src/providers/vision/arkVisionUnderstandingProvider.test.ts src/providers/references/arkViralBreakdownProvider.test.ts src/providers/renderer/seedanceRenderer.test.ts src/part015-processing-flow.test.ts
corepack pnpm --filter @shopclip/api test
corepack pnpm --filter @shopclip/shared test
```

## 结果

- `@shopclip/api db:generate`：Prisma Client 生成通过。
- `@shopclip/shared`：3 个测试文件、21 个测试通过；build 通过。
- `@shopclip/api`：24 个测试文件、108 个测试通过；typecheck 通过。
- `realMediaProcessing.test.ts` 覆盖真实 MP4 fixture 的 ffprobe 元数据读取、ffmpeg JPG 抽帧、ffmpeg `.m4a` 抽音频，以及注入真实 ASR provider 后的 transcript 回填。
- `arkInspirationProvider.test.ts` 覆盖真实灵感生成 provider 在图片结果无媒体时 fail-fast，不再返回伪造的 fallback material。
- `@shopclip/api` 视觉 provider 定向验证：`arkVisionUnderstandingProvider.test.ts` 覆盖真实 Ark Responses 请求体、JSON 解析、显式 mock fixture、真实模式缺配置 fail-fast、无效模型输出 fail-fast；与 `part015-processing-flow.test.ts` 联跑通过。
- `@shopclip/api` 参考拆解 provider 定向验证：`arkViralBreakdownProvider.test.ts` 先复现 provider 不调用 fetch、固定返回 mock 的问题，再验证 `REFERENCE_PROVIDER_MODE=ark` 时会调用 Ark `/responses`，并使用模型返回的水杯/大学生/杯子控相关拆解替代固定 blender mock；同时覆盖真实模式缺少 API key 时 fail-fast，不再静默回落 mock。最新定向运行触发 API 全量测试：23 个测试文件、105 个测试通过。
- 公开视频主动拆解 TDD：新增断言后先出现 RED：`expected undefined to be truthy`，证明 URL 拆解没有生成 `sourceAssetId`；实现后 `src/part015-processing-flow.test.ts` 通过，覆盖 URL -> `public_reference` asset -> structured slices -> reference analysis/template/script consumption，并验证 Studio 召回不包含该公开视频资产。
- `arkViralBreakdownProvider.test.ts` 新增结构化上下文断言，确认真实 Ark prompt 包含 `Structured source slices` 和 slice 摘要。
- `@shopclip/web`：1 个测试文件、71 个测试通过；typecheck 与 production build 通过。
- `@shopclip/web` 定向单测：`App.test.tsx` 71 个测试通过；新增断言确认“Viral video breakdown / Analyze reference” 出现在灵感页，且不再出现在创作页。
- `@shopclip/web` E2E：`part-015-structure-and-reference.spec.ts` 1 个浏览器用例通过，覆盖“上传自有参考视频 -> 进入灵感分区拆解参考视频 -> 提炼模板 -> 回到创作分区进行剧本参考选择”，并生成截图 `projects/shopclip-ai/evidence/part-015-uploaded-reference-video.png`。
- `git diff --check`：无空白错误。
- `src/part015-processing-flow.test.ts` 覆盖了公开视频 URL 拆解、自有上传视频 `sourceAssetId` 拆解、素材处理后 slice 检索、模板提炼、剧本 `assetRecallQuery` 和分镜素材召回。
- E2E 启动方式已改为 `apps/web/e2e/run-with-servers.cjs`：显式启动 memory API 与 Vite web，等待健康检查后运行 Playwright，结束后按 PID 树清理本地 dev server，避免 Windows + pnpm 下 Playwright `webServer` 清理卡住。
- 修复验证中发现的 `sourceAssetId` 上传参考视频链路问题：前端提交和 API schema 均将空白 `sourceUrl` 归一为未提供，避免禁用 URL 输入框仍提交 `""` 导致校验失败。

## 已知边界

- 当前媒体抽帧已经是真实 ffmpeg/ffprobe 实现；视频字幕/贴纸/商品标签优先由视觉 OCR 识别。ASR 只有配置 `ASR_PROVIDER_MODE=http/real` 和 endpoint 后才会作为补充转写，否则不会抽音频也不会伪造 transcript。
- 视觉理解和参考拆解真实 provider 已接入，但需要可公网访问的素材 URL、真实方舟环境变量和线上 smoke test。公开视频 URL 已支持分析型 ingest，并会生成 `public_reference` 资产和 slice；但原始公开视频仍不会进入混剪候选。
- COS 智能检索仍是召回加速层；数据库结构化 metadata 是事实源。
- 公开视频只保存来源和结构化拆解，不进入混剪素材池。
- 公开视频分析型资产会进入数据库用于检索、模板和剧本参考；Studio 召回层按 `source=public_reference` 过滤，避免原视频片段进入成片。
- 自有参考视频入口复用现有素材上传能力；参考拆解面板位于灵感分区，选择已上传视频素材，不另建重复上传表单；拆解成功后前端重新加载项目快照，使结构化资产和 slice 可继续供创作分区/Studio 使用。
- E2E 默认使用 memory store 和显式 mock providers；真实火山/Ark/COS/ASR 路径需要在配置真实环境变量后做单独线上 smoke test。

## 2026-05-30 真实公开视频 Smoke Test

输入：用户提供的抖音 `douyinvod.com` 公开视频 MP4 URL。

新增验证命令：

```powershell
corepack pnpm --filter @shopclip/api smoke:ark-models
corepack pnpm --filter @shopclip/api smoke:reference
corepack pnpm --filter @shopclip/api test src/providers/references/arkViralBreakdownProvider.test.ts src/providers/vision/arkVisionUnderstandingProvider.test.ts src/modules/media/realMediaProcessing.test.ts
```

真实链路结论：

- `smoke:ark-models`：视觉模型使用 `AI_GENERAL_API_KEY` + `AI_VISION_MODEL_ID` 调通，参考拆解模型使用 `AI_REFERENCE_API_KEY` + `AI_REFERENCE_MODEL_ID` 调通；脚本只输出环境变量名和状态，不输出 key/model 明文。
- `smoke:reference`：真实下载抖音 CDN 视频成功，真实 ffmpeg 抽帧成功，真实 Ark 视觉理解成功，生成 `source=public_reference` 的结构化参考视频资产。
- 输出 `sourceAsset.role=reference_video`，`structured=true`，视频整体摘要识别为“卡通猫主题水杯/水瓶电商短视频”，并提取粉色/黄色款、直饮口、茶隔、便携提环等可用于剧本和创作的商品细节。
- 输出 5 个 3 秒 slice，覆盖 0-15 秒范围；每个 slice 都有细粒度 summary 和 `suitableSceneRoles`，可供后续检索、剧本参考和智能剪辑召回使用。
- 输出 reference analysis，包含 `contentFormula`、`hookScore`、`keyViralFactors`、5 个 `commerceNarrativeSegments`，最终 reference 状态为 `ready`。

本次修复点：

- 抖音 CDN 直接下载需要浏览器 UA 和 Douyin referer，HTTP downloader 已补默认 headers。
- 视觉 Provider 的 key 回退顺序修正为 `AI_VISION_API_KEY -> AI_GENERAL_API_KEY -> ARK_API_KEY -> AI_API_KEY`，避免 `.env` 中通用 key 可用但业务错误选中旧 `ARK_API_KEY`。
- 方舟首个连接存在偶发 TLS reset，视觉/参考 Provider 已加入轻量网络重试；真实 HTTP 4xx 仍 fail-fast，不吞错。
- 对 `source=public_reference` 的视频，不再让 Ark 直接拉取原始抖音 URL；后端先下载并抽帧，再把本地帧转为 `data:image/jpeg;base64` 输入视觉模型。
- 参考拆解 Provider 增加模型输出归一化，处理 `hookScore=92`、数组字段返回字符串、`recreationBlueprint` 返回数组等常见 shape drift 后再进入 shared schema 校验。

## 2026-05-30 OCR 优先优化

- 用户确认视频文字可以通过图片识别提取字幕，不需要默认使用 ASR。
- 素材处理默认步骤从 `extract_audio` 调整为 `prepare_ocr`：后端抽取真实帧，视觉模型从帧中识别字幕、贴纸、商品标签和画面文字，并写入 asset/slice 的 `ocrText`。
- `ASR_PROVIDER_MODE=http/real` 仍保留为可选增强；默认 `none` 时不抽音频、不调用 ASR、不伪造 transcript。
- `arkVisionUnderstandingProvider.test.ts` 新增 OCR 角色补全测试：当 slice OCR 包含“限时优惠 点击下单”且为开场切片时，结果会保留 `demo` 并补充 `hook`、`price`、`cta`，同时 `searchText` 包含 OCR 文案。
- `arkViralBreakdownProvider.test.ts` 新增 hookScore 归一化测试：8/10 归一为 0.8，92/100 归一为 0.92，避免真实 smoke 中 hookScore 被压成 0.08。
- 真实 `smoke:reference` 复跑通过：同一抖音公开视频在 OCR 优先链路下输出 `hookScore=0.85`、`status=ready`、`sliceCount=5`；开场 slice roles 包含 `hook`，末尾 slice roles 包含 `closure`，整体摘要识别为卡通猫主题水杯/水瓶电商短视频。

## 2026-05-30 前端交互与真实结构化闭环补充

本轮目标：修完“多颗粒度结构化”剩余工作，使前端上传图片/可下载视频后能触发真实结构化，后端能保存原始对象、派生帧与结构化 JSON，并让剧本生成、参考视频拆解和 Studio 素材召回消费结构化信息。

新增/修正点：

- 前端本地文件导入统一走 `create upload intent -> /api/assets/:assetId/upload -> /api/assets/:assetId/process`，图片/视频上传后会自动触发结构化处理，并把返回的 `structuredAsset` 与 `AssetSlice` 合并回项目状态。
- 服务端 `/api/assets/:assetId/upload` 会把上传文件写入本地 media cache，保存 `metadata.localFilePath`，同时上传原始对象到 COS；后续 ffprobe/ffmpeg 使用本地文件做真实视频探测和抽帧。
- 外部素材导入不再只写 COS 元数据：下载后上传 raw object 到 COS，写本地 cache，然后对图片/视频调用 `processAssetStructure()`，并上传 `projects/<projectId>/derived/<assetId>/metadata/structured-asset.json`。
- 图片素材也生成 synthetic slice 和结构化摘要，进入检索、剧本 prompt 和分镜召回，而不是只作为“原图参考”存在。
- 剧本 prompt 构建增加结构化素材上下文：结构化摘要、素材角色、OCR、可见度与检索语义，脚本生成能真实读到多颗粒度信息。
- 分镜素材召回增加 scene role 推断，不再所有场景硬编码为 `demo`；Hook/痛点/信任/价格/CTA 等分镜会优先召回匹配角色的 slice。
- `asset-cos-flow.test.ts` 和 `p1-flow.test.ts` 已从旧的 `structureProvider: mock-asset-processor` 断言迁移为真实结构化契约；外部视频导入测试改为生成真实 MP4 fixture，避免用伪造字符串冒充视频。
- `apps/web/e2e/part-015-structure-and-reference.spec.ts` 改为上传真实 MP4 fixture，并等待视频素材完成结构化后再进入灵感分区拆解。
- `apps/web/e2e/run-with-servers.cjs` 显式固定 e2e 为 memory store、mock COS storage、mock vision/reference/render provider，避免本机 `.env` 真实 COS 配置污染离线浏览器测试；真实 COS/Ark 能力由 API 单测和 smoke 脚本覆盖。

最新验证结果：

```powershell
corepack pnpm --filter @shopclip/api test
corepack pnpm --filter @shopclip/api typecheck
corepack pnpm --filter @shopclip/shared test
corepack pnpm --filter @shopclip/shared build
corepack pnpm --filter @shopclip/api build
corepack pnpm --filter @shopclip/web test
corepack pnpm --filter @shopclip/web typecheck
corepack pnpm --filter @shopclip/web build
corepack pnpm --filter @shopclip/web test:e2e -- part-015-structure-and-reference.spec.ts
```

通过证据：

- `@shopclip/api test`：27 个测试文件、115 个测试通过。
- `@shopclip/api typecheck`：通过。
- `@shopclip/shared test`：3 个测试文件、21 个测试通过。
- `@shopclip/shared build`：通过。
- `@shopclip/api build`：通过。
- `@shopclip/web test`：1 个测试文件、72 个测试通过。
- `@shopclip/web typecheck`：通过。
- `@shopclip/web build`：通过。
- `@shopclip/web test:e2e -- part-015-structure-and-reference.spec.ts`：1 个浏览器用例通过，覆盖真实 MP4 上传、自动结构化、灵感分区拆解、模板提炼、创作分区参考视频和模板可选择。

当前真实能力边界：

- 代码层已经支持真实 COS 原始对象、派生帧和结构化 JSON 存储；本地 e2e 为离线可复现而显式使用 mock COS storage。
- 可下载视频必须是 ffmpeg/ffprobe 可解码的真实媒体文件；伪造 `video/mp4` 字符串会失败，这是预期行为。
- 公开视频直链下载、视觉理解、参考拆解已实现真实 provider；平台短链稳定下载仍建议后续接 `yt-dlp` 或托管下载服务。
- 腾讯云 COS 智能检索仍是候选召回加速层，最终可复用对象信息以数据库中的结构化 `Asset`/`AssetSlice`/`ReferenceVideo` 为事实源。
