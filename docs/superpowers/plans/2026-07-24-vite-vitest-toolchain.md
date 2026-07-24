# Vite, Vitest and React Router 7 Toolchain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Create React App and Jest 27 with Vite and Vitest, restore React Router 7, preserve all application/API behavior, and add preview smoke-test gates.

**Architecture:** Keep the existing React SPA and Vercel functions. Vite owns development and production frontend builds, a focused Vite plugin mounts existing API handlers locally, Vitest runs the complete existing test inventory, and Playwright validates the built preview across critical workflows.

**Tech Stack:** Node `>=20.19`, React 19, Vite 7.x, `@vitejs/plugin-react`, TypeScript 4.9 during CRA coexistence and 5.x after Task 6, Vitest 4.x, jsdom, Testing Library, React Router 7.x, Playwright Chromium, Vercel functions.

## Global Constraints

- Preserve all existing routes, pages and Vercel `/api` functions.
- Do not change database schemas, tenant records, credentials, persistence keys or API payloads.
- Support current Chrome, Edge, Safari and Firefox on desktop, iPadOS and Android.
- Internet Explorer and obsolete ES5-only browsers are unsupported.
- TypeScript target is ES2022 with strict checking.
- TypeScript stays pinned to 4.9 through Tasks 2–5; Task 6 upgrades to 5.x only after removing `react-scripts`.
- Client environment variables are allowlisted; server secrets never enter the browser bundle.
- The accepted baseline is 56 suites, 224 tests, zero failures and a successful production build.
- No test file or test case may be silently skipped or excluded.
- Protected preview and smoke tests must pass before production promotion.
- The migration must remain rollback-safe because stored data is unchanged.

---

## File structure

- Modify `src/components/navigation/GroupedNavigation.tsx`, `src/components/Layout.tsx` and navigation tests: close final Release 1 findings before migration.
- Create root `index.html`, `vite.config.ts`, `vitest.config.ts` and `src/vite-env.d.ts`: Vite/Vitest foundations.
- Create `src/config/environment.ts`: browser-safe environment adapter.
- Create `server/localApiMiddleware.js`: reusable local endpoint registration extracted from CRA proxy.
- Modify all 56 `*.test.ts(x)` files only where Jest-specific APIs require conversion.
- Create `scripts/test-inventory.mjs`: prove test-file and test-case migration coverage.
- Create `playwright.config.ts` and `e2e/critical-workflows.spec.ts`: built-preview smoke tests.
- Modify `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore` and `vercel.json`.
- Delete `src/setupProxy.js`, `src/react-app-env.d.ts` and `public/index.html` only after parity gates pass.

### Task 1: Make collapsible navigation release-clean

**Files:**
- Modify: `src/components/navigation/GroupedNavigation.tsx`
- Modify: `src/components/navigation/__tests__/GroupedNavigation.test.tsx`
- Modify: `src/services/navigationPreferenceStore.ts`
- Modify: `src/services/__tests__/navigationPreferenceStore.test.ts`
- Modify: `docs/superpowers/plans/2026-07-24-collapsible-navigation.md`
- Restore: `.superpowers/sdd/task-3-report.md` from `origin/main`
- Restore: `.superpowers/sdd/task-4-report.md` from `origin/main`

**Interfaces:**
- Preserves: `GroupedNavigation` props and navigation preference service signatures.
- Produces: review-clean navigation compatible with both old and new test runners.

- [ ] **Step 1: Write failing contrast, canonical-read and collapsed-ARIA tests**

```tsx
test('compact navigation uses readable light foreground and selected styling', () => {
  render(<GroupedNavigation expanded={false} pathname="/" role="admin" userId="u1" onNavigate={jest.fn()} />);
  const daily = screen.getByRole('button', { name: /daily operations/i });
  expect(daily).toHaveStyle({ color: 'rgba(255, 255, 255, 0.92)' });
  expect(screen.getByRole('link', { name: 'Operations' })).toHaveAttribute('aria-current', 'page');
});

test('collapsed headings do not reference an unmounted region', async () => {
  render(<GroupedNavigation expanded pathname="/" role="admin" userId="u1" onNavigate={jest.fn()} />);
  const heading = screen.getByRole('button', { name: /operational resources/i });
  expect(heading).not.toHaveAttribute('aria-controls');
});
```

