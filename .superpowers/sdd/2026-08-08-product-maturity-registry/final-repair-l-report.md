# Final Repair Package L: Route Composition and Static String Transforms

## Status

The initial two final-signoff findings, the subsequent Critical/two-Important review findings, and the Critical/Important second-pass findings were repaired locally from `71f8332eab9eb01e67241a2130c78a0ed5824875`. No runtime route, permission, entitlement, tenant, feature-gate, or persistence behaviour was changed. No push or deployment was performed.

## Commit

- Base: `71f8332eab9eb01e67241a2130c78a0ed5824875` — `FIX: unwrap rendered method references`
- Initial Repair L: `9bf9f729f5cc29d5b8a6331acb0e1e7def4b795c` — `FIX: harden maturity signoff gates`
- Review design and plan: `3904e1f` and `b5a7d67`
- Canonical route symbols: `781948a`
- Exact route access contracts: `14b4646`
- Static helper transform inputs: `8266d66`
- Review closure: the commit containing this updated report.

## Route Composition Gate

- Route discovery remains TypeScript-AST based and keeps exact, duplicate-sensitive equality with `REACHABLE_PRODUCT_ROUTES`.
- Public authentication lifecycle routes require their exact public components; Register and Customer Acceptance require `ProductRouteSurface`.
- The platform structural route requires `PlatformProtectedRoute` outside `ProductRouteSurface`, with `/platform` beneath that layout.
- Organisation product routes require direct `productRoute(...)` calls beneath the exact `ProtectedRoute` and `WorkflowProviders` structural layout.
- The App `productRoute` helper and canonical `AuthorisedProductRoute`/`ProductRouteSurface` definitions are audited so `ProtectedRoute` remains outside maturity presentation.
- The TypeScript checker resolves canonical declarations and exact direct-import symbols across App, `AuthorisedProductRoute`, and `ProductMaturitySurface`. Same-name no-ops, shadowed helper calls, aliases, barrels, wrappers, alternate imports, weakened canonical maturity implementations, and replaced maturity-resolver dependencies fail.
- The canonical `ProductMaturitySurface` body is audited as an exact six-stage top-level flow: resolver assignment and guarded path-error fallback, unclassified children, ready children/context, coming-soon workspace, and beta badge/children. Required symbol references hidden in dead or nested code fail, and the path-error Alert must retain its exact static unavailable copy without rendering route children.
- A complete 53-path verifier-only access-contract map checks each route's access class, exact ordered roles, exact entitlement, and default-auth policy. It is validation metadata only, not runtime permission authority, entitlement authority, or maturity metadata.
- Restricted organisation leaves require a direct static options object with exact properties; dynamic objects, dynamic role values, spreads, computed/shorthand/method/extra properties, reordered or changed roles, removed entitlements, and changed helper defaults fail.
- Bare destinations, guard-only, maturity-only, reversed guard/maturity order, direct equivalent wrappers, weakened helpers, weakened canonical wrappers, and unsupported pathless layouts fail closed.
- Existing public lifecycle, role sets, delegated support, the `legacyAskFtf` entitlement, operational feature gates, provider nesting, and nested JSX-fragment route discovery remain unchanged.

## Static String Transform Gate

- Visible-copy resolution now evaluates fully static string `replace` and `replaceAll` calls, including property or static element access and supported static call chains.
- The evaluator distinguishes first-match `replace` from all-match `replaceAll` and models literal replacement tokens without executing application code.
- Dynamic searches, dynamic replacements, callbacks, and regular expressions on a fully static rendered receiver fail closed. Regex and callbacks are never executed.
- Strict typed receiver resolution follows safe local and imported helper calls, binds fully static arguments to identifier parameters, and resolves all return expressions. Legacy-producing helper results are evaluated, while helper-hidden regex, callback, dynamic-search, and dynamic-return paths fail closed without execution.
- Function provenance follows local, imported, property, shorthand-property, destructured-property, and re-exported aliases recursively under the existing cycle and resource budgets. Cyclic or unresolved aliases fail closed; typed string-array helper arguments flow through the same binding-aware resolver into `join`.
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

## Verification

- Verifier passed: 46 modules, 12 workflows, 53 App routes, 148 customer UI sources, 64 evidence references, and zero customer-facing violations.
- Complete boundary suite passed all 188 tests in 391.496 seconds.
- Production build completed successfully with the repository's existing Browserslist, lint, hook-dependency, and bundle-size warnings only.
- `git diff --check` passed; the scoped review closure contains only the verifier, boundary fixtures, governance/design/plan documentation, and this report. No runtime App or permission file changed.
- No push or deployment was performed.
