# ShopClip AI 🎬

ShopClip AI 是一个面向电商商家的 AIGC 带货短视频生成 Demo 工作台。它把商品 brief、素材元数据和创意风格转成可编辑的脚本、分镜、渲染 trace、预览/导出产物和 mock 效果看板。

本仓库也是一个带 Agent 项目管理规则的全栈演示工作区：根目录 `AGENTS.md` 和 `.agents/` 定义了项目经理、产品文档、架构规划、实现、质量安全、交付运维等协作规则，方便后续 Agent 接手真实软件项目开发。

## 当前状态 ✅

- P0 主链路已完成：创建项目、上传素材元数据、生成脚本/分镜、编辑分镜、渲染 trace、预览和导出。
- P1 能力已完成：素材标签/检索、分镜编辑与局部重生成、Editing Agent 建议、TTS/字幕/BGM 设置、失败渲染重试、mock 数据看板。
- 多颗粒度素材结构化已接入真实多模态 provider 边界；保持 `VISION_PROVIDER_MODE=mock` 时走确定性结果，填写视觉模型环境变量后可切换到火山方舟/Ark 多模态理解。
- 视频渲染默认仍走稳定 mock；设置 `VIDEO_RENDER_PROVIDER_MODE=seedance` 后，`POST /api/projects/:projectId/render` 会提交真实 Seedance 视频生成任务，并在 `GET /api/render-tasks/:renderTaskId` 轮询产出视频 URL。
- 已提供 Render 部署配置：`render.yaml`。
- 最新交付证据位于 `projects/shopclip-ai/evidence/`。
- 最终交接记录：`projects/shopclip-ai/evidence/final-handoff.md`。

## 技术栈 🧰

| 层级       | 技术                                         |
| ---------- | -------------------------------------------- |
| 前端       | React 19、Vite、TypeScript、lucide-react     |
| 后端       | Node.js、Express、TypeScript                 |
| 契约       | `packages/shared` 中的 Zod schema 和共享类型 |
| 测试       | Vitest、Playwright                           |
| 包管理     | pnpm via Corepack                            |
| 当前持久化 | 确定性 in-memory demo store                  |
| 生产规划   | PostgreSQL + Prisma                          |
| 部署       | Render Blueprint                             |

## 目录结构 📁

```text
apps/
  api/          Express API、生命周期接口、mock providers
  web/          React 工作台 UI 和 Playwright E2E
packages/
  shared/       Zod schemas、共享 TypeScript 类型、健康检查 payload
projects/
  shopclip-ai/  需求、设计、开发计划、Part 文档和验证证据
.agents/        Agent 团队工作流、skills、plugins、本地私有 memory
plugins/        项目级插件副本
render.yaml     Render Blueprint：API 服务 + Web 静态站点
report.md       最新任务汇报
```

## 本地启动 🚀

安装依赖：

```bash
corepack enable
corepack pnpm install
```

创建本地环境变量文件：

```bash
cp .env.example .env
```

PowerShell：

```powershell
Copy-Item .env.example .env
```

启动前后端：

```bash
corepack pnpm dev
```

默认地址：

- Web：`http://localhost:5173/#project`
- API health：`http://localhost:4000/health`

## 环境变量 🔐

