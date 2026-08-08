# Product Maturity Registry Governance

The product maturity registry is the release-governance record for customer-facing modules and workflows. It is stored at `src/productMaturity/product-maturity-registry.json` and is checked by `node scripts/verifyProductMaturityRegistry.mjs` during Production Beta operational acceptance.

## Adding or changing an entry

Add one module entry with `workflowCode: null` for every customer-facing module. Add a separate entry for each independently promoted workflow, using the same `moduleCode` and a non-empty `workflowCode`. Each module/workflow pair must be unique.

Every entry must include its customer-facing name, maturity, owner, priority, promotion blockers, evidence, automated-test requirement, manual-acceptance requirement, operational-evidence requirement, target promotion milestone, ISO review date, and changelog reference. Add or update the matching reachable route in `src/productMaturity/surfaces.ts` when the module has a route in `src/App.tsx`.

Run the verifier and focused boundary test before requesting release:

```bash
node scripts/verifyProductMaturityRegistry.mjs
CI=true npm test -- --watchAll=false --runInBand src/__tests__/productMaturityBoundary.test.tsx
```

## Overrides and workflow-specific maturity

The module entry is the default maturity for that product area. A workflow entry with the same `moduleCode` and a specific `workflowCode` overrides that default only where the workflow boundary explicitly requests it. Do not create a workflow entry to override an unrelated route; model the route and workflow boundary together so the registry remains auditable.

## Promotion evidence

Before changing maturity, attach the required evidence to the entry and link the associated changelog or decision record. Promotion evidence includes:

- automated test coverage and its execution result;
- completed manual acceptance for the described workflow;
- operational evidence appropriate to the maturity, such as a support, training, or controlled beta review record; and
- unresolved promotion blockers, or a clear explanation of why each blocker has been removed.

`COMMERCIALLY_READY` must have an empty `promotionBlockers` array and additionally requires a structured `founderApproval` object. Its `status` must be `APPROVED`, `approverRole` must be `Founder`, `decision` must record the decision, and `reference` must point to an existing repository decision record. This gate records the accountable commercial decision: automated checks and operational evidence can show readiness, but they do not replace the Founder’s approval to make a customer-facing commercial commitment.

## Safe operational records

Every `evidence` item must be an existing repository-relative file or directory path that resolves inside the repository. Record ticket IDs, dated review summaries, test results, release notes, and approval decisions in an approved repository document, then reference that path from the registry. Absolute paths, lexical escapes, symlink escapes, and missing paths fail CI. Existence proves that evidence is reviewable, not that it is relevant: the owner and reviewer must confirm each path supports the entry's stated maturity and required evidence. Do not put customer names, tenant identifiers, access tokens, passwords, production URLs containing credentials, raw support transcripts, or customer records in the registry, verifier output, or changelog reference.

At each review, confirm that `reviewDate` is a valid ISO date and still reflects the next decision point. Confirm that `changelogReference` identifies the decision, release note, or approved governance document that explains the current classification. Update both when a promotion, rollback, or material scope change occurs.

## Release gate behaviour

App route completeness is discovered from React Router `Route` JSX in the TypeScript AST rather than source-text matching. Reachable route paths must be quoted strings, JSX string expressions, or no-substitution templates, and the resulting path multiset must exactly match `REACHABLE_PRODUCT_ROUTES`; dynamic paths, spread attributes, missing leaf paths, omissions, extras, and duplicate-count differences fail release verification. Pathless layout routes remain structural only and must contain nested React Router routes, whether those children are direct or wrapped in one or more JSX fragments.

Rendered copy analysis also inspects method receivers. It statically evaluates supported string/array `concat` calls and array `join` calls, including statically declared array identifiers and quoted or no-substitution-template element access such as `parts['join']('')`, without evaluating application code. Typed static string and string-array values preserve JavaScript coercion: string `concat` converts an array argument to its comma-joined string form, array `concat` flattens string-array arguments by one level, and `join` applies its resolved separator before the result is checked. Dynamic rendered element-access method names and unresolved rendered `join` or `concat` calls with static receiver copy fail closed, while non-rendered calls remain outside customer-copy analysis and all existing candidate, depth, node, symbol, and cycle budgets still apply.

The CI verifier validates registry completeness, runtime-parity lowercase module/workflow codes, structured Founder approval, repository-contained evidence/changelog paths and unique module/workflow keys; checks reachable App routes and every `WorkflowMaturityBoundary` reference against an exact registry entry; and uses one TypeScript Program covering every non-test production `.ts`/`.tsx` file under `src`. Workflow-boundary governance is repository-wide even in server/internal directories: module exports are inspected through the checker, so named or export-star barrels/re-exports fail. The canonical component module is also audited and must export exactly its one required declaration; additional aliases, wrappers, or unrelated named exports fail. Every canonical JSX symbol, including namespace/property tags, must follow one strict convention: a direct named import from the canonical component module, with imported and local name exactly `WorkflowMaturityBoundary`, used only as that JSX tag. Consumers may not request any additional named import from that module. Aliases, namespaces, variable or conditional chains, wrappers/HOCs, non-JSX references, shadowed tags, and missing, dynamic/nonliteral, or spread code props fail closed. Customer-copy analysis uses the same Program but remains limited to production UI-bearing sources, where it rejects any case-insensitive `Legacy` substring in JSX text, statically composed expressions, parameter-substituted helpers, imported copy, visible/accessibility attributes, and customer-message calls without executing code. Static composition deduplicates candidates and fails deterministically above 256 unique candidates. Visible-copy depth (32), aggregate per-root node-visit (4096), and separate aggregate per-root symbol-visit (1024) limits fail with explicit verifier errors rather than returning an unchecked result. Cycle detection is path-local, so genuine cyclic resolutions terminate safely without suppressing sibling composition. Evidence, changelog, and Founder-approval references must exist and remain inside the repository after lexical and realpath/symlink resolution. A verification failure blocks release without changing runtime permissions, workflow triggers, environments, secrets, or operational credentials.
