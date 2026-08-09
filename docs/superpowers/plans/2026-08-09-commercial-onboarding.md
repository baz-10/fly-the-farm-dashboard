# Commercial Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an external aerial-application business to apply, be reviewed and approved, accept a controlled invitation, receive an authoritative organisation identity, and reach its first Mission without Founder database or Supabase-console intervention.

**Architecture:** Add a platform-owned application and invitation lifecycle in front of the existing Supabase authentication and atomic organisation bootstrap. After provisioning, expose a tenant-scoped Getting Started workspace whose progress and Operational Readiness are derived from existing authoritative organisation, Base, fleet, Personnel, Client, Property, Field, Job, and Mission records rather than duplicating them.

**Tech Stack:** React 19, TypeScript, Material UI, Vercel Node APIs, Supabase Auth, PostgreSQL migrations and RPCs, Jest/Testing Library, PGlite migration tests, Playwright.

## Global Constraints

- Lifecycle order is Application → Review → Approval → Invitation → Authentication → Organisation Provisioning → Getting Started → Operational Readiness.
- Platform staff approve an application; they do not directly create the customer organisation.
- Invitation creation is a separate authoritative event and is allowed only after approval.
- Use “Getting Started” in customer-facing copy, never “Set up your organisation”.
- Use “Base” in onboarding copy; the database and operational APIs continue to use `operating_locations`.
- Do not automatically create or link Personnel.
- Reuse existing Supabase authentication, identity resolution, organisation bootstrap, tenancy, RLS, seat assignment, operating-location assignment, audit, outbox, and Client → Mission workflows.
- Do not add billing, pricing, subscription tiers, Platform membership for customer users, or speculative organisation architecture.
- Operational Readiness means the organisation workspace is ready to begin normal work; it does not replace Mission Readiness, compliance assessment, or Mission Authorisation and must never claim that a Mission is ready to fly.
- All mutations are same-origin, server-authorised, audited, transactional where multiple records change, and fail closed.
- No browser or legacy persistence fallback is permitted.

---

### Task 1: Authoritative application and invitation domain

**Files:**
- Create: `supabase/migrations/20260809100000_commercial_onboarding_lifecycle.sql`
- Create: `src/__tests__/commercialOnboardingMigration.test.js`

**Interfaces:**
- Produces: `commercial_onboarding_applications`, `commercial_onboarding_application_events`, `commercial_onboarding_invitations`, `commercial_onboarding_invitation_events`.
- Produces: `ftf_submit_commercial_application(jsonb)`, `ftf_review_commercial_application(uuid,uuid,integer,text,text)`, `ftf_issue_commercial_invitation(uuid,uuid,integer,text,text,timestamptz)`, `ftf_revoke_commercial_invitation(uuid,uuid,integer,text)`, and `ftf_accept_commercial_invitation(text,uuid)`.
- Consumes: existing `platform_users`, `platform_permissions`, `organisations`, `internal_users`, `memberships`, seat/location tables, `audit_events`, `transactional_outbox`, and `ftf_suggest_reference_prefix(text)`.

- [ ] **Step 1: Write migration contract tests that fail before the schema exists**

```js
test('separates application approval from invitation creation', () => {
  expect(sql).toContain('commercial_onboarding_applications');
  expect(sql).toContain('commercial_onboarding_application_events');
  expect(sql).toContain('commercial_onboarding_invitations');
  expect(sql).toContain('commercial_onboarding_invitation_events');
  expect(sql).toContain("status = 'APPROVED'");
  expect(sql).toContain('approved_application_required');
});

test('acceptance provisions the existing organisation identity chain without Personnel', () => {
  for (const table of ['organisations', 'operating_locations', 'internal_users', 'memberships',
    'organisation_seat_allocations', 'internal_user_seat_assignments',
    'membership_operating_location_assignments', 'ftf_profiles']) expect(sql).toContain(table);
  expect(sql).not.toMatch(/insert\s+into\s+public\.personnel/i);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `CI=true npm test -- --runInBand src/__tests__/commercialOnboardingMigration.test.js`

Expected: FAIL because `20260809100000_commercial_onboarding_lifecycle.sql` does not exist.

- [ ] **Step 3: Implement the platform-owned schema and immutable event streams**

Create application status values `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `DECLINED`, and `WITHDRAWN`; invitation status values `PENDING`, `SENT`, `ACCEPTED`, `EXPIRED`, and `REVOKED`; optimistic `row_version`; token hashes only; intended administrator email; approved organisation and Base snapshots; expiry; and acceptance/provisioning references. Enable and force RLS. Grant table access only to `service_role`. Add append-only triggers to both event tables and consumed invitation evidence.

