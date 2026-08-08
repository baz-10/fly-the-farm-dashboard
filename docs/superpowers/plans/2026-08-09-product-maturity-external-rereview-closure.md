# Product Maturity External Rereview Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the resolver-integrity, canonical-route-destination, and conditional/array helper-alias bypasses without changing runtime routes, permissions, or maturity behavior.

**Architecture:** Extend the existing verifier-only contracts with a reviewed SHA-256 of the complete canonical resolver source and an exact 53-route canonical destination map resolved through the TypeScript checker. Extend strict helper provenance structurally across every conditional alternative and statically selected array element, failing closed on unresolved attributable shapes.

**Tech Stack:** Node.js ESM, `node:crypto`, TypeScript compiler API, Jest fixture repositories, React JSX AST.

## Global Constraints

- Validation metadata never becomes runtime permission, entitlement, destination, or maturity authority.
- Do not execute application code, helper functions, conditions, callbacks, getters, or constructors.
- Preserve the 256-candidate, 32-depth, 4096-node, and 1024-symbol budgets plus path-local cycle handling.
- Do not modify runtime App routes, roles, permissions, entitlements, providers, or resolver behavior.
- Do not push or deploy.

---

### Task 1: Canonical Resolver Source Integrity

**Files:**
- Modify: `src/__tests__/productMaturityBoundary.test.tsx`
- Modify: `scripts/verifyProductMaturityRegistry.mjs`

**Interfaces:**
- Consumes: `routeManifestSource` already read from the selected verifier root.
- Produces: `assertCanonicalResolverSourceIntegrity(source)` using repository-controlled SHA-256 validation metadata.

- [ ] **Step 1: Write the failing mutation fixture**

Replace the canonical `resolveProductSurface` body in the copied fixture with `return null;` while retaining the declaration and imports. Assert failure containing `canonical product maturity resolver source integrity`.

- [ ] **Step 2: Run the resolver-integrity fixture for RED**

Run the focused boundary test. Expected: verifier exits `0`, proving declaration/import provenance does not protect the resolver body.

- [ ] **Step 3: Implement exact SHA-256 validation**

Import `createHash` from `node:crypto`, record the reviewed digest of the complete canonical source, and compare it with `createHash('sha256').update(source, 'utf8').digest('hex')` before parsing manifests or constructing route symbols.

- [ ] **Step 4: Run the focused fixture and production verifier for GREEN**

Expected: the weakened fixture fails with the integrity diagnostic and the unchanged canonical source verifies.

---

### Task 2: Exact Canonical Route Destinations

**Files:**
- Modify: `src/__tests__/productMaturityBoundary.test.tsx`
- Modify: `scripts/verifyProductMaturityRegistry.mjs`

**Interfaces:**
- Consumes: the TypeScript Program/checker, App source, structural route records, and `routeAccessContracts`.
- Produces: an exact 53-key `routeDestinationContracts` map and checker-resolved destination symbols used at every public/platform/organisation leaf.

- [ ] **Step 1: Write failing destination fixtures**

Add independent fixtures for `/jobs` rendering canonical `QuoteList`, Login imported from a same-name alternate module, `/jobs` rendering a conditional component alias, and `/jobs` inserting an unapproved wrapper around `ClientList`. Add a static control proving the current canonical App remains valid.

- [ ] **Step 2: Run destination fixtures for RED**

Expected: path swap, alternate Login, dynamic alias, and wrapper mutations currently pass or fail with insufficient text-only behavior; record each observed result before implementation.

- [ ] **Step 3: Implement complete destination metadata and symbol validation**

Define all 53 exact path/source/export destinations. Resolve canonical module exports, require direct unaliased App imports for default exports, and compare each actual JSX tag symbol at its approved AST position. Validate local `HomeRoute` and `WorkflowProviders`, canonical `PlatformShell`, public wrapper children, platform leaf, every organisation first argument, and the exact `OperationalFeatureGate`/`SprayRecImport` chain.

- [ ] **Step 4: Prove exact destination-map key equality**

Compare destination keys with the reachable route manifest after duplicate-sensitive route discovery. Missing or extra metadata fails with an explicit validation-only diagnostic.

- [ ] **Step 5: Run focused destination tests and production verifier for GREEN**

Expected: every mutation fails for the canonical destination diagnostic and all 53 unchanged destinations pass.

---

### Task 3: Conditional and Array Helper Aliases

**Files:**
- Modify: `src/__tests__/productMaturityBoundary.test.tsx`
- Modify: `scripts/verifyProductMaturityRegistry.mjs`

**Interfaces:**
- Consumes: `resolveHelperFunctionDeclarations`, strict transform bindings, checker symbols, and visible-copy budgets.
- Produces: structural alias-expression resolution across conditional alternatives and statically indexed array elements.

- [ ] **Step 1: Write failing alias fixtures**

Add Legacy-producing and safe conditional alternatives, Legacy-producing and safe static array indexes, a conditional with an unresolved function alternative, a dynamic array index, and an out-of-range index. Every unresolved attributable receiver must assert the existing fail-closed transform diagnostic.

- [ ] **Step 2: Run alias fixtures for RED**

Expected: prohibited/dynamic cases exit `0` because conditional and array initializers are discarded as arbitrary runtime provenance.

- [ ] **Step 3: Implement structural alias-expression resolution**

Resolve direct function expressions, identifier/property aliases, both conditional branches, and element access into array literals or array-valued aliases with a static integer index. Merge all conditional function alternatives; follow only the selected array element. Mark missing, spread, dynamic-index, unresolved-branch, or unsupported attributable shapes unresolved so rendered transforms fail closed. Preserve all budgets and symbol paths.

- [ ] **Step 4: Run focused alias tests and production verifier for GREEN**

Expected: Legacy alternatives/indexes are detected, safe cases pass, and dynamic/unresolved cases fail without execution.

---

### Task 4: Review, Documentation, and Final Verification

**Files:**
- Modify: `docs/product-maturity-registry.md`
- Modify: `.superpowers/sdd/2026-08-08-product-maturity-registry/final-repair-l-report.md`

**Interfaces:**
- Consumes: final reviewed implementation and fresh verification output.
- Produces: accurate governance wording, Repair L evidence, and a clean local commit.

- [ ] **Step 1: Update governance and Repair L report**

Document digest and destination maps as validation metadata, exact checker provenance, conditional/array fail-closed behavior, TDD history, review verdict, and only fresh test/build evidence.

- [ ] **Step 2: Request independent code review**

Provide the reviewer the three external findings, the implementation diff, and exact fixtures. Fix every Critical or Important finding before proceeding.

- [ ] **Step 3: Run the complete verification gate**

Run `node --check scripts/verifyProductMaturityRegistry.mjs`, the production verifier, the complete boundary suite, `npm run build`, and `git diff --check`. Record exact counts and elapsed time.

- [ ] **Step 4: Audit scope and commit**

Confirm no runtime App/guard/role/permission/resolver file changed. Stage only the verifier, fixtures, approved documentation, and Repair L report; commit locally and report the hash. Do not push or deploy.
