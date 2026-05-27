# Step 02 Document Upload Fix

Date: 2026-05-27

## Symptom

- Creation section Step 02 failed when uploading a Word document in the Brand materials bucket.
- Browser Network showed `POST /api/projects/:projectId/assets/upload-intent` returning `400 Bad Request`.

## Root Cause

- Step 02 Brand materials UI advertised PDF, DOCX, PPTX, and PNG support.
- The API upload-intent validation only allowed reference assets with audio, `text/plain`, and `text/markdown` MIME types.
- A `.docx` file is sent as `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, so `CreateAssetUploadIntentRequestSchema` rejected it before storage intent creation.

## Fix

- Added common document MIME types to the API `reference` asset whitelist:
  - PDF
  - DOC / DOCX
  - PPT / PPTX
- Updated web file inference so document extensions are treated as `reference` / script assets.
- Updated asset library script classification and accept filters to include those document formats.

## Verification

- `corepack pnpm --filter @shopclip/api test -- asset-cos-flow`: passed, including a regression test for project-level `.docx` upload intent creation.
- `corepack pnpm --filter @shopclip/web test -- App.test.tsx`: passed, including document MIME classification checks.
