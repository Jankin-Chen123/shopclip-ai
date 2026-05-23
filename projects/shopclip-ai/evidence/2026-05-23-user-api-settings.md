# User API Settings Evidence

Date: 2026-05-23

## Scope Verified

- Settings entry replaces the previous left sidebar footer text.
- Settings page exposes language switching.
- General, image, and video model configuration sections are visible.
- Each section includes API provider, API service address, model, and API key fields.
- Sidebar language switching was removed; language switching now lives in Settings only.
- Model fields provide preset suggestions and still allow manual model ID entry.
- Inspiration generation sends saved user API config to the backend.
- Backend provider uses user API key/model/base URL when provided.

## Automated Verification

```text
corepack pnpm typecheck
Result: passed

corepack pnpm test
Result: passed
- packages/shared: 7 tests passed
- apps/web: 10 tests passed
- apps/web after latest preset/manual-entry update: 11 tests passed
- apps/api: 18 tests passed

corepack pnpm lint
Result: passed

corepack pnpm build
Result: passed
```

## Browser Evidence

Settings page screenshot:

```text
output/playwright/api-settings.png
output/playwright/api-settings-latest-models.png
```

Command:

```text
D:\DemoV2\apps\web\node_modules\.bin\playwright.CMD screenshot --viewport-size=1440,900 http://localhost:5173/#settings D:\DemoV2\output\playwright\api-settings.png
D:\DemoV2\apps\web\node_modules\.bin\playwright.CMD screenshot --viewport-size=1440,900 http://localhost:5173/#settings D:\DemoV2\output\playwright\api-settings-latest-models.png
```

## Security Notes

- No real API key was added to source control.
- User-entered API keys are stored only in browser localStorage for this demo and sent only with generation requests.
- The backend does not log the API key in the provider adapter.
