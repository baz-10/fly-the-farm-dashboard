# Final Repair Package L: Route Composition and Static String Transforms

## Status

The initial two final-signoff findings, the subsequent Critical/two-Important findings, the Critical/Important second-pass findings, the final external-rereview findings, and the nested helper-factory follow-up were repaired locally from `71f8332eab9eb01e67241a2130c78a0ed5824875`. No runtime route, permission, entitlement, tenant, feature-gate, resolver, or persistence behaviour was changed. No push or deployment was performed.

## Commit

- Base: `71f8332eab9eb01e67241a2130c78a0ed5824875` — `FIX: unwrap rendered method references`
- Initial Repair L: `9bf9f729f5cc29d5b8a6331acb0e1e7def4b795c` — `FIX: harden maturity signoff gates`
- Review design and plan: `3904e1f` and `b5a7d67`
- Canonical route symbols: `781948a`
- Exact route access contracts: `14b4646`
- Static helper transform inputs: `8266d66`
- First review closure: `dba2dba`
- External-rereview design and plan: `749253d`
- Nested helper-factory design and plan: `6987dee`
- Nested helper-factory closure: the commit containing this updated report.

## Route Composition Gate

- Route discovery remains TypeScript-AST based and keeps exact, duplicate-sensitive equality with `REACHABLE_PRODUCT_ROUTES`.
- Public authentication lifecycle routes require their exact public components; Register and Customer Acceptance require `ProductRouteSurface`.
- The platform structural route requires `PlatformProtectedRoute` outside `ProductRouteSurface`, with `/platform` beneath that layout.
- Organisation product routes require direct `productRoute(...)` calls beneath the exact `ProtectedRoute` and `WorkflowProviders` structural layout.
- The App `productRoute` helper and canonical `AuthorisedProductRoute`/`ProductRouteSurface` definitions are audited so `ProtectedRoute` remains outside maturity presentation.
- The TypeScript checker resolves canonical declarations and exact direct-import symbols across App, `AuthorisedProductRoute`, and `ProductMaturitySurface`. Same-name no-ops, shadowed helper calls, aliases, barrels, wrappers, alternate imports, weakened canonical maturity implementations, and replaced maturity-resolver dependencies fail.
- The canonical `ProductMaturitySurface` body is audited as an exact six-stage top-level flow: resolver assignment and guarded path-error fallback, unclassified children, ready children/context, coming-soon workspace, and beta badge/children. Required symbol references hidden in dead or nested code fail, and the path-error Alert must retain its exact static unavailable copy without rendering route children.
- A reviewed verifier-only SHA-256 covers the complete canonical `surfaces.ts` source. Resolver or manifest implementation changes now require an intentional metadata update in the same review; runtime maturity authority remains in `surfaces.ts` and the registry.
- A complete 53-path verifier-only access-contract map checks each route's access class, exact ordered roles, exact entitlement, and default-auth policy. It is validation metadata only, not runtime permission authority, entitlement authority, or maturity metadata.
- A separate complete 53-path verifier-only destination map resolves the exact canonical source/export and direct App import for every public, platform, and organisation leaf. The checker also validates the canonical platform shell, local provider symbol, and exact Operational Feature Gate/Spray Import chain. Path swaps, same-name alternates, component aliases, dynamic leaves, and extra wrappers fail; App remains runtime routing authority.
- Canonical destination modules must retain their approved in-file default-export declaration shape; direct re-exports and local/imported component aliases fail provenance checks.
- The actual `App` return is bound to one direct canonical `BrowserRouter` whose only significant child is one direct canonical `Routes` tree. Only canonical `Route` nodes and JSX fragments may form that tree, and discovery is limited to it. Program-wide React Router provenance rejects route-component aliases, namespaces, re-exports, underlying-package imports, dynamic/CommonJS acquisition, and alternate route-building APIs such as `useRoutes`.
- Audited leaf `Route` nodes must be self-closing and contain exactly `path` plus `element`; structural `Route` nodes contain exactly `element`. Competing `Component`, `lazy`, `children`, error-boundary, or future alternate render props cannot override the checked composition.
- Restricted organisation leaves require a direct static options object with exact properties; dynamic objects, dynamic role values, spreads, computed/shorthand/method/extra properties, reordered or changed roles, removed entitlements, and changed helper defaults fail.
- Bare destinations, guard-only, maturity-only, reversed guard/maturity order, direct equivalent wrappers, weakened helpers, weakened canonical wrappers, and unsupported pathless layouts fail closed.
- Existing public lifecycle, role sets, delegated support, the `legacyAskFtf` entitlement, operational feature gates, provider nesting, and nested JSX-fragment route discovery remain unchanged.

## Static String Transform Gate

