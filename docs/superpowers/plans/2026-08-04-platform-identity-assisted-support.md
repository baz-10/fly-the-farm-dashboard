# Platform Identity and Organisation Assisted Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate Spray Command platform identities from organisation identities, rebrand platform-owned surfaces, and provide audited, time-limited Organisation Assisted Support without creating tenant memberships.

**Architecture:** Add a provider-neutral platform identity plane beside the existing organisation plane, then resolve delegated support through dedicated request, approval, session and activity records. All operational API access continues through server-authoritative context resolution and PostgreSQL enforcement; support grants never become memberships, seats, roles or location assignments.

**Tech Stack:** React 19, TypeScript 4.9, Material UI 7, Node.js CommonJS API handlers, PostgreSQL/Supabase Auth and RLS, repository-controlled SQL migrations, Jest/React Testing Library, PGlite.

## Global Constraints

- Platform identities have no automatic organisation membership, seat, operating-location assignment or operational-data access.
- `ben@trollope.com.au` is reconciled as Platform Super Administrator only; `ben@flythefarm.com.au` remains Fly The Farm Organisation Administrator only.
- Identity reconciliation is explicit, idempotent and fail-closed; ambiguity must not modify memberships or Personnel history.
- A support request and each approval are separate immutable authoritative events.
- Production Beta allows the same authorised Organisation Administrator to request and approve; the records must disclose this explicitly.
- Approval policy is versioned and must support different or multiple approvers later without redesign.
- Support duration defaults to two hours and is always server-calculated, expiring automatically.
- Supported modes are `READ_ONLY` and `READ_WRITE`; scopes are `ORGANISATION`, `MISSION`, `JOB` and `MODULE`.
- Support access never creates a membership, seat, role or location assignment.
- Enforcement is server-authoritative and reinforced by PostgreSQL trusted functions/RLS; browser state never grants access.
- Audit, activity and transactional outbox evidence are append-only.
- Break Glass remains disabled.
- Platform-owned UI uses Spray Command branding; organisation branding remains confined to organisation workspaces and reports.
- No drones, propellers, leaves or spray droplets may appear in the Spray Command platform mark.
- Existing Mission evidence and immutable report artefacts must not be rewritten.

---

## File Structure

- `src/brand/PlatformBrand.tsx`: repository-controlled Spray Command wordmark and waypoint mark.
- `src/components/PlatformShell.tsx`: platform-only navigation chrome.
- `src/pages/PlatformAdmin.tsx`: platform administration landing surface.
- `src/pages/platform/AssistedSupport.tsx`: platform support queue and session controls.
- `src/components/admin/OrganisationSupportAccess.tsx`: organisation request, approval and revocation workflow.
- `src/services/platformApi.ts`: typed client for platform identity and support endpoints.
- `server/platform-request-context.js`: platform identity resolution with no tenant fallback.
- `server/support-access.js`: pure delegated-scope and access-mode evaluator.
- `server/support-api.js`: versioned application handlers for support lifecycle commands.
- `server/support-repository.js`: Supabase/PostgreSQL adapter for platform and support records.
- `supabase/migrations/20260804160000_platform_identity_assisted_support.sql`: additive schema, permissions, trusted functions, RLS, audit and outbox writes.
- `scripts/verifyPlatformIdentitySupportPostgres.mjs`: migration and fail-closed behaviour verifier.

### Task 1: Spray Command platform brand and platform-owned surfaces

**Files:**
- Create: `src/brand/PlatformBrand.tsx`
- Create: `src/__tests__/platformBranding.test.tsx`
- Modify: `src/pages/Login.tsx`
- Modify: `src/pages/Register.tsx`
- Modify: `src/pages/ForgotPassword.tsx`
- Modify: `src/pages/ResetPassword.tsx`
- Modify: `src/pages/AuthCallback.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `api/auth.js`

**Interfaces:**
- Produces: `PlatformBrand({ compact?: boolean, inverse?: boolean })` for all platform-owned surfaces.
- Preserves: organisation name/logo presentation inside an authenticated organisation workspace.

- [ ] **Step 1: Write the failing brand tests**

```tsx
render(<Login />);
expect(screen.getByRole('img', { name: /spray command/i })).toBeInTheDocument();
expect(screen.queryByText(/fly the farm/i)).not.toBeInTheDocument();

