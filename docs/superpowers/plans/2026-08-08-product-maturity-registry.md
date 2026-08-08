# Product Maturity Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved repository-controlled Product Maturity Registry across every reachable Spray Command module and material workflow without changing permissions, tenancy, entitlements, feature flags or authoritative persistence.

**Architecture:** Store maturity governance in a versioned JSON manifest so runtime UI, Jest completeness tests and Node-based CI verification consume the same source. A typed selector resolves the current route and workflow, a shared presentation layer renders Beta and Coming Soon states consistently, and existing route guards continue to decide access before maturity presentation is applied.

**Tech Stack:** React 19, TypeScript, Material UI, React Router, Jest/Testing Library, Node.js verification scripts, Playwright, GitHub Actions.

## Global Constraints

- Do not broaden scope beyond the approved Product Maturity Registry slice.
- The registry describes product confidence and never grants access.
- The registry remains separate from permissions, subscriptions, entitlements, tenancy, feature flags and customer configuration.
- Preserve all existing route guards, authoritative APIs, RLS, tenant isolation and operating-location enforcement.
- Preserve the stable product navigation.
- Do not expose `Legacy` in customer-facing copy.
- `BETA` means safe, supported and actively improving; never experimental, unfinished or unsafe.
- `COMING_SOON` constrains only workflows whose exposure would cause unsafe operation, incorrect expectations, unreliable persistence, regulatory risk or significant data-loss risk.
- No capability becomes `COMMERCIALLY_READY` through this implementation.
- No browser-local workflow becomes authoritative through this implementation.
- Do not create synthetic operational or compliance records.
- P3 work must not interrupt the approved Gate 1 priority sequence.

---

## File structure

- Create `src/productMaturity/product-maturity-registry.json` — single repository-controlled maturity dataset.
- Create `src/productMaturity/types.ts` — maturity, registry-entry and surface types.
- Create `src/productMaturity/registry.ts` — typed loading, validation, selectors and fail-closed behaviour.
- Create `src/productMaturity/surfaces.ts` — route-to-module/workflow mapping for every reachable application route.
- Create `src/productMaturity/__tests__/registry.test.ts` — registry schema, governance and promotion-blocker tests.
- Create `src/productMaturity/__tests__/surfaces.test.ts` — reachable-route completeness and fail-closed tests.
- Create `src/components/productMaturity/MaturityBadge.tsx` — accessible shared maturity indicator.
- Create `src/components/productMaturity/ComingSoonWorkspace.tsx` — premium constrained-workflow surface.
- Create `src/components/productMaturity/ProductMaturitySurface.tsx` — route-level presentation boundary.
- Create `src/components/productMaturity/WorkflowMaturityBoundary.tsx` — workflow-level override boundary.
- Create `src/components/productMaturity/__tests__/MaturityBadge.test.tsx` — badge semantics and tooltip tests.
- Create `src/components/productMaturity/__tests__/ProductMaturitySurface.test.tsx` — Beta and Coming Soon route behaviour.
- Modify `src/navigation/organisationNavigation.tsx` — attach registry codes without changing permissions or route structure.
- Modify `src/navigation/__tests__/organisationNavigation.test.tsx` — navigation maturity coverage.
- Modify `src/components/Layout.tsx` — render maturity badges and the route-level surface inside the authorised shell.
- Modify `src/components/__tests__/LayoutNavigation.test.tsx` — desktop/mobile navigation badge and stability tests.
- Modify `src/App.tsx` — export the canonical reachable-route declarations used by completeness tests without changing guards.
- Modify `src/pages/Admin.tsx` — constrain only browser-local administration workflows using workflow maturity boundaries.
- Modify `src/pages/ComplianceMenu.tsx` — retain the compliance structure while marking unsafe local-only workflows Coming Soon.
- Create `scripts/verifyProductMaturityRegistry.mjs` — CI-safe manifest validation and human-readable internal summary.
- Modify `.github/workflows/production-beta-operational-acceptance.yml` — add the registry completeness gate before browser acceptance.
- Modify `e2e/acceptance/operator-resilience.spec.ts` — prove stable navigation and customer-safe maturity presentation.
- Create `docs/product-maturity-registry.md` — governance and promotion operating procedure.

