# Product Maturity Signoff Hardening Design

## Context

Final Repair L made App route validation composition-aware and added static `replace`/`replaceAll` modeling. Review identified three remaining bypass classes: composition tags were matched by spelling instead of canonical TypeScript symbols, product-route options were not checked against route-specific access contracts, and static transform receivers stopped at helper calls.

## Goals

- Require the approved canonical guard, layout, and maturity symbols throughout the App route chain.
- Preserve every current route's exact role and entitlement contract through verifier-only validation metadata.
- Resolve fully static local or imported helper return values when they feed rendered string transforms.
- Fail closed on unsupported static helper-backed transforms without executing application code.
- Preserve all runtime routes, permissions, entitlements, maturity behavior, feature gates, and providers.

## Canonical Symbol Governance

The verifier will build canonical TypeScript symbols from their declaration modules for `ProtectedRoute`, `PlatformProtectedRoute`, `Layout`, `AuthorisedProductRoute`, `ProductRouteSurface`, and `ProductMaturitySurface`. It will validate exact direct imports at each approved boundary:

- `App.tsx` imports the three default components directly from their component modules and the two named route-surface components directly from `AuthorisedProductRoute.tsx`.
- `AuthorisedProductRoute.tsx` imports `ProtectedRoute` directly and imports `ProductMaturitySurface` directly from its canonical module.
- The canonical route-surface module exports exactly `AuthorisedProductRoute` and `ProductRouteSurface`; their validated JSX references resolve to the corresponding canonical symbols.

Aliases, namespaces, barrels, re-exports, same-name local declarations, alternate wrappers, and unrelated same-name imports will fail. The App `productRoute` declaration will be resolved as a local symbol, and every organisation leaf must call that exact helper symbol. Existing component-shape checks remain in force after symbol validation.

## Route Access Contracts

A repository-controlled map in `scripts/verifyProductMaturityRegistry.mjs` will contain one validation entry for every reachable App route. This map is validation metadata only: it is not runtime permission authority, entitlement authority, or maturity metadata.

Public and platform entries record their access class. Each organisation entry records its exact ordered `allowedRoles` value and exact `requiredEntitlement`, using `null` to mean the existing default authenticated contract. The verifier will prove exact key equality between this map and the reachable route manifest.

Organisation routes using default authentication must call `productRoute` with one argument. Restricted routes must pass a direct object literal as the second argument. Spreads, computed keys, methods, shorthand properties, missing properties, extra properties, dynamic option objects, nonliteral entitlements, or changed role values/order will fail. Literal role arrays are read directly. `missionOperatorRoles` is accepted only through its exact direct canonical import and is resolved as a static string array before comparison. No App route or runtime permission declaration will change.

## Static Helper-Return Transforms

Strict typed static-value resolution will add safe helper-call handling alongside the existing method-call handling. For a local or imported helper symbol with a function body and matching identifier parameters, all arguments must first resolve to bounded typed static values. Those values are bound to the function parameters, and every reachable return expression is resolved recursively through the same strict evaluator.

The resolver will preserve the existing depth, node, symbol, candidate, and cycle budgets. It will not invoke JavaScript, callbacks, getters, constructors, or application functions. A fully static helper result can therefore feed `replace`/`replaceAll` and expose assembled prohibited copy. If a recognized helper result with static provenance contains or feeds a regex, callback, dynamic search/replacement, or otherwise unresolved static transform, the rendered expression fails closed. Arbitrary runtime receivers that were already treated as dynamic remain outside static transform evaluation.

## Error Handling and Diagnostics

Verifier failures will identify whether the rejected boundary is a canonical import/symbol convention, an exact route access contract, or an unresolved rendered transform. Manifest mismatch remains the primary diagnostic for unknown route paths. All failures remain release-gate failures only and do not mutate runtime state.

## Test Strategy

Fixtures will run the real verifier against copied repositories and prove red before implementation. Canonical-symbol fixtures will replace approved imports with same-name no-op modules, aliases, barrels, or local wrappers. Access fixtures will remove `/quotes` options, remove the `/ask-ftf` entitlement, change role values/order, and replace a direct options literal with a dynamic identifier. Transform fixtures will cover local and imported helpers returning static Legacy-producing input and helper-hidden regex, callback, or dynamic transforms, plus non-Legacy and existing dynamic-receiver controls.

After focused red/green cycles, completion requires the registry verifier, the complete boundary suite, the production build, syntax validation, and staged-diff checks. The Final Repair L report and governance documentation will record the stricter guarantees and final evidence. No push or deployment is included.
