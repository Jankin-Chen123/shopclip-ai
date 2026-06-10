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
## 2026-06-08 Background Task Popover Click Repair Batch

- Scope:
  - Fixes the draggable background task bar not opening reliably, and task list items being hard to click after the bar was made draggable.
- Fix:
  - Moved pointer drag handling from the entire task bar container to the task bar trigger button only.
  - This prevents the opened task popover and task buttons from being treated as drag targets.
  - Increased the drag detection threshold from 3px to 8px so normal clicks are less likely to be suppressed as drags.
- Verification:
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - Note: the production build still emits the existing Vite chunk-size warning for `index-*.js`.

## 2026-06-08 Background Task Target Restore Batch

- Scope:
  - Fixes background task item clicks returning to the deprecated studio interface instead of the page where the task was started.
- Fix:
  - Extended background task targets to remember whether the task started in project studio mode.
  - Persisted the project studio flow on the task target when applicable.
  - Restored `isProjectStudioMode` and `projectStudioFlow` before navigating to the task target page.
- Verification:
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - Note: the production build still emits the existing Vite chunk-size warning for `index-*.js`.

## 2026-06-10 Default Chinese Language Batch

- Scope:
  - Changes the workspace default interface language from English to Chinese when no saved browser preference exists.
  - Keeps explicit `initialLanguage` and saved `shopclip-language` values taking priority.
- Fix:
  - Updated `useWorkspaceNavigationState` to fall back to `zh` in browser and SSR/default render paths.
  - Added an App regression test for the default Chinese workspace interface.
- Verification:
  - `corepack pnpm --filter @shopclip/web test src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/web typecheck`

## 2026-06-10 Project Section Spacing Batch

- Scope:
  - Aligns the project section large card outer gap with the asset library and inspiration sections.
- Fix:
  - Set `.creation-shell-project` padding to `0` so `.workspace-main` owns the shared 24px outer page spacing.
  - Added a regression assertion that `.workspace-main` keeps `padding: 24px` while `.creation-shell-project` does not add a second inner page gap.
- Verification:
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx -t "keeps the project section outer gap aligned with other workspace sections"` passed.
  - `corepack pnpm --filter @shopclip/web typecheck` passed.
  - `corepack pnpm --filter @shopclip/web lint` passed.
  - `corepack pnpm --filter @shopclip/web test src/app/App.test.tsx` still fails in unrelated reference library history page assertions from the existing in-progress `ReferenceLibraryPanel.tsx` changes.

## 2026-06-10 Background Task Free Drag Batch

- Scope:
  - Makes the background task floating trigger the positioning anchor instead of reserving room for the task popover.
  - Lets the trigger reach the full viewport edge while the popover adapts around it.
- Fix:
  - Clamps drag movement by the trigger button's own dimensions.
  - Computes popover offset independently so it stays inside the viewport, shifts horizontally near edges, and flips above the trigger near the bottom.
  - Keeps the popover visually constrained while allowing the trigger itself to sit at `x=0` / `y=0`.
- Verification:
  - `corepack pnpm --filter @shopclip/web exec vitest run src/components/layout/AppShell.test.ts` passed with 3 tests.
  - `corepack pnpm --filter @shopclip/web typecheck` passed.
  - `corepack pnpm --filter @shopclip/web build` passed with the existing Vite chunk-size warning.
  - Playwright local browser check on `http://localhost:5175` dragged the trigger to left/top and right/bottom viewport edges and confirmed the popover stayed visible.

## 2026-06-10 Project Card Intro And Delete Cleanup

- Scope:
  - Removes the project portfolio introduction copy under the section title.
  - Removes the delete button from project list cards.
- Fix:
  - Stopped rendering the portfolio subtitle in `ProjectWorkspace`.
  - Removed the per-card project delete button and its dedicated card-delete CSS.
  - Kept the project detail delete action unchanged.
- Verification:
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx` passed with 167 tests.
  - `corepack pnpm --filter @shopclip/web typecheck` passed.
  - `corepack pnpm --filter @shopclip/web build` passed with the existing Vite chunk-size warning.
