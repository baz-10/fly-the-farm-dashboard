# Commercial Onboarding Runbook

## Purpose

Commercial onboarding follows one controlled lifecycle:

Application → Review → Approval → Invitation → Authentication → Organisation Provisioning → Getting Started → Operational Readiness.

Platform staff approve applications and send invitations. They do not create customer organisations directly. Invitation acceptance provisions the approved organisation, its initial Organisation Administrator, one seat and one assigned Base through the repository-controlled transaction. It never creates Personnel.

## Production configuration

The Vercel Production Beta environment requires the server-only onboarding fingerprint secret, canonical application origin and acceptance window documented by the deployment environment. Supabase must allow the canonical `/onboarding/accept` callback.

The protected GitHub environment `production-beta-acceptance` supplies:

- `E2E_ONBOARDING_APPLICANT_EMAIL`
- `E2E_ONBOARDING_APPLICANT_PASSWORD`
- `E2E_PLATFORM_EMAIL`
- `E2E_PLATFORM_PASSWORD`
- `E2E_ONBOARDING_MAILBOX_URL`
- `E2E_ONBOARDING_MAILBOX_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The applicant secret identifies a controlled mailbox that supports `+` addressing. Each run derives a unique `+sc-onboarding-…` recipient so immutable auth and onboarding history is never rewritten or confused with a previous acceptance identity. The mailbox endpoint must be HTTPS, require the bearer token, restrict reads to that controlled mailbox and its acceptance aliases, and return only messages received after the supplied timestamp. Its response contract is `{ "messages": [{ "receivedAt": "ISO timestamp", "links": ["https URL"] }] }`. Do not place any value above in Git, logs, prompts, screenshots, videos, traces or uploaded artefacts.

The runner accepts only either the exact canonical Spray Command invitation route or the standard Supabase `/auth/v1/verify` URL whose `redirect_to` is that exact route and invitation ID. The Supabase origin comes from the protected `SUPABASE_URL` secret. Provider links and tokens are never printed. After navigation, Playwright requires the final canonical Spray Command origin, exact invitation ID and activation page.

## Acceptance sequence

1. Resolve `/api/v1/deployment` and check out the exact commit deployed at the canonical Production Beta URL. A `repository_dispatch` run must also match its supplied 40-character deployment commit exactly.
2. Run `npm run verify:product-maturity` and `npm run test:ci:sharded`.
3. Run `npm run verify:commercial-onboarding` to apply and exercise the repository migrations in isolated PostgreSQL.
4. Run authentication-only, cleanup-only and the established Production Beta Client-to-Mission acceptance in that order.
5. Run `npx playwright test --project=commercial-onboarding`. This state-creating project has retries disabled.
6. The browser test uses normal public, Platform and organisation APIs. It proves separate application, review, approval and invitation transitions, normal Supabase activation, authoritative provisioning, Getting Started, Base confirmation, Fleet records, Personnel remaining optional and absent, the first Client-to-Draft-Mission chain and exact Operational Readiness after refresh, re-login and a second authorised session. Genuine missing compliance remains visible as `NEEDS_OPERATIONAL_ATTENTION`; no synthetic evidence is created to force a favourable state.
7. Run `npm run verify:commercial-onboarding -- --verify-controlled test-results/commercial-onboarding-evidence.json`. This reads the exact controlled IDs and proves one authentication and organisation identity, one administrator membership, one seat and Base, no Platform identity or Personnel, immutable application/invitation history, acceptance audit/outbox evidence and no duplicate onboarding completion.
8. Run `npm run verify:commercial-onboarding -- --archive-controlled test-results/commercial-onboarding-evidence.json`. The verifier snapshots exact active IDs and row versions, then invokes the repository-controlled `ftf_archive_controlled_commercial_onboarding` transaction. The RPC uses advisory locking, exact provenance, optimistic concurrency, child-first archival and atomic audit/outbox evidence. Exact postconditions are verified after the RPC returns.

Authentication diagnostics are text-only and safe. The commercial-onboarding Playwright project disables screenshots, video, trace and storage-state output.

## Recovery and failure handling

- An application is never approved directly from `SUBMITTED`; start review first.
- Approval never sends an invitation.
- Failed provider delivery records a failed delivery and revokes the prepared invitation.
- Expired, revoked or unusable links require a new invitation. A resend replaces only active invitation evidence and preserves history.
- Password recovery uses the normal Supabase recovery route.
- Wrong-email, Platform, conflicting-organisation and replay attempts fail closed.
- Missing evidence is reported as missing. Do not create synthetic compliance records to improve Operational Readiness.

If any identity, organisation or cleanup record does not resolve uniquely, stop. Never manipulate Production Beta tables manually and never broaden the acceptance role or customer permissions to make acceptance pass.
