# Onboarding Mailbox Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private, server-only HTTPS endpoint that reads controlled Spray Command onboarding invitation email links from `info@flythefarm.com.au` through the Gmail API.

**Architecture:** A Vercel API route delegates to a focused mailbox module. The module authenticates callers with a constant-time bearer-token comparison, validates the exact controlled recipient allowlist and timestamp, obtains a short-lived Gmail access token using the approved OAuth refresh token, reads only matching messages received after the timestamp, and returns only timestamps and HTTPS links. It never returns or logs message bodies, bearer tokens, OAuth credentials, or invitation URLs.

**Tech Stack:** Vercel Node.js functions, CommonJS, native `fetch`, Google OAuth 2.0 token endpoint, Gmail REST API, Jest.

## Global Constraints

- Endpoint is HTTPS-only and GET-only.
- Accept only `recipient` and `after` query parameters.
- Require `Authorization: Bearer <E2E_ONBOARDING_MAILBOX_TOKEN>`.
- Permit only `info@flythefarm.com.au` and `info+sc-onboarding-*@flythefarm.com.au`.
- Use only Gmail scope `https://www.googleapis.com/auth/gmail.readonly` through the already-provisioned OAuth refresh token.
- Never expose mailbox credentials to browser code or logs.
- Never log or return message bodies, bearer tokens, OAuth credentials, or invitation URLs outside the approved response.
- Do not change permissions, tenancy, RLS, migrations, or Production Beta release controls.
- Publish only a Preview deployment; do not execute migrations or a Production Beta release.

---

### Task 1: Mailbox endpoint contract and Gmail adapter

**Files:**
- Create: `server/onboarding-mailbox.js`
- Create: `api/v1/onboarding-mailbox.js`
- Create: `src/__tests__/onboardingMailboxApi.test.js`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `GOOGLE_MAILBOX_CLIENT_ID`, `GOOGLE_MAILBOX_CLIENT_SECRET`, `GOOGLE_MAILBOX_REFRESH_TOKEN`, and `E2E_ONBOARDING_MAILBOX_TOKEN` from the Vercel server runtime.
- Produces: `createOnboardingMailboxHandler(dependencies?)` and `GET /api/v1/onboarding-mailbox?recipient=<address>&after=<ISO timestamp>` returning `{ messages: Array<{ receivedAt: string, links: string[] }> }`.

- [ ] **Step 1: Write failing endpoint tests**

Cover missing token, wrong token, HTTP rejection, invalid recipient, valid controlled plus alias, invalid timestamp, after filtering, exact response shape, redaction, and safe upstream failures.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `CI=true npm test -- --runInBand --watchAll=false src/__tests__/onboardingMailboxApi.test.js`

Expected: FAIL because `server/onboarding-mailbox.js` does not exist.

- [ ] **Step 3: Implement the minimal mailbox module and Vercel route**

Use native `fetch`; do not add a Google SDK dependency. Exchange the refresh token at `https://oauth2.googleapis.com/token`, query Gmail with the validated recipient and timestamp, retrieve matching MIME content, extract HTTPS links in memory, and discard all other content.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `CI=true npm test -- --runInBand --watchAll=false src/__tests__/onboardingMailboxApi.test.js`

Expected: PASS.

- [ ] **Step 5: Run regression, build, registry, and secret checks**

Run the repository's existing full Jest suite, `npm run build`, `npm run verify:product-maturity`, and repository secret/environment scans. Confirm there is no browser import of the mailbox module and no new migration.

- [ ] **Step 6: Commit and publish for Preview deployment**

Commit only the plan, route, server module, Vercel function configuration, and tests. Push `codex/onboarding-mailbox-bridge`; do not merge, migrate, reconcile `codex/production-beta`, or run the Production Beta release workflow.

- [ ] **Step 7: Verify the Preview endpoint**

Wait for Vercel Preview READY. Verify HTTPS, GET-only behavior, authentication failure behavior, and the controlled response schema without printing credentials or returned links. Return only the exact HTTPS endpoint URL requested by the Product Owner.