---

### Task 1: Define and validate the repository-controlled registry

**Files:**
- Create: `src/productMaturity/product-maturity-registry.json`
- Create: `src/productMaturity/types.ts`
- Create: `src/productMaturity/registry.ts`
- Create: `src/productMaturity/__tests__/registry.test.ts`

**Interfaces:**
- Produces: `ProductMaturity`, `ProductMaturityEntry`, `getMaturityEntry(moduleCode, workflowCode?)`, `assertValidRegistry(registry)` and `PRODUCT_MATURITY_REGISTRY`.
- Consumes: approved classifications and promotion rules from `docs/superpowers/specs/2026-08-08-commercial-productisation-maturity-registry-design.md`.

- [ ] **Step 1: Write failing registry schema and governance tests**

Create tests that load the JSON manifest and prove:

```ts
expect(() => assertValidRegistry(PRODUCT_MATURITY_REGISTRY)).not.toThrow();
expect(new Set(PRODUCT_MATURITY_REGISTRY.map(entry => entry.maturity))).toEqual(
  new Set(['OPERATIONALLY_READY', 'BETA', 'COMING_SOON'])
);
expect(PRODUCT_MATURITY_REGISTRY.some(entry => entry.maturity === 'COMMERCIALLY_READY')).toBe(false);
expect(PRODUCT_MATURITY_REGISTRY.filter(entry => entry.maturity !== 'COMMERCIALLY_READY')
  .every(entry => entry.promotionBlockers.length > 0 || entry.maturity === 'OPERATIONALLY_READY')).toBe(true);
expect(PRODUCT_MATURITY_REGISTRY.every(entry => !entry.customerName.includes('Legacy'))).toBe(true);
```

Also assert stable unique `moduleCode/workflowCode` keys, valid ISO review dates, non-empty owner, priority, evidence, automated tests, manual acceptance, operational evidence, milestone and changelog reference fields.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
CI=true npm test -- --watchAll=false --runInBand src/productMaturity/__tests__/registry.test.ts
```

Expected: FAIL because the registry files and exported validation functions do not exist.

- [ ] **Step 3: Define exact TypeScript contracts**

Implement:

```ts
export type ProductMaturity =
  | 'COMMERCIALLY_READY'
  | 'OPERATIONALLY_READY'
  | 'BETA'
  | 'COMING_SOON';

export type ProductPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface ProductMaturityEntry {
  moduleCode: string;
  workflowCode: string | null;
  customerName: string;
  maturity: ProductMaturity;
  owner: string;
  priority: ProductPriority;
  promotionBlockers: string[];
  evidence: string[];
  requiredAutomatedTests: string[];
  requiredManualAcceptance: string[];
  requiredOperationalEvidence: string[];
  targetPromotionMilestone: string;
  reviewDate: string;
  changelogReference: string;
}
```

- [ ] **Step 4: Add the complete approved baseline manifest**

Represent every module and workflow from specification section 5. Use stable lowercase dot-separated codes such as:

```json
{
  "moduleCode": "quotes",
  "workflowCode": null,
  "customerName": "Quotes",
  "maturity": "COMING_SOON",
  "owner": "Product and Engineering",
  "priority": "P0",
  "promotionBlockers": [
    "Replace browser-local quote authority with canonical tenant-scoped persistence.",
    "Add optimistic concurrency, audit, outbox and archive semantics."
  ],
  "evidence": ["src/services/quoteStore.ts"],
  "requiredAutomatedTests": ["Cross-tenant API denial", "Refresh and second-session persistence"],
  "requiredManualAcceptance": ["Create, reopen, revise, issue and archive a genuine quote"],
  "requiredOperationalEvidence": ["Private beta quote workflow use"],
  "targetPromotionMilestone": "Gate 1 Quotes and Financials productisation",
  "reviewDate": "2026-09-08",
  "changelogReference": "docs/superpowers/specs/2026-08-08-commercial-productisation-maturity-registry-design.md"
}
```

Add workflow overrides for material differences, including Mission reports, quote PDF export, margin analysis, invoice export, compliance authority records, checklist execution and administration sub-workflows.

- [ ] **Step 5: Implement strict validation and selectors**

`assertValidRegistry` must reject unknown maturity values, duplicate keys, invalid dates, missing evidence fields, empty blockers where required, customer-facing `Legacy` text and `COMMERCIALLY_READY` entries lacking an explicit Founder-approval evidence string.

`getMaturityEntry` must apply a workflow override first and then the module entry. Missing module metadata throws `ProductMaturityConfigurationError`; it must never default to Commercially Ready.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
CI=true npm test -- --watchAll=false --runInBand src/productMaturity/__tests__/registry.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/productMaturity/product-maturity-registry.json src/productMaturity/types.ts src/productMaturity/registry.ts src/productMaturity/__tests__/registry.test.ts
git commit -m "FEAT: establish product maturity registry"
```