| 变量                   | 使用方 | 是否必需             | 说明                                                       |
| ---------------------- | ------ | -------------------- | ---------------------------------------------------------- |
| `PORT`                 | API    | 本地可选             | Render 会自动注入。                                        |
| `CORS_ORIGIN`          | API    | 生产必需             | 逗号分隔的 Web 允许来源。                                  |
| `JSON_BODY_LIMIT`      | API    | 可选                 | 默认 `1mb`。                                               |
| `VITE_API_URL`         | Web    | 生产必需             | 公共 API base URL，例如 `https://<api>.onrender.com/api`。 |
| `DATABASE_URL`         | API    | 未来使用             | 当前 Demo 使用内存存储，后续接 PostgreSQL/Prisma。         |
| `AI_PROVIDER_MODE`     | API    | 可选                 | Demo 使用 `mock` 保持确定性。                              |
| `ARK_API_KEY`          | API    | 真实 provider 才需要 | 火山方舟共享服务端密钥；三类 AI 模型默认共用它。             |
| `AI_GENERAL_API_KEY`   | API    | 可选                 | 通用/文案模型专用密钥；为空时回退使用 `ARK_API_KEY`。       |
| `AI_IMAGE_API_KEY`     | API    | 图片生成可选         | 图片生成专用密钥；为空时回退使用 `ARK_API_KEY`。            |
| `VIDEO_RENDER_PROVIDER_MODE` | API | 真实 Seedance 渲染才需要 | 默认 `mock`；设置为 `seedance`/`ark`/`doubao`/`real` 才会让渲染任务调用真实视频生成。 |
| `AI_VIDEO_API_KEY`     | API    | 视频生成可选         | 视频生成专用密钥；为空时回退使用 `ARK_API_KEY`。            |
| `AI_GENERAL_MODEL_ID`  | API    | 真实 provider 才需要 | 通用/文案模型的方舟 endpoint ID 或可调用 model ID。          |
| `VISION_PROVIDER_MODE` | API    | 真实素材理解才需要    | 默认 `mock`；设置为 `ark`/`doubao`/`real` 后，素材结构化会调用真实多模态模型。 |
| `AI_VISION_MODEL_ID`   | API    | 真实素材理解才需要    | 图片/视频理解模型的方舟 endpoint ID 或可调用 model ID。       |
| `AI_VISION_API_KEY`    | API    | 可选                 | 视觉理解专用密钥；为空时回退使用 `ARK_API_KEY`。              |
| `VISION_PUBLIC_BASE_URL` | API  | 视部署而定           | 当素材 URL 是 `/api/assets/...` 这类相对路径时，用该公网 API base URL 拼成模型可访问地址。 |
| `VISION_VIDEO_INPUT_MODE` | API | 可选                 | 默认 `video_url`；可设 `frame_urls` 只传公网关键帧，或 `text_only` 只传元数据/ASR 文本。 |
| `AI_IMAGE_MODEL_ID`    | API    | 图片生成才需要       | 图片生成模型的方舟 endpoint ID 或可调用 model ID。           |
| `ARK_IMAGE_SIZE`       | API    | 可选                 | 图片生成尺寸，默认 `1024x1024`。                           |
| `AI_VIDEO_MODEL_ID`    | API    | 视频生成才需要       | 视频生成模型的方舟 endpoint ID 或可调用 model ID；生产建议填写方舟控制台中的 `ep-...` endpoint ID，后端会原样提交该值。 |
| `AI_VIDEO_IMAGE_INPUT_MODE` | API | 可选            | Seedance 图片输入模式，默认 `first_frame`，会把第一张公网商品图作为首帧图一并提交；只能文生视频时设为 `none`，支持参考图的模型可设为 `reference_image`。 |
| `AI_VIDEO_DURATION`    | API    | 可选                 | Seedance 目标视频时长覆盖值；为空时按每个分镜时长自动计算。 |
| `AI_VIDEO_ALLOWED_DURATIONS` | API | 可选           | Seedance 可接受的离散时长列表，默认 `5,10`；每个分镜时长会向上规整到最近可用值。 |
| `ARK_API_BASE_URL`     | API    | 可选                 | 火山方舟 OpenAI-compatible API base URL。                   |
| `ARK_VIDEO_GENERATION_PATH` | API | 可选              | 火山方舟视频生成任务路径，默认 `/contents/generations/tasks`。 |
| `FFMPEG_PATH`          | API    | 可选                 | 服务器 ffmpeg 可执行文件路径；配置后用于把分镜视频片段拼接为最终导出 MP4。 |
| `RENDER_EXPORT_DIR`    | API    | 可选                 | ffmpeg 拼接产物临时目录，默认使用系统临时目录。最终导出会上传到 COS 后返回 COS URL。 |
| `COS_EXPORT_READ_MODE` | API    | 可选                 | 导出成片的 COS 读取方式；默认 `public` 返回 `COS_PUBLIC_BASE_URL` 下的对象地址，私有桶可设为 `signed` 返回临时签名 URL。 |
| `TTS_PROVIDER_MODE`    | API    | 可选                 | Demo 使用 `mock` 保持确定性。                              |
| `TTS_API_KEY`          | API    | 真实 provider 才需要 | 服务端密钥，不能暴露到前端。                               |
| `EXTERNAL_ASSET_PROVIDERS` | API | 可选              | 服务端外部素材源列表；可用 `pexels,pixabay,freesound`。 |
| `PEXELS_API_KEY`       | API    | Pexels 才需要        | 服务端 Pexels API key，不暴露给前端。                       |
| `PIXABAY_API_KEY`      | API    | Pixabay 才需要       | 服务端 Pixabay API key，不暴露给前端。                      |
| `FREESOUND_API_KEY`    | API    | Freesound 才需要     | 服务端 Freesound API key，用于音频素材搜索和高质量预览导入。 |

