# Vite, Vitest and React Router 7 Toolchain Design

**Date:** 24 July 2026  
**Status:** Implemented — protected preview pending
**Scope:** Replace Create React App and Jest 27 while preserving the existing React SPA, Vercel functions, routes, tests and production data.

## 1. Objective

Modernise the dashboard toolchain before Safety Plans and the Document Centre add more application and test surface.

The migration must:

- replace `react-scripts` with Vite;
- replace Jest 27 with Vitest;
- restore React Router 7 through public package APIs;
- preserve all existing routes, pages and Vercel `/api` functions;
- preserve existing application behavior and stored data;
- support current Chrome, Edge, Safari and Firefox on desktop, iPadOS and Android;
- explicitly end support for Internet Explorer and other obsolete ES5-only browsers;
- provide a protected preview and rollback gate before production promotion.

This is a tooling migration. It does not change database schemas, tenant records, user credentials, persistence keys or API payloads.

## 2. Selected approach

Use a Vite React TypeScript SPA with Vitest and Testing Library.

Alternatives rejected:

- Patching CRA/Jest would retain deprecated tooling and continue the React Router compatibility problem.
- Migrating to Next.js would introduce a new rendering and server architecture that the dashboard does not currently need.

The existing React component, context, routing and Vercel function architecture remains in place.

## 3. Version and platform baseline

- Node.js: `>=20.19`; the current development runtime is Node `20.20.2`.
- React and React DOM: retain React 19.
- Vite: 7.x, locked through `package-lock.json`.
- `@vitejs/plugin-react`: Vite 7-compatible stable release, locked through `package-lock.json`.
- Vitest: 4.x, locked through `package-lock.json`.
- React Router and React Router DOM: 7.x, using public exports.
- TypeScript: retain 4.9 while `react-scripts` remains in Tasks 2–5, then upgrade to a Vite 7-compatible stable 5.x release in Task 6 when CRA is removed.
- Test DOM: `jsdom`.
- Browser smoke tests: Playwright Chromium.

The build target is modern evergreen browsers. The TypeScript target changes from ES5 to ES2022 and preserves strict type checking.

## 4. Application build architecture

### 4.1 Entry and HTML

Vite uses a root `index.html` with:

```html
<script type="module" src="/src/index.tsx"></script>
```

The existing `src/index.tsx` remains the React entry point. The root element, theme, authentication provider and Strict Mode behavior remain unchanged.

Assets that require stable root URLs remain under `public/` and continue to be referenced as `/logo.png` and equivalent paths.

### 4.2 Configuration

Create:

- `vite.config.ts` for React, development API middleware and build settings;
- `vitest.config.ts` for the test environment;
- `src/vite-env.d.ts` for typed Vite environment variables;
- `src/config/environment.ts` as the single application-facing environment adapter.

Application code reads configuration through the adapter. The completed Vite
implementation reads the exact `import.meta.env.VITE_PERSISTENCE_MODE`,
`import.meta.env.MODE` and `import.meta.env.BASE_URL` keys. Vite maps the
supported `VITE_PERSISTENCE_MODE` value and its legacy deployment fallback onto
that exact client expression; mode and base URL use Vite's built-in exact keys.

Vite does not expose the `VITE_*` or `REACT_APP_*` namespaces to browser code. A production-transform regression injects synthetic service-role values under both prefixes and proves neither value appears in emitted HTML, CSS or JavaScript. Server secrets remain available only to Vercel functions and local server middleware.

The public base URL is normalised to exactly one leading and trailing slash (`/` remains `/`) before it is supplied to Vite or compiled as `process.env.PUBLIC_URL`, so public and generated assets remain valid on non-root deployments.

### 4.3 Build scripts

The package scripts become:

```json
{
  "dev": "vite",
  "start": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test"
}
```

`react-scripts`, CRA-specific Jest types and CRA-only configuration are removed after parity is proven. The same Task 6 change upgrades TypeScript from 4.9 to 5.x and updates TypeScript's module resolution for the CRA-free Vite baseline.

## 5. Local API compatibility

CRA's `src/setupProxy.js` currently mounts local versions of:

- `/api/auth`;
- `/api/store`;
- `/api/geocode`;
- `/api/pmav`;
- `/api/identify-weed`.

Vite must expose the same endpoints and request behavior during local development. The migration extracts the registration logic into a focused Node module used by a Vite `configureServer` plugin.

Requirements:

- request bodies reach existing handlers in their expected parsed form;
- cookies and same-origin authentication continue to work;
- API response status, JSON bodies and timeout behavior remain unchanged;
- the Queensland vegetation and weed-identification proxy behavior remains unchanged;
- secrets are read by server-side middleware only and are never inserted into the client bundle;
- Vite's SPA fallback never intercepts `/api/*`.

