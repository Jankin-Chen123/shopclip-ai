# Decision: Render Blueprint With Local Evidence Fallback

Date: 2026-05-22

## Context

Part 010 requires a deployed demo or documented access path, final documentation, security review,
and evidence. The repository has a Git remote, but this session does not have authenticated Render
MCP/API access or user-confirmed Render account environment values.

## Decision

Provide a reproducible Render Blueprint in `render.yaml`, document the exact account-side setup
steps in `README.md`, and collect local production build plus Playwright browser evidence as the
fallback verification path.

## Consequences

- A reviewer can deploy the same repo through Render Blueprint without reverse-engineering service
  settings.
- `CORS_ORIGIN` and `VITE_API_URL` remain explicit environment variables because Render service URLs
  are account-generated.
- The final handoff must clearly state that a live public URL still requires account-side Blueprint
  creation and environment variable entry.