## Demo 流程 ✨

1. 打开 `Project command center`，创建一个商品视频项目。
2. 进入 `Creative prep`，录入商品 brief 并上传素材元数据。
3. 生成脚本和分镜，进入 `Generation studio`。
4. 编辑分镜字段、保存修改、搜索素材，并应用 Editing Agent 建议。
5. 在 `Delivery room` 设置 TTS、字幕、BGM，启动渲染。
6. 可模拟失败渲染并重试，查看 trace 和恢复路径。
7. 导出 preview artifact。
8. 打开 `Analytics dashboard`，查看 mock 效果指标。

## API 概览 🔌

| Method  | Endpoint                                   | 用途                    |
| ------- | ------------------------------------------ | ----------------------- |
| `GET`   | `/health`                                  | 健康检查                |
| `POST`  | `/api/projects`                            | 创建项目                |
| `GET`   | `/api/projects/:projectId`                 | 加载项目快照            |
| `POST`  | `/api/projects/:projectId/assets`          | 添加素材元数据          |
| `POST`  | `/api/projects/:projectId/assets/import-external` | 导入外部素材结果为项目素材 |
| `POST`  | `/api/projects/:projectId/generate-script` | 生成脚本和分镜          |
| `GET`   | `/api/assets/search`                       | 搜索项目素材和可选外部素材 |
| `PATCH` | `/api/scenes/:sceneId`                     | 保存分镜编辑            |
| `POST`  | `/api/scenes/:sceneId/regenerate`          | 重生成单个分镜          |
| `GET`   | `/api/scenes/:sceneId/suggestions`         | 获取 Editing Agent 建议 |
| `POST`  | `/api/projects/:projectId/render`          | 启动 mock 渲染或真实 Seedance 渲染 |
| `GET`   | `/api/render-tasks/:renderTaskId`          | 加载渲染任务、轮询 Seedance 任务和 trace |
| `POST`  | `/api/render-tasks/:renderTaskId/retry`    | 重试失败渲染            |
| `GET`   | `/api/projects/:projectId/export`          | 导出完成的预览产物      |
| `GET`   | `/api/projects/:projectId/dashboard`       | 加载 mock 数据看板      |

## 架构图 🧭

```mermaid
flowchart TD
  Web["React + Vite Web App"] --> API["Express API"]
  API --> Contracts["Shared Zod Schemas / Types"]
  API --> Store["In-memory Demo Store"]
  API --> Script["Mock Script Provider"]
  API --> Agent["Mock Editing Agent"]
  API --> TTS["Mock TTS Provider"]
  API --> Renderer["Mock Renderer / Seedance Renderer"]
  API --> Dashboard["Mock Analytics Builder"]
  Renderer --> Trace["Trace Events"]
  Trace --> Web
  Dashboard --> Web
```

## Fallback 行为 🧯

- 素材结构化默认使用确定性 mock 输出；设置 `VISION_PROVIDER_MODE=ark`、`ARK_API_KEY` 或 `AI_VISION_API_KEY`、`AI_VISION_MODEL_ID` 后，`POST /api/assets/:assetId/process` 会调用真实多模态模型生成 `structuredAsset` 和 slice metadata。模型返回不合法或请求失败时，系统回落到 mock，并在 `modelTrace` / `complianceFlags` 中标记 `needs_review`。
- 脚本和分镜生成使用确定性 mock 输出，适合现场演示和自动化测试。
- Editing Agent 建议是可解释的确定性建议。
- TTS、字幕、BGM 和看板指标均为 metadata-backed mock 输出。
- 渲染产物默认使用 mock 输出；只有显式设置 `VIDEO_RENDER_PROVIDER_MODE=seedance` 且配置服务端视频密钥/模型后，才调用 Seedance。TTS 声线不会控制 Seedance 画面效果。
- Seedance 的画幅、清晰度、是否生成音频、水印和随机种子由前端“视频生成设置”提交到 render request，不需要写入 `.env`。默认会按分镜逐段提交 Seedance 任务，并从每个分镜的绑定素材中选公网图片，以 `role=first_frame` 一并提交；只能文生视频的 endpoint 可设置 `AI_VIDEO_IMAGE_INPUT_MODE=none`，支持多参考图的 endpoint 可设置 `AI_VIDEO_IMAGE_INPUT_MODE=reference_image`。每段视频完成后会在步骤 04 展示可点击预览；配置 `FFMPEG_PATH` 后，后端会尝试用 ffmpeg 拼接所有分镜片段为最终导出 MP4，并上传到 COS 的 `projects/<projectId>/exports/<exportId>/export.mp4` 后返回 COS 访问地址。Seedance 的 `duration` 是目标视频秒数；默认按每个分镜时长分别计算，并向上规整到 `AI_VIDEO_ALLOWED_DURATIONS` 中最近的可用值，必要时可用 `AI_VIDEO_DURATION` 强制覆盖。
- UI 支持失败渲染模拟和重试，不会丢失项目数据。
- 真实 provider 密钥只能放在服务端环境变量中，浏览器不会直接调用模型或 TTS provider。