---

### Task 2: Map every reachable route and enforce fail-closed completeness

**Files:**
- Create: `src/productMaturity/surfaces.ts`
- Create: `src/productMaturity/__tests__/surfaces.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getMaturityEntry` from Task 1.
- Produces: `ReachableProductRoute`, `REACHABLE_PRODUCT_ROUTES`, `PRODUCT_SURFACES` and `resolveProductSurface(pathname, search)`.

- [ ] **Step 1: Export canonical route metadata without changing route guards**

Add a readonly route manifest beside `App`:

```ts
export const REACHABLE_PRODUCT_ROUTES = [
  { path: '/login', moduleCode: 'authentication' },
  { path: '/register', moduleCode: 'onboarding' },
  { path: '/', moduleCode: 'operations-brief' },
  { path: '/jobs', moduleCode: 'clients' },
  { path: '/missions', moduleCode: 'missions' },
  { path: '/quotes', moduleCode: 'quotes' },
  { path: '/financials', moduleCode: 'financials' },
  { path: '/compliance/library', moduleCode: 'compliance-library' }
] as const;
```

Include every existing route declaration, including dynamic routes and public Customer Outcome. Keep the existing `<Route>` elements and `ProtectedRoute` wrappers unchanged.

- [ ] **Step 2: Write failing route completeness tests**

Assert every exported route resolves to exactly one registry-backed surface, dynamic Client/Property/Field/Job/Mission paths prefer the most specific matcher, query-driven `/jobs?view=properties|fields|jobs` resolves correctly, and an unknown mapped module throws rather than defaulting.

Also read `src/App.tsx` as text and assert every literal `<Route path="...">` appears in `REACHABLE_PRODUCT_ROUTES`, preventing an unclassified route from shipping.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
CI=true npm test -- --watchAll=false --runInBand src/productMaturity/__tests__/surfaces.test.ts
```

Expected: FAIL because the route surface resolver does not exist.

- [ ] **Step 4: Implement deterministic surface matching**

Define exact matchers using React Router-compatible path semantics. Sort matchers by specificity and resolve query-based workspace views before the shared `/jobs` fallback.

Return:

```ts
export interface ResolvedProductSurface {
  routePattern: string;
  moduleCode: string;
  workflowCode: string | null;
  entry: ProductMaturityEntry;
}
```

Unknown routes return `null` only for the eventual 404 surface; a declared reachable route with missing registry metadata throws `ProductMaturityConfigurationError`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
CI=true npm test -- --watchAll=false --runInBand src/productMaturity/__tests__/surfaces.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/App.tsx src/productMaturity/surfaces.ts src/productMaturity/__tests__/surfaces.test.ts
git commit -m "TEST: require maturity coverage for reachable routes"
```

---

### Task 3: Build the accessible maturity presentation layer

