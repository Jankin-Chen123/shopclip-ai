# Part 017 - 项目工作台前端重组

## 状态

- 状态：Done
- 日期：2026-06-03
- 负责角色：implementation-engineer

## 目标

将首界面左侧“创作”入口重组为“项目”入口。项目页首屏展示项目卡片列表；点击项目后进入项目详情，左侧展示项目信息与统计，右侧以“项目梗概 / 项目素材 / 剧本库 / 视频库”组织原有创作链路能力。

## 范围

- 更新侧栏入口文案与项目页默认结构。
- 新增项目卡片列表视图。
- 新增项目详情视图和四个项目内 tab。
- 复用原步骤 2 素材准备模块与脚本生成模块。
- 从视频库进入 Studio，并提供“保存视频并返回”入口回到视频库。
- 保持现有后端项目加载、素材导入、脚本生成、分镜编辑、渲染和智能剪辑 API 不变。

## 变更摘要

- 新增 `apps/web/src/features/projects/ProjectWorkspace.tsx`。
- 修改 `apps/web/src/app/App.tsx`，接入项目列表、项目详情、项目内 tab 和工作室返回动作。
- 修改 `apps/web/src/components/layout/AppShell.tsx`，将侧栏创作入口调整为项目入口，项目页不再显示旧流程步骤条。
- 修改 `apps/web/src/styles.css`，新增项目列表、项目详情、项目库和响应式样式。
- 更新 `apps/web/src/app/App.test.tsx`，覆盖项目页和项目详情渲染合同。

## 验证证据

- `corepack pnpm --filter @shopclip/web test src/app/App.test.tsx`：95 tests passed。
- `corepack pnpm --filter @shopclip/web typecheck`：通过。
- `corepack pnpm --filter @shopclip/web build`：通过，生成生产构建。
- GitHub 同步：`git rev-list --left-right --count origin/main...HEAD` 返回 `0 0`。
- 云端部署：`ubuntu@152.136.252.134:/www/wwwroot/shopclip-ai ./deploy.sh` 完成，Web 资源更新为 `index-BAW6iRdj.css` / `index-B_yz-lAN.js`，API health 返回 `{"service":"api","status":"ok","version":"0.1.0"}`。
- 线上浏览器验收：`https://shopclip.site` 项目列表不再显示旧 `Product setup`；完成“Project portfolio -> Create project -> Project overview -> Project materials -> Script library -> Video library -> Generate video -> Save video and return”点击路径。
- 线上截图：`output/playwright/shopclip-site-project-workspace-after-deploy.png`。

## 风险与后续

- 当前项目卡片列表沿用 `GET /api/projects` 的 `ProjectSummary`，该 summary 只有素材数和场景数，没有真实脚本数、视频数和封面 URL；前端先用已有字段推导卡片信息。后续如果要完全精确展示图 1 的脚本数、视频数和商品封面，应扩展 `ProjectSummary` 后端合同。
- “添加剧本”和“生成视频”复用原有页面级模块，未拆成完全嵌入式弹层；后续可以按用户体验继续收敛为项目详情右侧内联编辑。