render(<PlatformBrand />);
expect(screen.getByText('SPRAY COMMAND')).toBeInTheDocument();
expect(screen.getByTestId('spray-command-waypoint-mark')).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `CI=true npm test -- --runInBand src/__tests__/platformBranding.test.tsx`

Expected: FAIL because `PlatformBrand` does not exist and authentication screens still expose Fly The Farm branding.

- [ ] **Step 3: Implement the repository-controlled brand component and replace platform leaks**

```tsx
export function PlatformBrand({ compact = false, inverse = false }: PlatformBrandProps) {
  return <Stack direction="row" alignItems="center" spacing={1.25} aria-label="Spray Command">
    <Box data-testid="spray-command-waypoint-mark" aria-hidden="true">{/* CSS waypoint geometry */}</Box>
    {!compact && <Typography component="span">SPRAY COMMAND</Typography>}
  </Stack>;
}
```

Use the component in authentication and global platform chrome. Replace platform-owned public copy in `api/auth.js` with Spray Command without changing organisation workspace identity.

- [ ] **Step 4: Run focused tests and build**

Run: `CI=true npm test -- --runInBand src/__tests__/platformBranding.test.tsx && npm run build`

Expected: PASS; no platform-owned authentication assertion contains Fly The Farm.

- [ ] **Step 5: Commit**

```bash
git add src/brand/PlatformBrand.tsx src/__tests__/platformBranding.test.tsx src/pages/Login.tsx src/pages/Register.tsx src/pages/ForgotPassword.tsx src/pages/ResetPassword.tsx src/pages/AuthCallback.tsx src/components/Layout.tsx api/auth.js
git commit -m "IMP-PLT-001 rebrand platform-owned surfaces"
```

### Task 2: Additive platform identity schema and fail-closed reconciliation

**Files:**
- Create: `supabase/migrations/20260804160000_platform_identity_assisted_support.sql`
- Create: `src/__tests__/platformIdentityPglite.test.js`
- Create: `scripts/verifyPlatformIdentitySupportPostgres.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces tables: `platform_users`, `platform_roles`, `platform_permissions`, `platform_role_permissions`, `platform_user_roles`.
- Produces function: `reconcile_platform_identity(p_auth_user_id uuid, p_expected_email text, p_platform_role_code text, p_actor_auth_user_id uuid)` returning one result row with `status` and `platform_user_id`.
- Produces permission: `platform.super_admin`; reserved disabled permission: `platform.break_glass`.

- [ ] **Step 1: Write RED PGlite tests**

```js
expect(await scalar(db, `select count(*) from platform_users`)).toBe(0);
await expect(sql(db, `select * from reconcile_platform_identity($1,$2,'PLATFORM_SUPER_ADMIN',$1)`, [platformAuthId, 'ben@trollope.com.au']))
  .resolves.toMatchObject([{ status: 'RECONCILED' }]);
expect(await scalar(db, `select count(*) from memberships where internal_user_id=$1`, [platformInternalUserId])).toBe(0);
expect(await scalar(db, `select count(*) from personnel where linked_internal_user_id=$1`, [platformInternalUserId])).toBe(1);
```

Also assert mismatched or duplicate auth identity returns `IDENTITY_AMBIGUOUS` without changing memberships, seats, locations, Personnel, Missions or report artefacts.

- [ ] **Step 2: Run the migration test and confirm RED**

Run: `CI=true npm test -- --runInBand src/__tests__/platformIdentityPglite.test.js`

Expected: FAIL because the platform tables and reconciliation function do not exist.

- [ ] **Step 3: Implement the additive identity plane**

Create platform-owned role/permission tables without `organisation_id`. Make reconciliation lock the target auth identity, verify normalized email, reject multiple matches, upsert the platform identity and role idempotently, and refuse to remove tenant membership when a Personnel link or historical reference would be orphaned. Never embed tenant access in platform roles.

- [ ] **Step 4: Add and run the PostgreSQL verifier**

```json
"verify:platform-support": "node scripts/verifyPlatformIdentitySupportPostgres.mjs"
```

Run: `CI=true npm test -- --runInBand src/__tests__/platformIdentityPglite.test.js && npm run verify:platform-support`

Expected: PASS with explicit checks for idempotency, ambiguity rollback and zero implicit tenant grants.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260804160000_platform_identity_assisted_support.sql src/__tests__/platformIdentityPglite.test.js scripts/verifyPlatformIdentitySupportPostgres.mjs package.json
git commit -m "NEW-PLT-001 separate platform identity plane"
```

