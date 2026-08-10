# GitHub-Managed Production Beta Release

## Trust boundaries

The `production-beta-deployment` GitHub environment owns migration and deployment authority only. Its secrets are `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `VERCEL_TOKEN`; its variables are `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`.

The separate `production-beta-acceptance` environment retains only the approved browser identities, mailbox integration, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Migration and Vercel deployment credentials must never be added to acceptance jobs, Vercel runtime configuration, Codex, repository files, environment files, logs or artefacts.

## Controlled release

Dispatch **Production Beta Release** with the reviewed 40-character commit SHA. That value becomes `RELEASE_SHA`. The workflow checks out and validates the exact SHA, runs registry verification, regression and the production build, then enters the protected deployment environment.

The release job verifies the fixed Production Beta Supabase, Vercel organisation and Vercel project identifiers before performing any mutation. It parses the pre-apply migration ledger into exact repository and remote Migration IDs, then strictly parses the repository-controlled dry-run. The plan must exactly equal the repository IDs absent from the pre-apply remote ledger, so an unexpectedly empty plan fails closed. After applying only that plan, the planned IDs must exactly equal the post-apply remote ledger minus the pre-apply remote ledger, and the workflow proves that zero repository migrations remain pending.

The workflow then deploys the same checkout with `githubCommitSha=RELEASE_SHA` as Vercel metadata and server-only `SPRAY_COMMAND_RELEASE_SHA=RELEASE_SHA` runtime configuration. It captures deployment ID, creation timestamp and deployment state immediately from the newly created deployment URL, before waiting for `READY`, so those facts survive a wait failure. After `READY`, the workflow retrieves the exact deployment through the authenticated Vercel API and fails on missing, invalid or mismatched `meta.githubCommitSha`. Only after that independent metadata check does it query `/api/v1/deployment` on the newly created deployment URL. That endpoint reads only `SPRAY_COMMAND_RELEASE_SHA` and must return the same SHA before operational acceptance runs.

## Reviewed action pins

Every third-party action used by the protected release and acceptance workflows is pinned to a reviewed immutable commit:

- `actions/checkout` v4.2.2 — `11bd71901bbe5b1630ceea73d27597364c9af683`
- `actions/setup-node` v4.4.0 — `49933ea5288caeca8642d1e84afbd3f7d6820020`
- `actions/upload-artifact` v4.6.2 — `ea165f8d65b6e75b540449e92b4886f43607fa02`

To update an action, review the upstream release notes and source diff, confirm that the action does not require wider permissions or expose additional credentials or artefacts, replace the full 40-character commit in every protected workflow, update the adjacent version comment and this list, and run the release-governance and acceptance-governance tests. Floating major-version tags are not permitted.

## Canonical release history

Every release attempt that crosses the migration boundary writes a **Production Beta Release Record** to its GitHub Actions run summary. The workflow run is the canonical Production Beta release-history entry and records:

- Release SHA
- Workflow run ID and release-attempt timestamp
- Exact failure stage (`NONE` for a fully successful release)
- Exact repository and pre-apply remote Migration IDs
- Exact, ordered Migration IDs identified by the repository-controlled dry-run
- Post-apply remote Migration IDs and repository migrations pending after apply
- Machine-derived migration ledger verification
- Deployment ID, timestamp and deployment state, captured before the `READY` wait when deployment creation succeeds
- Acceptance result

The record is written even when migration application, ledger reconciliation, deployment, the `READY` wait, deployed-SHA verification or acceptance fails. Pre-acceptance failures record acceptance as `NOT_RUN`, and absent deployment evidence is distinguished as `NOT_CREATED` or `NOT_CAPTURED`, so a partial or unaccepted release remains visible and cannot be mistaken for an accepted release. A missing ledger result is recorded as unverified rather than replaced by a hard-coded success value.

## Vercel Git deployment separation

`codex/production-beta` is currently assigned as the Vercel Production branch. Repository configuration disables automatic Git deployment for that branch only. The GitHub-managed release workflow is therefore the only approved Production Beta deployment path, while all other unassigned branches remain eligible for Preview deployments under the existing Vercel project configuration.

## Failure handling

- Migration failure stops deployment and acceptance, but an attempt that crossed the migration boundary still produces its canonical partial-release record.
- Any failure after the migration boundary is a **PARTIAL RELEASE**. The canonical record names whether migration apply, ledger reconciliation, deployment creation, deployment identity capture, `READY` wait, metadata verification or runtime verification failed. Preserve applied migration history and keep the previous application serving where Vercel supports it.
- Missing or mismatched Vercel deployment metadata stops before the runtime identity query; missing or mismatched runtime identity stops acceptance and fails the release.
- Acceptance failure means the release is not accepted. Preserve safe diagnostics and fix forward through reviewed code.

Never repair, delete, reverse or rewrite migration history automatically. Never perform a destructive rollback because a later deployment or acceptance stage failed.

## First-release gate

Building and validating this workflow does not authorise its first execution. Before the first release, inspect and constrain the automatic Vercel Git production deployment path so it cannot race migrations. Record the smallest proposed configuration change and obtain Product Owner approval.

The first GitHub-managed Production Beta migration and deployment also requires explicit Product Owner approval after workflow validation, credential separation and immutable-SHA verification are complete.
