# Production Deployment

Fly The Farm can be deployed to Vercel as a Create React App single-page application. The frontend is ready for preview deployment, but the app should not be treated as a production SaaS until browser-local persistence is replaced with the planned Supabase backend.

## Recommended Architecture

| Layer | Recommendation | Notes |
|---|---|---|
| Frontend hosting | Vercel | Build command: `npm run build`; output directory: `build`. |
| SPA routing | Vercel rewrite | `vercel.json` rewrites deep links like `/financials` to `index.html`. |
| Serverless API | Vercel Functions | `api/identify-weed.js` replaces the local-only CRA proxy in production. |
| Auth/database/storage | Supabase | Existing plan: `docs/plans/2026-03-23-backend-migration.md`. |

## Current Production Status

Ready for preview:

- Dashboard, Mission Planner, and Job Profit Review UI can be served from Vercel.
- Deep links are covered by `vercel.json`; API routes are excluded from the SPA fallback.
- `/api/identify-weed` now has a Vercel Function implementation.

Not production-safe yet:

- User auth is stored in `localStorage`.
- Clients, fields, jobs, quotes, missions, financial actuals, and compliance records are mostly stored in `localStorage`.
- Browser-local data is per-device and not secure enough for real multi-user operation.
- Supabase Auth, PostgreSQL RLS policies, and Storage still need to be implemented before real customer data goes in.

## Vercel Project Settings

Framework preset:

```text
Create React App
```

Build settings:

```text
Install command: npm install
Build command: CI=false npm run build
Output directory: build
```

`CI=false` keeps the existing Create React App lint warnings from failing Vercel builds. The warnings should still be cleaned up, but they are not deployment-blocking defects.

Environment variables:

```text
ANTHROPIC_API_KEY=<server-only key for api/identify-weed.js>
REACT_APP_PERSISTENCE_MODE=local
REACT_APP_SUPABASE_URL=<future Supabase URL>
REACT_APP_SUPABASE_ANON_KEY=<future Supabase anon key>
```

Do not expose `ANTHROPIC_API_KEY` as a `REACT_APP_*` variable.

Current Vercel environment status: no environment variables are configured yet. Add `ANTHROPIC_API_KEY` before smoke-testing real Weed ID image analysis.

## Deployment Flow

First-time connection to Ben's Vercel team:

```bash
npx vercel login
npx vercel --yes --scope ben-harris-projects-4b428f19
```

This will create or link the `fly-the-farm-dashboard` project in the `Ben Harris' projects` team. Vercel writes local project metadata into `.vercel/`, which is intentionally ignored by git.

Connected project:

```text
Team: Ben Harris' projects (ben-harris-projects-4b428f19)
Project: fly-the-farm-dashboard
Project ID: prj_74SucbPLkxaJi3PpF4XYTuC6NkR9
Production alias: https://fly-the-farm-dashboard-sable.vercel.app
Git repository: https://github.com/baz-10/fly-the-farm-dashboard.git
```

The `BJT-FTF/fly-the-farm-dashboard` remote could not be connected from the current Vercel account. If that org repo should drive automatic deployments, grant the Vercel GitHub app access to it and then run:

```bash
npx vercel git connect https://github.com/BJT-FTF/fly-the-farm-dashboard.git --scope ben-harris-projects-4b428f19
```

Preview deployment:

```bash
npx vercel
```

Production deployment:

```bash
npx vercel --prod
```

If using GitHub integration, let Vercel create preview deployments for branches and production deployments from the production branch.

## Smoke Test Checklist

After each preview deployment, verify:

- `/` loads the Operations Command dashboard.
- `/mission-planning` loads directly after refresh.
- `/financials` loads directly after refresh and the review queue row selection updates the right inspector.
- `/compliance` loads directly after refresh.
- Weed ID upload returns a clear error if `ANTHROPIC_API_KEY` is missing and identifies an image when the key is present.

## Backend Migration Path

Follow the existing Supabase plan rather than rewriting pages:

1. Add Supabase client and env vars.
2. Create tables, RLS policies, and storage buckets from `docs/plans/2026-03-23-backend-supabase-design.md`.
3. Move one store at a time behind the existing service function signatures.
4. Start with auth, clients/properties/fields, jobs, quotes, financial actuals, missions, then compliance records.
5. Add an admin migration tool that reads existing `localStorage` keys and writes them to Supabase.

`src/services/persistence.ts` centralizes the localStorage keys and starts the adapter boundary for this migration.