- [ ] **Step 4: Implement repository-controlled platform permissions and RPC transitions**

Add only:

```sql
platform.onboarding.application.read
platform.onboarding.application.review
platform.onboarding.invitation.issue
platform.onboarding.invitation.revoke
```

Make review and invitation transitions separate. Require an approved application before invitation issuance. Hash tokens before persistence, bind invitations to the approved email, use advisory transaction locks, reject Platform identities and conflicting organisation identities, and make successful acceptance idempotent.

- [ ] **Step 5: Implement atomic provisioning inside invitation acceptance**

Provision exactly one organisation, Organisation Administrator role, internal user, membership, one seat allocation and assignment, one Base and assignment, compatibility profile, default policies through existing organisation triggers, audit records, outbox records, accepted invitation event, and resulting organisation reference. Do not create Personnel.

- [ ] **Step 6: Run migration tests and PGlite lint**

Run: `CI=true npm test -- --runInBand src/__tests__/commercialOnboardingMigration.test.js src/__tests__/migrationLint.test.js`

Expected: PASS, including replay, expiry, revoked, wrong-email, Platform-identity, conflicting-membership, and immutability assertions.

- [ ] **Step 7: Commit the domain slice**

```bash
git add supabase/migrations/20260809100000_commercial_onboarding_lifecycle.sql src/__tests__/commercialOnboardingMigration.test.js
git commit -m "NEW-ONB-001 add governed commercial onboarding lifecycle"
```

---

### Task 2: Public application and Platform review workflow

**Files:**
- Create: `server/commercial-onboarding-api.js`
- Create: `api/v1/commercial-onboarding.js`
- Create: `src/services/commercialOnboardingApi.ts`
- Create: `src/pages/CommercialApplication.tsx`
- Create: `src/components/platform/CommercialOnboardingReview.tsx`
- Modify: `server/operational-dispatcher.js`
- Modify: `src/pages/PlatformAdmin.tsx`
- Modify: `src/App.tsx`
- Create: `src/__tests__/commercialOnboardingApi.test.js`
- Create: `src/pages/__tests__/CommercialApplication.test.tsx`
- Create: `src/components/platform/__tests__/CommercialOnboardingReview.test.tsx`

**Interfaces:**
- Consumes: Task 1 RPCs and existing `resolvePlatformRequestContext`.
- Produces: public `POST /api/v1/commercial-onboarding?action=apply`; platform-authorised list, review, approve, decline, issue, resend, and revoke actions; public `/apply`; Platform Administration review panel.

- [ ] **Step 1: Write failing API tests for public application and platform-only decisions**

