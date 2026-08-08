# Final Repair Package K: Route AST and Receiver-Aware Copy Verification

## Status

Bounded reviewer follow-up completed locally. No push or deployment was performed.

## Commit

- Base: `4e4e85ed19c5922b72c5abb872792c4c8a614d60` — `FIX: isolate visible copy resolver state`
- Repair K: the commit containing this report.

## Repairs

- Replaced App route source-text matching with TypeScript AST discovery tied to the `Route` import from `react-router-dom`.
- Reachable route paths accept JSX quoted strings, JSX string-literal expressions, and no-substitution templates. Dynamic expressions, spread attributes, duplicate path attributes, empty paths, and missing reachable leaf paths fail closed. Existing pathless layout routes remain structural only when they contain nested React Router routes.
- App route paths and `REACHABLE_PRODUCT_ROUTES` now require exact, bidirectional, duplicate-sensitive multiset equality, so omissions, manifest-only extras, and multiplicity differences all block verification.
- Visible-copy resolution now inspects method receivers and safely composes static array `join` plus string/array `concat` calls, including statically declared array identifiers.
- Unresolved rendered `join` or `concat` calls with static receiver copy fail closed without evaluating application code. Other method receivers expose only direct static copy candidates, preventing internal navigation metadata and non-rendered calls from becoming customer-copy false positives.
- Existing 256-candidate, 32-depth, 4096-node, 1024-symbol, path-local cycle, UI-source scoping, and repository-containment controls remain in force.

## TDD Evidence

- Eight route fixtures failed against the former regex/subset check, covering an unclassified JSX expression, dynamic/spread/missing leaf paths, exact JSX-expression and template counting, manifest extras, and duplicate multiplicity.
- Receiver fixtures failed against the former argument-only call analysis for complete and fragmented array joins, string/array concat, unresolved rendered composition, and array identifiers.
- A non-rendered receiver fixture remained green, preserving the customer-visible-flow boundary.

## Verification

- Verifier passed: 46 modules, 12 workflows, 53 App routes, 148 customer UI sources, 64 evidence references, and zero customer-facing violations.
- Complete focused boundary suite passed all 89 tests.
- Production build completed successfully. It reported only the repository's existing Browserslist, lint, hook-dependency, and bundle-size warnings; no Repair K warning was introduced.
- `git diff --check` passed and the scoped diff contains only the verifier, boundary fixtures, governance documentation, and this report.
- No push or deployment was performed.
