# Product Maturity Signoff Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three Important Final Repair L bypasses by enforcing canonical route symbols, exact verifier-only route access contracts, and safe static helper-return transform evaluation.

**Architecture:** Extend the existing TypeScript Program verifier rather than changing App runtime behavior. A checker-backed route-symbol contract validates direct imports and AST references; a complete access-contract map validates static `productRoute` options; and the strict typed copy evaluator follows safe local/imported helper returns under existing budgets.

**Tech Stack:** Node.js ESM, TypeScript Compiler API, Jest through `react-scripts`, React/TypeScript fixture sources.

## Global Constraints

- The access-contract map is verifier-only validation metadata, not runtime permission authority, entitlement authority, or maturity metadata.
- Do not change App routes, runtime roles, runtime entitlements, feature gates, providers, tenant logic, or maturity behavior.
- Canonical dependencies require exact direct imports; aliases, namespaces, barrels, wrappers, re-exports, and same-name unrelated symbols fail.
- `productRoute` options must remain direct static object literals with exact ordered roles and exact entitlement, with no spreads, dynamic objects, missing fields, or extra fields.
- Static copy analysis must not execute application code, callbacks, regular expressions, constructors, or getters.
- Preserve the 256-candidate, 32-depth, 4096-node, and 1024-symbol visible-copy budgets.
- Do not push or deploy.

---

### Task 1: Canonical Route Symbol Provenance

**Files:**
- Modify: `src/__tests__/productMaturityBoundary.test.tsx`
- Modify: `scripts/verifyProductMaturityRegistry.mjs`

**Interfaces:**
- Consumes: the one production TypeScript Program and `App.tsx` source already created by `verifyProductMaturityRegistry`.
- Produces: canonical symbol/import metadata passed into `discoverReactRouterPaths`, plus exact symbol predicates used by composition checks.

- [ ] **Step 1: Write failing symbol-provenance fixtures**

Add real verifier fixtures that mutate `App.tsx` or `AuthorisedProductRoute.tsx` while preserving the same JSX spelling, including:

```tsx
const ProductRouteSurface = ({ children }: { children: React.ReactNode }) => <>{children}</>;
```

and direct-import replacements such as:

```tsx
import ProtectedRoute from './components/RouteFixtureNoop';
```

Cover `ProtectedRoute`, `PlatformProtectedRoute`, `ProductRouteSurface`, `Layout`, the `productRoute` helper call symbol, and the `ProductMaturitySurface` dependency. Assert the canonical-import/symbol verifier diagnostic.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
CI=true npm test -- --watchAll=false --runInBand src/__tests__/productMaturityBoundary.test.tsx --verbose=false -t "canonical route symbol"
```

Expected: each new mutation is accepted by the current name-only verifier, so the tests fail with verifier status `0` instead of `1`.

- [ ] **Step 3: Implement canonical declarations and exact imports**

Add checker helpers that locate the canonical declarations, compare aliases to canonical symbols only when validating import provenance, and require these exact direct imports:

```text
App.tsx:
  ./components/ProtectedRoute default ProtectedRoute
  ./components/PlatformProtectedRoute default PlatformProtectedRoute
  ./components/Layout default Layout
  ./components/productMaturity/AuthorisedProductRoute named AuthorisedProductRoute, ProductRouteSurface

AuthorisedProductRoute.tsx:
  ../ProtectedRoute default ProtectedRoute
  ./ProductMaturitySurface named ProductMaturitySurface
```

Require exact canonical JSX symbols in every existing composition predicate. Capture the single local `productRoute` declaration symbol and require each organisation call expression to reference that exact symbol. Reject alternate imports, aliases, barrels, same-name declarations, and non-approved canonical-module exports.

- [ ] **Step 4: Run focused tests and baseline verifier for GREEN**

Run the focused command from Step 2, then:

```bash
node scripts/verifyProductMaturityRegistry.mjs
```

Expected: all provenance fixtures pass and the production verifier reports 53 App routes with zero customer-facing Legacy violations.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/verifyProductMaturityRegistry.mjs src/__tests__/productMaturityBoundary.test.tsx
git commit -m "FIX: enforce canonical route symbols"
```

---

### Task 2: Exact Per-Route Access Contracts

**Files:**
- Modify: `src/__tests__/productMaturityBoundary.test.tsx`
- Modify: `scripts/verifyProductMaturityRegistry.mjs`

**Interfaces:**
- Consumes: approved route paths, route AST records, and canonical `productRoute`/`missionOperatorRoles` symbols from Task 1.
- Produces: a verifier-only `routeAccessContracts` map and an exact static options validator.

- [ ] **Step 1: Write failing access-contract fixtures**

Add fixtures for these exact mutations:

```tsx
productRoute(<QuoteList />)
productRoute(<AskFTF />, { allowedRoles: ['admin', 'contractor'] })
productRoute(<QuoteList />, { allowedRoles: ['contractor', 'admin'] })
productRoute(<QuoteList />, quoteRouteOptions)
```