```js
test('an unauthenticated applicant may submit but cannot review an application', async () => {
  await handler(req('POST', 'apply', validApplication), applyResponse);
  expect(applyResponse.statusCode).toBe(201);
  await handler(req('POST', 'approve', { applicationId }), approveResponse);
  expect(approveResponse.statusCode).toBe(401);
});

test('approval does not create an invitation', async () => {
  expect(repository.reviewApplication).toHaveBeenCalled();
  expect(repository.issueInvitation).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the API test and confirm RED**

Run: `CI=true npm test -- --runInBand src/__tests__/commercialOnboardingApi.test.js`

Expected: FAIL because the handler is absent.

- [ ] **Step 3: Implement the API boundary**

Validate business name, administrator name, email, phone, intended Base name/address/coordinates/timezone, consent version, and plain-language application notes. Return non-enumerating public responses. Enforce same origin and bounded payload size. Require exact platform permissions for reads and transitions. Return safe error codes and correlation IDs.

- [ ] **Step 4: Write failing application-page tests**

```tsx
expect(screen.getByRole('heading', { name: 'Apply for Spray Command' })).toBeVisible();
expect(screen.getByLabelText('Base address')).toBeVisible();
expect(screen.queryByText('Operating Location')).not.toBeInTheDocument();
```

- [ ] **Step 5: Implement `/apply` with Premium Simplicity**

Use sections “Your business”, “Your administrator”, and “Your Base”. Reuse the approved address-search, map, confirmation, coordinates, and provenance interaction. Preserve entered work after validation errors. Submission shows an application reference and states that review occurs before any invitation.

- [ ] **Step 6: Write failing Platform review tests**

Assert the review panel separates `Approve application` from `Send invitation`, displays request and decision evidence, and never exposes customer operational data.

- [ ] **Step 7: Implement Platform review, approval, invitation, resend, and revoke UI**

Place the panel on the existing Spray Command Platform Administration surface. Use explicit confirmation for approval, decline, invitation issue, and revoke. Display timestamps, actor, notes, status, expiry, and resulting organisation only after acceptance.

- [ ] **Step 8: Run focused tests**

Run: `CI=true npm test -- --runInBand src/__tests__/commercialOnboardingApi.test.js src/pages/__tests__/CommercialApplication.test.tsx src/components/platform/__tests__/CommercialOnboardingReview.test.tsx`

Expected: PASS.

- [ ] **Step 9: Commit the application/review slice**

```bash
git add server/commercial-onboarding-api.js api/v1/commercial-onboarding.js src/services/commercialOnboardingApi.ts src/pages/CommercialApplication.tsx src/components/platform/CommercialOnboardingReview.tsx server/operational-dispatcher.js src/pages/PlatformAdmin.tsx src/App.tsx src/__tests__/commercialOnboardingApi.test.js src/pages/__tests__/CommercialApplication.test.tsx src/components/platform/__tests__/CommercialOnboardingReview.test.tsx
git commit -m "NEW-ONB-001 add application review and invitation workflow"
```

---

### Task 3: Invitation authentication and organisation provisioning

**Files:**
- Create: `src/pages/AcceptOrganisationInvitation.tsx`
- Modify: `api/auth.js`
- Modify: `src/contexts/AuthContext.tsx`
- Modify: `src/pages/AuthCallback.tsx`
- Modify: `src/App.tsx`
- Modify: `src/__tests__/authenticated-auth-api.test.ts`
- Modify: `src/pages/AuthLifecycle.test.tsx`
- Create: `src/pages/__tests__/AcceptOrganisationInvitation.test.tsx`

**Interfaces:**
- Consumes: Supabase invitation authentication session and `ftf_accept_commercial_invitation(token_hash, auth_user_id)`.
- Produces: `/onboarding/accept`; auth action `accept-organisation-invitation`; trusted Spray Command cookies only after provisioning and organisation identity resolution succeed.

- [ ] **Step 1: Write failing auth-boundary tests**

```ts
test('chooses a password before resolving the organisation identity', async () => {
  expect(passwordUpdateIndex).toBeLessThan(invitationAcceptanceIndex);
  expect(invitationAcceptanceIndex).toBeLessThan(profileResolutionIndex);
  expect(profileResolutionIndex).toBeLessThan(trustedCookieIndex);
});

