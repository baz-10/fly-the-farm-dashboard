# GitHub-Managed Production Beta Release

## Trust boundaries

The `production-beta-deployment` GitHub environment owns migration and deployment authority only. Its secrets are `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `VERCEL_TOKEN`; its variables are `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`.

The separate `production-beta-acceptance` environment retains only the approved browser identities, mailbox integration, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Migration and Vercel deployment credentials must never be added to acceptance jobs, Vercel runtime configuration, Codex, repository files, environment files, logs or artefacts.

## Controlled release

Dispatch **Production Beta Release** with the reviewed 40-character commit SHA. That value becomes `RELEASE_SHA`. The workflow checks out and validates the exact SHA, runs registry verification, regression and the production build, then enters the protected deployment environment.

The release job verifies the fixed Production Beta Supabase, Vercel organisation and Vercel project identifiers before performing any mutation. It inspects the remote migration ledger and strictly parses the repository-controlled dry-run into exact, ordered Migration IDs. After applying only that plan, machine reconciliation requires every planned ID to exist in the remote ledger and requires that zero repository migrations remain pending. It then deploys the same checkout with `githubCommitSha=RELEASE_SHA`, waits for Vercel `READY`, and requires `/api/v1/deployment` to return the same SHA before operational acceptance runs.

## Canonical release history

Every release attempt that crosses the migration boundary writes a **Production Beta Release Record** to its GitHub Actions run summary. The workflow run is the canonical Production Beta release-history entry and records:

- Release SHA
- Exact, ordered Migration IDs identified by the repository-controlled dry-run
- Remote Migration IDs and repository migrations pending after apply
- Machine-derived migration ledger verification
- Deployment ID
- Deployment timestamp
- Acceptance workflow run ID
- Acceptance result

The record is written even when migration application, ledger reconciliation, deployment, deployed-SHA verification or acceptance fails. Deployment or SHA failures record acceptance as `NOT_RUN`, so a partial or unaccepted release remains visible and cannot be mistaken for an accepted release. A missing ledger result is recorded as unverified rather than replaced by a hard-coded success value.

## Vercel Git deployment separation

`codex/production-beta` is currently assigned as the Vercel Production branch. Repository configuration disables automatic Git deployment for that branch only. The GitHub-managed release workflow is therefore the only approved Production Beta deployment path, while all other unassigned branches remain eligible for Preview deployments under the existing Vercel project configuration.

## Failure handling

- Migration failure stops deployment and acceptance, but an attempt that crossed the migration boundary still produces its canonical partial-release record.
- Deployment failure after migration is a **PARTIAL RELEASE**. Preserve applied migration history and keep the previous application serving where Vercel supports it.
- A deployed-SHA mismatch stops acceptance and fails the release.
- Acceptance failure means the release is not accepted. Preserve safe diagnostics and fix forward through reviewed code.

Never repair, delete, reverse or rewrite migration history automatically. Never perform a destructive rollback because a later deployment or acceptance stage failed.

## First-release gate

Building and validating this workflow does not authorise its first execution. Before the first release, inspect and constrain the automatic Vercel Git production deployment path so it cannot race migrations. Record the smallest proposed configuration change and obtain Product Owner approval.

The first GitHub-managed Production Beta migration and deployment also requires explicit Product Owner approval after workflow validation, credential separation and immutable-SHA verification are complete.
