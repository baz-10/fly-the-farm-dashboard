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

## Acceptance sequence

1. Run `npm run verify:product-maturity`.
2. Run `npm run verify:commercial-onboarding` to apply and exercise the repository migrations in isolated PostgreSQL.
3. Run `npx playwright test --project=commercial-onboarding`.
4. The browser test uses normal public, Platform and organisation APIs. It proves separate application, review, approval and invitation transitions, normal Supabase activation, authoritative provisioning, Getting Started, Base confirmation, Fleet records, the optional Personnel path and the first Client-to-Draft-Mission chain.
5. Run the repository-controlled cleanup command with the generated non-secret evidence file. It is written immediately after provisioning so the `always()` cleanup remains available if a later onboarding step fails. Cleanup refuses any organisation whose immutable onboarding provenance, exact organisation ID or controlled record labels do not match, archives child records in dependency order and records audit/outbox evidence.
6. Run authentication-only, cleanup-only and the established Production Beta Client-to-Mission acceptance before the full workflow gate.

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