test('failed provisioning creates no trusted session', async () => {
  expect(res.statusCode).toBe(403);
  expect(res.headers['set-cookie']).toBeUndefined();
});
```

- [ ] **Step 2: Run auth tests and confirm RED**

Run: `CI=true npm test -- --runInBand src/__tests__/authenticated-auth-api.test.ts src/pages/AuthLifecycle.test.tsx src/pages/__tests__/AcceptOrganisationInvitation.test.tsx`

Expected: FAIL because invitation acceptance is not supported.

- [ ] **Step 3: Add the narrow trusted-server acceptance action**

Validate the Supabase access token, derive the authenticated user server-side, hash the supplied invitation token, invoke the acceptance RPC, resolve the new organisation profile, then set trusted cookies. Never accept an auth-user ID, organisation ID, role, seat, or location from the browser.

- [ ] **Step 4: Implement the invitation page and callback routing**

The page supports password creation, expired-link guidance, resend guidance, and successful redirect to `/getting-started`. Authentication errors remain authentication errors; application or invitation errors remain onboarding errors. Do not display Platform identity errors during password choice.

- [ ] **Step 5: Add recovery and replay tests**

Cover existing confirmed auth users, duplicate callback delivery, already accepted invitation, expired invitation, revoked invitation, wrong authenticated email, Platform-only identity, existing foreign membership, and successful password recovery after onboarding.

- [ ] **Step 6: Run focused authentication tests**

Run: `CI=true npm test -- --runInBand src/__tests__/authenticated-auth-api.test.ts src/pages/AuthLifecycle.test.tsx src/pages/__tests__/AcceptOrganisationInvitation.test.tsx`

Expected: PASS with trusted cookies created only after successful authoritative identity resolution.

- [ ] **Step 7: Commit the invitation acceptance slice**

```bash
git add api/auth.js src/contexts/AuthContext.tsx src/pages/AuthCallback.tsx src/pages/AcceptOrganisationInvitation.tsx src/App.tsx src/__tests__/authenticated-auth-api.test.ts src/pages/AuthLifecycle.test.tsx src/pages/__tests__/AcceptOrganisationInvitation.test.tsx
git commit -m "NEW-ONB-001 accept approved organisation invitations"
```

---

### Task 4: Getting Started projection and workspace

**Files:**
- Create: `server/getting-started-api.js`
- Create: `api/v1/getting-started.js`
- Create: `src/services/gettingStartedApi.ts`
- Create: `src/pages/GettingStarted.tsx`
- Create: `src/components/onboarding/GettingStartedStep.tsx`
- Modify: `server/operational-dispatcher.js`
- Modify: `src/App.tsx`
- Modify: `src/navigation/organisationNavigation.tsx`
- Modify: `src/components/__tests__/LayoutNavigation.test.tsx`
- Modify: `src/navigation/__tests__/organisationNavigation.test.tsx`
- Create: `src/__tests__/gettingStartedApi.test.js`
- Create: `src/pages/__tests__/GettingStarted.test.tsx`

**Interfaces:**
- Produces: `GET /api/v1/getting-started`, returning `{ organisation, steps, operationalReadiness, nextAction }` derived from authoritative records.
- Consumes: existing organisation branding, `operating_locations`, aircraft, equipment kits, Personnel, Clients, Properties, Fields, Jobs, and Missions APIs/routes.

- [ ] **Step 1: Write a failing projection test**

```js
expect(result.steps.map(({ code, state }) => [code, state])).toEqual([
  ['ORGANISATION', 'COMPLETE'], ['BASE', 'NEEDS_ATTENTION'], ['AIRCRAFT', 'NOT_STARTED'],
  ['EQUIPMENT', 'NOT_STARTED'], ['PERSONNEL', 'OPTIONAL'], ['CLIENT', 'NOT_STARTED'],
  ['PROPERTY', 'NOT_STARTED'], ['FIELD', 'NOT_STARTED'], ['JOB', 'NOT_STARTED'],
  ['MISSION', 'NOT_STARTED'],
]);
expect(result.nextAction.code).toBe('CONFIRM_BASE');
```

- [ ] **Step 2: Run projection tests and confirm RED**

Run: `CI=true npm test -- --runInBand src/__tests__/gettingStartedApi.test.js`

Expected: FAIL because the read projection does not exist.

- [ ] **Step 3: Implement the read-only, tenant-scoped projection**

Derive every state from source records. A Base is complete only when its authoritative address, confirmed coordinates, timezone, and active membership assignment exist. Personnel remains optional until the user indicates they will operate; no synthetic rows or duplicated completion flags are allowed. Reading the projection creates no audit noise.

- [ ] **Step 4: Write failing workspace UX tests**

Assert the heading is `Getting Started`, onboarding copy uses `Base`, the current next action is prominent, completed steps remain openable, and existing domain actions navigate to their established routes instead of embedding duplicate forms.

- [ ] **Step 5: Implement the Getting Started workspace**

Show a welcoming progress summary, one recommended next action, and expandable sections for Organisation, Base, Aircraft, Equipment, Personnel, First Client, First Property, First Field, First Job, and First Mission. Use “Do this later” only for genuinely optional steps. Preserve stable main navigation; add a contextual Getting Started entry for incomplete onboarding without hiding other modules.

- [ ] **Step 6: Run API and component tests**

Run: `CI=true npm test -- --runInBand src/__tests__/gettingStartedApi.test.js src/pages/__tests__/GettingStarted.test.tsx`

Expected: PASS, including tenant, location, permission, responsive, keyboard, and plain-language assertions.

- [ ] **Step 7: Commit the Getting Started slice**

```bash
git add server/getting-started-api.js api/v1/getting-started.js src/services/gettingStartedApi.ts src/pages/GettingStarted.tsx src/components/onboarding/GettingStartedStep.tsx server/operational-dispatcher.js src/App.tsx src/navigation/organisationNavigation.tsx src/components/__tests__/LayoutNavigation.test.tsx src/navigation/__tests__/organisationNavigation.test.tsx src/__tests__/gettingStartedApi.test.js src/pages/__tests__/GettingStarted.test.tsx
git commit -m "NEW-ONB-001 add Getting Started workspace"
```

---

### Task 5: Base confirmation and onboarding handoffs

**Files:**
- Create: `src/components/onboarding/BaseConfirmation.tsx`
- Modify: `server/operational-api.js`
- Modify: `src/services/operationalApi.ts`
- Modify: `src/pages/GettingStarted.tsx`
- Modify: `src/pages/AircraftManagement.tsx`
- Modify: `src/pages/Personnel.tsx`
- Modify: `src/pages/ClientList.tsx`
- Create: `src/components/onboarding/__tests__/BaseConfirmation.test.tsx`
- Modify: `src/__tests__/liveChainAccessApi.test.js`

**Interfaces:**
- Consumes: existing authoritative `operating_locations` create/update API and approved address/map confirmation standard.
- Produces: a Base confirmation action that updates the initial operating-location row with optimistic concurrency and returns to Getting Started.

- [ ] **Step 1: Write failing Base confirmation tests**

```tsx
expect(screen.getByRole('heading', { name: 'Confirm your Base' })).toBeVisible();
expect(screen.getByText('Location confirmed')).toBeVisible();
expect(api.updateOperatingLocation).toHaveBeenCalledWith(base.id, base.rowVersion,
  expect.objectContaining({ addressSource: 'ADDRESS_SEARCH', locationConfirmed: true }));
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `CI=true npm test -- --runInBand src/components/onboarding/__tests__/BaseConfirmation.test.tsx src/__tests__/liveChainAccessApi.test.js`