### Task 3: Platform request context and administration boundary

**Files:**
- Create: `server/platform-request-context.js`
- Create: `src/components/PlatformShell.tsx`
- Create: `src/pages/PlatformAdmin.tsx`
- Create: `src/__tests__/platformRequestContext.test.js`
- Create: `src/__tests__/platformAdministration.test.tsx`
- Modify: `src/App.tsx`
- Modify: `server/operational-dispatcher.js`
- Modify: `server/operational-api.js`

**Interfaces:**
- Produces: `resolvePlatformRequestContext(req, res): Promise<{ authUser, platformUser, roles, permissions }>`.
- Produces route: `/platform` guarded only by platform permissions.
- Produces API: `GET /api/v1/platform-session`.

- [ ] **Step 1: Write RED boundary tests**

```js
await expect(resolvePlatformRequestContext(orgAdminReq, res)).rejects.toMatchObject({ status: 403 });
expect((await resolvePlatformRequestContext(platformReq, res)).organisation).toBeUndefined();
expect((await resolvePlatformRequestContext(platformReq, res)).permissions).toContain('platform.super_admin');
```

Render `/platform` for each identity and assert the platform user sees Spray Command Platform Administration while the organisation administrator receives access denied.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `CI=true npm test -- --runInBand src/__tests__/platformRequestContext.test.js src/__tests__/platformAdministration.test.tsx`

Expected: FAIL because the platform context and route do not exist.

- [ ] **Step 3: Implement separate context, API and shell**

Resolve only `platform_users` and platform-role permissions. Do not call `resolveRequestContext`, inspect memberships or derive tenant access. Add `platform-session` to the dispatcher and a separate `/platform` route using `PlatformShell`.

- [ ] **Step 4: Run focused tests**

Run: `CI=true npm test -- --runInBand src/__tests__/platformRequestContext.test.js src/__tests__/platformAdministration.test.tsx src/__tests__/versionedApiDispatcher.test.js`

Expected: PASS; the existing `/api/v1/*` public contract remains intact.

- [ ] **Step 5: Commit**

```bash
git add server/platform-request-context.js src/components/PlatformShell.tsx src/pages/PlatformAdmin.tsx src/__tests__/platformRequestContext.test.js src/__tests__/platformAdministration.test.tsx src/App.tsx server/operational-dispatcher.js server/operational-api.js
git commit -m "NEW-PLT-002 enforce platform administration boundary"
```

### Task 4: Support request, approval, session and activity schema

**Files:**
- Modify: `supabase/migrations/20260804160000_platform_identity_assisted_support.sql`
- Modify: `src/__tests__/platformIdentityPglite.test.js`
- Modify: `scripts/verifyPlatformIdentitySupportPostgres.mjs`

**Interfaces:**
- Produces tables: `organisation_support_policy_versions`, `support_requests`, `support_approval_events`, `support_sessions`, `support_activity_events`, `organisation_notifications`.
- Produces trusted functions: `create_support_request`, `decide_support_request`, `start_support_session`, `revoke_support_session`, `record_support_activity`.
- Produces evaluator: `support_access_allowed(session_id, organisation_id, mode, module_code, mission_id, job_id, at_time)`.

- [ ] **Step 1: Extend RED tests for distinct events and future policy**

```js
expect(request.requested_by_internal_user_id).toBe(adminId);
expect(approval.approved_by_internal_user_id).toBe(adminId);
expect(approval.requester_is_approver).toBe(true);
expect(approval.created_at).not.toBe(request.created_at);
expect(await startSession(request.id)).toMatchObject({ state: 'ACTIVE' });
```

