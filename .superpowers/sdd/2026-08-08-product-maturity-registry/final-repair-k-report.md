# Final Repair Package K: Route AST and Receiver-Aware Copy Verification

## Status

Bounded reviewer follow-up completed locally. No push or deployment was performed.

## Commit

- Base: `4e4e85ed19c5922b72c5abb872792c4c8a614d60` — `FIX: isolate visible copy resolver state`
- Original Repair K: `02a979f590a63ee2a58ab2f47c2b17a0b6a82c75` — `FIX: harden route and copy verification`
- Receiver-semantics reviewer follow-up: `4940db86374c4eb13a16120959e92f10e8a4cef5` — `FIX: preserve static copy semantics`
- Callee-wrapper reviewer follow-up: the commit containing this updated report.

## Repairs

- Replaced App route source-text matching with TypeScript AST discovery tied to the `Route` import from `react-router-dom`.
- Reachable route paths accept JSX quoted strings, JSX string-literal expressions, and no-substitution templates. Dynamic expressions, spread attributes, duplicate path attributes, empty paths, and missing reachable leaf paths fail closed. Existing pathless layout routes remain structural only when they contain nested React Router routes.
- App route paths and `REACHABLE_PRODUCT_ROUTES` now require exact, bidirectional, duplicate-sensitive multiset equality, so omissions, manifest-only extras, and multiplicity differences all block verification.
- Pathless React Router layout discovery follows direct and arbitrarily nested JSX fragments while continuing to reject fragments without Route children and missing leaf paths.
- Visible-copy resolution now inspects property and static element-access method receivers and safely evaluates array `join` plus string/array `concat` calls, including statically declared array identifiers.
- Call-expression callees are unwrapped through parenthesized, `as`, type-assertion, non-null, and `satisfies` expressions before property or element-access classification. Wrapped static `join` and `concat` references therefore use the same typed evaluation as direct calls, while wrapped dynamic rendered method names fail closed.
- Typed static string and string-array candidates preserve JavaScript behaviour: string `concat` comma-coerces array arguments, array `concat` performs one-level array flattening, and `join` uses the resolved separator. Dynamic rendered element-access method names fail closed.
- Unresolved rendered `join` or `concat` calls with static receiver copy fail closed without evaluating application code. Other method receivers expose only direct static copy candidates, preventing internal navigation metadata and non-rendered calls from becoming customer-copy false positives.
- Existing 256-candidate, 32-depth, 4096-node, 1024-symbol, path-local cycle, UI-source scoping, and repository-containment controls remain in force.

## TDD Evidence

- Eight route fixtures failed against the former regex/subset check, covering an unclassified JSX expression, dynamic/spread/missing leaf paths, exact JSX-expression and template counting, manifest extras, and duplicate multiplicity.
- Receiver fixtures failed against the former argument-only call analysis for complete and fragmented array joins, string/array concat, unresolved rendered composition, and array identifiers.
- A non-rendered receiver fixture remained green, preserving the customer-visible-flow boundary.
- Reviewer follow-up fixtures failed against the original Repair K for static element-access calls, dynamic method names, string-versus-array concat coercion, and valid nested-fragment layouts. Paired property/element success and rejection cases now lock the corrected semantics.
- Callee-wrapper fixtures failed against the receiver-semantics follow-up for parenthesized property and element references, `as`, type-assertion, and non-null wrappers, plus a parenthesized dynamic element-access reference. All six passed after applying the existing budget-counted static unwrap helper before callee classification.

## Verification

- Verifier passed: 46 modules, 12 workflows, 53 App routes, 148 customer UI sources, 64 evidence references, and zero customer-facing violations.
- Complete focused boundary suite passed all 112 tests.
- Production build completed successfully. It reported only the repository's existing Browserslist, lint, hook-dependency, and bundle-size warnings; no Repair K warning was introduced.
- `git diff --check` passed and the scoped diff contains only the verifier, boundary fixtures, governance documentation, and this report.
- No push or deployment was performed.