The deployed Vercel functions remain the production API implementation.

## 6. React Router 7 restoration

Restore React Router 7 after the Vite/Vitest test runner can consume its public exports.

The migration:

- upgrades `react-router` and `react-router-dom` together;
- uses only public package entry points;
- retains the existing browser-router SPA structure;
- verifies every declared route in `src/App.tsx`;
- verifies nested mission, job and compliance URLs;
- verifies direct page refresh through the Vercel SPA rewrite;
- removes the temporary Router 6 compatibility exception from the navigation release.

Router 7 requires Node 20+ and React 18+; the selected baseline satisfies both.

## 7. Vitest migration

### 7.1 Configuration

Vitest uses:

- `environment: 'jsdom'`;
- `globals: true` for a controlled first migration;
- `setupFiles: './src/setupTests.ts'`;
- Testing Library cleanup;
- `@testing-library/jest-dom/vitest`;
- clear and restore mock behavior configured centrally;
- the existing `*.test.ts` and `*.test.tsx` discovery pattern.

### 7.2 Test conversion

Convert Jest-specific APIs deliberately:

- `jest.fn`, `jest.mock`, `jest.spyOn` and timer helpers become `vi` equivalents;
- `jest.Mock` and related namespace types become Vitest imports;
- CommonJS handler tests continue to use isolated module loading compatible with Vitest;
- module mocks declare explicit named/default exports;
- no test imports private package files from `node_modules`.

Test behavior, not the old runner's implementation details, is preserved.

### 7.3 Baseline

The accepted pre-migration baseline is:

- 56 suites;
- 224 tests;
- zero failures;
- production build succeeds.

The migration is not complete until all equivalent tests pass under Vitest. If consolidation changes the displayed suite count, a test manifest must demonstrate that no test file or test case was silently dropped.

## 8. Browser smoke tests

Playwright smoke coverage runs against the Vite preview build and covers:

1. login page renders and an authenticated test session can enter the dashboard;
2. compact and expanded navigation routes correctly;
3. Missions list and New Mission load;
4. Jobs list and a Job detail route load;
5. Aircraft and equipment kits load;
6. Maintenance Command loads without a collection error;
7. a direct refresh on a nested SPA route returns the application;
8. a representative authenticated `/api/store` read succeeds;
9. contractor-visible views do not reveal administrator-only financial data.

Smoke tests use dedicated test data or non-destructive reads. They must not mutate production records.

## 9. Vercel deployment

Update `vercel.json`:

- framework: `vite`;
- build command: `npm run build`;
- output directory: `dist`;
- retain the current function duration settings;
- retain `/api/*` function routing;
- retain the SPA rewrite to `/index.html`.

Deployment sequence:

1. Create a protected preview from the migration branch.
2. Run automated unit, build and smoke gates.
3. Manually verify login, mission, job, aircraft, maintenance and saved-data loading.
4. Confirm page refresh works on nested routes.
5. Promote only after preview approval.

Rollback is the immediately preceding Vercel production deployment. No data rollback is required because the migration changes no stored data.

## 10. Error handling and diagnostics

- A missing required client environment variable fails the build with its public variable name, never its value.
- A local API registration failure stops the development server with the affected endpoint named.
- Test migration failures remain visible; tests are not skipped or excluded to achieve a green result.
- Vite build warnings introduced by the migration are resolved or explicitly documented before promotion.
- Bundle-size changes are measured against the CRA production build and investigated when a major entry chunk grows materially.
- Preview failures block production promotion.

## 11. Delivery boundaries

The migration is implemented in a dedicated branch/worktree and kept logically separate from feature development.

Order:

1. Make the collapsible navigation branch review-clean.
2. Establish a Vite/Vitest migration branch containing the reviewed navigation state.
3. Complete toolchain and Router 7 migration.
4. Deploy and approve a protected preview.
5. Merge and promote.
6. Begin Safety Plans only after the new baseline is green.

## 12. Acceptance criteria

- `npm run dev` serves the dashboard and local APIs.
- `npm test` runs the complete migrated test inventory with zero failures.
- `npm run build` type-checks and writes the production SPA to `dist`.
- `npm run preview` serves working nested routes.
- React Router 7 is installed through public packages and route regressions pass.
- No CRA runtime or test dependency remains.
- No browser code exposes server secrets.
- All Vercel APIs retain their deployed routes and configuration.
- Protected preview smoke tests pass.
- Production data and persistence keys remain unchanged.
- A documented rollback returns traffic to the previous deployment.

## 13. Out of scope

- Server-side rendering.
- Next.js or another application framework migration.
- Database or authentication redesign.
- Rewriting Vercel functions into a different backend.
- Visual redesign outside fixes required to preserve current behavior.
- Safety Plans or Document Centre feature implementation.
- Internet Explorer or obsolete ES5-only browser support.