**Files:**
- Create: `src/components/productMaturity/MaturityBadge.tsx`
- Create: `src/components/productMaturity/ComingSoonWorkspace.tsx`
- Create: `src/components/productMaturity/ProductMaturitySurface.tsx`
- Create: `src/components/productMaturity/WorkflowMaturityBoundary.tsx`
- Create: `src/components/productMaturity/__tests__/MaturityBadge.test.tsx`
- Create: `src/components/productMaturity/__tests__/ProductMaturitySurface.test.tsx`

**Interfaces:**
- Consumes: `ProductMaturityEntry` and `resolveProductSurface` from Tasks 1–2.
- Produces: reusable `MaturityBadge`, route-level `ProductMaturitySurface` and workflow-level `WorkflowMaturityBoundary` components.

- [ ] **Step 1: Write failing badge behaviour tests**

Prove:

- Commercially Ready and Operationally Ready render no primary badge.
- Beta renders a visible `Beta` chip.
- The Beta chip has accessible text and the exact approved explanatory tooltip.
- Coming Soon renders a visible `Coming Soon` chip only where a destination or constrained workflow needs it.
- No customer-facing output contains `Legacy`, `experimental`, `unfinished` or `unsafe`.

- [ ] **Step 2: Write failing surface behaviour tests**

Render a Beta route and assert children remain usable with a subtle page-level indicator. Render a Coming Soon route and assert children are not mounted, no browser write function executes, and the replacement explains availability in plain language.

Render an Operationally Ready route and assert children render without badge clutter. Pass a workflow override to `WorkflowMaturityBoundary` and prove it takes precedence over the parent module.

- [ ] **Step 3: Run component tests and verify RED**

Run:

```bash
CI=true npm test -- --watchAll=false --runInBand src/components/productMaturity
```

Expected: FAIL because the shared components do not exist.

- [ ] **Step 4: Implement `MaturityBadge`**

Use a small Material UI `Chip` and `Tooltip`. Keep the Beta visual neutral and premium, not warning-coloured. Use the exact tooltip:

```text
This feature is available during Private Commercial Beta and is still being refined.
```

Do not render a badge for Operationally Ready or Commercially Ready.

- [ ] **Step 5: Implement `ComingSoonWorkspace`**

Render the stable customer-facing module name, `Coming Soon`, a concise explanation and a supported alternative action where the registry entry declares one. Do not list engineering blockers, database terminology or internal priorities.

- [ ] **Step 6: Implement route and workflow boundaries**

`ProductMaturitySurface` accepts the current location and authorised route content. It resolves maturity and:

- renders children unchanged for Commercially Ready and Operationally Ready;
- renders a page-level Beta indicator followed by children for Beta; and
- renders only `ComingSoonWorkspace` for Coming Soon.

`WorkflowMaturityBoundary` accepts explicit `moduleCode`, `workflowCode` and children, applies the same rules, and is used only inside mixed-maturity pages.

- [ ] **Step 7: Run component tests and verify GREEN**

Run:

```bash
CI=true npm test -- --watchAll=false --runInBand src/components/productMaturity
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/components/productMaturity
git commit -m "UX: add consistent maturity presentation"
```

---

### Task 4: Integrate maturity into stable navigation and authorised routes

**Files:**
- Modify: `src/navigation/organisationNavigation.tsx`
- Modify: `src/navigation/__tests__/organisationNavigation.test.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/components/__tests__/LayoutNavigation.test.tsx`
- Modify: `src/pages/Admin.tsx`
- Modify: `src/pages/ComplianceMenu.tsx`

**Interfaces:**
- Consumes: registry selectors, `MaturityBadge`, `ProductMaturitySurface` and `WorkflowMaturityBoundary`.
- Produces: stable navigation with correct maturity communication and constrained unsafe workflows.

- [ ] **Step 1: Write failing navigation metadata tests**

Add `moduleCode` and optional `workflowCode` to every `NavigationItem`, including standalone Home. Prove every visible navigation item resolves to a registry entry and existing `roles` and `entitlement` arrays remain byte-for-byte equivalent to their pre-change values.

Assert the group order and route paths remain unchanged.

- [ ] **Step 2: Write failing responsive navigation tests**

Extend `LayoutNavigation.test.tsx` to prove:

