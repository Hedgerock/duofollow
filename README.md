# DuoFollow

An unofficial React + TypeScript demo for finding Duolingo accounts that do not follow you back.

**Current status:** demo-only. No Duolingo API requests, credentials, or real unfollow actions are implemented.

## Local development

```bash
npm install
npm run dev
npm test
npm run build
```

## GitHub Pages

Create a repository named `duofollow`, push this project to its `main` branch, then open **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The configured Vite base is `/duofollow/`. Change `base` in `vite.config.ts` if your repository has a different name.

## Architecture

- `src/domain/users.ts`: data model, client contract, and mutual-following calculation.
- `src/data/demo.ts`: mock client; no network requests.
- `src/App.tsx`: interactive UI, filtering, selection, and dry-run confirmation.

Before implementing live integration, independently verify current API endpoints, browser CORS behavior, Duolingo terms, and a safe authorization method. Do not ask users to paste account JWTs into a public website.
