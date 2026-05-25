# Asset COS Upload Intent Verification

Date: 2026-05-25

## Scope

Implemented the COS-backed material library import contract:

- Asset metadata now carries source, storage provider, object key, embedding text, and structured metadata fields.
- Backend exposes `POST /api/projects/:projectId/assets/upload-intent`.
- Backend exposes `POST /api/assets/:assetId/confirm-upload` to move an uploaded asset into `ready` status after the browser/COS upload succeeds.
- Backend exposes `GET /api/asset-processing-jobs/:jobId` for upload/metadata processing status checks.
- Prisma now persists COS-backed asset metadata, asset slices, and asset processing jobs in PostgreSQL when `DATABASE_URL` is configured and `PROJECT_STORE_MODE` is not `memory`.
- Storage provider runs in `mock` mode by default and can switch to Tencent COS presigned PUT mode through environment variables.
- Frontend file import now requests an upload intent, performs direct file upload when the provider is `tencent-cos`, and confirms the upload so the asset becomes searchable/usable.

## Verification

- `corepack pnpm --filter @shopclip/shared build`
- `corepack pnpm --filter @shopclip/api build`
- `corepack pnpm --filter @shopclip/web build`
- `corepack pnpm --filter @shopclip/api test`
- `corepack pnpm --filter @shopclip/web test`
- `corepack pnpm --filter @shopclip/api db:generate`

All commands passed.

## Server Configuration Needed Later

Set these on the API server before switching to real object storage:

```env
COS_PROVIDER_MODE=tencent
COS_SECRET_ID=<Tencent Cloud SecretId>
COS_SECRET_KEY=<Tencent Cloud SecretKey>
COS_BUCKET=<bucket-name-appid>
COS_REGION=<bucket-region>
COS_PUBLIC_BASE_URL=https://<bucket-name-appid>.cos.<region>.myqcloud.com
COS_UPLOAD_PREFIX=projects
PROJECT_STORE_MODE=prisma
```

Keep `COS_PROVIDER_MODE=mock` for local development without COS credentials.

## Server Deployment Step

After pulling this change on the server, run the Prisma migration before restarting PM2:

```bash
cd /www/wwwroot/shopclip-ai
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @shopclip/shared build
corepack pnpm --filter @shopclip/api db:generate
corepack pnpm --filter @shopclip/api exec prisma migrate deploy --schema prisma/schema.prisma
corepack pnpm --filter @shopclip/api build
VITE_API_URL=http://152.136.252.134/api corepack pnpm --filter @shopclip/web build
pm2 restart shopclip-api
```
