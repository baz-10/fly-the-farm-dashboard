# Final Repair Package L: Route Composition and Static String Transforms

## Status

Both final signoff findings were repaired locally from `71f8332eab9eb01e67241a2130c78a0ed5824875`. No runtime route, permission, entitlement, tenant, feature-gate, or persistence behaviour was changed. No push or deployment was performed.

## Commit

- Base: `71f8332eab9eb01e67241a2130c78a0ed5824875` — `FIX: unwrap rendered method references`
- Repair L: the commit containing this report.

## Route Composition Gate

- Route discovery remains TypeScript-AST based and keeps exact, duplicate-sensitive equality with `REACHABLE_PRODUCT_ROUTES`.
- Public authentication lifecycle routes require their exact public components; Register and Customer Acceptance require `ProductRouteSurface`.
- The platform structural route requires `PlatformProtectedRoute` outside `ProductRouteSurface`, with `/platform` beneath that layout.
- Organisation product routes require direct `productRoute(...)` calls beneath the exact `ProtectedRoute` and `WorkflowProviders` structural layout.
- The App `productRoute` helper and canonical `AuthorisedProductRoute`/`ProductRouteSurface` definitions are audited so `ProtectedRoute` remains outside maturity presentation.
- Bare destinations, guard-only, maturity-only, reversed guard/maturity order, direct equivalent wrappers, weakened helpers, weakened canonical wrappers, and unsupported pathless layouts fail closed.
- Existing public lifecycle, role sets, delegated support, the `legacyAskFtf` entitlement, operational feature gates, provider nesting, and nested JSX-fragment route discovery remain unchanged.

## Static String Transform Gate

- Visible-copy resolution now evaluates fully static string `replace` and `replaceAll` calls, including property or static element access and supported static call chains.
- The evaluator distinguishes first-match `replace` from all-match `replaceAll` and models literal replacement tokens without executing application code.
- Dynamic searches, dynamic replacements, callbacks, and regular expressions on a fully static rendered receiver fail closed. Regex and callbacks are never executed.
- Partially resolved dynamic receivers are not promoted from isolated fallback fragments, preserving existing safe UI transformations while retaining conservative argument scanning.
- Existing typed string/string-array `join` and `concat` coercion, wrapper unwrapping, path-local cycles, and the 256-candidate, 32-depth, 4096-node, and 1024-symbol budgets remain in force.

## TDD Evidence

- Nine initial route fixtures passed incorrectly against the path-only scanner: bare, guard-only, maturity-only, reversed, and direct-equivalent `/quotes` elements; missing Register maturity; wrapped Login lifecycle; reversed platform order; and a reversed organisation layout.
- Two deeper route fixtures then passed incorrectly with helper/canonical validation removed, proving a weakened `productRoute` helper or reversed canonical `AuthorisedProductRoute` could bypass leaf-only checks.
- Eight transform fixtures passed incorrectly before implementation: four Legacy-producing literal/property/element/chained transforms and four unresolved dynamic, regex, or callback transforms. A ninth red transform fixture then proved that static receiver/search/replacement values passed through helper parameters also required the typed binding map. A final red self-audit fixture closed an unresolved static nested-transform chain without misclassifying existing dynamic UI receivers.
- Focused green runs covered the exact current repository, nested-fragment route discovery, unknown-route manifest diagnostics, all route-composition mutations, five Legacy-producing transforms, five false-positive controls, and five transform fail-closed controls.

## Verification

- Verifier passed: 46 modules, 12 workflows, 53 App routes, 148 customer UI sources, 64 evidence references, and zero customer-facing violations.
- Complete boundary suite passed all 138 tests.
- Production build completed successfully with the repository's existing Browserslist, lint, hook-dependency, and bundle-size warnings only.
- `git diff --check` passed; the scoped change contains only the verifier, boundary fixtures, governance documentation, and this report.
- No push or deployment was performed.