Expected: FAIL because onboarding Base confirmation is absent.

- [ ] **Step 3: Extend the existing operating-location update contract narrowly**

Persist confirmed address label, latitude, longitude, location source, confirmation timestamp, and row version on the authoritative operating-location record. Require the current user to hold update permission and be assigned to that Base. Preserve RLS and optimistic concurrency.

- [ ] **Step 4: Implement Base confirmation using the approved map standard**

Support address search, Street/Satellite/Hybrid, intentional recentering, manual pin adjustment, explicit confirmation, preserved map state after validation failure, and inline errors. Customer-facing copy says Base; API names remain operating location.

- [ ] **Step 5: Add return-to-onboarding handoffs**

Pass `returnTo=/getting-started` through existing Aircraft, Equipment, Personnel, Client, Property, Field, Job, and Mission creation routes. After authoritative save, show `Return to Getting Started` without changing the domain workflow or duplicating its forms.

- [ ] **Step 6: Run focused regression tests**

Run: `CI=true npm test -- --runInBand src/components/onboarding/__tests__/BaseConfirmation.test.tsx src/__tests__/liveChainAccessApi.test.js src/components/__tests__/AircraftForm.remote.test.tsx src/components/mission/__tests__/GuidedMissionCreation.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the Base and handoff slice**

```bash
git add src/components/onboarding/BaseConfirmation.tsx server/operational-api.js src/services/operationalApi.ts src/pages/GettingStarted.tsx src/pages/Personnel.tsx src/pages/ClientList.tsx src/components/onboarding/__tests__/BaseConfirmation.test.tsx src/__tests__/liveChainAccessApi.test.js
git commit -m "IMP-ONB-001 confirm Base and preserve onboarding flow"
```

---

### Task 6: Operational Readiness conclusion

**Files:**
- Create: `src/components/onboarding/OperationalReadiness.tsx`
- Modify: `server/getting-started-api.js`
- Modify: `src/pages/GettingStarted.tsx`
- Modify: `src/__tests__/gettingStartedApi.test.js`
- Create: `src/components/onboarding/__tests__/OperationalReadiness.test.tsx`

**Interfaces:**
- Produces: onboarding readiness states `GETTING_STARTED`, `READY_TO_PLAN`, and `NEEDS_OPERATIONAL_ATTENTION` with grouped reasons and authoritative routes.
- Consumes: existing compliance health projection for advisory compliance status; never recalculates compliance or Mission Readiness.

- [ ] **Step 1: Write failing readiness semantics tests**

```js
expect(result.operationalReadiness).toMatchObject({
  state: 'READY_TO_PLAN',
  headline: 'Your Spray Command workspace is ready',
  missionAuthorisationClaim: false,
});
expect(result.operationalReadiness.advisories).toContainEqual(
  expect.objectContaining({ code: 'REOC_MISSING', route: '/compliance/reoc' }),
);
```

- [ ] **Step 2: Run the readiness tests and confirm RED**

Run: `CI=true npm test -- --runInBand src/__tests__/gettingStartedApi.test.js src/components/onboarding/__tests__/OperationalReadiness.test.tsx`

Expected: FAIL because the conclusion model is absent.

- [ ] **Step 3: Implement deterministic readiness derivation**

`READY_TO_PLAN` requires confirmed organisation identity, confirmed Base, at least one aircraft, one equipment kit, one Client, Property, Field, Job, and Draft Mission. Personnel is reported separately: an organisation that intends to authorise or operate a Mission must add eligible Personnel and satisfy the existing Mission gates. Missing ReOC or other compliance evidence yields `NEEDS_OPERATIONAL_ATTENTION` and never becomes “current” by assumption.

- [ ] **Step 4: Implement the conclusion experience**

Celebrate completed onboarding with `Your Spray Command workspace is ready` and primary action `Open your first Mission`. Immediately below it, state `Each Mission must still satisfy Weather, JSA, Personnel, compliance, readiness and authorisation requirements before flight.` Show outstanding operational attention with plain-language reason and direct action.

- [ ] **Step 5: Run readiness tests**

Run: `CI=true npm test -- --runInBand src/__tests__/gettingStartedApi.test.js src/components/onboarding/__tests__/OperationalReadiness.test.tsx`

Expected: PASS without legal-certification or ready-to-fly claims.

- [ ] **Step 6: Commit the readiness slice**

```bash
git add server/getting-started-api.js src/pages/GettingStarted.tsx src/components/onboarding/OperationalReadiness.tsx src/__tests__/gettingStartedApi.test.js src/components/onboarding/__tests__/OperationalReadiness.test.tsx
git commit -m "NEW-ONB-001 add onboarding Operational Readiness"
```

---

### Task 7: Product maturity, security acceptance, and unattended E2E

**Files:**
- Modify: `src/productMaturity/product-maturity-registry.json`
- Modify: `src/productMaturity/surfaces.ts`
- Modify: `src/productMaturity/__tests__/registry.test.ts`
- Create: `e2e/acceptance/commercial-onboarding.spec.ts`
- Create: `scripts/verifyCommercialOnboardingPostgres.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/production-beta-operational-acceptance.yml`
- Create: `docs/operations/commercial-onboarding-runbook.md`

**Interfaces:**
- Consumes: Tasks 1–6 and protected GitHub environment secrets.
- Produces: permanent onboarding acceptance, PostgreSQL verification, support runbook, and evidence-backed Product Maturity entry.

- [ ] **Step 1: Write failing registry and route-governance assertions**

Register `/apply`, `/onboarding/accept`, and `/getting-started`; retain Organisation Onboarding as `BETA`; list the new implementation, security, recovery, and genuine operational-evidence requirements. Confirm maturity never grants permission.

- [ ] **Step 2: Write the unattended E2E workflow**

Cover application submission, Platform review, approval without invitation, invitation issue, password creation, atomic provisioning, trusted session, Getting Started, Base confirmation, aircraft, equipment, optional Personnel decision, Client → Property → Field → Job → Draft Mission, readiness conclusion, refresh, re-login, and second session.

- [ ] **Step 3: Add hostile and recovery cases**

Verify wrong-email acceptance, expired/revoked/replayed token, application enumeration, direct unapproved invitation, direct RPC access, cross-tenant reads, unassigned Base access, Platform identity acceptance, conflicting membership, and trusted-cookie creation before provisioning all fail closed.

- [ ] **Step 4: Add PostgreSQL verification**

The script must prove one auth identity, one organisation identity, one membership, one administrator role, one active seat, one assigned Base, no Platform identity, no Personnel, immutable application/invitation history, matching audit/outbox events, and no duplicate onboarding completion storage.

- [ ] **Step 5: Add secure CI execution**

Use protected environment secrets for a controlled applicant mailbox and Platform reviewer identity. Never persist passwords, auth storage state, screenshots, videos, or traces from authentication. Missing secrets fail closed. Production runs must archive only controlled onboarding organisations through an approved repository-controlled cleanup command; genuine customer records remain untouched.

- [ ] **Step 6: Run the complete verification chain**

```bash
npm run verify:product-maturity
CI=true npm test -- --runInBand
npm run build
npm run verify:commercial-onboarding
npx playwright test e2e/acceptance/commercial-onboarding.spec.ts
```

Expected: registry zero violations; complete regression PASS; production build PASS; PostgreSQL assertions PASS; unattended onboarding PASS.

- [ ] **Step 7: Deploy and run Production Beta acceptance**

Apply only the repository-controlled migration, deploy the exact tested commit, wait for READY, run authentication-only and onboarding-only gates before the full Client-to-Mission acceptance, and verify audit/outbox/tenant isolation directly in PostgreSQL.

- [ ] **Step 8: Commit governance and acceptance**

```bash
git add src/productMaturity src/productMaturity/__tests__/registry.test.ts e2e/acceptance/commercial-onboarding.spec.ts scripts/verifyCommercialOnboardingPostgres.mjs package.json .github/workflows/production-beta-operational-acceptance.yml docs/operations/commercial-onboarding-runbook.md
git commit -m "TEST-ONB-001 govern commercial onboarding acceptance"
```

---

## Final acceptance evidence

- Application, review, approval, and invitation are four separate authoritative events.
- No organisation exists before invitation acceptance.
- No Founder database or Supabase-console action is needed in the normal lifecycle.
- Customer authentication uses the existing Supabase lifecycle.
- Organisation provisioning is atomic, idempotent, audited, and tenant-safe.
- The initial user is an Organisation Administrator only.
- One seat and one assigned Base exist.
- No Platform identity or Personnel record is created.
- Getting Started is resumable and derives progress from authoritative records.
- Customer-facing onboarding copy uses Base; authoritative code retains operating location.
- Operational Readiness celebrates workspace completion without implying Mission authorisation.
- The complete first Client → Property → Field → Job → Mission path passes unattended.
- Refresh, password recovery, re-login, second session, tenant isolation, expiry, revocation, replay protection, audit, and outbox pass.
- Production Beta controlled records are archived without touching genuine customer records.
