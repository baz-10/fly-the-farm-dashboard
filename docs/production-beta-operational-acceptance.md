# Production Beta Operational Acceptance

The `Production Beta Operational Acceptance` GitHub Actions workflow runs the browser-level Client-to-Mission acceptance chain against the canonical Spray Command Production Beta environment.

## Protected execution profile

GitHub environment: `production-beta-acceptance`

Required environment secrets:

- `E2E_ORGANISATION_EMAIL`
- `E2E_ORGANISATION_PASSWORD`

Secret values must be entered directly into the GitHub environment settings by an authorised repository administrator. They must never be copied into repository files, workflow inputs, command-line arguments, support messages, prompts or test output.

The acceptance identity must be a dedicated Fly The Farm Production Beta organisation user with the minimum permissions needed by the tested operational workflow. It must not be a Platform identity, service-role identity or cross-tenant support identity.

## Execution

The workflow can be started without credential input by:

- GitHub Actions `workflow_dispatch`;
- the `production-beta-deployed` repository dispatch event; or
- its daily scheduled run.

The workflow serialises runs, targets `https://spray-command-production-beta.vercel.app`, installs an isolated Chromium runtime and runs `npm run test:e2e`.

Authentication traces, screenshots and videos are disabled. Non-authentication failure artefacts are retained for seven days and must not include the generated authenticated storage-state file.

## Rotation

Rotate the acceptance password through the normal Spray Command/Supabase password-recovery workflow, then replace only the GitHub environment secret. No repository change is required.

If either secret is missing, authentication fails closed before operational records are created.