Also cover an extra option property and a default-auth route changed from one argument to `{}`. Assert an `exact route access contract` failure.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
CI=true npm test -- --watchAll=false --runInBand src/__tests__/productMaturityBoundary.test.tsx --verbose=false -t "route access contract"
```

Expected: current verification accepts the mutations, so every new test fails with verifier status `0`.

- [ ] **Step 3: Implement complete verifier-only metadata and static AST validation**

Define one map entry for all 53 reachable paths. Public and platform paths record access class. Organisation entries record literal expected values such as:

```js
['/quotes', { kind: 'organisation', allowedRoles: ['admin', 'contractor'], requiredEntitlement: null }]
['/ask-ftf', { kind: 'organisation', allowedRoles: ['admin', 'contractor'], requiredEntitlement: 'legacyAskFtf' }]
['/', { kind: 'organisation', allowedRoles: null, requiredEntitlement: null }]
```

Prove exact key equality with the reachable manifest. For default contracts require exactly one helper argument. For restricted contracts require a direct object literal, reject spreads/computed/shorthand/method/extra properties, statically resolve ordered role arrays including the exact direct `missionOperatorRoles` import, and compare entitlement literals exactly.

- [ ] **Step 4: Run focused tests and baseline verifier for GREEN**

Run the focused command from Step 2 and the production verifier. Expected: access mutations fail for the intended diagnostic and unchanged App access contracts pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add scripts/verifyProductMaturityRegistry.mjs src/__tests__/productMaturityBoundary.test.tsx
git commit -m "FIX: lock route access contracts"
```

---

### Task 3: Strict Static Helper-Return Transforms

**Files:**
- Modify: `src/__tests__/productMaturityBoundary.test.tsx`
- Modify: `scripts/verifyProductMaturityRegistry.mjs`

**Interfaces:**
- Consumes: `resolveStaticTransformValues`, the checker, typed static values, function return discovery, binding/cycle state, and visible-copy budgets.
- Produces: safe typed resolution of local/imported helper `CallExpression` results for static transform receivers.

- [ ] **Step 1: Write failing helper-return fixtures**

Add local and imported static helper fixtures such as:

```tsx
const hiddenCopy = () => 'LeXacy';
export const fixture = <span>{hiddenCopy().replace('X', 'g')}</span>;
```

Add recognized helpers whose return contains a regex, callback, or dynamic search/replacement and assert fail-closed. Add passing controls for a helper returning non-Legacy static copy and an arbitrary dynamic runtime receiver.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
CI=true npm test -- --watchAll=false --runInBand src/__tests__/productMaturityBoundary.test.tsx --verbose=false -t "helper-return transform"
```

Expected: static Legacy helper receivers and helper-hidden unresolved transforms are accepted by the current verifier, making the new rejection tests fail.

- [ ] **Step 3: Implement safe strict helper-call resolution**

Within the strict typed resolver, recognize direct identifier/property helper calls whose checker symbol resolves to a local or imported function body. Require exact identifier parameters and fully resolved typed arguments, create scoped typed bindings, resolve all return expressions recursively, and require all discovered declarations/returns to resolve. Preserve path-local symbol cycles and all budgets. Throw the existing rendered-string-transform fail-closed diagnostic when a recognized static-provenance helper cannot be resolved safely.

- [ ] **Step 4: Run focused tests and baseline verifier for GREEN**

Run the focused command from Step 2 and the production verifier. Expected: static helper results are modeled, unsupported helper-hidden transforms fail without execution, and current dynamic UI still passes.

- [ ] **Step 5: Commit Task 3**

```bash
git add scripts/verifyProductMaturityRegistry.mjs src/__tests__/productMaturityBoundary.test.tsx
git commit -m "FIX: resolve static helper transform inputs"
```

---

### Task 4: Governance, Repair Report, and Final Verification

**Files:**
- Modify: `docs/product-maturity-registry.md`
- Modify: `.superpowers/sdd/2026-08-08-product-maturity-registry/final-repair-l-report.md`

**Interfaces:**
- Consumes: final verifier behavior and fresh command output from Tasks 1–3.
- Produces: durable governance wording, updated Repair L evidence, and a clean committed worktree.

- [ ] **Step 1: Update governance and report**

Document checker-resolved canonical imports/symbols, the validation-only nature of the access map, exact static options requirements, and safe helper-return transform resolution. Update the test count and verification evidence only after fresh runs.

- [ ] **Step 2: Run the complete verification gate**

Run:

```bash
node --check scripts/verifyProductMaturityRegistry.mjs
node scripts/verifyProductMaturityRegistry.mjs
CI=true npm test -- --watchAll=false --runInBand src/__tests__/productMaturityBoundary.test.tsx --verbose=false
npm run build
git diff --check
```

Expected: syntax and verifier exit `0`; one boundary suite with every test passing; build exit `0` with only pre-existing warnings; diff check exit `0`.

- [ ] **Step 3: Audit scope and commit documentation**

Confirm no runtime App/permission file changed and stage only the governance document plus forced-add ignored Repair L report:

```bash
git add docs/product-maturity-registry.md
git add -f .superpowers/sdd/2026-08-08-product-maturity-registry/final-repair-l-report.md
git commit -m "DOCS: record Repair L review closure"
```

- [ ] **Step 4: Confirm final repository state**

Run `git status --short`, `git log -5 --oneline`, and `git rev-parse HEAD`. Expected: clean worktree and local commits only; do not push or deploy.