- Beta appears beside Weather/Chemical surfaces where classified Beta;
- Coming Soon destinations remain discoverable;
- Operationally Ready destinations receive no badge;
- collapsed desktop tooltips include maturity without duplicate labels;
- mobile navigation presents the same state;
- Home remains standalone; and
- no navigation label contains `Legacy`.

- [ ] **Step 3: Run navigation tests and verify RED**

Run:

```bash
CI=true npm test -- --watchAll=false --runInBand src/navigation/__tests__/organisationNavigation.test.tsx src/components/__tests__/LayoutNavigation.test.tsx
```

Expected: FAIL because navigation does not consume the registry.

- [ ] **Step 4: Attach maturity references without changing access**

Extend `NavigationItem`:

```ts
moduleCode: string;
workflowCode?: string;
```

Use the registry only to render maturity. Keep every `roles`, `entitlement`, `path`, active-prefix and group decision unchanged.

Rename the customer-facing `Legacy Ask FTF` label to `Operational Intelligence` while retaining its existing route and entitlement enforcement.

- [ ] **Step 5: Wrap authorised route content in `ProductMaturitySurface`**

Inside `Layout`, resolve `location.pathname` and `location.search` after authentication and route guards have succeeded. Replace the bare `<Outlet />` with:

```tsx
<ProductMaturitySurface pathname={location.pathname} search={location.search}>
  <Outlet />
</ProductMaturitySurface>
```

This ordering ensures maturity never grants access.

- [ ] **Step 6: Constrain only mixed-maturity workflows**

In `Admin.tsx`, keep Organisation Branding, Organisation Assisted Support and authoritative chemical reviews available. Wrap browser-local network/source manager, extraction and document-sourcing panels in Coming Soon workflow boundaries.

In `ComplianceMenu.tsx`, preserve all cards and routes but present the seven browser-local compliance forms as Coming Soon. Keep authoritative ReOC, Operations Manual, Compliance Health, credentials, controlled checklists and PMAV according to their registry states.

- [ ] **Step 7: Run navigation and mixed-page tests and verify GREEN**

Run:

```bash
CI=true npm test -- --watchAll=false --runInBand src/navigation/__tests__/organisationNavigation.test.tsx src/components/__tests__/LayoutNavigation.test.tsx src/pages/__tests__/CasaComplianceOverview.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/navigation/organisationNavigation.tsx src/navigation/__tests__/organisationNavigation.test.tsx src/components/Layout.tsx src/components/__tests__/LayoutNavigation.test.tsx src/pages/Admin.tsx src/pages/ComplianceMenu.tsx
git commit -m "UX: apply maturity across product navigation"
```

---

### Task 5: Add CI completeness verification and governance documentation

**Files:**
- Create: `scripts/verifyProductMaturityRegistry.mjs`
- Create: `docs/product-maturity-registry.md`
- Modify: `.github/workflows/production-beta-operational-acceptance.yml`
- Create: `src/__tests__/productMaturityBoundary.test.tsx`

**Interfaces:**
- Consumes: JSON manifest, approved governance specification and reachable-route source.
- Produces: `npm`/CI verification command and operator-facing governance procedure.

- [ ] **Step 1: Write a failing CI verifier invocation test**

Create `src/__tests__/productMaturityBoundary.test.tsx` that executes the verifier in a child process and expects exit code `0`, a count of classified modules/workflows, and no customer-facing `Legacy` violation.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
CI=true npm test -- --watchAll=false --runInBand src/__tests__/productMaturityBoundary.test.tsx
```

Expected: FAIL because the verifier does not exist.

- [ ] **Step 3: Implement the Node verifier**

The script reads `product-maturity-registry.json` directly, validates required fields and unique keys, scans customer-facing navigation and maturity components for `Legacy`, and scans `src/App.tsx` route literals against the exported route manifest.

It prints only safe counts and violations. It does not read environment variables, production credentials or customer data.

- [ ] **Step 4: Add the GitHub Actions gate**

Add this step after dependency installation and before Playwright environment validation:

```yaml
      - name: Verify Product Maturity Registry completeness
        run: node scripts/verifyProductMaturityRegistry.mjs
