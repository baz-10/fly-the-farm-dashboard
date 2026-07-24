# Production Deployment

Fly The Farm is deployed to Vercel as a Vite single-page application. The frontend is ready for protected preview deployment, but the app should not be treated as a production SaaS until browser-local persistence is replaced with the planned Supabase backend.

## Recommended Architecture

| Layer | Recommendation | Notes |
|---|---|---|
| Frontend hosting | Vercel | Build command: `npm run build`; output directory: `dist`. |
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
Vite
```

Build settings:

```text
Install command: npm install
Build command: npm run build
Output directory: dist
```

Environment variables:

```text
ANTHROPIC_API_KEY=<server-only key for api/identify-weed.js>
VITE_PERSISTENCE_MODE=local
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and
`ANTHROPIC_API_KEY` are server-only. Never expose them with a `VITE_*`
prefix.

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

## Protected Preview Verification

Before promoting a preview, run the same local release gates used by CI:

```bash
npm test
npm run test:coverage
npm run build
npm run test:e2e
```

Open the protected Vercel preview using an authorised team account. Use a
synthetic preview account or non-production tenant only; never reuse customer
credentials in automated tests. Verify:

- `/` loads the Operations Command dashboard.
- `/missions`, `/jobs`, `/aircraft`, and `/maintenance` load from navigation.
- `/missions/new` loads directly after a hard refresh, proving the SPA rewrite.
- A contractor view contains operational details but no administrator-only
  costs, rates, margin, profit, or purchase values.
- `GET /api/store?collection=ftf_missions` returns JSON (authenticated data or
  an authentication error), never `index.html`.
- Weed ID upload returns a clear error if `ANTHROPIC_API_KEY` is missing and identifies an image when the key is present.

Local `vite preview` uses the local API middleware so the browser gates can
verify routing without a Vercel deployment. Vercel serves `/api/*` through
serverless functions. The SPA rewrite explicitly excludes `/api/`; do not
point preview tests at production data.

## Promotion and Rollback

1. Confirm the protected preview passed the checklist and the four local
   release commands above.
2. Promote the exact verified Vercel deployment from the Vercel dashboard, or
   deploy that commit with `npx vercel --prod`.
3. Re-run the nested-route and API checks against the production alias.
4. If verification fails, use Vercel **Deployments** to promote the
   immediately preceding successful production deployment. Do not rebuild it:
   rolling back to the existing immutable deployment preserves its known
   build output and environment.
5. Record the failed and restored deployment URLs and pause further promotion
   until the regression is understood.

## Backend Migration Path

Follow the existing Supabase plan rather than rewriting pages:

1. Add Supabase client and env vars.
2. Create tables, RLS policies, and storage buckets from `docs/plans/2026-03-23-backend-supabase-design.md`.
3. Move one store at a time behind the existing service function signatures.
4. Start with auth, clients/properties/fields, jobs, quotes, financial actuals, missions, then compliance records.
5. Add an admin migration tool that reads existing `localStorage` keys and writes them to Supabase.

`src/services/persistence.ts` centralizes the localStorage keys and starts the adapter boundary for this migration.