```ts
test('deduplicates valid groups while reading preferences', () => {
  localStorage.setItem('ftf_navigation_groups:u1', JSON.stringify(['daily', 'daily', 'safety']));
  expect(readNavigationExpansion('u1')).toEqual(['daily', 'safety']);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- --watchAll=false src/components/navigation/__tests__/GroupedNavigation.test.tsx src/services/__tests__/navigationPreferenceStore.test.ts
```

Expected: FAIL on dark inherited foreground, dangling `aria-controls`, and duplicate stored group IDs.

- [ ] **Step 3: Implement the narrow fixes**

Apply explicit light foreground/hover/selected colors in both compact and expanded modes, use `aria-current="page"` on the active item, set `aria-controls` only while its region is mounted, and return:

```ts
return Array.isArray(value)
  ? Array.from(new Set(value.filter(isNavigationGroupId)))
  : [];
```

Update the navigation plan's Tech Stack to acknowledge that Router 7 restoration occurs in this migration. Restore the two generic SDD reports overwritten by navigation agents:

```bash
git restore --source=origin/main -- .superpowers/sdd/task-3-report.md .superpowers/sdd/task-4-report.md
```

The restored files must again contain the Optional Mission Work-Pack Editor and deployment-asset Task 4 reports. `.superpowers/` remains ignored for new scratch artifacts.

- [ ] **Step 4: Run navigation verification**

Run:

```bash
npm test -- --watchAll=false src/navigation src/services/__tests__/navigationPreferenceStore.test.ts src/components/navigation src/components/__tests__/Layout.navigation.test.tsx
npm run build
```

Expected: all focused tests PASS and the CRA build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/navigation src/services/navigationPreferenceStore.ts src/services/__tests__/navigationPreferenceStore.test.ts docs/superpowers/plans/2026-07-24-collapsible-navigation.md .superpowers/sdd/task-3-report.md .superpowers/sdd/task-4-report.md
git commit -m "fix: make grouped navigation release ready"
```

### Task 2: Install Vite foundation and browser environment adapter

**Files:**
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `src/vite-env.d.ts`
- Create: `src/config/environment.ts`
- Create: `src/config/environment.test.ts`
- Create: `src/config/environment.build.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Modify: `.gitignore`
- Modify: `src/services/persistence.ts`
- Modify: `src/services/__tests__/persistence.test.ts`
- Modify: `src/services/sprayRecParser.ts`
- Modify: `src/utils/pdfTextExtract.ts`
- Modify: `src/components/ErrorBoundary.tsx`
- Modify: `src/components/JSAErrorBoundary.tsx`
- Modify: `src/components/MissionErrorBoundary.tsx`
- Modify: `src/components/__tests__/MissionMapFeatureRegister.test.tsx`
- Modify: `src/utils/__tests__/missionWeather.test.ts`
- Modify: `src/utils/__tests__/missionWorkflow.test.ts`

**Interfaces:**
- Produces: `getPersistenceModeFromEnvironment()`, `isDevelopmentEnvironment()`, and `getPublicAssetUrl(path)`.
- Preserves: `getPersistenceMode()` public behavior.

- [ ] **Step 1: Install locked build/test dependencies**

Run:

```bash
npm install --save-dev vite@^7 @vitejs/plugin-react@^5.2.0 vitest@^4 jsdom@latest @vitest/coverage-v8@^4 @types/node@^20.19.0
npm install --save-dev --save-exact typescript@4.9.5
```

Expected: package lock resolves on Node 20.20.2 and `npm ls react-scripts typescript --all` exits zero. TypeScript remains on the CRA-compatible 4.9 baseline.

- [ ] **Step 2: Write the failing environment adapter test**

```ts
import { describe, expect, it } from 'vitest';
import { readClientEnvironment } from './environment';

describe('readClientEnvironment', () => {
  it('reads only the exact browser environment keys supported by Vite', () => {
    expect(readClientEnvironment({
      VITE_PERSISTENCE_MODE: 'remote',
      MODE: 'development',
      BASE_URL: '/dashboard',
    })).toEqual({ persistenceMode: 'remote', isDevelopment: true, publicBaseUrl: '/dashboard' });
  });

  it('never exposes unrecognised server secrets', () => {
    expect(JSON.stringify(readClientEnvironment({
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
      MODE: 'production',
      BASE_URL: '/',
    }))).not.toContain('secret');
  });
});
```