## 验证命令 🧪

```bash
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
corepack pnpm --filter @shopclip/web test:e2e
```

最近一次完整验证记录在 `report.md` 和 `projects/shopclip-ai/evidence/` 中。

## Render 部署 🌐

仓库已包含 `render.yaml`，定义了两个服务：

- `shopclip-ai-api`：Node Web Service，运行 `apps/api`。
- `shopclip-ai-web`：Static Site，构建 `apps/web`。

部署步骤：

1. 将仓库推送到 GitHub、GitLab 或 Bitbucket。
2. 在 Render 中从该仓库创建 Blueprint，并选择 `render.yaml`。
3. 把 `shopclip-ai-api` 的 `CORS_ORIGIN` 设置为最终 Web 静态站点 URL。
4. 把 `shopclip-ai-web` 的 `VITE_API_URL` 设置为最终 API URL，并追加 `/api`。
5. 没有真实 provider 前，保持 `AI_PROVIDER_MODE=mock` 和 `TTS_PROVIDER_MODE=mock`。
6. 部署后先检查 `/health`，再在浏览器里跑完整 Demo 流程。

当前仓库提供可复现的部署路径和本地浏览器证据。公网 Render URL 仍需要在账号侧创建 Blueprint 并填写最终环境变量。

## Agent 工作流 🤖

本仓库内置项目级 Agent 团队规则，核心入口是 `AGENTS.md`。

主要角色：

- `product-docs-lead`：需求、范围、验收标准、README、发布说明和交接材料。
- `solution-architect`：技术方案、模块边界、接口、数据流、任务拆解和集成节奏。
- `implementation-engineer`：前端、后端、数据模型、业务逻辑、迁移和集成实现。
- `quality-security-engineer`：测试策略、回归、验收、缺陷复现、代码审查和安全风险。
- `delivery-ops-engineer`：CI/CD、部署、环境、监控、运行手册、发布和回滚。

项目级能力：

- `.agents/skills/`：Figma、UI/UX、Playwright、截图、安全、部署、OpenAI 文档、PDF、Notebook 等 skills。
- `plugins/`：`superpowers` 和 `github` 项目级插件副本。
- `.agents/memory/`：本地私有用户记忆，必须保持 git 忽略，不提交。
- `projects/<project-slug>/`：每个真实项目的需求、设计、计划、Part 和证据目录。

重要规则：

- 开发前先读 `AGENTS.md`、需求、设计、开发计划和当前 Part 文档。
- 需求、设计、开发计划未确认前，不直接进入正式代码开发，除非用户明确要求临时原型。
- 每个 Part 完成后记录状态、变更摘要、验证证据、风险和后续事项。
- 提交前检查 `.agents/memory/` 没有被 git 跟踪。

## 安全说明 🛡️

- 不要提交真实 `.env`、API key、provider token 或数据库密码。
- `.env.example` 只能保存占位变量。
- Express API 已禁用 `X-Powered-By`，设置基础浏览器安全响应头，使用显式 CORS origin，并限制 JSON body size。
- React 前端只接收公开的 `VITE_API_URL`。
- `.agents/memory/` 是用户本地私有记忆目录，必须保持忽略。

## 项目文档 📚

- 需求文档：`projects/shopclip-ai/00-requirements.md`
- 设计规范：`projects/shopclip-ai/01-design-spec.md`
- 开发计划：`projects/shopclip-ai/02-development-plan.md`
- 交付证据：`projects/shopclip-ai/evidence/`
- 最终交接：`projects/shopclip-ai/evidence/final-handoff.md`
- 工作汇报：`report.md`
