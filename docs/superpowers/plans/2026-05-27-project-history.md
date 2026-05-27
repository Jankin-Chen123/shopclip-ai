# Project History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a historical project list so users can browse prior creation projects and restore their settings, assets, scripts, and storyboard.

**Architecture:** Add a lightweight project summary contract in `packages/shared`, expose `ProjectStore.listProjects()` through both memory and Prisma stores, and add `GET /api/projects` before the existing `/:projectId` route. The creation project page will render a history panel from summaries and continue using the existing full snapshot load path when a user selects a project.

**Tech Stack:** TypeScript, Zod, Express, Prisma, React, Vitest.

---

### Task 1: Backend Contract And Endpoint

**Files:**
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/schemas.test.ts`
- Modify: `apps/api/src/modules/projects/projectStore.ts`
- Modify: `apps/api/src/modules/projects/memoryStore.ts`
- Modify: `apps/api/src/modules/projects/prismaProjectStore.ts`
- Modify: `apps/api/src/modules/projects/router.ts`
- Test: `apps/api/src/p0-flow.test.ts`

- [x] Write failing shared/API tests for project summaries and `GET /api/projects`.
- [x] Run focused tests and confirm they fail because the contract/endpoint does not exist.
- [x] Implement `ProjectSummarySchema`, `ProjectSummary` type, `ProjectStore.listProjects()`, and the route.
- [x] Run focused tests and confirm they pass.

### Task 2: Frontend History Panel

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/features/projects/ProjectSetup.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/app/i18n.ts`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/app/App.test.tsx`

- [x] Write failing component tests for rendering historical projects and selecting one.
- [x] Run focused web tests and confirm they fail before implementation.
- [x] Add `listProjects()`, fetch summaries on the project page, and render the history panel.
- [x] Selecting a history item calls the existing full project load path and synchronizes the workspace state.
- [x] Run focused web tests and confirm they pass.

### Task 3: Documentation And Verification

**Files:**
- Create: `projects/shopclip-ai/parts/part-014-project-history.md`

- [x] Record scope, changed files, verification commands, and residual risks in the Part document.
- [x] Run relevant package tests and typechecks.
- [x] Check `git status` and ensure `.agents/memory` is not tracked.