Add a Node-environment Vitest regression that runs a Vite production transform against a fixture containing synthetic `REACT_APP_SUPABASE_SERVICE_ROLE_KEY` and `VITE_SUPABASE_SERVICE_ROLE_KEY` values, then scans emitted HTML, CSS and JavaScript and proves neither value appears.

- [ ] **Step 3: Run Vitest and verify RED**

Run:

```bash
npx vitest run src/config/environment.test.ts
npx vitest run src/config/environment.build.test.ts
```

Expected: the adapter test initially fails because `src/config/environment.ts` does not exist. With the old namespace-exposing Vite config present, the build regression fails and prints the synthetic CRA/Vite service-role values found in emitted JavaScript.

- [ ] **Step 4: Implement Vite entry/config and adapter**

Use:

```ts
export interface ClientEnvironment {
  persistenceMode: 'local' | 'remote';
  isDevelopment: boolean;
  publicBaseUrl: string;
}

export function readClientEnvironment(source: Record<string, unknown>): ClientEnvironment {
  return {
    persistenceMode: source.VITE_PERSISTENCE_MODE === 'remote' ? 'remote' : 'local',
    isDevelopment: source.MODE === 'development',
    publicBaseUrl: typeof source.BASE_URL === 'string' ? source.BASE_URL : '/',
  };
}

export const clientEnvironment = readClientEnvironment({
  VITE_PERSISTENCE_MODE: import.meta.env.VITE_PERSISTENCE_MODE,
  MODE: import.meta.env.MODE,
  BASE_URL: import.meta.env.BASE_URL,
});
```

Set `target: 'ES2022'`, root `index.html`, Vite React plugin and output `dist`. Keep TypeScript 4.9's `moduleResolution: 'node'` and do not exclude legacy test directories from `tsc`.

Do not use whole-object `import.meta.env` or Vite/CRA namespace exposure.
Configure Vite with an inert automatic environment prefix and an exact `define`
replacement for only `import.meta.env.VITE_PERSISTENCE_MODE`. Use Vite's exact
built-in `MODE` and `BASE_URL` keys for the remaining client settings. The
build may read `REACT_APP_PERSISTENCE_MODE` only as a temporary compatibility
fallback for an existing deployment; application source must use the adapter.

Normalise the selected public base URL to exactly one leading and trailing
slash, preserving `/` for root deployments. A build regression must verify
public HTML assets, generated JavaScript/CSS paths and `import.meta.env.BASE_URL`
for a `/dashboard` deployment.

- [ ] **Step 5: Verify adapter and production build**

Run:

```bash
npx vitest run src/config/environment.test.ts
npx vitest run src/config/environment.build.test.ts
CI=true npm test -- --watchAll=false --runInBand src/services/__tests__/persistence.test.ts
npx tsc --noEmit
npm ls react-scripts typescript --all
npm run build
REACT_APP_SUPABASE_SERVICE_ROLE_KEY=cra-secret-scan VITE_SUPABASE_SERVICE_ROLE_KEY=vite-secret-scan npx vite build
! rg 'cra-secret-scan|vite-secret-scan' dist
```

Expected: adapter and synthetic secret tests PASS, the complete TypeScript inventory passes under 4.9, dependency-tree validation passes, both CRA and Vite builds succeed, `dist/index.html` exists, and a scan finds neither synthetic secret in Vite browser output.

- [ ] **Step 6: Commit**

```bash
git add index.html vite.config.ts src/vite-env.d.ts src/config package.json package-lock.json tsconfig.json .gitignore src/services src/utils src/components docs/superpowers/plans/2026-07-24-vite-vitest-toolchain.md docs/superpowers/specs/2026-07-24-vite-vitest-toolchain-design.md
git commit -m "build: establish Vite application foundation"
```

### Task 3: Preserve local Vercel API behavior

**Files:**
- Create: `server/localApiMiddleware.js`
- Create: `server/localApiMiddleware.test.ts`
- Modify: `vite.config.ts`
- Modify: `src/setupProxy.js`

**Interfaces:**
- Produces: `registerLocalApiMiddleware(server)` and Vite plugin `localApiPlugin()`.
- Consumes: existing `api/auth.js`, `api/store.js`, `api/geocode.js`, `api/pmav.js`, and `api/identify-weed.js`.