- Visible-copy resolution now evaluates fully static string `replace` and `replaceAll` calls, including property or static element access and supported static call chains.
- The evaluator distinguishes first-match `replace` from all-match `replaceAll` and models literal replacement tokens without executing application code.
- Dynamic searches, dynamic replacements, callbacks, and regular expressions on a fully static rendered receiver fail closed. Regex and callbacks are never executed.
- Strict typed receiver resolution follows safe local and imported helper calls, binds fully static arguments to identifier parameters, and resolves all return expressions. Legacy-producing helper results are evaluated, while helper-hidden regex, callback, dynamic-search, and dynamic-return paths fail closed without execution.
- Function provenance follows local, imported, property, shorthand-property, destructured-property, re-exported, conditional-alternative, and statically indexed array aliases recursively under the existing cycle and resource budgets. All conditional function/array alternatives are retained, canonical non-negative static indexes select their exact element, and dynamic/non-canonical/out-of-range/spread-backed indexes or unresolved alternatives fail closed; typed string-array helper arguments flow through the same binding-aware resolver into `join`.
- Function-valued helper calls are resolved structurally as nested factories. Each returned function carries its AST declaration and path-local static closure bindings, so multiple factory calls retain fully static arguments without executing code; declaration-only factories, dynamic arguments, unsupported parameters/arity, non-function returns, missing returns, and cycles fail closed.
- Partially resolved dynamic receivers are not promoted from isolated fallback fragments, preserving existing safe UI transformations while retaining conservative argument scanning.
- Existing typed string/string-array `join` and `concat` coercion, wrapper unwrapping, path-local cycles, and the 256-candidate, 32-depth, 4096-node, and 1024-symbol budgets remain in force.

## TDD Evidence

- Nine initial route fixtures passed incorrectly against the path-only scanner: bare, guard-only, maturity-only, reversed, and direct-equivalent `/quotes` elements; missing Register maturity; wrapped Login lifecycle; reversed platform order; and a reversed organisation layout.
- Two deeper route fixtures then passed incorrectly with helper/canonical validation removed, proving a weakened `productRoute` helper or reversed canonical `AuthorisedProductRoute` could bypass leaf-only checks.
- Eight transform fixtures passed incorrectly before implementation: four Legacy-producing literal/property/element/chained transforms and four unresolved dynamic, regex, or callback transforms. A ninth red transform fixture then proved that static receiver/search/replacement values passed through helper parameters also required the typed binding map. A final red self-audit fixture closed an unresolved static nested-transform chain without misclassifying existing dynamic UI receivers.
- Focused green runs covered the exact current repository, nested-fragment route discovery, unknown-route manifest diagnostics, all route-composition mutations, five Legacy-producing transforms, five false-positive controls, and five transform fail-closed controls.
- Review follow-up provenance TDD first proved eight same-name, shadowing, dependency-replacement, and no-op canonical mutations passed incorrectly. Focused coverage now includes eleven canonical-symbol/import cases spanning aliases, barrels, wrappers, the maturity resolver/body, and mission-role provenance.
- Access-contract TDD proved eight leaf mutations and one altered helper default passed incorrectly before implementation. Focused coverage now includes exact `/quotes` roles, `/ask-ftf` entitlement, role ordering, dynamic/spread/extra options, default-auth calls, complete route metadata, and canonical mission roles.
- Helper-return TDD proved seven prohibited or unresolved local/imported helper cases were accepted and one legitimate Legacy-removal result was rejected before implementation. Focused coverage now spans local functions, parameter bindings, imported helpers, nested `join`, regex, callbacks, dynamic searches/returns, safe transformations, and direct dynamic-receiver controls.
- Independent re-review first reproduced dead-code-only maturity references, local/imported/cyclic function-alias escapes, and rejected static string-array helper inputs. Follow-up fixtures now cover exact top-level maturity control/data flow; local, imported, explicit-property, shorthand-property, destructured-property, re-exported, and cyclic aliases; and both Legacy-producing and safe typed-array inputs. Later passes proved and closed an error-Alert `{children}` exposure, the shorthand-value-symbol regression, and the destructured binding-element alias bypass.
- External-rereview TDD proved that an unchanged resolver declaration could return `null`, nine canonical destination mutations passed through text-only checks, conditional aliases discarded a Legacy/unresolved branch, and static array indexes failed closed without modeling even safe or Legacy-producing selected functions. Focused coverage now includes the resolver integrity mutation; `/jobs` path swaps; alternate/re-exported/locally aliased Login, Platform Shell, and Platform Admin modules; dynamic/wrapped destinations; gated leaf swaps; safe/prohibited conditional function and array alternatives; safe/prohibited static indexes; and dynamic, unresolved, spread-backed, non-canonical, and out-of-range fail-closed controls. Independent adversarial review then reproduced React Router `Component`/`lazy` override props, local/imported/CommonJS/underlying-package Route aliases, a parallel `useRoutes` channel, and the non-canonical `['01']` index collapse. Each was watched RED before exact router-tree/attribute/provenance contracts and the canonical index parser closed them.
- Nested helper-factory TDD proved that the exact `makeHelper()().replace(...)` receiver, a multi-level factory retaining a static argument, a declaration-only factory, a dynamic factory argument, and a cyclic factory all passed incorrectly before implementation; the clean static factory control passed throughout. Focused green coverage now detects both Legacy-producing factory shapes, preserves the clean result, and fails closed on every unresolved, dynamic, or cyclic factory without execution. Independent review then reproduced a false cycle when one clean conditional factory alternative called its sibling: merged provenance symbols contaminated both alternative paths. Clean and Legacy sibling fixtures were watched RED before per-descriptor ancestry restored path-local cycles; clean, Legacy, and unresolved sibling controls then passed, and re-review reported no Critical, Important, or Minor findings.

## Verification

- Verifier passed: 46 modules, 12 workflows, 53 App routes, 148 customer UI sources, 64 evidence references, and zero customer-facing violations.
- Complete boundary suite passed all 227 tests in 488.075 seconds.
- Production build completed successfully with the repository's existing Browserslist, lint, hook-dependency, and bundle-size warnings only.
- `git diff --check` passed; the scoped review closure contains only the verifier, boundary fixtures, governance/design/plan documentation, and this report. No runtime App or permission file changed.
- No push or deployment was performed.