```

Do not change workflow secrets, environment, permissions, triggers or acceptance credentials.

- [ ] **Step 5: Document promotion operations**

`docs/product-maturity-registry.md` must describe:

- how to add a module/workflow entry;
- how overrides work;
- required promotion evidence;
- why Commercially Ready requires Founder approval;
- how to record operational evidence without customer secrets;
- how to review dates and changelog references; and
- how registry failures block release without changing runtime permissions.

- [ ] **Step 6: Run the verifier and focused test**

Run:

```bash
node scripts/verifyProductMaturityRegistry.mjs
CI=true npm test -- --watchAll=false --runInBand src/__tests__/productMaturityBoundary.test.tsx
```

Expected: both commands PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add scripts/verifyProductMaturityRegistry.mjs docs/product-maturity-registry.md .github/workflows/production-beta-operational-acceptance.yml src/__tests__/productMaturityBoundary.test.tsx
git commit -m "CI: enforce product maturity governance"
```

---

### Task 6: Extend operational acceptance and verify the complete slice

**Files:**
- Modify: `e2e/acceptance/operator-resilience.spec.ts`
- Modify only if required by verified failures: files changed in Tasks 1–5.

**Interfaces:**
- Consumes: deployed navigation and maturity presentation.
- Produces: end-to-end evidence that maturity communication does not break the authoritative operational workflow.

- [ ] **Step 1: Add browser acceptance assertions**

Using the existing authenticated acceptance project, assert:

- the stable navigation groups and Home remain available;
- an authorised Beta surface remains usable and shows the approved Beta explanation;
- a visible Coming Soon destination opens its plain-language workspace and performs no mutation request;
- Operationally Ready Client → Property → Field → Job → Mission creation remains available;
- no customer-facing page contains `Legacy`; and
- returning from a maturity surface preserves the current authenticated session.

Do not capture authentication screenshots, video, traces or storage state on failure.

- [ ] **Step 2: Run focused unit and component regression**

Run:

```bash
CI=true npm test -- --watchAll=false --runInBand src/productMaturity src/components/productMaturity src/navigation src/components/__tests__/LayoutNavigation.test.tsx src/__tests__/productMaturityBoundary.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run the complete regression suite**

Run:

```bash
CI=true npm test -- --watchAll=false --runInBand
```

Expected: all suites and tests PASS.

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: exit code `0`. Existing unrelated warnings may be reported but no new maturity-registry warning is accepted.

- [ ] **Step 5: Run local Playwright tests where credentials are not required**

Run:

```bash
npx playwright test --project=environment
```

Expected: PASS against the configured target. Do not request or print acceptance credentials.

- [ ] **Step 6: Review the complete diff and security boundaries**

Run:

```bash
git diff --check
git status --short
rg -n "E2E_ORGANISATION_PASSWORD|SUPABASE_SERVICE_ROLE_KEY|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY" src scripts docs .github
```

Expected: no whitespace errors, only intended files changed, and no secret values committed. Environment-variable names in controlled server/workflow configuration are acceptable; secret values are not.

- [ ] **Step 7: Commit final acceptance coverage**

```bash
git add e2e/acceptance/operator-resilience.spec.ts
git commit -m "TEST: prove maturity registry operational safety"
```

- [ ] **Step 8: Publish and deploy only under explicit release authority**

After Product Owner release authority, push `codex/production-beta` without force, deploy to the verified Spray Command Production Beta Vercel project, and run the protected unattended Production Beta Operational Acceptance workflow.

Return:

- commit SHA;
- push confirmation;
- deployment ID and READY status;
- production URL;
- registry verification result;
- regression/build results;
- unattended acceptance run ID and result;
- worktree status; and
- Product Owner visual-review link.

Do not claim Commercially Ready promotion. The implemented registry itself begins Operationally Ready after deployment and Product Owner acceptance; external beta evidence remains required for any later Commercially Ready decision.