- [ ] **Step 1: Write failing endpoint-registration tests**

```ts
it('registers every production API path before SPA fallback', () => {
  const routes: string[] = [];
  registerLocalApiMiddleware({
    use(path: string) { routes.push(path); },
  } as never);
  expect(routes).toEqual([
    '/api/auth',
    '/api/store',
    '/api/geocode',
    '/api/pmav',
    '/api/identify-weed',
  ]);
});
```

Add a request test proving JSON PUT bodies reach `/api/store`, cookie headers are preserved, and `/api/*` errors remain JSON rather than `index.html`.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run server/localApiMiddleware.test.ts`

Expected: FAIL because the middleware module does not exist.

- [ ] **Step 3: Extract and mount local handlers**

Implement one Connect-compatible middleware per path, parse JSON only for methods with bodies, preserve original request headers, and forward handler promises/errors. Export:

```js
function registerLocalApiMiddleware(server) { /* exact five routes */ }
function localApiPlugin() {
  return { name: 'ftf-local-api', configureServer(server) { registerLocalApiMiddleware(server.middlewares); } };
}
module.exports = { registerLocalApiMiddleware, localApiPlugin };
```

Use the plugin from `vite.config.ts`. Keep `src/setupProxy.js` temporarily as a thin delegation wrapper so CRA comparison remains available until Task 6.

- [ ] **Step 4: Verify local APIs**

Run:

```bash
npx vitest run server/localApiMiddleware.test.ts src/__tests__/authenticated-auth-api.test.ts src/__tests__/authenticated-store-api.test.ts src/__tests__/geocode-api.test.ts
npm run dev -- --host 127.0.0.1
```

Expected: tests PASS; manual probes to `/api/auth` and `/api/geocode` return JSON, while `/missions` returns the SPA.

- [ ] **Step 5: Commit**

```bash
git add server/localApiMiddleware.js server/localApiMiddleware.test.ts vite.config.ts src/setupProxy.js
git commit -m "build: preserve local Vercel API middleware"
```

### Task 4: Configure Vitest and migrate utility/service tests

**Files:**
- Create: `vitest.config.ts`
- Modify: `src/setupTests.ts`
- Create: `scripts/test-inventory.mjs`
- Create: `scripts/test-inventory.test.ts`
- Modify: all test files under `src/utils/__tests__/`
- Modify: all test files under `src/services/__tests__/`
- Modify: all test files under `src/hooks/__tests__/`

**Interfaces:**
- Produces: `npm test` Vitest runner and a manifest that counts discovered test files/cases.

- [ ] **Step 1: Write the inventory test**

```ts
it('discovers the complete pre-migration test file inventory', async () => {
  const inventory = await collectTestInventory('src');
  expect(inventory.files).toHaveLength(56);
  expect(inventory.files).toContain('src/services/__tests__/persistence.test.ts');
  expect(inventory.files).toContain('src/App.test.tsx');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run scripts/test-inventory.test.ts`

Expected: FAIL because `scripts/test-inventory.mjs` does not exist.

- [ ] **Step 3: Add Vitest configuration and inventory**

Configure jsdom, globals, setup file, clear/restore mocks and test inclusion. Change setup import to:

```ts
import '@testing-library/jest-dom/vitest';
```

The inventory script recursively lists `*.test.{ts,tsx,js,jsx}` and extracts declared `test`/`it` calls for comparison; it never excludes a failing test.

- [ ] **Step 4: Convert utility/service/hook tests**

Replace Jest globals with Vitest equivalents:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fn = vi.fn();
vi.spyOn(object, 'method');
```

Replace `jest.Mock` with `Mock` imported from Vitest. Preserve assertions and fixture behavior.

- [ ] **Step 5: Run migrated test group**

Run:

```bash
npx vitest run src/utils src/services src/hooks scripts/test-inventory.test.ts
```

Expected: every converted test passes and inventory remains 56 files.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/setupTests.ts scripts src/utils src/services src/hooks
git commit -m "test: migrate utility and service suites to Vitest"
```

### Task 5: Migrate React component, context and page tests

**Files:**
- Modify: all test files under `src/components/`
- Modify: all test files under `src/contexts/`
- Modify: all `*.test.tsx` files under `src/pages/`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: Vitest globals/jsdom setup from Task 4.
- Produces: React test suites with no Jest-specific APIs or private router imports.

- [ ] **Step 1: Add a migration guard**

Extend `scripts/test-inventory.test.ts`:

```ts
it('contains no Jest runtime API in migrated React tests', async () => {
  const offenders = await findPatterns('src', /\bjest\.(fn|mock|spyOn|useFakeTimers|resetModules)\b|jest\.Mock/);
  expect(offenders).toEqual([]);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run scripts/test-inventory.test.ts`

Expected: FAIL listing the remaining component/context/page Jest usages.

- [ ] **Step 3: Convert React tests**

Use `vi` and public `react-router-dom` APIs. Preserve Testing Library user-event behavior, `act`, async waits, role-based queries, touch/keyboard navigation and context mocks. Do not use `virtual: true` or private package paths.

- [ ] **Step 4: Run React suites**

Run:

```bash
npx vitest run src/components src/contexts src/pages src/App.test.tsx scripts/test-inventory.test.ts
```

Expected: all suites PASS and the Jest API guard returns no offenders.

- [ ] **Step 5: Commit**

```bash
git add src/components src/contexts src/pages src/App.test.tsx scripts/test-inventory.test.ts
git commit -m "test: migrate React suites to Vitest"
```

### Task 6: Migrate CommonJS API tests and remove CRA

**Files:**
- Modify: `src/__tests__/authenticated-auth-api.test.ts`
- Modify: `src/__tests__/authenticated-store-api.test.ts`
- Modify: `src/__tests__/geocode-api.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Delete: `src/setupProxy.js`
- Delete: `src/react-app-env.d.ts`
- Delete: `public/index.html`

**Interfaces:**
- Produces: complete Vitest suite and CRA-free package.

- [ ] **Step 1: Write CRA-removal audit assertions**

```ts
it('has no Create React App runtime or configuration', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  expect(pkg.dependencies?.['react-scripts']).toBeUndefined();
  expect(pkg.scripts.build).toBe('tsc --noEmit && vite build');
  expect(await pathExists('src/setupProxy.js')).toBe(false);
  expect(await pathExists('public/index.html')).toBe(false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run scripts/test-inventory.test.ts`

Expected: FAIL because CRA files/dependency still exist.

- [ ] **Step 3: Convert API handler tests**

Use Node-compatible Vitest module loading. Keep `process.env` isolation for server handlers, reset modules with `vi.resetModules()`, and import CommonJS handlers through supported interop without changing production API exports.

- [ ] **Step 4: Remove CRA, upgrade TypeScript and update scripts**

Remove `react-scripts`, `@types/jest`, CRA-only config and files. Upgrade TypeScript only now:

```bash
npm install --save-dev typescript@^5
```

Adopt the Vite-compatible TypeScript 5 module resolution, then set the exact scripts from the design, including `test`, `test:watch`, `test:coverage`, `dev`, `start`, `build` and `preview`.

- [ ] **Step 5: Run the full Vitest inventory**

Run:

```bash
npm test
npm run test:coverage
npm run build
```

Expected: 56 discovered test files, at least 224 test cases, zero failures; coverage command and Vite build succeed.

- [ ] **Step 6: Commit**

```bash
git add src/__tests__ package.json package-lock.json scripts
git add -u src/setupProxy.js src/react-app-env.d.ts public/index.html
git commit -m "build: remove Create React App and Jest"
```

### Task 7: Restore and verify React Router 7

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/App.test.tsx`
- Create: `src/__tests__/route-manifest.test.tsx`
- Modify: route-related tests under `src/components/`, `src/pages/` and `src/contexts/` only if public Router 7 behavior requires it.

**Interfaces:**
- Produces: React Router 7 public-package baseline and route-manifest regression.

- [ ] **Step 1: Add route manifest tests before upgrading**

```tsx
it.each([
  '/',
  '/missions',
  '/missions/new',
  '/missions/mission-1',
  '/jobs',
  '/aircraft',
  '/maintenance',
  '/compliance',
  '/compliance/safety',
])('declares and renders route %s without a router module error', async (path) => {
  renderApplicationAt(path);
  expect(await screen.findByTestId('application-shell')).toBeInTheDocument();
});
```

Add assertions for job/client/property/field nested routes and legacy `/mission-planning` redirect.

- [ ] **Step 2: Run route tests on Router 6**

Run: `npx vitest run src/__tests__/route-manifest.test.tsx`

Expected: PASS, establishing behavior before the version change.

- [ ] **Step 3: Upgrade both public router packages**

Run:

```bash
npm install react-router@^7 react-router-dom@^7
```

Update imports only when required by documented public Router 7 exports; no private entry points.

- [ ] **Step 4: Verify Router 7**

Run:

```bash
npm ls react-router react-router-dom
npx vitest run src/__tests__/route-manifest.test.tsx src/App.test.tsx src/components/__tests__/Layout.navigation.test.tsx
npm test
npm run build
```

Expected: aligned Router 7 packages; route tests, complete suite and build PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/App.test.tsx src/__tests__/route-manifest.test.tsx src/components src/pages src/contexts
git commit -m "build: restore React Router 7"
```

### Task 8: Add built-preview smoke tests and Vercel configuration

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/critical-workflows.spec.ts`
- Create: `e2e/fixtures/auth.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vercel.json`
- Modify: `docs/production-deployment.md`

**Interfaces:**
- Produces: `npm run test:e2e` and Vercel Vite deployment output.

- [ ] **Step 1: Install Playwright and write failing smoke tests**

Run: `npm install --save-dev @playwright/test@latest`

Create tests that assert login, navigation, Missions/New Mission, Jobs, Aircraft, Maintenance, nested-route refresh, representative `/api/store` read, and contractor financial privacy.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
npx playwright install chromium
npm run test:e2e
```

Expected: FAIL because Playwright preview server/config and authenticated fixture are incomplete.

- [ ] **Step 3: Implement preview configuration and fixtures**

Configure Playwright `webServer`:

```ts
webServer: {
  command: 'npm run build && npm run preview -- --host 127.0.0.1',
  port: 4173,
  reuseExistingServer: false,
}
```

Use local non-production authentication fixtures and non-destructive record reads. Never embed real credentials.

- [ ] **Step 4: Update Vercel**

Set:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

Retain existing function durations and SPA rewrite excluding `/api/`.

- [ ] **Step 5: Run final local gates**

Run:

```bash
npm test
npm run test:coverage
npm run build
npm run test:e2e
```

Expected: full Vitest inventory, coverage, production build and all smoke tests PASS.

- [ ] **Step 6: Document preview and rollback**

Document protected-preview verification, direct nested-route refresh, local/prod API distinction, production promotion and rollback to the immediately preceding Vercel deployment.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts e2e package.json package-lock.json vercel.json docs/production-deployment.md
git commit -m "test: add Vite preview deployment gates"
```

### Task 9: Final migration audit

**Files:**
- Modify: `scripts/test-inventory.test.ts`
- Modify: `docs/superpowers/specs/2026-07-24-vite-vitest-toolchain-design.md`

**Interfaces:**
- Consumes: complete Vite/Vitest/Router 7 migration.
- Produces: auditable release evidence and an implemented specification status.

- [ ] **Step 1: Add final dependency and secret audit tests**

Assert:

```ts
expect(pkg.dependencies?.['react-scripts']).toBeUndefined();
expect(pkg.devDependencies?.['@types/jest']).toBeUndefined();
expect(pkg.dependencies?.['react-router-dom']).toMatch(/\\^7/);
expect(await findPatterns('src', /process\.env\.REACT_APP_|%PUBLIC_URL%|react-router\\/dist/)).toEqual([]);
expect(await findPatterns('dist', /SUPABASE_SERVICE_ROLE_KEY|ANTHROPIC_API_KEY/)).toEqual([]);
```

- [ ] **Step 2: Run the complete release gate**

Run:

```bash
npm ls
npm test
npm run test:coverage
npm run build
npm run test:e2e
git diff --check
```

Expected: no invalid dependency tree, all tests/smokes PASS, build succeeds, and diff is clean.

- [ ] **Step 3: Compare inventory and bundle**

Record:

- 56 test files represented;
- at least 224 test cases executed;
- no skipped tests introduced;
- CRA versus Vite entry bundle sizes;
- any remaining build warning with owner and disposition.

- [ ] **Step 4: Update specification status**

Set the toolchain design status to `Implemented — protected preview pending` before deployment, then `Implemented` only after preview approval.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-inventory.test.ts docs/superpowers/specs/2026-07-24-vite-vitest-toolchain-design.md
git commit -m "docs: record Vite migration verification"
```
