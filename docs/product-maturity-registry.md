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

`COMMERCIALLY_READY` additionally requires explicit Founder approval in the entry's evidence. This gate records the accountable commercial decision: automated checks and operational evidence can show readiness, but they do not replace the Founder’s approval to make a customer-facing commercial commitment.

## Safe operational records

Record only non-secret, reviewable evidence references in the registry: ticket IDs, dated review summaries, test names, release notes, and approved document paths. Do not put customer names, tenant identifiers, access tokens, passwords, production URLs containing credentials, raw support transcripts, or customer records in the registry, verifier output, or changelog reference.

At each review, confirm that `reviewDate` is a valid ISO date and still reflects the next decision point. Confirm that `changelogReference` identifies the decision, release note, or approved governance document that explains the current classification. Update both when a promotion, rollback, or material scope change occurs.

## Release gate behaviour

The CI verifier validates registry completeness and unique module/workflow keys, checks the reachable App routes against the route manifest, and rejects `Legacy` language in customer-facing navigation and maturity components. A verification failure blocks the release workflow until the governance issue is corrected. It does not change application runtime permissions, workflow triggers, environments, secrets, or operational acceptance credentials.
