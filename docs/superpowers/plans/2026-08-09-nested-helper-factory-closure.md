# Nested Helper Factory Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the rendered-transform bypass for nested static helper factories while preserving AST-only evaluation and fail-closed behavior.

**Architecture:** Extend helper provenance so a resolved function carries its function-like AST node plus path-local closure bindings. When an alias expression is a call, resolve all statically known callee alternatives, bind fully static arguments, recursively resolve every factory return as a function alias, and mark any unsupported alternative unresolved.

**Tech Stack:** Node.js ESM, TypeScript compiler API, Jest fixture repositories, React JSX AST.

## Global Constraints

- Never execute JavaScript, helper functions, conditions, callbacks, getters, constructors, or application code.
- Preserve the 256-candidate, 32-depth, 4096-node, and 1024-symbol budgets plus path-local cycle handling.
- Every recognized factory alternative and every return expression must resolve; otherwise fail closed with `visible-string rendered string transform could not be resolved safely.`
- Do not modify runtime routes, guards, roles, permissions, entitlements, providers, maturity registry data, or runtime resolver behavior.
- Do not push or deploy.

---

### Task 1: Reproduce Nested Factory Outcomes

**Files:**
- Test: `src/__tests__/productMaturityBoundary.test.tsx`

**Interfaces:**
- Consumes: `withTemporaryFixture`, `fixturePath`, `expectVerifierFailure`, and `expectVerifierSuccess`.
- Produces: real-verifier fixtures covering prohibited, safe, unresolved, dynamic-argument, and cyclic factory receivers.

- [ ] **Step 1: Add the exact prohibited nested-factory fixture**

Append a local factory and rendered transform to `src/pages/ClientDetail.tsx` in a copied repository:

```tsx
const repairMakeHelper = () => () => 'LeXacy';
export const repairFactoryFixture = (
  <span>{repairMakeHelper()().replace('X', 'g')}</span>
);
```

Assert `expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot)`.

- [ ] **Step 2: Add static-argument and safe controls**

Use a factory whose returned function closes over an identifier parameter:

```tsx
const repairMakeBoundHelper = (value: string) => () => value;
```

Assert `repairMakeBoundHelper('LeXacy')().replace('X', 'g')` detects Legacy, while `repairMakeBoundHelper('Current')().replace('x', 'x')` passes.

- [ ] **Step 3: Add fail-closed controls**

Add independent fixtures for a declaration-only factory, a factory invoked with a declared dynamic string argument, and a recursively returning factory. Assert each contains `rendered string transform could not be resolved safely`.

- [ ] **Step 4: Run the focused tests for RED**

Run:

```bash
npm test -- --runInBand src/__tests__/productMaturityBoundary.test.tsx -t 'nested helper factory|static argument helper factory|unresolved helper factory|dynamic helper factory|cyclic helper factory'
```

Expected: prohibited and fail-closed fixtures fail because the verifier exits `0`; the safe control passes.

---

### Task 2: Resolve Function-Valued Factory Returns

**Files:**
- Modify: `scripts/verifyProductMaturityRegistry.mjs`
- Test: `src/__tests__/productMaturityBoundary.test.tsx`

**Interfaces:**
- Consumes: `resolveHelperAliasExpression`, `resolveHelperFunctionDeclarations`, `resolveStaticTransformValues`, `functionReturnExpressions`, and the existing visible-string budgets/state.
- Produces: helper alternatives shaped as `{ declaration, bindings }` and bounded `CallExpression` factory-return resolution.

- [ ] **Step 1: Preserve closure bindings on direct and aliased functions**

Change helper-resolution `functions` entries from raw function nodes to descriptors:

```js
{ declaration: functionLikeNode, bindings: new Map(inheritedBindings) }
```

Thread inherited bindings through alias-expression, alias-symbol, conditional, and array resolution without changing their recognized/unresolved merge semantics.

- [ ] **Step 2: Resolve a helper-alias `CallExpression` structurally**

For a call candidate, resolve its callee through `resolveHelperAliasExpression`. Require every callee alternative to have exact arity and simple identifier parameters, and resolve every argument with `resolveStaticTransformValues` using the alternative's closure bindings. Add parameter symbols to a cloned binding map, add callee symbols to the path-local symbol set, extract every return with `functionReturnExpressions`, and recursively resolve each return using the bound map.

- [ ] **Step 3: Fail closed on incomplete factory provenance**

Return `unresolvedHelperAlias(...)` when the callee is attributable but unresolved, any argument is dynamic, any parameter/arity is unsupported, a factory has no return expression, a return is not a resolvable function alias, or a factory cycle is encountered. Preserve recognized arbitrary non-helper calls as outside static helper provenance.

- [ ] **Step 4: Consume closure-aware helper descriptors**

In `resolveStaticTransformValues`, use each descriptor's `declaration` and clone its `bindings` before binding the final helper call's arguments. Keep return evaluation and all current transform diagnostics unchanged.

- [ ] **Step 5: Run focused tests for GREEN**

Run the Task 1 command. Expected: all new prohibited, safe, and fail-closed outcomes pass.

- [ ] **Step 6: Run helper-provenance regression tests**

Run:

```bash
npm test -- --runInBand src/__tests__/productMaturityBoundary.test.tsx -t 'helper-return transform|helper-function alias|indexed helper|conditional helper|helper factory'
```

Expected: all matching tests pass with zero failures.

---

### Task 3: Document and Verify the Closure

**Files:**
- Modify: `docs/product-maturity-registry.md`
- Modify: `.superpowers/sdd/2026-08-08-product-maturity-registry/final-repair-l-report.md`

**Interfaces:**
- Consumes: final implementation and fresh command output.
- Produces: accurate governance wording, Repair L TDD/verification evidence, and one scoped local repair commit.

- [ ] **Step 1: Update governance and Repair L evidence**

Document AST-only function-valued factory returns, closure bindings, recursive nesting, and fail-closed dynamic/unresolved/cyclic cases. Record RED behavior and only fresh final counts/timings.

- [ ] **Step 2: Run syntax and production verifier checks**

Run:

```bash
node --check scripts/verifyProductMaturityRegistry.mjs
node scripts/verifyProductMaturityRegistry.mjs
```

Expected: syntax exits `0`; verifier reports zero customer-facing violations.

- [ ] **Step 3: Run the complete boundary suite**

Run:

```bash
npm test -- --runInBand src/__tests__/productMaturityBoundary.test.tsx
```

Expected: all boundary tests pass; copy the exact count and elapsed time into the report.

- [ ] **Step 4: Run the production build and diff checks**

Run:

```bash
npm run build
git diff --check
git status --short
```

Expected: build exits `0` with only known warnings, diff check exits `0`, and only the verifier, boundary fixtures, approved documentation, plan/spec, and report are modified.

- [ ] **Step 5: Commit locally**

```bash
git add scripts/verifyProductMaturityRegistry.mjs src/__tests__/productMaturityBoundary.test.tsx docs/product-maturity-registry.md docs/superpowers/specs/2026-08-09-product-maturity-signoff-hardening-design.md docs/superpowers/plans/2026-08-09-nested-helper-factory-closure.md .superpowers/sdd/2026-08-08-product-maturity-registry/final-repair-l-report.md
git commit -m "FIX: close nested helper factory bypass"
```

Report the local commit hash and do not push or deploy.
