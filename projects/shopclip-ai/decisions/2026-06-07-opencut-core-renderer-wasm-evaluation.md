# OpenCut Core / Renderer / WASM Evaluation

## Context

The SmartEdit workspace is being aligned with OpenCut as a gap-fill effort, not a full migration. The current ShopClip editor already has working timeline, preview, inspector, render-task, and ffmpeg-backed smart-edit behavior. OpenCut Classic uses a larger Next.js/Bun editor architecture with `EditorCore`, manager classes, CanvasRenderer, and WASM rendering.

Reference source: `C:\tmp\opencut-classic`.

## Evaluation

### EditorCore

OpenCut `EditorCore` centralizes timeline, command, playback, scenes, project, media, renderer, save, audio, selection, clipboard, and diagnostics managers.

Decision: do not introduce `EditorCore` now.

Reason:
- The current app is Vite + React and already stores smart-edit state through `SmartEditPlan`, render tasks, and project APIs.
- Replacing that model would force a broad rewrite of timeline, preview, inspector, persistence, tests, and backend contracts.
- Current command history, clipboard, selection, track state, and timeline editing are already usable and now closer to OpenCut visually.

Future trigger:
- Revisit only if the editor is split out as its own OpenCut-compatible package, or if current SmartEdit state becomes too difficult to maintain after modular extraction.

### CanvasRenderer

OpenCut preview renders through a canvas compositor and preview overlay system.

Decision: do not introduce CanvasRenderer now.

Reason:
- Current preview is tied to generated smart-edit MP4 outputs and source media previews.
- CanvasRenderer would need a scene graph, media decoding strategy, renderer lifecycle, and likely significant dependency work.
- The current pass already adds transform handles and preview overlay affordance without changing the render path.

Future trigger:
- Revisit when real-time composited preview becomes required before ffmpeg export, especially for multiple independent overlay elements.

### WASM / Export Pipeline

OpenCut has a WASM-adjacent rendering/export stack. ShopClip currently uses backend ffmpeg composition.

Decision: keep backend ffmpeg export for now.

Reason:
- ShopClip must support persistent backend render tasks, COS/local storage publishing, trace events, and long-task progress.
- Browser WASM export would duplicate backend composition and complicate progress/task persistence.
- ffmpeg already supports the current product requirements: trimmed clips, subtitles, audio, BGM, and final MP4 export.

Future trigger:
- Revisit only for offline/browser-local export, lower-latency draft previews, or if backend render cost/latency becomes the dominant bottleneck.

## Current Migration Boundary

Migrate and adapt:
- Editor chrome
- Assets tabs
- Preview toolbar and transform overlay
- Timeline toolbar, bookmarks, drop indicators, and context menu
- Properties registry-style grouping
- Resizable panel behavior

Do not migrate yet:
- OpenCut `EditorCore`
- CanvasRenderer
- WASM/export stack
- Next.js app router/editor provider architecture

## Result

Continue the gap-fill strategy. The current SmartEdit editor should be modularized gradually around existing behavior before any core renderer replacement is considered.