Add cases where `DIFFERENT_APPROVER` and `MULTI_APPROVER` policy versions prevent session start until their independent approval events satisfy the recorded policy snapshot.

- [ ] **Step 2: Run migration tests and confirm RED**

Run: `CI=true npm test -- --runInBand src/__tests__/platformIdentityPglite.test.js`

Expected: FAIL because support lifecycle tables/functions do not exist.

- [ ] **Step 3: Implement append-only lifecycle and SQL enforcement**

Use immutable request/approval/activity rows, optimistic `row_version` only on revocable session state, server-calculated `expires_at <= started_at + approved_duration`, and atomic audit/outbox inserts. Constrain scope references by type, reject read-only mutation, reject expired/revoked sessions, and leave `platform.break_glass` disabled.

- [ ] **Step 4: Run migration tests and verifier**

Run: `CI=true npm test -- --runInBand src/__tests__/platformIdentityPglite.test.js && npm run verify:platform-support`

Expected: PASS for same-person disclosure, multi-approver readiness, mode/scope checks, expiry/revocation, audit/outbox and zero memberships created.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260804160000_platform_identity_assisted_support.sql src/__tests__/platformIdentityPglite.test.js scripts/verifyPlatformIdentitySupportPostgres.mjs
git commit -m "NEW-PLT-003 add delegated support evidence model"
```

### Task 5: Support application service, repository and versioned API

**Files:**
- Create: `server/support-access.js`
- Create: `server/support-repository.js`
- Create: `server/support-api.js`
- Create: `src/__tests__/supportAccess.test.js`
- Create: `src/__tests__/supportApi.test.js`
- Modify: `server/operational-dispatcher.js`

**Interfaces:**
- Produces: `evaluateSupportAccess({ session, operation, organisationId, moduleCode, missionId, jobId, now })` returning `{ allowed, denialCode }`.
- Produces endpoints: `support-requests`, `support-approvals`, `support-sessions`, `support-activity` under `/api/v1/*`.

- [ ] **Step 1: Write RED domain and API tests**

```js
expect(evaluateSupportAccess({ session: readOnly, operation: 'write', ...scope })).toEqual({ allowed: false, denialCode: 'SUPPORT_READ_ONLY' });
expect(evaluateSupportAccess({ session: activeMission, operation: 'read', missionId: siblingId, ...scope })).toEqual({ allowed: false, denialCode: 'SUPPORT_SCOPE_MISMATCH' });
expect(await postApproval({ requesterId: adminId, approverId: adminId })).toMatchObject({ requesterIsApprover: true });
```

Assert stale versions return 409, unsupported scopes return 400, cross-tenant references return 404, and no failed command creates partial records.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `CI=true npm test -- --runInBand src/__tests__/supportAccess.test.js src/__tests__/supportApi.test.js`

Expected: FAIL because support application files and dispatcher entries do not exist.

- [ ] **Step 3: Implement pure evaluator, repository adapter and thin handlers**

Keep business rules in `support-access.js`; handlers authenticate the correct identity plane, validate commands and delegate to repository trusted functions. The repository must never write memberships, seats, locations or organisation roles.

- [ ] **Step 4: Run focused and dispatcher regression tests**

Run: `CI=true npm test -- --runInBand src/__tests__/supportAccess.test.js src/__tests__/supportApi.test.js src/__tests__/versionedApiDispatcher.test.js`

Expected: PASS with unsupported API versions/resources still safely rejected.

- [ ] **Step 5: Commit**

```bash
git add server/support-access.js server/support-repository.js server/support-api.js src/__tests__/supportAccess.test.js src/__tests__/supportApi.test.js server/operational-dispatcher.js
git commit -m "NEW-PLT-004 expose delegated support lifecycle API"
```

### Task 6: Enforce delegated access across operational APIs

**Files:**
- Modify: `server/request-context.js`
- Modify: `server/operational-api.js`
- Modify: `server/operational-repository.js`
- Create: `src/__tests__/assistedSupportEnforcement.test.js`

**Interfaces:**
- Extends request context with optional `support: { sessionId, platformUserId, organisationId, mode, scopeType, scopeReference, expiresAt }`.
- Consumes: `evaluateSupportAccess` and `recordSupportActivity` from Tasks 4–5.

- [ ] **Step 1: Write RED enforcement tests**

```js
expect(await invokeOperational(readOnlyMissionSession, 'GET', missionPath)).toHaveStatus(200);
expect(await invokeOperational(readOnlyMissionSession, 'PATCH', missionPath)).toHaveError(403, 'SUPPORT_READ_ONLY');
expect(await invokeOperational(readWriteMissionSession, 'GET', siblingMissionPath)).toHaveError(404, 'NOT_FOUND');
expect(await invokeOperational(expiredSession, 'GET', missionPath)).toHaveError(403, 'SUPPORT_SESSION_EXPIRED');
```

Assert ordinary organisation sessions are unchanged, supported reads/writes create activity and audit/outbox evidence, and support access creates zero tenant identity rows.

- [ ] **Step 2: Run the enforcement test and confirm RED**

Run: `CI=true npm test -- --runInBand src/__tests__/assistedSupportEnforcement.test.js`

Expected: FAIL because operational context cannot resolve delegated support.

- [ ] **Step 3: Implement fail-closed support context and central guards**

Resolve an explicit server-side support session identifier only after platform authentication. Before repository access, evaluate organisation, mode and scope; use 404 for scope mismatches to avoid resource disclosure. Record successful reads and mutation attempts/outcomes without storing sensitive payloads.

- [ ] **Step 4: Run enforcement and existing operational API suites**

Run: `CI=true npm test -- --runInBand src/__tests__/assistedSupportEnforcement.test.js src/__tests__/trustedOperationalApi.test.js src/__tests__/liveChainAccessApi.test.js`

Expected: PASS with tenant and operating-location protections unchanged for ordinary users.

- [ ] **Step 5: Commit**

```bash
git add server/request-context.js server/operational-api.js server/operational-repository.js src/__tests__/assistedSupportEnforcement.test.js
git commit -m "IMP-PLT-002 enforce scoped assisted support access"
```

### Task 7: Organisation approval UI and platform support console

**Files:**
- Create: `src/services/platformApi.ts`
- Create: `src/components/admin/OrganisationSupportAccess.tsx`
- Create: `src/pages/platform/AssistedSupport.tsx`
- Create: `src/__tests__/organisationSupportAccess.test.tsx`
- Create: `src/__tests__/assistedSupportConsole.test.tsx`
- Modify: `src/pages/Admin.tsx`
- Modify: `src/pages/PlatformAdmin.tsx`

**Interfaces:**
- Produces client methods: `createSupportRequest`, `decideSupportRequest`, `revokeSupportSession`, `startSupportSession`, `endSupportSession`, `listSupportActivity`.
- Consumes the versioned support endpoints from Task 5.

- [ ] **Step 1: Write RED workflow tests**

```tsx
await user.click(screen.getByRole('button', { name: /request support/i }));
expect(await screen.findByText(/request recorded/i)).toBeInTheDocument();
expect(screen.getByRole('button', { name: /approve request/i })).toBeEnabled();
await user.click(screen.getByRole('button', { name: /approve request/i }));
expect(await screen.findByText(/requester and approver are the same person/i)).toBeInTheDocument();
```

Assert mode, scope, duration, reason and notes are visible; revocation is immediate; platform UI cannot start a session before approval; and organisation branding does not appear in Platform Administration.

- [ ] **Step 2: Run UI tests and confirm RED**

Run: `CI=true npm test -- --runInBand src/__tests__/organisationSupportAccess.test.tsx src/__tests__/assistedSupportConsole.test.tsx`

Expected: FAIL because the support workflow components do not exist.

- [ ] **Step 3: Implement the two-plane workflow**

Add `OrganisationSupportAccess` to the existing organisation Admin page and `AssistedSupport` to Platform Administration. Make request and approval visibly separate actions, disclose same-person approval, show exact expiry and scope, and provide end/revoke controls. Do not expose reusable support credentials to browser storage.

- [ ] **Step 4: Run UI tests and build**

Run: `CI=true npm test -- --runInBand src/__tests__/organisationSupportAccess.test.tsx src/__tests__/assistedSupportConsole.test.tsx && npm run build`

Expected: PASS with responsive layouts and accessible labels.

- [ ] **Step 5: Commit**

```bash
git add src/services/platformApi.ts src/components/admin/OrganisationSupportAccess.tsx src/pages/platform/AssistedSupport.tsx src/__tests__/organisationSupportAccess.test.tsx src/__tests__/assistedSupportConsole.test.tsx src/pages/Admin.tsx src/pages/PlatformAdmin.tsx
git commit -m "NEW-PLT-005 add assisted support workflow"
```

### Task 8: Durable notifications, full verification and deployment gate

**Files:**
- Modify: `server/support-repository.js`
- Modify: `scripts/verifyPlatformIdentitySupportPostgres.mjs`
- Create: `src/__tests__/supportNotifications.test.js`
- Modify: `docs/superpowers/specs/2026-08-04-platform-identity-assisted-support-design.md`

**Interfaces:**
- Produces notification events for `SUPPORT_GRANTED`, `SUPPORT_STARTED`, `SUPPORT_ENDED`, `SUPPORT_EXPIRED`, `SUPPORT_REVOKED`.
- Preserves authoritative access state if notification delivery fails; outbox retry remains failure-visible.

- [ ] **Step 1: Write RED notification tests**

```js
expect(await lifecycle('START')).toHaveNotification('SUPPORT_STARTED');
expect(await lifecycle('REVOKE')).toHaveNotification('SUPPORT_REVOKED');
expect(await lifecycleWithDeliveryFailure('EXPIRE')).toMatchObject({ sessionState: 'EXPIRED', outboxPending: true });
```

- [ ] **Step 2: Run notification tests and confirm RED**

Run: `CI=true npm test -- --runInBand src/__tests__/supportNotifications.test.js`

Expected: FAIL because lifecycle notifications are not yet written.

- [ ] **Step 3: Implement atomic notification/outbox creation**

Write organisation notifications in the same transaction as lifecycle changes. Store delivery state separately so failure cannot prolong or expand delegated access.

- [ ] **Step 4: Run the complete local gate**

Run: `CI=true npm test -- --runInBand`

Run: `npm run build`

Run: `npm run verify:platform-support`

Run: `git diff --check && git status --short`

Expected: all tests pass, production build succeeds, verifier proves identity separation/support enforcement, and only intentional files are present.

- [ ] **Step 5: Commit the completed local capability**

```bash
git add server/support-repository.js scripts/verifyPlatformIdentitySupportPostgres.mjs src/__tests__/supportNotifications.test.js docs/superpowers/specs/2026-08-04-platform-identity-assisted-support-design.md
git commit -m "IMP-PLT-003 complete assisted support audit and notifications"
```

- [ ] **Step 6: Apply the production gate without destructive reconciliation**

Confirm the linked Supabase project is the Spray Command Production Beta project before migration. Apply the additive migration, run the production verifier, then run identity reconciliation only if both approved auth identities resolve uniquely and the preflight reports no Personnel/history orphaning. If reconciliation proposes a destructive membership change or identity ambiguity, stop for Product Owner review.

- [ ] **Step 7: Deploy and prove live acceptance**

Push `codex/production-beta` without force, deploy to the Spray Command Production Beta Vercel project, wait for `READY`, and verify:

```text
Platform identity: no tenant membership/seat/location and no operational access
Organisation identity: Fly The Farm-only administrator context
Support request: immutable request event
Support approval: distinct immutable approval event and same-person disclosure
Session: two-hour default, explicit scope and mode
Read-only: reads allowed, mutations denied
Read/write: scoped mutation allowed
Scope mismatch: hidden/denied
Expiry/revocation: immediate fail-closed denial
Activity/audit/outbox/notifications: present
Break Glass: disabled
Platform UI: Spray Command branding only
Organisation workspace/reports: organisation branding retained
```

Expected: deployed Production Beta capability passes smoke and security acceptance without any local/legacy fallback.
