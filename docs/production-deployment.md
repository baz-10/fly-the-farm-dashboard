# Production Deployment

Fly The Farm is deployed to Vercel as a Vite single-page application. The frontend is ready for protected preview deployment, but the app should not be treated as a production SaaS until browser-local persistence is replaced with the planned Supabase backend.

## Recommended Architecture

| Layer | Recommendation | Notes |
|---|---|---|
| Frontend hosting | Vercel | Build command: `npm run build`; output directory: `dist`. |
| SPA routing | Vercel rewrite | `vercel.json` rewrites deep links like `/financials` to `index.html`. |
| Serverless API | Vercel Functions | Vite middleware serves the same API handlers locally; Vercel Functions serve them in production. |
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
- An administrator can open the company Safety Plan master, create a job plan,
  submit it and approve it.
- A normal contractor cannot approve; a nominated operational authority can.
- An assigned PIC can acknowledge the exact approved version.
- A client and a contractor from another tenant cannot open the plan.
- An approved Safety Plan PDF downloads with the controlled version and
  CASA/ReOC-aligned notice.
- The Safety Plan editor at 375 px has no horizontal overflow.

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

## Safety Plan production prerequisites

Apply these prerequisites before deploying code that enables shared Safety
Plans. Do not deploy the UI first: the API fails closed when its collections,
RPCs or storage boundary are unavailable.

1. Apply `docs/supabase-safety-plan-migration.sql` to the target Supabase
   project. This adds the `safety_plan_authority` profile boolean, the
   Safety Plan collections, tenant policies, atomic optimistic-concurrency
   functions and server-derived audit boundary.
2. Confirm existing administrator profiles and explicitly nominate only the
   operational authorities authorised by each company. The default must remain
   `false`.
3. Create a **private** Supabase Storage bucket named
   `ftf-safety-attachments`. Do not enable public URLs.
4. Apply Storage policies that constrain every object to the authenticated
   tenant/plan/version path, allow draft uploads only to permitted operators,
   allow reads only to users who can read that plan, and prevent mutation of
   approved-version evidence. The server service role performs validated
   attachment mutations; the browser never receives that key.
5. Set `VITE_PERSISTENCE_MODE=remote` for protected preview and production.
   Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` as server-only Vercel variables.

`FTF_E2E_AUTH_FIXTURE=local-playwright-only` is exclusively a local Playwright
sentinel. Never configure it in Vercel. The fixture additionally requires a
loopback Host header and refuses activation when `VERCEL=1`; its process-memory
repository never falls through to Supabase.

Before promotion, use synthetic accounts in the protected preview to complete
the administrator, contractor, nominated-authority, PIC and client checks
above. Inspect Network responses for JSON API errors and confirm no request
contains the local fixture header. Verify the private bucket cannot be listed
or read across tenants and that an expired signed URL no longer works.

If any prerequisite or preview check fails, promote the immediately preceding
successful immutable Vercel deployment. Leave the additive database migration,
audit rows and private attachments in place; rolling application code back is
safer than attempting destructive data rollback. Disable new Safety Plan entry
in the affected environment until the mismatch is corrected, then re-run the
entire protected-preview checklist.
