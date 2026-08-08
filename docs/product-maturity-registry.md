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

The CI verifier validates registry completeness, runtime-parity lowercase module/workflow codes, structured Founder approval, repository-contained evidence/changelog paths and unique module/workflow keys; checks reachable App routes and every `WorkflowMaturityBoundary` reference against an exact registry entry; and uses the TypeScript AST to reject any case-insensitive `Legacy` substring in customer copy across production UI-bearing TypeScript under `src`, including App, brand, context, error-boundary, page, component, navigation, hook, and feature sources. Workflow boundary tags are recursively resolved to the canonical declaration through TypeScript aliases and barrel re-exports, variable/property chains, parenthesized/type wrappers, namespace property access, and recognised `memo`/`forwardRef` wrappers. A construct that partially traces to the canonical component but cannot be safely modelled fails closed, as do rebound/shadowed references and missing, dynamic/nonliteral, or spread code props. JSX text, statically composed rendered expressions (including logical/conditional, template, concatenation, and nested call/object/array forms), parameter-substituted local/imported pure helper returns, imported constant copy, customer-copy properties, visible/accessibility attributes, and customer-message notice/toast/setter calls are checked without executing application code. Static composition deduplicates candidates and fails deterministically if a visible-string resolution exceeds 256 unique candidates; symbol/node budgets plus depth and cycle guards also remain active. Tests and explicit server/internal directories are excluded; comments, internal identifiers/strings, and structural JSX attributes such as `id`, `className`, and `data-*` are ignored. Evidence, changelog, and Founder-approval references must exist and remain inside the repository after both lexical and realpath/symlink resolution. A verification failure blocks the release workflow until the governance issue is corrected. It does not change application runtime permissions, workflow triggers, environments, secrets, or operational acceptance credentials.
